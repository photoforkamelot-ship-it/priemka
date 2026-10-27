"""Планы магазина: PDF из Кайтена → листы-картинки для меток замечаний и контрольных точек.

Листы хранятся на сервере: data/plans/<объект>/<план>_<лист>.jpg (длинная сторона ~2400 px),
исходный PDF — ещё и на Яндекс Диске (если подключён). В письмо план не попадает — он для навигации.
"""
from __future__ import annotations

import os
import re
from pathlib import Path

import pymupdf

DATA = Path(os.environ.get("PLANS_DIR") or Path(__file__).resolve().parent.parent / "data" / "plans")
LONG_SIDE = 2200
KINDS = {"montage": "План монтажа", "categories": "План категорий", "light": "Световой план", "facade": "ТЗ на фасад", "other": "План"}


def guess_kind(text: str) -> str:
    t = text.lower()
    if "фасад" in t and ("техническое задание" in t or "оформлени" in t):
        return "facade"
    if "dialux" in t or "светильник" in t or " лк" in t or "освещенност" in t:
        return "light"
    if "категори" in t:
        return "categories"
    if "н тр" in t or "н вент" in t or "монтаж" in t:
        return "montage"
    return "other"


def render(pdf: bytes, obj_id: str, plan_id: str, max_pages: int = 40) -> list[dict]:
    """Каждая страница PDF → JPEG. Возвращает [{n, w, h, file}]; w/h — размеры картинки в пикселях."""
    folder = DATA / obj_id
    folder.mkdir(parents=True, exist_ok=True)
    doc = pymupdf.open(stream=pdf, filetype="pdf")
    pages = []
    for i, page in enumerate(doc):
        if i >= max_pages:
            break
        r = page.rect
        zoom = LONG_SIDE / max(r.width, r.height)
        pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), alpha=False)
        f = folder / f"{plan_id}_{i + 1}.jpg"
        f.write_bytes(pix.tobytes("jpeg", jpg_quality=72))
        pages.append({"n": i + 1, "w": pix.width, "h": pix.height, "file": f.name})
    return pages


def first_text(pdf: bytes) -> str:
    doc = pymupdf.open(stream=pdf, filetype="pdf")
    return " ".join(doc[i].get_text() for i in range(min(3, len(doc))))[:4000]


def page_file(obj_id: str, name: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{12}_\d+\.jpg", name):
        raise LookupError("нет такого листа")
    f = DATA / obj_id / name
    if not f.exists():
        raise LookupError("лист не найден на сервере — загрузите план заново")
    return f


def remove(obj_id: str, plan_id: str):
    for f in (DATA / obj_id).glob(f"{plan_id}_*.jpg"):
        f.unlink(missing_ok=True)
