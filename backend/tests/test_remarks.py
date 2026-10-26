import json
from app.api import Api
from app.disk import FakeDisk
from app.remarks import default_phrase
from app.storage import MemoryStore
from tests.test_api import TOKEN, call, make


def test_phrase():
    assert default_phrase("На входе: исправить оформление зоны радиаторов; срок 10.11") == "исправить оформление зоны радиаторов"
    assert default_phrase("Устранить протечку под сифоном мойки") == "Устранить протечку под сифоном мойки"


def test_remarks_flow():
    api = Api(MemoryStore(), TOKEN, disk=FakeDisk())
    oid = make(api)
    st, r = call(api, "POST", f"/api/objects/{oid}/remarks", {"section": "build", "zone": "Тамбур", "text": "Исправить решётку"})
    assert st == 400 and "срок" in r["error"]
    st, r = call(api, "POST", f"/api/objects/{oid}/remarks", {"section": "build", "zone": "Тамбур",
                 "text": "Утопить грязезащитную решётку", "deadline_ask": "Андрей Казаков"})
    assert st == 201 and r["phrase"] == "Утопить грязезащитную решётку"
    rid = r["id"]
    st, r = call(api, "POST", f"/api/objects/{oid}/remarks/{rid}/photo", {"image_b64": "aGVsbG8="})
    assert r["photos"][0]["path"].startswith("Приёмка/ПР22/Тамбур/")
    st, r = call(api, "PUT", f"/api/objects/{oid}/remarks/{rid}", {"deadline": "2026-11-10"})
    st, r = call(api, "PUT", f"/api/objects/{oid}/remarks/{rid}", {"deadline": "2026-11-12", "reason": "нет плитки"})
    assert r["deadline_history"] == [{"date": "2026-11-10", "reason": "нет плитки"}]
    st, z = call(api, "GET", f"/api/objects/{oid}/zones/1")
    assert next(x for x in z if x["zone"] == "Тамбур")["remarks"] == 1
    st, r = call(api, "POST", f"/api/objects/{oid}/remarks/{rid}/status", {"status": "accepted"}, user_id=1)
    assert r["status"] == "accepted"
    st, lst = call(api, "GET", f"/api/objects/{oid}/remarks")
    assert lst[0]["n"] == 1
