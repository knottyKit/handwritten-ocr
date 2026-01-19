# backend/extractors/inner_curvature.py
from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, Any, Tuple, List

import fitz  # pymupdf
from PIL import Image, ImageDraw, ImageOps

from ocr_engines import get_easyocr_reader


# ==============================
# Page-level normalized crop boxes (0..1) relative to page0.png
# ==============================
HEADER_BOXES = {
    "construction_number": (0.135, 0.112, 0.395, 0.145),
    "orderer":             (0.135, 0.158, 0.395, 0.185),
    "construction_name":   (0.135, 0.200, 0.395, 0.230),
    "project_title":       (0.405, 0.180, 0.790, 0.230),
}

DIAGRAM_BOX: Tuple[float, float, float, float] = (0.06, 0.26, 0.94, 0.62)
TABLE_BOX: Tuple[float, float, float, float]   = (0.06, 0.67, 0.94, 0.95)


# ==============================
# Table.png-level boxes (0..1) relative to table.png
# ==============================
TABLE_TITLE_BOX = (0.085, 0.12, 0.81, 0.20)

PART_X     = (0.00, 0.086)
GRID_X     = (0.086, 0.81)   # LU+LC+LB
DATE_X     = (0.81, 0.91)
CONFIRM_X  = (0.91, 1.00)

# ✅ DO NOT CHANGE THIS (per your instruction)
ROW_BOXES = [
    (0.00, 0.44, 1.00, 0.59),  # DB11-3A
    (0.00, 0.59, 1.00, 0.75),  # DB11-3B
    (0.00, 0.75, 1.00, 0.90),  # DB11-3C
]


# ==============================
# OCR / parsing helpers
# ==============================
def _find_input_file(job_dir: Path) -> Path:
    for p in job_dir.iterdir():
        if p.name.startswith("input") and p.is_file():
            return p
    raise FileNotFoundError("No input file found")


def _render_pdf_page0_to_png(pdf_path: Path, out_png: Path) -> None:
    doc = fitz.open(str(pdf_path))
    page = doc.load_page(0)
    mat = fitz.Matrix(2.0, 2.0)
    pix = page.get_pixmap(matrix=mat, alpha=False)
    out_png.write_bytes(pix.tobytes("png"))


def crop_norm(img_path: Path, out_path: Path, box_norm, pad_px=12) -> Tuple[int, int, int, int]:
    img = Image.open(img_path).convert("RGB")
    W, H = img.size
    l, t, r, b = box_norm
    x1 = max(0, int(l * W) - pad_px)
    y1 = max(0, int(t * H) - pad_px)
    x2 = min(W, int(r * W) + pad_px)
    y2 = min(H, int(b * H) + pad_px)
    img.crop((x1, y1, x2, y2)).save(out_path)
    return (x1, y1, x2, y2)


def crop_from_image_norm(img: Image.Image, box_norm, pad_px=0) -> Image.Image:
    img = img.convert("RGB")
    W, H = img.size
    l, t, r, b = box_norm
    x1 = max(0, int(l * W) - pad_px)
    y1 = max(0, int(t * H) - pad_px)
    x2 = min(W, int(r * W) + pad_px)
    y2 = min(H, int(b * H) + pad_px)
    return img.crop((x1, y1, x2, y2))


def preprocess_printed(img: Image.Image) -> Image.Image:
    g = img.convert("L")
    g = ImageOps.autocontrast(g)
    g = g.point(lambda p: 255 if p > 175 else 0)
    return g


def preprocess_handwriting_soft(img: Image.Image) -> Image.Image:
    g = img.convert("L")
    g = ImageOps.autocontrast(g)
    return g


def _tighten_to_content(img: Image.Image) -> Image.Image:
    """
    Crops away empty margins around ink. Helps OCR AND our "1" heuristic.
    """
    g = img.convert("L")
    inv = ImageOps.invert(g)
    inv = ImageOps.autocontrast(inv)
    bw = inv.point(lambda p: 255 if p > 40 else 0)

    bbox = bw.getbbox()
    if not bbox:
        return img

    x1, y1, x2, y2 = bbox
    pad = 8
    x1 = max(0, x1 - pad)
    y1 = max(0, y1 - pad)
    x2 = min(img.size[0], x2 + pad)
    y2 = min(img.size[1], y2 + pad)
    return img.crop((x1, y1, x2, y2))


def _upscale(img: Image.Image, scale: int = 6) -> Image.Image:
    w, h = img.size
    if w <= 1 or h <= 1:
        return img
    return img.resize((w * scale, h * scale), Image.Resampling.NEAREST)


def ocr_easy(img: Image.Image, handwriting: bool, allowlist: str | None = None) -> str:
    reader = get_easyocr_reader()
    import numpy as np

    pre = preprocess_handwriting_soft(img) if handwriting else preprocess_printed(img)
    arr = np.array(pre)

    kwargs = {"detail": 0}
    if allowlist:
        kwargs["allowlist"] = allowlist

    texts = reader.readtext(arr, **kwargs)
    return " ".join(t.strip() for t in texts if t and t.strip()).strip()


def clean_part_number(s: str) -> str:
    s = (s or "").replace(" ", "").strip()
    s = s.replace("DB1l", "DB11").replace("DBll", "DB11")
    s = s.replace("—", "-").replace("–", "-")
    return s


# ==========================================================
# ✅ ONLY FIX: make straight-line handwritten "1" recognized
# without touching your date pipeline.
# ==========================================================
def _looks_like_straight_one(cell_img: Image.Image) -> bool:
    """
    Detect a single vertical stroke (their handwritten '1').

    Important constraints:
    - must be mostly a thin vertical band
    - must be tall
    - must not be a blob
    """
    import numpy as np

    g = cell_img.convert("L")
    g = ImageOps.autocontrast(g)

    arr = np.array(g)
    ink = arr < 170  # True = ink

    h, w = ink.shape
    if h < 10 or w < 10:
        return False

    ink_count = int(ink.sum())
    if ink_count < 18:
        return False

    col = ink.sum(axis=0)
    peak = int(col.max())
    if peak <= 0:
        return False

    # narrow column support => vertical stroke
    active_cols = int((col > (0.20 * peak)).sum())
    thin = active_cols <= max(2, int(0.20 * w))

    row = ink.sum(axis=1)
    active_rows = int((row > 0).sum())
    tall = active_rows >= int(0.50 * h)

    # avoid blobs (too wide)
    not_blob = active_cols <= int(0.30 * w)

    return thin and tall and not_blob


def parse_numeric_cell(raw: str, cell_img: Image.Image | None = None) -> str:
    """
    LU/LC/LB must be: optional +/-, digits, optional 1 decimal place.

    ✅ Enhancement:
    - If OCR returns nothing/garbage, and the cell image looks like a straight '1',
      return '+1' (because in your sheet, it's always written as +1).
    """
    s = (raw or "").strip()

    # normalize common OCR confusions
    s = s.replace(" ", "")
    s = s.replace("＋", "+").replace("－", "-")
    s = s.replace("O", "0").replace("o", "0")

    # treat I/l/| as 1 to help OCR output
    s = s.replace("I", "1").replace("l", "1").replace("|", "1")

    m = re.search(r"[+\-]?\d+(?:\.\d+)?", s)
    if m:
        num = m.group(0)
        if "." in num:
            left, right = num.split(".", 1)
            num = f"{left}.{right[:1]}"  # 1 decimal only
        return num

    # fallback: if the image clearly contains a straight-line "1"
    if cell_img is not None:
        ti = _tighten_to_content(cell_img)
        bi = _upscale(ti, scale=7)
        if _looks_like_straight_one(bi):
            return "+1"

    return ""


MONTH_NAMES = {
    1: "January", 2: "February", 3: "March", 4: "April",
    5: "May", 6: "June", 7: "July", 8: "August",
    9: "September", 10: "October", 11: "November", 12: "December",
}


def _parse_month_day_from_any_separators(text: str) -> tuple[str, tuple[int, int] | None]:
    cand = (text or "").strip()
    if not cand:
        return "", None

    cand = cand.replace("I", "1").replace("l", "1")
    cand = cand.replace("\\", "/").replace("|", "/")

    m = re.search(r"(\d{1,2})\D+(\d{1,2})", cand)
    if m:
        mm = int(m.group(1))
        dd = int(m.group(2))
        return cand, (mm, dd)

    parts = [p for p in re.split(r"\s+", cand) if p.isdigit()]
    if len(parts) >= 2:
        mm = int(parts[0])
        dd = int(parts[1])
        return cand, (mm, dd)

    digits = re.sub(r"\D", "", cand)
    if len(digits) in (2, 3, 4):
        mm = int(digits[0])
        dd = int(digits[1:]) if len(digits) >= 3 else int(digits[1])
        return cand, (mm, dd)

    return cand, None


def ocr_date_cell(date_img: Image.Image) -> tuple[str, str]:
    """
    KEEP THIS EXACTLY LIKE YOUR WORKING VERSION
    (this is why your dates used to show).
    """
    tight = _tighten_to_content(date_img)
    big = _upscale(tight, scale=7)

    raw = ocr_easy(big, handwriting=True, allowlist="0123456789/")

    _, md = _parse_month_day_from_any_separators(raw)
    if not md:
        return ("", raw)

    month, day = md
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return ("", raw)

    return (f"{MONTH_NAMES[month]} {day}", raw)


def save_debug_bbox(img_path: Path, out_path: Path, bboxes_px):
    img = Image.open(img_path).convert("RGB")
    draw = ImageDraw.Draw(img)
    for (x1, y1, x2, y2, color, label) in bboxes_px:
        draw.rectangle([x1, y1, x2, y2], outline=color, width=4)
        if label:
            draw.text((x1 + 6, y1 + 6), label, fill=color)
    img.save(out_path)


def save_table_debug(table_img: Image.Image, out_path: Path):
    img = table_img.convert("RGB").copy()
    W, H = img.size
    draw = ImageDraw.Draw(img)

    def rect(box, color, label):
        l, t, r, b = box
        x1, y1, x2, y2 = int(l * W), int(t * H), int(r * W), int(b * H)
        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
        draw.text((x1 + 4, y1 + 4), label, fill=color)

    rect(TABLE_TITLE_BOX, "red", "TITLE_RAW")

    for i, rb in enumerate(ROW_BOXES):
        rect(rb, "cyan", f"ROW{i+1}")

    rect((PART_X[0], 0.44, PART_X[1], 0.90), "blue", "PART")
    rect((GRID_X[0], 0.44, GRID_X[1], 0.90), "green", "GRID")
    rect((DATE_X[0], 0.44, DATE_X[1], 0.90), "orange", "DATE")
    rect((CONFIRM_X[0], 0.44, CONFIRM_X[1], 0.90), "purple", "CONFIRM")

    img.save(out_path)


# ==============================
# Extractor
# ==============================
def extract_inner_curvature(job_dir: Path, job_id: str) -> Dict[str, Any]:
    input_path = _find_input_file(job_dir)

    page0_png = job_dir / "page0.png"
    diagram_png = job_dir / "diagram.png"
    table_png = job_dir / "table.png"
    debug_bbox_png = job_dir / "debug_bbox.png"
    table_debug_png = job_dir / "table_debug_grid.png"

    if input_path.suffix.lower() == ".pdf":
        _render_pdf_page0_to_png(input_path, page0_png)
    else:
        Image.open(input_path).convert("RGB").save(page0_png)

    diagram_bbox = crop_norm(page0_png, diagram_png, DIAGRAM_BOX, pad_px=20)
    table_bbox = crop_norm(page0_png, table_png, TABLE_BOX, pad_px=10)

    header: Dict[str, str] = {}
    header_assets: Dict[str, str] = {}
    header_bboxes_px = []

    for key, box in HEADER_BOXES.items():
        out_img = job_dir / f"header_{key}.png"
        bbox = crop_norm(page0_png, out_img, box, pad_px=10)
        header_bboxes_px.append((*bbox, "green", f"H_{key}"))
        header_assets[key] = f"/v1/jobs/{job_id}/asset/header_{key}.png"
        header[key] = ocr_easy(Image.open(out_img), handwriting=False)

    table_img = Image.open(table_png).convert("RGB")
    save_table_debug(table_img, table_debug_png)

    title_img = crop_from_image_norm(table_img, TABLE_TITLE_BOX, pad_px=4)
    title_raw = ocr_easy(
        title_img,
        handwriting=False,
        allowlist="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-/()._ 曲率R",
    )

    rows_out: List[Dict[str, Any]] = []
    row_assets: Dict[str, Dict[str, str]] = {}

    for idx, rb in enumerate(ROW_BOXES, start=1):
        row_img = crop_from_image_norm(table_img, rb, pad_px=0)

        part_img = crop_from_image_norm(row_img, (PART_X[0], 0.0, PART_X[1], 1.0), pad_px=2)
        grid_img = crop_from_image_norm(row_img, (GRID_X[0], 0.0, GRID_X[1], 1.0), pad_px=2)
        date_img = crop_from_image_norm(row_img, (DATE_X[0], 0.0, DATE_X[1], 1.0), pad_px=2)
        conf_img = crop_from_image_norm(row_img, (CONFIRM_X[0], 0.0, CONFIRM_X[1], 1.0), pad_px=2)

        # Save crops to inspect (unchanged behavior)
        part_path = job_dir / f"part_row{idx}.png"
        date_path = job_dir / f"date_row{idx}.png"
        conf_path = job_dir / f"confirmer_row{idx}.png"
        part_img.save(part_path)
        date_img.save(date_path)
        conf_img.save(conf_path)

        row_assets[f"row{idx}"] = {
            "part": f"/v1/jobs/{job_id}/asset/part_row{idx}.png",
            "date": f"/v1/jobs/{job_id}/asset/date_row{idx}.png",
            "confirmer": f"/v1/jobs/{job_id}/asset/confirmer_row{idx}.png",
        }

        part_number = clean_part_number(
            ocr_easy(part_img, handwriting=False, allowlist="DB0123456789-")
        )

        # 12 numeric cells: now uses parse_numeric_cell(raw, cell_img) so we can detect straight-line '1'
        gw, gh = grid_img.size
        cells: List[str] = []
        for c in range(12):
            x1 = int((c / 12) * gw)
            x2 = int(((c + 1) / 12) * gw)
            cell_img = grid_img.crop((x1, 0, x2, gh))

            raw_cell = ocr_easy(cell_img, handwriting=True, allowlist="+-0123456789.Iil|")
            cells.append(parse_numeric_cell(raw_cell, cell_img=cell_img))

        lu = cells[0:4]
        lc = cells[4:8]
        lb = cells[8:12]

        inspection_date, date_raw = ocr_date_cell(date_img)
        confirmer = ocr_easy(conf_img, handwriting=True).replace(" ", "").strip()

        rows_out.append(
            {
                "part_number": part_number,
                "lu": lu,
                "lc": lc,
                "lb": lb,
                "inspection_date": inspection_date,
                "_date_raw": date_raw,
                "confirmer": confirmer,
            }
        )

    save_debug_bbox(
        page0_png,
        debug_bbox_png,
        [
            (*diagram_bbox, "red", "DIAGRAM"),
            (*table_bbox, "blue", "TABLE"),
            *header_bboxes_px,
        ],
    )

    return {
        "template": "inner_curvature_v1",
        "header": header,
        "table": {"title_raw": title_raw},
        "assets": {
            "page0_image": f"/v1/jobs/{job_id}/asset/page0.png",
            "diagram_image": f"/v1/jobs/{job_id}/asset/diagram.png",
            "table_image": f"/v1/jobs/{job_id}/asset/table.png",
            "debug_bbox": f"/v1/jobs/{job_id}/asset/debug_bbox.png",
            "table_debug_grid": f"/v1/jobs/{job_id}/asset/table_debug_grid.png",
            "header_crops": header_assets,
            "row_crops": row_assets,
        },
        "rows": rows_out,
    }
