"""Хранилище объектов.

Объект целиком хранится одним JSON-документом. Две реализации:
- MemoryStore / FileStore — для локальной отладки и тестов;
- YdbStore — Yandex Database (serverless, бесплатный лимит), для облака.
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


class YdbStore:
    """Таблица objects(id Utf8, owner Int64, team Json, data Json, PRIMARY KEY(id))."""

    def __init__(self, endpoint: str, database: str):
        import ydb  # noqa: импорт только в облаке
        import ydb.iam
        self._ydb = ydb
        self.driver = ydb.Driver(endpoint=endpoint, database=database,
                                 credentials=ydb.iam.MetadataUrlCredentials())
        self.driver.wait(fail_fast=True, timeout=10)
        self.pool = ydb.SessionPool(self.driver)

    def _q(self, query: str, params: dict):
        def tx(session):
            prepared = session.prepare(query)
            return session.transaction(self._ydb.SerializableReadWrite()).execute(prepared, params, commit_tx=True)
        return self.pool.retry_operation_sync(tx)

    def get(self, obj_id):
        rs = self._q("DECLARE $id AS Utf8; SELECT data FROM objects WHERE id = $id;", {"$id": obj_id})
        rows = rs[0].rows
        return StoreObject.from_dict(json.loads(rows[0].data)) if rows else None

    def put(self, obj):
        self._q("DECLARE $id AS Utf8; DECLARE $owner AS Int64; DECLARE $team AS Json; DECLARE $data AS Json;"
                "UPSERT INTO objects (id, owner, team, data) VALUES ($id, $owner, $team, $data);",
                {"$id": obj.id, "$owner": obj.owner_tg, "$team": json.dumps(obj.team_tg),
                 "$data": json.dumps(obj.to_dict(), ensure_ascii=False)})

    def all(self):
        rs = self._q("SELECT data FROM objects;", {})
        return [StoreObject.from_dict(json.loads(r.data)) for r in rs[0].rows]

    def list_for(self, tg_id):
        return [o for o in self.all() if o.owner_tg == tg_id or tg_id in o.team_tg]


def from_env() -> Store:
    if os.getenv("YDB_ENDPOINT"):
        return YdbStore(os.environ["YDB_ENDPOINT"], os.environ["YDB_DATABASE"])
    if os.getenv("STORE_FILE"):
        return FileStore(os.environ["STORE_FILE"])
    return MemoryStore()
