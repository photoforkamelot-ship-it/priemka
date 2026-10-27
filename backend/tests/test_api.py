import base64
import json
from datetime import date, timedelta

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


def test_timed_reminders():
    from datetime import datetime
    from app import firstday
    from app.models import Remark
    api = Api(MemoryStore(), TOKEN)
    oid = make(api)
    o = api.store.get(oid)
    acc = o.accept_date
    at = lambda d, hm: datetime.fromisoformat(f"{d.isoformat()}T{hm}:00")
    keys = lambda d, hm: [r.key for r in firstday.due(o, at(d, hm))]
    assert "first_12:30" in keys(acc, "12:40") and "first_12:30" not in keys(acc, "14:10")
    o.remarks.append(Remark(id="r1", section="build", zone="Тамбур", text="Покрасить", deadline=(acc + timedelta(days=2)).isoformat(), created="1"))
    d2 = acc + timedelta(days=2)
    assert "zh_check" in keys(d2, "09:10") and "update_soon" in keys(d2, "09:45") and "dl_today_r1" in keys(d2, "09:30")
    assert "dl_late_r1" in keys(d2 + timedelta(days=3), "09:00")
    o.extras["zh_ok"] = d2.isoformat()
    assert "update_soon" not in keys(d2, "09:45")
    o.flags["sent"] = {"dl_today_r1": d2.isoformat()}
    assert "dl_today_r1" not in keys(d2, "11:00")


class _Sender:
    def __init__(self):
        self.sent = []

    def send_text(self, chat_id, text, buttons=None):
        self.sent.append((chat_id, text))

    def send_document(self, chat_id, name, content, caption=""):
        self.sent.append((chat_id, name))

    def call(self, method, data=None):
        return {"ok": True, "result": {"username": "test_bot"}}


def test_team_invite_and_log_and_groups():
    import sys, pathlib
    sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
    from bot.bot import handle_update
    snd = _Sender()
    api = Api(MemoryStore(), TOKEN, sender=snd)
    oid = make(api)
    st, t = call(api, "POST", f"/api/objects/{oid}/team/invite")
    assert t["link"].startswith("https://t.me/test_bot?start=join_")
    payload = t["link"].split("start=")[1]
    handle_update({"message": {"text": f"/start {payload}", "chat": {"id": 7}, "from": {"id": 7, "first_name": "Пётр"}}}, snd, api.store)
    st, o = call(api, "GET", f"/api/objects/{oid}", user_id=7)
    assert st == 200
    # помощник не ставит «принято», журнал пишет кто и что
    st, r = call(api, "POST", f"/api/objects/{oid}/remarks", {"section": "build", "zone": "Тамбур", "text": "Покрасить потолок", "deadline": "2026-11-06"}, user_id=7)
    st, r2 = call(api, "PUT", f"/api/objects/{oid}/remarks/{r['id']}", {"deadline": "2026-11-08", "reason": "нет краски"}, user_id=7)
    assert any(l["what"] == "срок" and l["before"] == "2026-11-06" and l["after"] == "2026-11-08" for l in r2["log"])
    st, _ = call(api, "POST", f"/api/objects/{oid}/remarks/{r['id']}/status", {"status": "accepted"}, user_id=7)
    assert st == 403
    # объединение в подпункты
    st, r3 = call(api, "POST", f"/api/objects/{oid}/remarks", {"section": "build", "zone": "Тамбур", "text": "Заменить плитку армстронг", "deadline": "2026-11-06"})
    st, g = call(api, "POST", f"/api/objects/{oid}/groups", {"members": [r["id"], r3["id"]], "text": "Исправить оформление тамбура"})
    st, L = call(api, "GET", f"/api/objects/{oid}/letter/first")
    assert "1. Исправить оформление тамбура:" in L["text"] and "– Покрасить потолок" in L["text"]
    # убрать из команды — старая ссылка больше не работает
    call(api, "POST", f"/api/objects/{oid}/team/7/remove")
    st, _ = call(api, "GET", f"/api/objects/{oid}", user_id=7)
    assert st == 404


def test_stores_upload(tmp_path, monkeypatch):
    import openpyxl
    from app import api as api_mod
    monkeypatch.setenv("STORES_FILE", str(tmp_path / "stores.json"))
    monkeypatch.setenv("ADMIN_TG", "1")
    api_mod._STORES = None
    wb = openpyxl.Workbook(); ws = wb.active
    ws.append(["Пермь"])
    ws.append(["ОСП Пермь", "г. Пермь, ул. Ленина, д. 1", "ПР99", "Иванов Иван Иванович", "pr99@ya-retail.ru", "8-900-111-22-33"])
    f = tmp_path / "s.xlsx"; wb.save(f)
    api = Api(MemoryStore(), TOKEN)
    st, r = call(api, "POST", "/api/stores-upload", {"file_b64": base64.b64encode(f.read_bytes()).decode()})
    assert st == 200 and r["count"] == 1 and r["updated"]
    st, _ = call(api, "POST", "/api/stores-upload", {"file_b64": ""}, user_id=2)
    assert st == 403
    api_mod._STORES = None
