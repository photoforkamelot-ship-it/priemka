"""PDF для печати: вкладыш на конверт (ГПХ → Калько) и объявление «Требуется дворник»."""
from __future__ import annotations

import re
from pathlib import Path

import pymupdf

from ..models import StoreObject
from .names import from_genitive_short
from .texts import digits

ASSETS = Path(__file__).resolve().parent.parent / "assets"
F = ASSETS / "fonts"

# Получатель на конверте — из справочника (можно заменить без кода)
KALKO = {"lines": ("ГПХ", "ДОКУМЕНТЫ", "КАЛЬКО", "СВЕТЛАНЕ"), "addr": ("Г. ТОМСК,", "УЛ. ПУШКИНА, 71")}


def envelope_insert(obj: StoreObject, recipient: dict = KALKO) -> bytes:
    B = pymupdf.Font(fontfile=str(F / "Carlito-Bold.ttf"))
    BI = pymupdf.Font(fontfile=str(F / "Carlito-BoldItalic.ttf"))
    I = pymupdf.Font(fontfile=str(F / "Carlito-Italic.ttf"))
    d = pymupdf.open()
    p = d.new_page(width=595.3, height=841.9)
    W = p.rect.width

    def line(txt, font, size, y, underline=False, maxw=W - 80):
        while font.text_length(txt, fontsize=size) > maxw and size > 8:
            size -= 0.5
        w = font.text_length(txt, fontsize=size)
        x = (W - w) / 2
        tw = pymupdf.TextWriter(p.rect)
        tw.append((x, y), txt, font=font, fontsize=size)
        tw.write_text(p)
        if underline:
            p.draw_line((x, y + size * 0.12), (x + w, y + size * 0.12), width=size * 0.06)

    line(f"ОСП {obj.code}".upper(), BI, 38, 64)
    line(obj.full_address.upper(), I, 30, 100)
    for t, y in zip(recipient["lines"], (260, 348, 436, 524)):
        line(t, B, 72, y, underline=True)
    line(recipient["addr"][0], B, 42, 583)
    line(recipient["addr"][1], B, 42, 634)
    line(f"ОТ {from_genitive_short(obj.director.name)}", I, 38, 700)
    line(f"ТЕЛ.:{digits(obj.director.phone)}", I, 38, 745)
    return d.tobytes(garbage=3, deflate=True)


def dvornik_poster(obj: StoreObject, template: Path = ASSETS / "templates" / "obyavlenie-dvornik.pdf") -> bytes:
    d = pymupdf.open(str(template))
    p = d[0]
    spans = [s for b in p.get_text("dict")["blocks"] if b["type"] == 0 for l in b["lines"] for s in l["spans"]]
    eight = next(s for s in spans if s["text"] == "8")
    adr = next(s for s in spans if s["text"].startswith("ПО АДРЕСУ"))
    num = digits(obj.director.phone)
    if len(num) != 11:
        raise ValueError("нужен телефон директора из 11 цифр")
    num = num[1:]
    fr = pymupdf.Font(fontfile=str(F / "LiberationSans-Regular.ttf"))
    fb = pymupdf.Font(fontfile=str(F / "LiberationSans-Bold.ttf"))
    base = eight["origin"][1]
    boxes = sorted((pymupdf.Rect(i["bbox"]) for i in p.get_image_info()), key=lambda r: r.x0)
    k = 0
    for r, n in zip(boxes, (3, 3, 2, 2)):
        p.draw_rect(r + (-1, -1, 1, 1), color=None, fill=(1, 1, 1), overlay=True)
        w = r.width / n
        for j in range(n):
            ch = num[k]; k += 1
            tw = pymupdf.TextWriter(p.rect)
            tw.append((r.x0 + j * w + (w - fr.text_length(ch, fontsize=72)) / 2, base), ch, font=fr, fontsize=72)
            tw.write_text(p)
    r = pymupdf.Rect(adr["bbox"])
    p.draw_rect(pymupdf.Rect(0, r.y0, p.rect.width, r.y1 + 3), color=None, fill=(1, 1, 1), overlay=True)
    pre, addr, size, maxw = "ПО АДРЕСУ: ", obj.full_address, 28, p.rect.width - 40
    while fr.text_length(pre, fontsize=size) + fb.text_length(addr, fontsize=size) > maxw and size > 11:
        size -= 0.5
    tot = fr.text_length(pre, fontsize=size) + fb.text_length(addr, fontsize=size)
    x = (p.rect.width - tot) / 2
    y = adr["origin"][1] + (size - adr["size"]) * 0.25
    tw = pymupdf.TextWriter(p.rect)
    tw.append((x, y), pre, font=fr, fontsize=size)
    tw.append((x + fr.text_length(pre, fontsize=size), y), addr, font=fb, fontsize=size)
    tw.write_text(p)
    return d.tobytes(garbage=3, deflate=True)


def readiness_list(obj: StoreObject, rko: str = "", day: str = "") -> bytes:
    """Лист контроля готовности (АХЧ) из шаблона: дата приёмки, магазин и адрес под заголовком,
    координатор, специалист АХЧ и РКО — внизу второго листа. Остальное заполняется ручкой на приёмке."""
    from datetime import date as _d
    d = pymupdf.open(ASSETS / "templates" / "list-gotovnosti-ahch.pdf")
    R = pymupdf.Font(fontfile=str(F / "LiberationSans-Regular.ttf"))
    Bf = pymupdf.Font(fontfile=str(F / "LiberationSans-Bold.ttf"))

    def put(page, x, y, txt, font, size, maxw=None, white=None):
        if maxw:
            while font.text_length(txt, fontsize=size) > maxw and size > 6:
                size -= 0.25
        if white:
            page.draw_rect(white, color=None, fill=(1, 1, 1), overlay=True)
        tw = pymupdf.TextWriter(page.rect)
        tw.append((x, y), txt, font=font, fontsize=size)
        tw.write_text(page)

    p0 = d[0]
    when = day or (obj.accept_date.isoformat() if obj.accept_date else "")
    hit = p0.search_for("__.__")
    if when and hit:
        r = hit[0]
        dt = _d.fromisoformat(when)
        put(p0, r.x0, r.y1 - 2, f"{dt:%d.%m.%Y} г.", Bf, 10, white=pymupdf.Rect(r.x0 - 1, r.y0, r.x0 + 60, r.y1 + 1))
    put(p0, 20, 86, f"Магазин {obj.code} · {obj.full_address}" + (f" · открытие {obj.open_date:%d.%m.%Y}" if obj.open_date else ""),
        Bf, 8.5, maxw=p0.rect.width - 40)
    if len(d) > 1:
        p1 = d[-1]
        for label, val in (("КООРДИНАТОР СТРОИТЕЛЬСТВА", obj.coordinator.name), ("СПЕЦИАЛИСТ АХЧ", obj.ahch_curator.name), ("РКО:", rko)):
            hits = p1.search_for(label)
            if hits and val:
                r = hits[0]
                x = r.x1 + (14 if label != "РКО:" else 8)
                put(p1, x, r.y1 - 2.2, val, R, 9.5, maxw=230)
    return d.tobytes(garbage=3, deflate=True)
