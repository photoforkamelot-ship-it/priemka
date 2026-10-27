"""Замечания: создание, фраза-ссылка, сроки, статусы, нумерация для письма."""
from __future__ import annotations

import json
import re
from datetime import date
from pathlib import Path

from .models import SECTIONS, ZONES, Comment, Remark, StoreObject
from .storage import new_id

VERB = re.compile(r"\b[А-Яа-яЁё]+(?:ть|ти|чь)(?:ся)?\b")
CONTACTS = Path(__file__).resolve().parent / "assets" / "contacts.json"


def default_phrase(text: str) -> str:
    """«На входе: исправить оформление зоны радиаторов; срок …» → «исправить оформление зоны радиаторов»."""
    head = text.split(";")[0].strip()
    m = VERB.search(head)
    return (head[m.start():] if m else head).strip(" .,")


def validate(r: Remark):
    if r.section not in SECTIONS:
        raise ValueError("раздел: стройка или оборудование")
    if r.zone not in ZONES:
        raise ValueError("зона из списка")
    if not r.text.strip():
        raise ValueError("нужен текст замечания")
    if not r.question and not r.deadline and not r.deadline_ask and not r.deadline_text:
        raise ValueError("замечание без срока сохранить нельзя: дата или «уточняется у …»")
    if r.deadline:
        date.fromisoformat(r.deadline)


def create(obj: StoreObject, data: dict, author_tg: int, author_name: str) -> Remark:
    cid = str(data.get("id") or "")
    r = Remark(id=cid if re.fullmatch(r"[0-9a-f]{12}", cid) and not any(x.id == cid for x in obj.remarks) else new_id(), section=data.get("section", "build"), zone=data.get("zone", ""), text=data.get("text", "").strip(),
               deadline=data.get("deadline", "") or "", deadline_ask=data.get("deadline_ask", "") or "",
               responsible=data.get("responsible", ""), responsible_email=data.get("responsible_email", ""),
               question=bool(data.get("question")), author_tg=author_tg, author_name=author_name,
               created=date.today().isoformat(), stage=int(data.get("stage", 1)),
               deadline_text=(data.get("deadline_text") or "").strip(), item_ref=data.get("item_ref", ""),
               plan_mark=_mark(data.get("plan_mark")))
    r.phrase = (data.get("phrase") or "").strip() or default_phrase(r.text)
    if data.get("fixed_on_site"):
        r.status = "fixed_on_site"
    validate(r)
    obj.remarks.append(r)
    return r


def _mark(m) -> dict:
    if not m:
        return {}
    x, y = float(m["x"]), float(m["y"])
    if not (0 <= x <= 1 and 0 <= y <= 1):
        raise ValueError("метка вне плана")
    return {"plan": str(m["plan"]), "page": int(m.get("page", 1)), "x": round(x, 5), "y": round(y, 5)}


FIELD_NAMES = {"section": "раздел", "zone": "зона", "text": "текст", "phrase": "фраза-ссылка", "deadline": "срок",
               "deadline_ask": "срок уточняется у", "deadline_text": "срок", "responsible": "ответственный", "question": "вопрос"}
STATUS_NAMES = {"open": "открыто", "fixed": "исправлено", "accepted": "принято", "fixed_on_site": "устранено в ходе приёмки"}


def log(r: Remark, who: str, what: str, before: str = "", after: str = ""):
    from datetime import datetime
    r.log.append({"who": who, "when": datetime.now().strftime("%Y-%m-%d %H:%M"), "what": what, "before": before, "after": after})


def update(r: Remark, data: dict, who: str = ""):
    """Правка пункта; каждое изменённое поле — в журнал: кто, когда, было → стало."""
    before = {k: getattr(r, k) for k in FIELD_NAMES}
    _update(r, data)
    if who:
        for k, name in FIELD_NAMES.items():
            a, b = before[k], getattr(r, k)
            if a != b:
                log(r, who, name, "да" if a is True else "нет" if a is False else str(a), "да" if b is True else "нет" if b is False else str(b))


def _update(r: Remark, data: dict):
    if "plan_mark" in data:
        r.plan_mark = _mark(data["plan_mark"])
    for k in ("section", "zone", "text", "phrase", "deadline_ask", "deadline_text", "responsible", "responsible_email"):
        if k in data:
            setattr(r, k, (data[k] or "").strip())
    if "question" in data:
        r.question = bool(data["question"])
    if "deadline" in data and (data["deadline"] or "") != r.deadline:
        if r.deadline:                                   # перенос срока — вся цепочка
            r.deadline_history.append({"date": r.deadline, "reason": data.get("reason", "")})
        r.deadline = data["deadline"] or ""
    validate(r)


STATUSES = ("open", "fixed", "accepted", "fixed_on_site")


def set_status(r: Remark, status: str, is_owner: bool):
    if status not in STATUSES:
        raise ValueError("неизвестный статус")
    if status == "accepted" and not is_owner:
        raise PermissionError("«Принято» ставит только руководитель команды")
    r.status = status
    today = date.today().isoformat()
    if status == "accepted":
        r.accepted_date = today
    elif status == "fixed":
        r.fixed_date = today
    elif status == "open":
        r.accepted_date = r.fixed_date = ""


def add_comment(r: Remark, author: str, text: str, color: str = ""):
    if text.strip():
        r.comments.append(Comment(author=author, text=text.strip(), date=date.today().isoformat(), color=color))


def numbered(obj: StoreObject, for_update: bool = False) -> dict[str, list[tuple[int, Remark]]]:
    """Сквозная нумерация внутри раздела; вопросы — в конце своего списка; принятые и
    «устранено в ходе приёмки» в апдейт не идут."""
    out = {}
    for sec in SECTIONS:
        items = [r for r in obj.remarks if r.section == sec]
        if for_update:
            items = [r for r in items if r.status not in ("accepted", "fixed_on_site")]
        items.sort(key=lambda r: (r.question, ZONES.index(r.zone) if r.zone in ZONES else 99, r.created))
        out[sec] = list(enumerate(items, 1))
    return out


def zone_summary(obj: StoreObject, stage: int) -> list[dict]:
    checked = set(obj.zones_checked.get(str(stage), []))
    res = []
    for z in ZONES:
        rs = [r for r in obj.remarks if r.zone == z and r.stage == stage]
        res.append({"zone": z, "checked": z in checked, "remarks": len(rs),
                    "no_deadline": sum(r.needs_deadline for r in rs),
                    "authors": sorted({r.author_name for r in rs if r.author_name})})
    return res


def people_for(obj: StoreObject) -> list[dict]:
    """Ответственные для выбора: общие + своего округа + координатор объекта."""
    cs = json.loads(CONTACTS.read_text(encoding="utf-8"))
    out = [{"name": c["fio"], "email": c.get("email", ""), "role": c.get("role", "")} for c in cs
           if c.get("scope") in ("all", obj.okrug) or (c.get("scope") == "region" and c.get("area") == obj.okrug)]
    if obj.dev_manager.filled and not any(x["name"] == obj.dev_manager.name for x in out):
        out.insert(0, {"name": obj.dev_manager.name, "email": obj.dev_manager.email, "role": "Менеджер по развитию региона"})
    if obj.coordinator.filled:
        out.insert(0, {"name": obj.coordinator.name, "email": obj.coordinator.email, "role": "Координатор строительства"})
    return out
