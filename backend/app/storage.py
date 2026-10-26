"""Хранилище объектов.

Объект целиком хранится одним JSON-документом:
- MemoryStore / FileStore — для локальной отладки и тестов;
- SqliteStore — файл SQLite на сервере (рабочий режим).
"""
from __future__ import annotations

import json
import os
import threading
import uuid
from pathlib import Path
from typing import Iterable, Protocol

from .models import StoreObject


class Store(Protocol):
    def get(self, obj_id: str) -> StoreObject | None: ...
    def put(self, obj: StoreObject) -> None: ...
    def list_for(self, tg_id: int) -> list[StoreObject]: ...
    def all(self) -> Iterable[StoreObject]: ...


def new_id() -> str:
    return uuid.uuid4().hex[:12]


class MemoryStore:
    def __init__(self):
        self._d: dict[str, dict] = {}
        self._lock = threading.Lock()

    def get(self, obj_id):
        with self._lock:
            d = self._d.get(obj_id)
        return StoreObject.from_dict(d) if d else None

    def put(self, obj):
        with self._lock:
            self._d[obj.id] = obj.to_dict()

    def all(self):
        with self._lock:
            items = list(self._d.values())
        return [StoreObject.from_dict(d) for d in items]

    def list_for(self, tg_id):
        return [o for o in self.all() if o.owner_tg == tg_id or tg_id in o.team_tg]


class FileStore(MemoryStore):
    """MemoryStore, который сохраняется в JSON-файл (локальная разработка)."""

    def __init__(self, path: str | os.PathLike):
        super().__init__()
        self.path = Path(path)
        if self.path.exists():
            self._d = json.loads(self.path.read_text(encoding="utf-8"))

    def put(self, obj):
        super().put(obj)
        with self._lock:
            self.path.write_text(json.dumps(self._d, ensure_ascii=False, indent=1), encoding="utf-8")


class SqliteStore:
    """SQLite-файл на сервере: таблица objects(id, owner, team, data). Подходит для любого VPS/хостинга."""

    def __init__(self, path: str | os.PathLike):
        import sqlite3
        self.path = str(path)
        self._lock = threading.Lock()
        self._db = sqlite3.connect(self.path, check_same_thread=False)
        try:  # на сетевых дисках (PythonAnywhere) WAL может быть недоступен — тогда обычный режим
            self._db.execute("PRAGMA journal_mode=WAL")
        except sqlite3.OperationalError:
            pass
        self._db.execute("CREATE TABLE IF NOT EXISTS objects (id TEXT PRIMARY KEY, owner INTEGER, team TEXT, data TEXT NOT NULL)")
        self._db.commit()

    def get(self, obj_id):
        with self._lock:
            row = self._db.execute("SELECT data FROM objects WHERE id = ?", (obj_id,)).fetchone()
        return StoreObject.from_dict(json.loads(row[0])) if row else None

    def put(self, obj):
        with self._lock:
            self._db.execute("INSERT OR REPLACE INTO objects (id, owner, team, data) VALUES (?, ?, ?, ?)",
                             (obj.id, obj.owner_tg, json.dumps(obj.team_tg), json.dumps(obj.to_dict(), ensure_ascii=False)))
            self._db.commit()

    def all(self):
        with self._lock:
            rows = self._db.execute("SELECT data FROM objects").fetchall()
        return [StoreObject.from_dict(json.loads(r[0])) for r in rows]

    def list_for(self, tg_id):
        return [o for o in self.all() if o.owner_tg == tg_id or tg_id in o.team_tg]

    def backup(self, dest: str | os.PathLike) -> None:
        import sqlite3
        with self._lock:
            out = sqlite3.connect(str(dest))
            self._db.backup(out)
            out.close()


def from_env() -> Store:
    if os.getenv("DB_FILE"):
        return SqliteStore(os.environ["DB_FILE"])
    if os.getenv("STORE_FILE"):
        return FileStore(os.environ["STORE_FILE"])
    return MemoryStore()
