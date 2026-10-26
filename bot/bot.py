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
        if action.startswith(("open:", "memo:", "print:")) and self.app_url:
            return {"text": title, "web_app": {"url": f"{self.app_url}#{action.replace(':', '/')}"}}
        return {"text": title, "callback_data": action[:64]}


def handle_update(update: dict, sender: Sender, store: Store) -> None:
    msg = update.get("message")
    if msg and msg.get("text", "").startswith(("/start", "/objects")):
        sender.send_text(msg["chat"]["id"], "Приёмка магазина: обход, замечания, письмо, первый день и памятка.",
                         [("Открыть приложение", "open:objects")])
        return
    cb = update.get("callback_query")
    if cb:
        sender.call("answerCallbackQuery", {"callback_query_id": cb["id"]})
        data, uid = cb.get("data", ""), cb["from"]["id"]
        oid = (cb.get("message", {}).get("reply_markup") and None) or None  # объект в callback: «done:cash|<id>»
        if "|" in data:
            data, oid = data.split("|", 1)
        if oid and data.startswith("done:"):
            o = store.get(oid)
            if o and (o.owner_tg == uid or uid in o.team_tg):
                o.first_day_done[data[5:]] = True
                store.put(o)
                sender.send_text(uid, "Отметил ✅")


def daily(store: Store, sender: Sender, today: date | None = None) -> int:
    """Запускается таймером раз в день (утром по местному времени)."""
    today = today or datetime.now(timezone(timedelta(hours=5))).date()
    n = 0
    for o in store.all():
        for r in firstday.reminders(o, today):
            buttons = [(t, f"{a}|{o.id}" if a.startswith("done:") else a) for t, a in r.buttons]
            for uid in {o.owner_tg, *o.team_tg}:
                if uid:
                    sender.send_text(uid, f"<b>{o.code}</b> · {r.text}", buttons)
                    n += 1
    return n
