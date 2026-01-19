# backend/ocr_engines.py
from __future__ import annotations

from functools import lru_cache

@lru_cache(maxsize=1)
def get_easyocr_reader():
    import easyocr
    return easyocr.Reader(["en", "ja"], gpu=False)

@lru_cache(maxsize=1)
def get_paddle_ocr():
    # DO NOT call this unless paddlepaddle is properly installed.
    from paddleocr import PaddleOCR
    return PaddleOCR(use_angle_cls=True, lang="japan")
