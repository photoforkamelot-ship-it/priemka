import base64
import json
from datetime import date

import pymupdf

from app.api import Api
from app.firstday import reminders
from app.storage import MemoryStore
from app.telegram_auth import TgUser, sign_init_data

TOKEN = "1:T"


def call(api, method, path, body=None, user_id=1):
    init = sign_init_data({"auth_date": 4_000_000_000, "user": {"id": user_id, "first_name": "И"}}, TOKEN)
    st, hd, out = api.handle(method, path, {"X-Telegram-Init-Data": init},
                             json.dumps(body, ensure_ascii=False).encode() if body is not None else b"")
    return st, (json.loads(out) if hd["Content-Type"].startswith("application/json") else out)


def make(api):
    st, o = call(api, "POST", "/api/objects", {"code": "пр22", "city": "Пермь", "address": "Комсомольский пр-т, 36",
                                               "okrug": "СФО", "accept_date": "2026-11-05", "store_email": "s@x.ru",
                                               "director": {"name": "Чепкасова Дарья Андреевна", "phone": "89000000000"},
                                               "dev_manager": {"name": "Шаврин Алексей", "email": "a@x.ru"}})
    assert st == 201 and o["code"] == "ПР22"
    return o["id"]


def test_auth_required():
    api = Api(MemoryStore(), TOKEN)
    st, _h, _b = api.handle("GET", "/api/objects", {}, b"")
    assert st == 401


def test_flow():
    api = Api(MemoryStore(), TOKEN)
    oid = make(api)
    st, lst = call(api, "GET", "/api/objects")
    assert lst[0]["missing_contracts"] == 4
    # чужой не видит
    st, _ = call(api, "GET", f"/api/objects/{oid}", user_id=2)
    assert st == 404
    # первый день: форма заблокирована до доступа к кассе
    st, steps = call(api, "GET", f"/api/objects/{oid}/firstday")
    assert next(s for s in steps if s["key"] == "forma")["state"] == "blocked"
    assert not any(s["key"] == "mops" for s in steps)
    st, steps = call(api, "POST", f"/api/objects/{oid}/firstday/cash", {"done": True})
    assert next(s for s in steps if s["key"] == "forma")["state"] == "todo"
    # АХЧ
    st, r = call(api, "POST", f"/api/objects/{oid}/ahch", {})
    assert "ПР22, г. Пермь" in r["text"] and r["channel"]["kind"] == "yk"
    # договор: загрузка PDF с адресом
    doc = pymupdf.open(); p = doc.new_page()
    p.insert_text((50, 50), "DOGOVOR", fontsize=12)
    p.insert_font(fontname="dj", fontfile="/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")
    p.insert_text((50, 80), "ДОГОВОР АРЕНДЫ № ИП-128 г. Пермь, проспект Комсомольский, дом 36", fontname="dj", fontsize=10)
    b64 = base64.b64encode(doc.tobytes()).decode()
    st, r = call(api, "POST", f"/api/objects/{oid}/contracts/upload", {"file_b64": b64})
    assert r["slots"] == ["arenda"] and r["contracts"]["arenda"]["status"] == "received"
    st, r = call(api, "POST", f"/api/objects/{oid}/contracts/request", {"to": "dev_manager"})
    assert "Договор аренды" not in r["body"] and r["button"] == "Запросить у Алексея" and r["mailto"].startswith("mailto:a@x.ru")
    # PDF
    st, pdf = call(api, "GET", f"/api/objects/{oid}/pdf/konvert")
    assert st == 200 and pdf[:4] == b"%PDF"


def test_reminders():
    api = Api(MemoryStore(), TOKEN)
    oid = make(api)
    o = api.store.get(oid)
    keys = lambda d: [r.key for r in reminders(o, d)]
    assert "cash_check" in keys(date(2026, 11, 4))
    assert "contracts" in keys(date(2026, 11, 7)) and "contracts" not in keys(date(2026, 11, 8))
    o.flags["dvornik_hired"] = True
    assert "dvornik_act" in keys(date(2026, 11, 30))
