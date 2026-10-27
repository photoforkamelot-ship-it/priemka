"""Справочник магазинов из выгрузки XLSX (Магазин · Адрес · Код · Управляющий · почта · телефон) → backend/data/stores.json.

    python tools/import_stores.py путь/к/выгрузке.xlsx
Файл с данными управляющих в git не кладётся (data/ в .gitignore).
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import openpyxl

OKRUG = {"Алтай": "СФО", "Кемерово": "СФО", "Красноярск": "СФО", "Новосибирск": "СФО", "Омск": "СФО", "Томск": "СФО",
         "Екатеринбург": "УФО", "Пермь": "УФО", "Тюмень": "УФО", "Челябинск": "УФО", "Оренбург": "УФО"}
CODE = re.compile(r"^[А-ЯЁA-Z]{1,3}\d{1,4}[А-ЯЁA-Z]?$")
PHONE = re.compile(r"[\d+][\d\s()\-+]{8,}")


def city_of(addr: str) -> str:
    m = re.search(r"(?:^|,\s*)г\.?\s*([А-ЯЁ][\w\-ё ]+?)(?:,|$)", addr) or re.search(r",\s*([А-ЯЁ][\w\-ё ]+?)\s+г\.?(?:,|$)", addr)
    return m.group(1).strip() if m else ""


def street_of(addr: str) -> str:
    parts = [p.strip() for p in addr.split(",")]
    for i, p in enumerate(parts):
        if re.search(r"\b(ул|пр-кт|пр|пер|б-р|ш|пл|наб|мкр|тракт|проезд)\b\.?", p):
            return ", ".join(parts[i:])
    return parts[-1] if parts else addr


def main(xlsx: str, out: str):
    rows = openpyxl.load_workbook(xlsx, read_only=True, data_only=True).worksheets[0].iter_rows(values_only=True)
    region, stores, letters = "", [], {}
    for r in rows:
        cells = [c for c in r if c not in (None, "")]
        if not cells:
            continue
        if r[0] and not str(r[0]).startswith("ОСП"):
            region = str(r[0]).strip()
            continue
        code = next((str(c).strip() for c in cells if CODE.match(str(c).strip())), "")
        if not code:
            continue
        email = next((str(c).strip() for c in cells if "@" in str(c)), "")
        addr = next((str(c).strip() for c in cells if re.search(r"\b(ул|пр-кт|г\.|обл|край|д\.)", str(c)) and str(c) != email), "")
        i_code = cells.index(next(c for c in cells if str(c).strip() == code))
        director = next((str(c).strip() for c in cells[i_code + 1:] if re.match(r"^[А-ЯЁ][а-яё]+ [А-ЯЁ][а-яё]+", str(c))), "")
        after = cells[cells.index(email) + 1:] if email in cells else []
        phone = next((str(c).strip() for c in after if PHONE.search(str(c))), "")
        stores.append({"code": code, "region": region, "okrug": OKRUG.get(region, "ЦФО"), "address": addr,
                       "city": city_of(addr), "street": street_of(addr), "email": email,
                       "director": director, "director_phone": phone})
        m = re.match(r"^([A-Za-z]+)\d", email.split("@")[0]) if email.endswith("ya-retail.ru") else None
        pre = re.match(r"^([А-ЯЁA-Z]+)\d", code)
        if m and pre:
            letters.setdefault(pre.group(1), {}).setdefault(m.group(1).upper(), 0)
            letters[pre.group(1)][m.group(1).upper()] += 1
    prefix = {k: max(v, key=v.get) for k, v in letters.items()}
    Path(out).parent.mkdir(parents=True, exist_ok=True)
    from datetime import date
    Path(out).write_text(json.dumps({"stores": stores, "email_prefix": prefix, "updated": date.today().isoformat()}, ensure_ascii=False), encoding="utf-8")
    print(f"магазинов: {len(stores)}, префиксов почты: {len(prefix)} → {out}")
    return len(stores)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else str(Path(__file__).resolve().parent.parent / "data" / "stores.json"))
