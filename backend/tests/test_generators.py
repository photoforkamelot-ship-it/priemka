import json
from datetime import date

import pymupdf

from app.models import Person, StoreObject
from app.telegram_auth import AuthError, sign_init_data, verify_init_data
from app.generators import texts, contracts, vcf
from app.generators.names import from_genitive_short
from app.generators.pdfs import dvornik_poster, envelope_insert


def obj(**kw):
    o = StoreObject(id="1", code="ПР22", city="Пермь", address="Комсомольский пр-т, 36", okrug="СФО",
                    accept_date=date(2026, 11, 5), store_email="pr22@example.ru",
                    director=Person("Чепкасова Дарья Андреевна", phone="+7 900 000-00-00"),
                    dev_manager=Person("Шаврин Алексей Александрович", email="a.shavrin@ya-retail.ru"))
    for k, v in kw.items():
        setattr(o, k, v)
    return o


def test_auth_roundtrip():
    tok = "123:ABC"
    data = sign_init_data({"auth_date": 2_000_000_000, "user": {"id": 7, "first_name": "Иван"}}, tok)
    u = verify_init_data(data, tok, now=2_000_000_100)
    assert u.id == 7 and u.display == "Иван"
    try:
        verify_init_data(data, "999:XYZ", now=2_000_000_100)
        assert False
    except AuthError:
        pass


def test_ahch_text():
    t = texts.ahch_request(obj(), ["Повесить зеркало", "", "Собрать рециркулятор"])
    assert t.startswith("Добрый день,\nПР22, г. Пермь, Комсомольский пр-т, 36\nЗАЯВКА СРОЧНАЯ")
    assert "Просьба приехать 05.11.2026" in t and "2. Собрать рециркулятор" in t


def test_contracts_request_only_missing():
    o = obj()
    o.contracts["arenda"].status = o.contracts["tko"].status = o.contracts["dez"].status = "received"
    r = texts.contracts_request(o, o.dev_manager)
    assert r["subject"] == "ПР22 Сканы договоров" and r["cc"] == "pr22@example.ru"
    assert r["button"] == "Запросить у Алексея"
    assert "Договор ОПС" in r["body"] and "аренды" not in r["body"]


def test_names_genitive():
    assert from_genitive_short("Чепкасова Дарья Андреевна") == "ЧЕПКАСОВОЙ Д.А."
    assert from_genitive_short("Петров Пётр Петрович") == "ПЕТРОВА П.П."


def test_group_name_and_signature():
    assert texts.whatsapp_group_name(obj()) == "ПР22 Комсомольский 36"
    assert "ОСП ПЕРМЬ МАГАЗИН №ПР22" in texts.outlook_signature(obj())


def test_contract_detection():
    a = "Комсомольский пр-т, 36"
    d = contracts.detect_text("ДОГОВОР АРЕНДЫ № ИП-128-Пермь ... г. Пермь, проспект Комсомольский, дом 36", a)
    assert d.slots == ["arenda"] and d.has_address
    d = contracts.detect_text("Дератизация ... г. Пермь, ул. Докучаева, 24", a)
    assert d.slots == ["dez"] and not d.has_address
    d = contracts.detect_text("услуг по обращению с твердыми коммунальными отходами Комсомольский пр-кт, 36", a)
    assert "tko" in d.slots and d.has_address


def test_pdfs_render():
    for data in (envelope_insert(obj()), dvornik_poster(obj())):
        doc = pymupdf.open(stream=data, filetype="pdf")
        text = doc[0].get_text()
        assert "КОМСОМОЛЬСКИЙ" in text.upper()
    env = pymupdf.open(stream=envelope_insert(obj()), filetype="pdf")[0].get_text()
    assert "ОТ ЧЕПКАСОВОЙ Д.А." in env and "89000000000" in env


def test_vcf_region_filter():
    o = obj()
    v = vcf.for_object(o)
    assert "Конохова" in v and "Романова" not in v and "Шаврин" in v
    assert v.count("BEGIN:VCARD") == v.count("END:VCARD")
