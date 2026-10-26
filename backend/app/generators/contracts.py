"""Распознавание договоров по тексту и проверка адреса магазина.

Файлы от менеджера по развитию называются как угодно («ДА зарегистрирован…»,
«Договор Ботаническ…»), поэтому слот определяется по содержимому.
Сканы без текстового слоя распознаются отдельно (OCR); здесь — текст.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

import pymupdf

RULES = {
    "arenda": [r"договор\s+аренды", r"арендодатель"],
    "tko": [r"тв[её]рдыми\s+коммунальными\s+отходами", r"\bТКО\b", r"\bТБО\b", r"региональный\s+оператор"],
    "dez": [r"дератизац", r"дезинсекц", r"дезинфекц", r"санитарно-профилактическ"],
    "ops": [r"охранн", r"пожарн\w*\s+сигнализац", r"\bОПС\b", r"пульт\w*\s+охран"],
}


@dataclass
class Detected:
    slots: list[str]
    has_address: bool
    text_found: bool
    number: str = ""
    doc_date: str = ""


def _norm(s: str) -> str:
    s = s.lower().replace("ё", "е")
    s = re.sub(r"\s+", " ", s)
    return s


def address_keys(address: str) -> tuple[str, str]:
    """«Комсомольский пр-т, 36» → ('комсомольск', '36')."""
    a = _norm(address)
    a = re.sub(r"\b(г|ул|улица|пр-т|проспект|пр|пер|переулок|б-р|бульвар|ш|шоссе|д|дом)\.?\s", " ", a)
    words = [w for w in re.findall(r"[а-яa-z]{3,}", a)]
    house = (re.findall(r"\b\d+[а-я]?\b", a) or [""])[-1]
    street = max(words, key=len) if words else ""
    return street[:-2] if len(street) > 6 else street, house


def has_address(text: str, address: str) -> bool:
    t = _norm(text)
    street, house = address_keys(address)
    if not street:
        return False
    for m in re.finditer(re.escape(street), t):
        window = t[m.start(): m.start() + 80]
        if not house or re.search(rf"(?<!\d){re.escape(house)}(?!\d)", window):
            return True
    return False


def detect_text(text: str, address: str) -> Detected:
    t = _norm(text)
    slots = [s for s, pats in RULES.items() if any(re.search(p, t, re.I) for p in pats)]
    num = re.search(r"(?:договор[ау]?|соглашение)\s*№\s*([\w\-/]+)", text, re.I)
    dt = re.search(r"\b(\d{2}\.\d{2}\.20\d{2})\b", text)
    return Detected(slots=slots, has_address=has_address(text, address), text_found=bool(t.strip()),
                    number=num.group(1) if num else "", doc_date=dt.group(1) if dt else "")


def detect_pdf(data: bytes, address: str) -> Detected:
    doc = pymupdf.open(stream=data, filetype="pdf")
    text = "\n".join(p.get_text() for p in doc)
    return detect_text(text, address)
