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


def save_source(pdf: bytes, obj_id: str, plan_id: str):
    """Исходный PDF рядом с листами — из него печать фрагментов идёт в векторе, без потери качества."""
    folder = DATA / obj_id
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{plan_id}.pdf").write_bytes(pdf)


def crop_print(obj_id: str, plan: dict, page_n: int, box: tuple[float, float, float, float], sheets: int = 0,
               marks: list[dict] | None = None, title: str = "") -> bytes:
    """Фрагмент плана без лишних зон → листы A4 крупно. box — доли листа (x0, y0, x1, y1).
    sheets: 0 — авто (масштаб ≥ 2× от целого листа, не больше 6 листов), иначе 1/2/4/6.
    Листы с перекрытием 4 % и подписью «лист i из n», метки замечаний — номерами."""
    x0, y0, x1, y1 = (min(box[0], box[2]), min(box[1], box[3]), max(box[0], box[2]), max(box[1], box[3]))
    if x1 - x0 < 0.02 or y1 - y0 < 0.02:
        raise ValueError("рамка слишком маленькая")
    src_path = DATA / obj_id / f"{plan['id']}.pdf"
    out = pymupdf.open()
    if src_path.exists():
        src = pymupdf.open(src_path)
        sp = src[page_n - 1]
        R = sp.rect
        vector = True
    else:   # старые планы: только картинка листа
        pg = next(x for x in plan["pages"] if x["n"] == page_n)
        img = page_file(obj_id, pg["file"])
        R = pymupdf.Rect(0, 0, pg["w"], pg["h"])
        vector = False
    crop = pymupdf.Rect(R.x0 + x0 * R.width, R.y0 + y0 * R.height, R.x0 + x1 * R.width, R.y0 + y1 * R.height)
    land = crop.width > crop.height
    A4 = (842, 595) if land else (595, 842)
    M = 22                                    # поля листа
    usable = (A4[0] - 2 * M, A4[1] - 2 * M - 14)
    if not sheets:
        # авто: сколько листов нужно, чтобы фрагмент был не мельче, чем 2× от «целый лист на A4»
        base = min(usable[0] / R.width, usable[1] / R.height) * 2
        sheets = 1
        for n in (1, 2, 4, 6):
            sheets = n
            c, r = _grid(n, crop, usable)
            if min(usable[0] * c / crop.width, usable[1] * r / crop.height) >= base:
                break
    cols, rows = _grid(sheets, crop, usable)
    tw, th = crop.width / cols, crop.height / rows
    ov = 0.04
    F = pymupdf.Font("helv")
    n, total = 0, cols * rows
    for r in range(rows):
        for c in range(cols):
            n += 1
            tile = pymupdf.Rect(crop.x0 + c * tw - (ov * tw if c else 0), crop.y0 + r * th - (ov * th if r else 0),
                                crop.x0 + (c + 1) * tw + (ov * tw if c < cols - 1 else 0), crop.y0 + (r + 1) * th + (ov * th if r < rows - 1 else 0))
            page = out.new_page(width=A4[0], height=A4[1])
            k = min(usable[0] / tile.width, usable[1] / tile.height)
            dst = pymupdf.Rect(M, M + 14, M + tile.width * k, M + 14 + tile.height * k)
            if vector:
                # растр из вектора под размер листа (~220 dpi): поворот листа PDF учитывается сам
                z = k * 220 / 72
                pix = sp.get_pixmap(matrix=pymupdf.Matrix(z, z), clip=tile, alpha=False)
                page.insert_image(dst, stream=pix.tobytes("jpeg", jpg_quality=85))
            else:
                page.insert_image(dst, filename=str(img), clip=tile)
            page.draw_rect(dst, color=(0.6, 0.6, 0.6), width=0.4)
            for m in marks or []:
                mx, my = R.x0 + m["x"] * R.width, R.y0 + m["y"] * R.height
                if tile.contains(pymupdf.Point(mx, my)):
                    px, py = dst.x0 + (mx - tile.x0) * k, dst.y0 + (my - tile.y0) * k
                    col = {"open": (0.86, 0.15, 0.15), "fixed": (0.85, 0.6, 0), "accepted": (0.1, 0.6, 0.3)}.get(m.get("status"), (0.86, 0.15, 0.15))
                    page.draw_circle((px, py), 7, color=(1, 1, 1), fill=col, width=1)
                    lab = str(m.get("n", ""))
                    page.insert_text((px - F.text_length(lab, 7) / 2, py + 2.5), lab, fontsize=7, color=(1, 1, 1))
            label = f"{title} · лист {n} из {total}" if total > 1 else title
            _label(page, M, M + 9, label)
    return out.tobytes(garbage=3, deflate=True)


def _grid(n: int, crop, usable) -> tuple[int, int]:
    """Раскладка n листов: колонки × строки, ближе к пропорциям фрагмента."""
    opts = [(c, n // c) for c in range(1, n + 1) if n % c == 0]
    ar = crop.width / crop.height
    return min(opts, key=lambda cr: abs((ar / cr[0] * cr[1]) - usable[0] / usable[1]))


def _label(page, x, y, text):
    from pathlib import Path as _P
    f = _P(__file__).resolve().parent / "assets" / "fonts" / "LiberationSans-Regular.ttf"
    w = pymupdf.TextWriter(page.rect)
    w.append((x, y), text, font=pymupdf.Font(fontfile=str(f)), fontsize=8)
    w.write_text(page, color=(0.35, 0.35, 0.35))


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
    (DATA / obj_id / f"{plan_id}.pdf").unlink(missing_ok=True)


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
        others = [(n.strip(), int(x)) for n, x in re.findall(r"Торец\s+[«\"](.*?)[»\"]\s*\*\s*(\d+)", text)]
        if "narrow_ends" in p and "ends" not in p:
            p["ends"] = p["narrow_ends"] + sum(x for _, x in others)
            parts = [f"{p['narrow_ends']} узких"] + [f"{x} «{n.capitalize()}»" for n, x in others]
            p["ends_note"] = " + ".join(parts) + f" = {p['ends']}" if others else f"{p['ends']} узких"
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
