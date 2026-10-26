"""Локальный сервер для разработки: API + статика Mini App.

    cd backend && python devserver.py            # http://localhost:8080
Без Telegram: все запросы идут от тестового пользователя id=1.
Данные — в файле backend/dev-data.json.
"""
from __future__ import annotations

import mimetypes
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from app.api import Api
from app.storage import FileStore
from app.disk import FakeDisk
from app.telegram_auth import TgUser

ROOT = Path(__file__).resolve().parent
STATIC = ROOT.parent / "miniapp"
api = Api(FileStore(ROOT / "dev-data.json"), bot_token="dev", dev_user=TgUser(id=1, first_name="Тест"), disk=FakeDisk())


class H(BaseHTTPRequestHandler):
    def _go(self, method):
        if self.path.startswith("/api/"):
            n = int(self.headers.get("Content-Length") or 0)
            st, hd, body = api.handle(method, self.path.split("?")[0], dict(self.headers), self.rfile.read(n) if n else b"")
        else:
            p = STATIC / (self.path.split("?")[0].lstrip("/") or "index.html")
            if not p.is_file():
                p = STATIC / "index.html"
            st, hd, body = 200, {"Content-Type": mimetypes.guess_type(p.name)[0] or "text/plain"}, p.read_bytes()
        self.send_response(st)
        for k, v in hd.items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self): self._go("GET")
    def do_POST(self): self._go("POST")
    def do_PUT(self): self._go("PUT")


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    print(f"http://localhost:{port}")
    ThreadingHTTPServer(("", port), H).serve_forever()
