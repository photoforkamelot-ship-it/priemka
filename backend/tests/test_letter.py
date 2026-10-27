from datetime import date

from app import letter, norms, remarks as rm
from app.models import Person, StoreObject


def obj():
    o = StoreObject(id="a1", code="ПР22", city="Пермь", address="пр-кт Комсомольский, 36", okrug="УФО",
                    accept_date=date(2026, 11, 5), open_date=date(2026, 11, 12), store_email="pr22@ya-retail.ru")
    o.coordinator = Person("Казаков Андрей Владимирович", "a.kazakov@ya-retail.ru")
    o.survey = {"coffee": 1, "grids": 24, "ends": 6, "superstructures": 1}
    return o


def deliver_all(o):
    for lst, items in norms.norms(o).items():
        o.delivery[lst] = {str(x["n"]): x["norm"] for x in items if x["norm"] is not None}


def test_norm_formulas():
    o = obj(); o.survey.update(coffee=2)
    n = {x["n"]: x["norm"] for x in norms.norms(o)["mto"]}
    assert n[25] == 24 and n[26] == 2 and n[28] == 66 and n[76] == 2 and 80 not in n
    o.okrug = "ЦФО"
    assert any(x["n"] == 80 for x in norms.norms(o)["mto"])
    assert len(norms.norms(o)["coffee"]) == 15 and norms.norms(o)["coffee"][1]["norm"] == 1000


def test_first_letter_sections_and_numbering():
    o = obj(); deliver_all(o)
    o.delivery["hoz"]["3"] = 1
    r = rm.create(o, {"section": "build", "zone": "Фасад", "text": "Установить водосточные трубы согласно ТЗ", "deadline": "2026-11-06"}, 1, "Илгин")
    r.photos = [{"url": "https://disk.yandex.ru/i/x"}]
    rm.create(o, {"section": "build", "zone": "Тамбур", "text": "Принимаем такое исполнение?", "question": True}, 1, "Илгин")
    rm.create(o, {"section": "build", "zone": "Санузел", "text": "Устранить протечку под сифоном", "deadline_ask": "Казаков Андрей Владимирович"}, 2, "Сидоров")
    L = letter.build(o, "first", date(2026, 11, 5))
    t = L["text"]
    assert t.startswith("Коллеги, Добрый день!") and "В процессе приёмки выявлены:" in t
    assert "1. Установить водосточные трубы согласно ТЗ; Срок 06.11.2026" in t
    assert "2. Устранить протечку под сифоном; @Казаков Андрей Владимирович Андрей, подскажи, пожалуйста, срок исправления" in t
    assert '<a href="mailto:a.kazakov@ya-retail.ru">@Казаков Андрей Владимирович</a>' in L["html"]
    assert "3. Принимаем такое исполнение?" in t                    # вопрос — в конце списка
    assert "3. Короба для мороженого, 5шт – 4;" in t                 # номер позиции из шаблона сохранён
    assert '<a href="https://disk.yandex.ru/i/x">Установить водосточные трубы согласно ТЗ</a>' in L["html"]
    assert "Times New Roman" in L["html"] and "data-rid" not in L["html"] and "data-rid" in L["html_app"]
    assert L["to"][0][1] == "a.zhihareva@ya-retail.ru"
    cc = [e for _, e in L["cc"]]
    assert "m.ganin@ya-retail.ru" in cc and "a.galinov@ya-retail.ru" not in cc and "a.kazakov@ya-retail.ru" in cc
    assert L["subject"] == "ПР22 Пермь г, пр-кт Комсомольский, 36 - приемка нового магазина"


def test_update_rules():
    o = obj(); deliver_all(o)
    a = rm.create(o, {"section": "build", "zone": "Фасад", "text": "Покрасить отливы", "deadline": "2026-11-06"}, 1, "И")
    b = rm.create(o, {"section": "build", "zone": "Фасад", "text": "Заменить плитку", "deadline": "2026-11-06"}, 1, "И")
    rm.update(b, {"deadline": "2026-11-08", "reason": "нет плитки"})
    rm.add_comment(b, "Жихарева Анастасия", "фото до/после в МАХ")
    t = letter.build(o, "update", date(2026, 11, 7))["text"]
    assert "К исправлению:" in t and "; Срок 06.11.2026" in t and "Новый срок 08.11.2026 — (нет плитки)" in t
    rm.set_status(a, "accepted", is_owner=True)
    t = letter.build(o, "update", date(2026, 11, 7))["text"]
    assert "Покрасить отливы" not in t and "1. Заменить плитку" in t     # принятое уходит, нумерация пересчитана
    rm.set_status(b, "accepted", is_owner=True)
    t = letter.build(o, "update", date(2026, 11, 13))["text"]
    assert t == "Коллеги, добрый день. Все замечания устранены."
    o.delivery["hoz"]["3"] = 0
    t = letter.build(o, "update", date(2026, 11, 13))["text"]
    assert "Магазин открыт 12.11.2026. Осталось устранить:" in t and "ВСЕ СТРОИТЕЛЬНЫЕ НЕДОЧЁТЫ УСТРАНЕНЫ." in t


def test_batteries_and_statuses():
    o = obj(); o.extras = {"batteries": [{"count": 2, "sections": 12}, {"count": 1, "sections": 7}, {"count": 3, "sections": 4}], "pumps": 6}
    o.statuses = {"guard": {"state": "bad"}, "bread": {"state": "off"},
                  "ad_box": {"state": "bad", "deadline": "2026-07-29"}, "alarm": {"count": "3", "note": "1 ДОВЕЗУТ СЕГОДНЯ;"},
                  "tbo": {"ask": "Сокол Петр Михайлович", "question": "будет ли бак?"}}
    o.survey = {**(o.survey or {}), "fire_cabinet": False}
    lines = {x["key"]: x for x in letter.status_lines(o)}
    assert lines["batteries"]["text"] == "КОЛИЧЕСТВО БАТАРЕЙ: 2(12 СЕКЦИЙ)+1(7 СЕКЦИЙ)+3(4 СЕКЦИИ)"
    assert lines["guard"]["color"] == letter.ORANGE and "bread" not in lines
    assert lines["fire_cabinet"]["text"] == "ПОЖАРНЫЙ ШКАФ, РУКАВА – НЕ ПРЕДУСМОТРЕНЫ;" and lines["fire_cabinet"]["color"] == letter.GREEN
    assert lines["ad_box"]["text"] == "РЕКЛАМНЫЙ КОРОБ В МАГАЗИНЕ – ОТСУТСТВУЕТ; УСТРАНЕНИЕ 29.07.26;"
    assert lines["alarm"]["text"] == "ТРЕВОЖНЫЕ КНОПКИ – 3 ШТ – В НАЛИЧИИ, ИСПРАВНЫ; 1 ДОВЕЗУТ СЕГОДНЯ;"
    assert "@Сокол Петр Михайлович Петр, будет ли бак?" in lines["tbo"]["text"]
    assert lines["ad_box"]["html"].startswith("РЕКЛАМНЫЙ КОРОБ В МАГАЗИНЕ<b>")
