"""Нормы недовоза по шаблону письма (главный источник) и опросу объекта.

Списки: МТО — 80 позиций, хозтовары — 61, расходники кофе — набор на 1 или 2 кофестанции.
Формулы: 25 — сетки 250×1600 по плану; 26 — 2 сетки на суперструктуру; 28 — 11 ограничителей на торец;
76 — корзина для белья: 2 при двойной кофестанции; 80 — только ЦФО.
"""
from __future__ import annotations

import json
from pathlib import Path

from .models import StoreObject

_N = json.loads((Path(__file__).resolve().parent / "assets" / "norms.json").read_text(encoding="utf-8"))
LISTS = {"mto": "НЕДОВОЗ МЕЛКОГО ТОРГОВОГО ОБОРУДОВАНИЯ", "hoz": "НЕДОВОЗ ХОЗТОВАРОВ",
         "coffee": "НЕДОВОЗ РАСХОДНЫХ МАТЕРИАЛОВ КОФЕ"}
SURVEY_DEFAULTS = {"coffee": 1, "grids": None, "ends": None, "superstructures": None, "fresh": False,
                   "ramp": True, "entrance_light": True, "fire_cabinet": False}


def survey(obj: StoreObject) -> dict:
    return {**SURVEY_DEFAULTS, **(obj.survey or {})}


def norms(obj: StoreObject) -> dict[str, list[dict]]:
    """{"mto": [{n, name, norm, note}], "hoz": [...], "coffee": [...]}; norm=None — нужен ответ в опросе."""
    s = survey(obj)
    out = {}
    mto = []
    for x in _N["mto"]:
        n, norm, note = x["n"], x["qty"], ""
        if n == 25:
            norm, note = s["grids"], "количество сеток — по плану"
        elif n == 26:
            norm = 2 * s["superstructures"] if s["superstructures"] is not None else None
            note = "2 шт на одну суперструктуру"
        elif n == 28:
            norm = 11 * s["ends"] if s["ends"] is not None else None
            note = "11 штук на каждый торец"
        elif n == 76:
            norm = 2 if int(s["coffee"] or 1) == 2 else 1
        elif n == 80 and obj.okrug != "ЦФО":
            continue
        mto.append({"n": n, "name": x["name"], "norm": norm, "note": note})
    out["mto"] = mto
    out["hoz"] = [{"n": x["n"], "name": x["name"], "norm": x["qty"], "note": ""} for x in _N["hoz"]]
    cof = _N["coffee2"] if int(s["coffee"] or 1) == 2 else _N["coffee1"]
    out["coffee"] = [{"n": x["n"], "name": x["name"], "norm": x["qty"], "note": ""} for x in cof]
    return out


def shortages(obj: StoreObject) -> dict[str, list[dict]]:
    """Недовоз = норма − привезено; позиции без недовоза не попадают. Номер позиции из шаблона сохраняется."""
    got = obj.delivery or {}
    out = {}
    for lst, items in norms(obj).items():
        rows = []
        for it in items:
            if it["norm"] is None:
                continue
            have = int((got.get(lst) or {}).get(str(it["n"]), 0) or 0)
            miss = it["norm"] - have
            if miss > 0:
                rows.append({**it, "have": have, "missing": miss})
        out[lst] = rows
    return out


def survey_missing(obj: StoreObject) -> list[str]:
    s = survey(obj)
    names = {"grids": "сетки 250×1600 по плану", "ends": "торцы", "superstructures": "суперструктуры"}
    return [v for k, v in names.items() if s.get(k) is None]
