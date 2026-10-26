"""Общая маршрутизация для рабочих серверов (server.py — VPS, wsgi.py — PythonAnywhere).

/api/...        — API Mini App
/tg/webhook     — вебхук Telegram (заголовок X-Telegram-Bot-Api-Secret-Token)
/cron/daily     — ежедневные напоминания; дёргает внешний будильник (GitHub Actions)
                  с заголовком X-Cron-Key — на бесплатном PythonAnywhere своих задач по расписанию нет
остальное       — статика Mini App
"""
from __future__ import annotations

import hmac
import json
import mimetypes
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .api import Api
from .disk import Disk
from .storage import SqliteStore

BACKEND = Path(__file__).resolve().parent.parent
STATIC = BACKEND.parent / "miniapp"
MAX_BODY = 30 * 1024 * 1024


def load_env(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            v = v.split("  #")[0].strip().strip('"')
            os.environ.setdefault(k.strip(), v)


def _eq(a: str, b: str) -> bool:
    return bool(a) and bool(b) and hmac.compare_digest(a, b)


class App:
    def __init__(self):
        from bot.bot import Sender  # bot/ лежит рядом с backend/
        load_env(BACKEND / ".env")
        self.bot_token = os.environ["BOT_TOKEN"]
        self.app_url = os.environ.get("APP_URL", "").rstrip("/")
        self.webhook_secret = os.environ.get("WEBHOOK_SECRET", "")
        self.cron_secret = os.environ.get("CRON_SECRET", "")
        self.tz = timezone(timedelta(hours=int(os.environ.get("TZ_HOURS", "7"))))
        (BACKEND / "data").mkdir(exist_ok=True)
        self.store = SqliteStore(os.environ.get("DB_FILE", str(BACKEND / "data" / "priemka.sqlite")))
        self.sender = Sender(self.bot_token, self.app_url)
        disk = Disk(os.environ["DISK_TOKEN"]) if os.environ.get("DISK_TOKEN") else None
        self.api = Api(self.store, self.bot_token, sender=self.sender, disk=disk)

    # ---------- задачи ----------
    def run_daily(self) -> dict:
        from bot.bot import daily
        now = datetime.now(self.tz)
        sent = daily(self.store, self.sender, today=now.date())
        bdir = BACKEND / "data" / "backup"
        bdir.mkdir(parents=True, exist_ok=True)
        self.store.backup(bdir / f"priemka-{now:%a}.sqlite")   # 7 копий по дням недели
        admin = os.environ.get("ADMIN_TG")
        if admin and now.day in (1, 15) and os.environ.get("HOST") == "pythonanywhere":
            self.sender.send_text(int(admin), "Продлите бесплатный сайт на PythonAnywhere: вкладка Web → «Run until 1 month from today». "
                                              "Без этого через месяц приложение остановится.")
        return {"sent": sent}

    def deploy(self) -> dict:
        """Автообновление: GitHub Actions после каждой выкладки зовёт /cron/deploy, затем перезапускает сайт через API PythonAnywhere.
        Здесь — git pull и, если поменялся requirements.txt, установка библиотек в фоне."""
        import subprocess
        repo = BACKEND.parent
        req = BACKEND / "requirements.txt"
        before = req.read_bytes() if req.exists() else b""
        r = subprocess.run(["git", "pull", "--ff-only"], cwd=repo, capture_output=True, text=True, timeout=120)
        out = {"pull": (r.stdout + r.stderr).strip()[-600:], "ok": r.returncode == 0}
        if r.returncode == 0 and req.exists() and req.read_bytes() != before:
            subprocess.Popen([sys.executable, "-m", "pip", "install", "--user", "-q", "-r", str(req)], cwd=repo,
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
            out["pip"] = "started"
        head = subprocess.run(["git", "log", "-1", "--format=%h %s"], cwd=repo, capture_output=True, text=True)
        out["version"] = head.stdout.strip()
        return out

    def status(self) -> dict:
        """Диагностика: версия кода, вебхук бота, справочник магазинов, Диск."""
        import subprocess
        head = subprocess.run(["git", "log", "-1", "--format=%h %s"], cwd=BACKEND.parent, capture_output=True, text=True)
        try:
            wh = self.sender.call("getWebhookInfo")["result"]
            wh = {k: wh.get(k) for k in ("url", "pending_update_count", "last_error_message", "last_error_date")}
            if self.app_url and self.webhook_secret and wh.get("url") != f"{self.app_url}/tg/webhook":
                wh["fixed"] = self.set_webhook().get("ok")   # бот молчал без вебхука — подключаем сами
        except Exception as e:
            wh = {"error": repr(e)}
        from .api import _stores
        return {"version": head.stdout.strip(), "webhook": wh, "stores": len(_stores()["stores"]),
                "disk": bool(os.environ.get("DISK_TOKEN")), "objects": len(list(self.store.all()))}

    def set_webhook(self) -> dict:
        return self.sender.call("setWebhook", {"url": f"{self.app_url}/tg/webhook", "secret_token": self.webhook_secret,
                                               "allowed_updates": json.dumps(["message", "callback_query"])})

    # ---------- маршрутизация ----------
    def route(self, method: str, path: str, headers: dict, body: bytes):
        from bot.bot import handle_update
        h = {k.lower(): v for k, v in headers.items()}
        if path.startswith("/api/"):
            return self.api.handle(method, path, headers, body)
        if path == "/tg/webhook" and method == "POST":
            if not _eq(h.get("x-telegram-bot-api-secret-token", ""), self.webhook_secret):
                return 403, {}, b""
            try:
                handle_update(json.loads(body or b"{}"), self.sender, self.store)
            except Exception as e:  # ошибку не возвращаем — иначе Telegram будет повторять
                sys.stderr.write(f"update error: {e!r}\n")
            return 200, {}, b""
        if path == "/cron/daily" and method == "POST":
            if not _eq(h.get("x-cron-key", ""), self.cron_secret):
                return 403, {}, b""
            return 200, {"Content-Type": "application/json"}, json.dumps(self.run_daily()).encode()
        if path == "/cron/setwebhook" and method == "POST":
            if not _eq(h.get("x-cron-key", ""), self.cron_secret):
                return 403, {}, b""
            return 200, {"Content-Type": "application/json"}, json.dumps(self.set_webhook()).encode()
        if path == "/cron/deploy" and method == "POST":
            if not _eq(h.get("x-cron-key", ""), self.cron_secret):
                return 403, {}, b""
            return 200, {"Content-Type": "application/json"}, json.dumps(self.deploy(), ensure_ascii=False).encode()
        if path == "/cron/status" and method == "POST":
            if not _eq(h.get("x-cron-key", ""), self.cron_secret):
                return 403, {}, b""
            return 200, {"Content-Type": "application/json"}, json.dumps(self.status(), ensure_ascii=False).encode()
        if method != "GET":
            return 405, {}, b""
        p = (STATIC / (path.lstrip("/") or "index.html")).resolve()
        if not str(p).startswith(str(STATIC.resolve())) or not p.is_file():
            p = STATIC / "index.html"
        ctype = mimetypes.guess_type(p.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"   # иначе браузер телефона показывает русский текст «кракозябрами»
        return 200, {"Content-Type": ctype, "Cache-Control": "no-cache"}, p.read_bytes()
