"""Яндекс Диск: загрузка фото замечаний и публичные ссылки на папки.

Токен OAuth приложения (scope cloud_api:disk.write, cloud_api:disk.read) хранится только на сервере, в файле .env (DISK_TOKEN).
Яндекс Диск — отдельный сервис, Yandex Cloud для него не нужен.
Папки: «Приёмка/<КОД>/<Зона>/<id замечания>_<n>.jpg».
"""
from __future__ import annotations

import re
import time

import requests

BASE = "https://cloud-api.yandex.net/v1/disk"


def safe(name: str) -> str:
    return re.sub(r'[\\/:*?"<>|]+', "_", name).strip() or "_"


class Disk:
    def __init__(self, token: str, root: str = "Приёмка", session: requests.Session | None = None):
        self.root = root
        self.s = session or requests.Session()
        self.s.headers["Authorization"] = f"OAuth {token}"

    def _mkdirs(self, path: str):
        cur = ""
        for part in path.strip("/").split("/"):
            cur = f"{cur}/{part}" if cur else part
            r = self.s.put(f"{BASE}/resources", params={"path": cur}, timeout=15)
            if r.status_code not in (201, 409):
                r.raise_for_status()

    def upload(self, data: bytes, code: str, zone: str, filename: str, sub: str = "") -> str:
        folder = f"{self.root}/{safe(code)}/{safe(zone)}" + (f"/{safe(sub)}" if sub else "")
        self._mkdirs(folder)
        path = f"{folder}/{safe(filename)}"
        r = self.s.get(f"{BASE}/resources/upload", params={"path": path, "overwrite": "true"}, timeout=15)
        r.raise_for_status()
        put = requests.put(r.json()["href"], data=data, timeout=60)
        put.raise_for_status()
        return path

    def public_url(self, path: str) -> str:
        r = self.s.put(f"{BASE}/resources/publish", params={"path": path}, timeout=15)
        if r.status_code not in (200, 201, 409):
            r.raise_for_status()
        for _ in range(3):
            info = self.s.get(f"{BASE}/resources", params={"path": path, "fields": "public_url"}, timeout=15).json()
            if info.get("public_url"):
                return info["public_url"]
            time.sleep(0.5)
        return ""


class FakeDisk:
    """Для локальной отладки и тестов: хранит файлы в памяти."""

    def __init__(self):
        self.files: dict[str, bytes] = {}

    def upload(self, data, code, zone, filename, sub=""):
        path = f"Приёмка/{safe(code)}/{safe(zone)}/" + (f"{safe(sub)}/" if sub else "") + safe(filename)
        self.files[path] = data
        return path

    def public_url(self, path):
        return "https://disk.example/" + path
