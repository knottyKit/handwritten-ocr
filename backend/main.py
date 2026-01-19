# backend/main.py
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

from extractors.inner_curvature import extract_inner_curvature

BASE_DIR = Path(__file__).resolve().parent
STORAGE_DIR = BASE_DIR / "storage" / "jobs"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="Handwritten OCR Backend", version="0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class CreateJobResponse(BaseModel):
    jobId: str
    template: str = "inner_curvature_v1"


@app.get("/health")
def health():
    return {"ok": True}


@app.post("/v1/jobs", response_model=CreateJobResponse)
async def create_job(file: UploadFile = File(...)):
    """
    FAST endpoint: save upload only. NO OCR HERE.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename")

    job_id = str(uuid.uuid4())
    job_dir = STORAGE_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=True)

    ext = Path(file.filename).suffix.lower() or ".bin"
    input_path = job_dir / f"input{ext}"

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty upload")

    input_path.write_bytes(data)
    (job_dir / "meta.txt").write_text(f"filename={file.filename}\n", encoding="utf-8")

    return CreateJobResponse(jobId=job_id)


@app.post("/v1/jobs/{job_id}/extract")
def extract(job_id: str):
    """
    This can be slow (render/crop/ocr later). That's OK.
    """
    job_dir = STORAGE_DIR / job_id
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Job not found")

    return extract_inner_curvature(job_dir, job_id=job_id)


@app.get("/v1/jobs/{job_id}/asset/{filename}")
def get_asset(job_id: str, filename: str):
    job_dir = STORAGE_DIR / job_id
    path = job_dir / filename
    if not path.exists():
        raise HTTPException(status_code=404, detail="Asset not found")
    return FileResponse(str(path))
