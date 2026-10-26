"""Точки входа Yandex Cloud Functions.

api_handler    — HTTP API для Mini App (API Gateway → функция).
bot_webhook    — вебхук Telegram.
daily_reminders — таймер раз в день.
Секреты (BOT_TOKEN) приходят из Lockbox через переменные окружения функции.
"""
from __future__ import annotations

import base64
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent))

from app.api import Api  # noqa: E402
from app.storage import from_env  # noqa: E402
from bot.bot import Sender, daily, handle_update  # noqa: E402

_store = None


def _ctx():
    global _store
    if _store is None:
        _store = from_env()
    sender = Sender(os.environ["BOT_TOKEN"], os.environ.get("APP_URL", ""))
    return _store, sender


def api_handler(event, context):
    store, sender = _ctx()
    body = event.get("body") or ""
    body = base64.b64decode(body) if event.get("isBase64Encoded") else body.encode()
    api = Api(store, os.environ["BOT_TOKEN"], sender=sender)
    status, headers, out = api.handle(event.get("httpMethod", "GET"), event.get("path", "/"), event.get("headers") or {}, body)
    binary = not headers.get("Content-Type", "").startswith(("application/json", "text/"))
    headers.update({"Access-Control-Allow-Origin": os.environ.get("APP_ORIGIN", "*")})
    return {"statusCode": status, "headers": headers, "isBase64Encoded": binary,
            "body": base64.b64encode(out).decode() if binary else out.decode()}


def bot_webhook(event, context):
    store, sender = _ctx()
    if (event.get("headers") or {}).get("X-Telegram-Bot-Api-Secret-Token") != os.environ.get("WEBHOOK_SECRET"):
        return {"statusCode": 403, "body": ""}
    handle_update(json.loads(event.get("body") or "{}"), sender, store)
    return {"statusCode": 200, "body": ""}


def daily_reminders(event, context):
    store, sender = _ctx()
    return {"sent": daily(store, sender)}
