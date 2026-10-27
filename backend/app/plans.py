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


# ---------- что можно прочитать из PDF без ИИ: таблица DIALux и легенда плана ----------
def _num(s: str) -> float:
    return float(s.replace(",", ".").replace(" ", ""))


def parse_sheet(pdf: bytes) -> dict:
    """Световой план (DIALux) и легенда плана монтажа: светильники по типам, аварийные «А»,
    кассы, сетки, торцы, кофестанция, площади и расхождения площадей."""
    doc = pymupdf.open(stream=pdf, filetype="pdf")
    out = {"luminaires": [], "emergency": 0, "passport": {}, "discrepancies": []}
    for page in doc:
        text = page.get_text("text")
        # таблица DIALux: «17 * \n FAROS LED FT 185 OPTI-L 50W 3000K PI90  (6742 lm)»
        if "DIALux" in text:
            tail = text[text.find("DIALux"):]
            for m in re.finditer(r"(?m)^\s*(\d+)\s*\*\s*\n?\s*(.+?)\s*\((\d+)\s*lm\)", tail):
                out["luminaires"].append({"count": int(m.group(1)), "name": re.sub(r"\s+", " ", m.group(2)).strip(), "lm": int(m.group(3))})
        # аварийные светильники — крупные «А» на плане
        sizes, a_sizes = [], []
        for b in page.get_text("dict")["blocks"]:
            for line in b.get("lines", []):
                for s in line["spans"]:
                    if s["text"].strip():
                        sizes.append(s["size"])
                    if s["text"].strip() in ("A", "А"):
                        a_sizes.append(s["size"])
        if sizes and a_sizes:
            sizes.sort()
            med = sizes[len(sizes) // 2]
            out["emergency"] += sum(1 for x in a_sizes if x >= med * 1.8)
        p = out["passport"]
        rx = {
            "date": r"Дата\s+(\d{2}\.\d{2}\.\d{4})",
            "s_total": r"S\s*общ\s*=\s*([\d.,]+)", "s_hall": r"S\s*торгового зала\s*=\s*([\d.,]+)",
            "s_bakery": r"S\s*пекарни\s*=\s*([\d.,]+)", "s_aux": r"S\s*подсобных помещений\s*=\s*([\d.,]+)",
            "cash": r"Кассы\s+(\d+)\s*шт", "cold_m": r"Холод\s+([\d.,]+)\s*м\b", "shelves_m": r"Стеллажи\s+([\d.,]+)\s*м",
            "grids": r"Сетки\s*\*\s*(\d+)", "narrow_ends": r"Узкие торцы\s*\*\s*(\d+)", "bag_racks": r"Стойка для пакетов\s*\*\s*(\d+)",
        }
        for k, r in rx.items():
            m = re.search(r, text)
            if m and k not in p:
                p[k] = m.group(1) if k == "date" else (_num(m.group(1)) if k.startswith(("s_", "cold", "shelves")) else int(m.group(1)))
        other_ends = sum(int(x) for x in re.findall(r"Торец\s+[«\"].*?[»\"]\s*\*\s*(\d+)", text))
        if "narrow_ends" in p:
            p["ends"] = p["narrow_ends"] + other_ends
        m = re.search(r"Кофестанция\s*\((\d{3,4})\s*[xх×]\s*(\d{3})\)\s*\*\s*(\d+)", text)
        if m and "coffee" not in p:
            p["coffee"] = 2 if int(m.group(1)) >= 1800 else int(m.group(3))     # 1864×650 — двойная кофестанция
            p["coffee_size"] = f"{m.group(1)}×{m.group(2)}"
        m = re.search(r"([\d.,]+)\s*м\s*су-?ра", text)
        if m:
            p["superstructure_m"] = _num(m.group(1))
        # расхождение площадей: «S торгового зала = 147,9» в легенде и «S=174 м2» на чертеже
        if p.get("s_hall"):
            for m in re.finditer(r"S\s*=\s*([\d.,]+)\s*\n?\s*м2", text):
                v = _num(m.group(1))
                if v > 60 and abs(v - p["s_hall"]) > 5:
                    out["discrepancies"].append(f"S торгового зала: {p['s_hall']:g} м² в легенде, {v:g} м² на чертеже".replace(".", ","))
    out["luminaires_total"] = sum(x["count"] for x in out["luminaires"])
    out["discrepancies"] = sorted(set(out["discrepancies"]))
    return out
