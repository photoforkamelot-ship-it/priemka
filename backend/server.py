"""Рабочий сервер для VPS: один процесс — API, статика, вебхук бота, напоминания в 9:00.

    cd backend && python server.py
Настройки — backend/.env (см. docs/DEPLOY.md, вариант Б). Для PythonAnywhere — wsgi.py.
"""
from __future__ import annotations

import os
import sys
import threading
import time
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent))

from app.web import MAX_BODY, App  # noqa: E402

app = App()


class H(BaseHTTPRequestHandler):
    server_version = "priemka"

    def log_message(self, fmt, *args):  # без тел запросов и initData в логах
        sys.stderr.write("%s %s\n" % (self.command, self.path.split("?")[0]))

    def _go(self, method):
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            st, hd, body = 413, {}, b"too large"
        else:
            st, hd, body = app.route(method, self.path.split("?")[0], dict(self.headers), self.rfile.read(n) if n else b"")
        self.send_response(st)
        for k, v in hd.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self): self._go("GET")
    def do_POST(self): self._go("POST")
    def do_PUT(self): self._go("PUT")


def reminders_loop():
    hour, last = int(os.environ.get("REMIND_HOUR", "9")), None
    while True:
        now = datetime.now(app.tz)
        if now.hour == hour and last != now.date():
            last = now.date()
            try:
                sys.stderr.write(f"daily: {app.run_daily()}\n")
            except Exception as e:
                sys.stderr.write(f"daily error: {e!r}\n")
        time.sleep(60)


if __name__ == "__main__":
    if app.app_url and app.webhook_secret:
        sys.stderr.write(f"setWebhook: {app.set_webhook().get('ok')}\n")
    threading.Thread(target=reminders_loop, daemon=True).start()
    port = int(os.environ.get("PORT", "8080"))
    sys.stderr.write(f"listening on 127.0.0.1:{port}\n")
    ThreadingHTTPServer(("127.0.0.1", port), H).serve_forever()
