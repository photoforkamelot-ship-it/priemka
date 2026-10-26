"""Рабочий сервер: API Mini App + статика + вебхук бота + ежедневные напоминания.

Один процесс на любом VPS или хостинге с Python 3.10+ и выходом в интернет по 443:
    cd backend && python server.py
Настройки — в файле backend/.env (см. docs/DEPLOY.md), секреты в чат и в git не попадают.
HTTPS даёт веб-сервер перед ним (Caddy/nginx): Telegram открывает Mini App только по https.
"""
from __future__ import annotations

import mimetypes
import os
import sys
import threading
import time
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent))


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"'))


load_env(ROOT / ".env")

import json  # noqa: E402

from app.api import Api  # noqa: E402
from app.disk import Disk  # noqa: E402
from app.storage import SqliteStore  # noqa: E402
from bot.bot import Sender, daily, handle_update  # noqa: E402

BOT_TOKEN = os.environ["BOT_TOKEN"]
APP_URL = os.environ.get("APP_URL", "").rstrip("/")          # https://priemka.example.ru
WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "")
TZ = timezone(timedelta(hours=int(os.environ.get("TZ_HOURS", "7"))))   # Томск — UTC+7
REMIND_HOUR = int(os.environ.get("REMIND_HOUR", "9"))
MAX_BODY = 30 * 1024 * 1024
STATIC = ROOT.parent / "miniapp"

store = SqliteStore(os.environ.get("DB_FILE", str(ROOT / "data" / "priemka.sqlite")))
sender = Sender(BOT_TOKEN, APP_URL)
disk = Disk(os.environ["DISK_TOKEN"]) if os.environ.get("DISK_TOKEN") else None
api = Api(store, BOT_TOKEN, sender=sender, disk=disk)


class H(BaseHTTPRequestHandler):
    server_version = "priemka"

    def log_message(self, fmt, *args):  # без тел запросов и initData в логах
        sys.stderr.write("%s %s\n" % (self.command, self.path.split("?")[0]))

    def _send(self, st, hd, body):
        self.send_response(st)
        for k, v in hd.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> bytes:
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            raise ValueError("too large")
        return self.rfile.read(n) if n else b""

    def _go(self, method):
        path = self.path.split("?")[0]
        try:
            body = self._body()
        except ValueError:
            return self._send(413, {"Content-Type": "text/plain"}, b"too large")
        if path.startswith("/api/"):
            return self._send(*api.handle(method, path, dict(self.headers), body))
        if path == "/tg/webhook" and method == "POST":
            if not WEBHOOK_SECRET or self.headers.get("X-Telegram-Bot-Api-Secret-Token") != WEBHOOK_SECRET:
                return self._send(403, {}, b"")
            try:
                handle_update(json.loads(body or b"{}"), sender, store)
            except Exception as e:  # Telegram повторит запрос, если ответить ошибкой — не надо
                sys.stderr.write(f"update error: {e!r}\n")
            return self._send(200, {}, b"")
        if method != "GET":
            return self._send(405, {}, b"")
        p = (STATIC / (path.lstrip("/") or "index.html")).resolve()
        if not str(p).startswith(str(STATIC.resolve())) or not p.is_file():
            p = STATIC / "index.html"
        ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        self._send(200, {"Content-Type": ctype, "Cache-Control": "no-cache"}, p.read_bytes())

    def do_GET(self): self._go("GET")
    def do_POST(self): self._go("POST")
    def do_PUT(self): self._go("PUT")


def reminders_loop():
    """Раз в день в REMIND_HOUR по местному времени — напоминания бота и копия базы."""
    last = None
    while True:
        now = datetime.now(TZ)
        if now.hour == REMIND_HOUR and last != now.date():
            last = now.date()
            try:
                n = daily(store, sender, today=now.date())
                sys.stderr.write(f"reminders sent: {n}\n")
                bdir = ROOT / "data" / "backup"
                bdir.mkdir(parents=True, exist_ok=True)
                store.backup(bdir / f"priemka-{now:%a}.sqlite")   # 7 копий по дням недели
            except Exception as e:
                sys.stderr.write(f"reminders error: {e!r}\n")
        time.sleep(60)


def set_webhook():
    if APP_URL and WEBHOOK_SECRET:
        r = sender.call("setWebhook", {"url": f"{APP_URL}/tg/webhook", "secret_token": WEBHOOK_SECRET,
                                       "allowed_updates": json.dumps(["message", "callback_query"])})
        sys.stderr.write(f"setWebhook: {r.get('ok')} {r.get('description', '')}\n")


if __name__ == "__main__":
    (ROOT / "data").mkdir(exist_ok=True)
    set_webhook()
    threading.Thread(target=reminders_loop, daemon=True).start()
    port = int(os.environ.get("PORT", "8080"))
    sys.stderr.write(f"listening on 127.0.0.1:{port}\n")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
