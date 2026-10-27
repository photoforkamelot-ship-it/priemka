"""Файл контактов .vcf: общие + региональные (по округу) + люди объекта."""
from __future__ import annotations

import json
import re
from pathlib import Path

from ..models import StoreObject

CONTACTS = Path(__file__).resolve().parent.parent / "assets" / "contacts.json"


def _esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace(",", "\\,").replace(";", "\\;").replace("\n", "\\n")


def _tel(p: str) -> str:
    m = re.match(r"^\s*([\d\-\s()+]+?)\s*(?:доб|доп)\.?\s*([\d\-]+)", p)
    d, ext = (re.sub(r"\D", "", m.group(1)), re.sub(r"\D", "", m.group(2))) if m else (re.sub(r"\D", "", p), "")
    if len(d) == 10:
        d = "7" + d
    if len(d) == 11 and d[0] == "8":
        d = "7" + d[1:]
    return ("+" + d if len(d) == 11 else d) + ("," + ext if ext else "")


def card(fio: str, role: str, phones: list[str], email: str, org: str) -> str:
    parts = fio.split()
    v = ["BEGIN:VCARD", "VERSION:3.0", f"N:{_esc(parts[0] if parts else '')};{_esc(' '.join(parts[1:]))};;;",
         f"FN:{_esc(fio)}", f"ORG:{_esc(org)}", f"TITLE:{_esc(role)}"]
    v += [f"TEL;TYPE={'CELL' if i == 0 else 'WORK'}:{_tel(p)}" for i, p in enumerate(phones) if p]
    if email:
        v.append(f"EMAIL;TYPE=WORK:{email}")
    v += ["CATEGORIES:Открытие Ярче", "END:VCARD"]
    return "\r\n".join(v)


def for_object(obj: StoreObject, contacts: list[dict] | None = None) -> str:
    contacts = contacts if contacts is not None else json.loads(CONTACTS.read_text(encoding="utf-8"))
    cards = []
    for c in contacts:
        scope, area = c.get("scope"), c.get("area", "")
        if scope == "all" or (scope == "region" and area == obj.okrug) or (scope == obj.okrug):
            cards.append(card(c["fio"], c.get("role", ""), c.get("phones", []), c.get("email", ""),
                              "Ярче" + (f" · {area or scope}" if scope not in ("all",) else "")))
    for p, role in ((obj.director, "Директор магазина"), (obj.coordinator, "Координатор строительства"),
                    (obj.dev_manager, "Менеджер по развитию региона"), (obj.mops_contractor, "Подрядчик МОПы")):
        if p.filled:
            cards.append(card(p.name, role, [p.phone], p.email, f"Ярче · {obj.code}"))
    return "\r\n".join(cards) + "\r\n"


MAX_GROUP = ["Тарасова", "Ларионова", "Жихарева", "Суркова", "Ильиных", "Тимофеева", "Слёзкин", "Черепанова", "Кускова", "Филатова"]


def max_group(obj: StoreObject, contacts: list[dict] | None = None) -> str:
    """Участники группы в МАХ по регламенту + директор магазина: один файл — все номера в контакты, потом добавить в группу."""
    contacts = contacts if contacts is not None else json.loads(CONTACTS.read_text(encoding="utf-8"))
    cards = []
    for sur in MAX_GROUP:
        c = next((x for x in contacts if x["fio"].split()[0].replace("ё", "е") == sur.replace("ё", "е")), None)
        if c and (c.get("phones") or c.get("phone")):
            phones = c.get("phones") or [c.get("phone")]
            cards.append(card(c["fio"], c.get("role", ""), phones, c.get("email", ""), "Ярче!"))
    d = obj.director
    if d.name and d.phone:
        cards.append(card(d.name, f"Директор магазина {obj.code}", [d.phone], obj.store_email or "", "Ярче!"))
    return "\r\n".join(cards) + "\r\n"
