"""Бот: вебхук (/start, кнопки напоминаний), отправка файлов «на печать», ежедневные напоминания.

Работает без библиотек — прямые вызовы Bot API через requests.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))
from app import firstday  # noqa: E402
from app.storage import Store  # noqa: E402

API = "https://api.telegram.org/bot{token}/{method}"


class Sender:
    def __init__(self, token: str, app_url: str = ""):
        self.token, self.app_url = token, app_url

    def call(self, method: str, data: dict | None = None, files: dict | None = None) -> dict:
        r = requests.post(API.format(token=self.token, method=method), data=data, files=files, timeout=20)
        r.raise_for_status()
        return r.json()

    def send_text(self, chat_id: int, text: str, buttons: list[tuple[str, str]] | None = None) -> dict:
        data = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
        if buttons:
            data["reply_markup"] = json.dumps({"inline_keyboard": [[self._btn(t, a)] for t, a in buttons]})
        return self.call("sendMessage", data)

    def send_document(self, chat_id: int, name: str, content: bytes, caption: str = "") -> dict:
        return self.call("sendDocument", {"chat_id": chat_id, "caption": caption}, files={"document": (name, content)})

    def _btn(self, title: str, action: str) -> dict:
        if action.startswith("tel:"):
            return {"text": f"{title} {action[4:]}", "callback_data": "noop"}
        if action.startswith("open:") and self.app_url:
            return {"text": title, "web_app": {"url": f"{self.app_url}/#{action[5:]}"}}
        return {"text": title, "callback_data": action[:64]}


def handle_update(update: dict, sender: Sender, store: Store) -> None:
    msg = update.get("message")
    txt = (msg or {}).get("text", "")
    if msg and txt.startswith("/start join_"):
        # приглашение в команду объекта: /start join_<объект>_<код>
        try:
            _, oid, code = txt.split(maxsplit=1)[1].split("_", 2)
        except ValueError:
            oid = code = ""
        o = store.get(oid) if oid else None
        frm = msg.get("from", {})
        uid = frm.get("id")
        name = " ".join(x for x in (frm.get("first_name"), frm.get("last_name")) if x) or frm.get("username") or str(uid)
        if not o or not code or o.flags.get("invite") != code:
            sender.send_text(msg["chat"]["id"], "Ссылка-приглашение устарела. Попросите руководителя прислать новую.")
            return
        if uid != o.owner_tg and uid not in o.team_tg:
            o.team_tg.append(uid)
        o.flags.setdefault("team_names", {})[str(uid)] = name
        store.put(o)
        sender.send_text(msg["chat"]["id"], f"Вы в команде объекта {o.code}, {o.full_address}. Замечания, фото и недовозы — в приложении.",
                         [("Открыть объект", f"open:o/{o.id}")])
        try:
            sender.send_text(o.owner_tg, f"{name} присоединился к команде объекта {o.code}.", [("Команда", f"open:o/{o.id}/data")])
        except Exception:
            pass
        return
    if msg and txt.startswith(("/start", "/objects")):
        sender.send_text(msg["chat"]["id"], "Приёмка магазина: обход, замечания, письмо, первый день и памятка.",
                         [("Открыть приложение", "open:objects")])
        return
    cb = update.get("callback_query")
    if not cb:
        return
    sender.call("answerCallbackQuery", {"callback_query_id": cb["id"]})
    data, uid = cb.get("data", ""), cb["from"]["id"]
    if data == "noop" or "|" not in data:
        return
    data, oid = data.split("|", 1)
    o = store.get(oid)
    if not o or not (o.owner_tg == uid or uid in o.team_tg):
        return
    today = local_now(o).date()
    if data.startswith("done:"):
        o.first_day_done[data[5:]] = True
        reply = "Отметил ✅"
    elif data == "zh:ok":
        o.extras["zh_ok"] = today.isoformat()
        reply = "Отметил: Жихарева приняла фото ✅ Апдейт можно отправлять до 10:00."
    elif data == "sent:first":
        o.extras["first_sent"] = today.isoformat()
        reply = "Отметил: первое письмо отправлено ✅"
    elif data.startswith("snooze:"):
        o.flags.setdefault("snooze", {})[data[7:]] = (today + timedelta(days=1)).isoformat()
        reply = "Хорошо, напомню завтра."
    elif data == "cash_wait":
        reply = "Проверьте заявку на доступ к кассе в ЯК (Помощь → мои заявки) и напишите исполнителю. Завтра спрошу ещё раз."
    elif data.startswith("print:"):
        from app.generators import pdfs
        kind = data[6:]
        make = {"konvert": pdfs.envelope_insert, "dvornik": pdfs.dvornik_poster,
                "ahchlist": lambda x: pdfs.readiness_list(x)}.get(kind)
        if make:
            sender.send_document(uid, f"{kind}-{o.code}.pdf", make(o), "На печать → «Поделиться» → Kyocera Mobile Print")
        return
    else:
        return
    store.put(o)
    sender.send_text(uid, f"<b>{o.code}</b> · {reply}")


ROUTES = {"open:prep": "o/{id}", "open:contracts": "o/{id}/contracts", "open:object": "o/{id}/data",
          "open:letter": "o/{id}/letter/first", "open:update": "o/{id}/letter/update", "open:walk2": "o/{id}/walk/2",
          "open:walk3": "o/{id}/walk/3", "open:ahch": "o/{id}/ahch", "memo:dvornik": "o/{id}/dvornik", "open:objects": "objects",
          "open:feedback": "o/{id}/feedback", "open:memo-forma": "doc/memo%2Fpamyatka-otkrytiya%2Finstr%2Fforma%2Fforma.html"}


def route(action: str, oid: str) -> str:
    """Кнопка напоминания: экран приложения этого объекта, отметка «сделано» или звонок."""
    if action.startswith(("done:", "snooze:", "print:", "zh:", "sent:")) or action == "cash_wait":
        return f"{action}|{oid}"
    if action in ROUTES:
        return "open:" + ROUTES[action].format(id=oid)
    if action.startswith("open:r/"):
        return f"open:o/{oid}/{action[5:]}"
    return action


def local_now(o, utc: datetime | None = None) -> datetime:
    utc = utc or datetime.now(timezone.utc)
    return utc.astimezone(timezone(timedelta(hours=firstday.tz_hours(o))))


def tick(store: Store, sender: Sender, utc: datetime | None = None) -> int:
    """Каждые 30 минут: по местному времени каждого объекта — что пора отправить (каждое — раз в день)."""
    n = 0
    for o in store.all():
        now = local_now(o, utc)
        rs = firstday.due(o, now)
        if not rs:
            continue
        for r in rs:
            buttons = [(t, route(a, o.id)) for t, a in r.buttons]
            for uid in ({r.to} if r.to else {o.owner_tg, *o.team_tg}):
                if uid:
                    try:
                        sender.send_text(uid, f"<b>{o.code}</b> · {r.text}", buttons)
                        n += 1
                    except Exception as e:  # один недоставленный — не повод ронять остальные
                        sys.stderr.write(f"send {o.code} {r.key}: {e!r}\n")
            if not isinstance(o.flags.get("sent"), dict):
                o.flags["sent"] = {}
            o.flags["sent"][r.key] = now.date().isoformat()
        store.put(o)
    return n


def daily(store: Store, sender: Sender, today: date | None = None) -> int:
    """Совместимость: утренний прогон = обычный тик."""
    return tick(store, sender)
