from app.models import StoreObject
from app.storage import SqliteStore


def test_sqlite_roundtrip(tmp_path):
    s = SqliteStore(tmp_path / "db.sqlite")
    o = StoreObject(id="a1", code="ПР22", city="Томск", address="Комсомольский 36", okrug="СФО", owner_tg=5, team_tg=[7])
    s.put(o)
    s2 = SqliteStore(tmp_path / "db.sqlite")          # после перезапуска данные на месте
    assert s2.get("a1").code == "ПР22"
    assert [x.id for x in s2.list_for(7)] == ["a1"] and s2.list_for(9) == []
    s2.backup(tmp_path / "b.sqlite")
    assert SqliteStore(tmp_path / "b.sqlite").get("a1").address == "Комсомольский 36"
