"""Готовые тексты: заявка АХЧ, запрос договоров, МОПы, подпись Outlook, группа WhatsApp."""
from __future__ import annotations

import re
from datetime import date
from urllib.parse import quote

from ..models import CONTRACT_TITLES, Person, StoreObject
from .names import first_name_genitive

AHCH_DEFAULT = [
    "Установить полку в сейф (нет в наличии)",
    "Установить диспенсеры для мыла - 2 шт",
    "Повесить зеркало в сан узле",
    "Установить диспенсеры для полотенец - 2 шт",
    "Установить держатель для туалетной бумаги - 1 шт",
    "Прикрепить сейф на 2 анкера (сейф в наличии)",
    "Прикрепить крючки - 3 шт. в дневном накопителе, 1 шт. в пекарне, 3 шт на кассы (нет в наличии)",
    "Повесить гигрометры - 2 шт",
    "Установить 3 держателя для щипцов",
    "Собрать рециркулятор",
    "Установить урну - у входа",
    "Собрать 2 шпильки - в зоне выпечки",
    "Скрутить стеллажи/торцы, где есть возможность",
    "Скрутить кабинки между собой в кабинете директора",
    "Разместить 2 плана эвакуации",
    "Собрать 2 подставки для огнетушителя",
]

# Куда отправлять заявку АХЧ по округу (памятка «Не забывай», п. 15)
AHCH_CHANNEL = {
    "СФО": {"kind": "yk", "path": "Ярче Коммуникации → Помощь → Заявки по АХЧ → Создать"},
    "УФО": {"kind": "yk", "path": "Ярче Коммуникации → Помощь → Заявки по АХЧ → Создать"},
    "ЦФО": {"kind": "whatsapp"},
}
AHCH_TVER_KALUGA = {"kind": "mail", "to": ["N.mazurova@vianservis.ru", "e.nikitin@ya-retail.ru"],
                    "call": ["8-916-590-34-57", "8-926-788-99-15"]}


def ahch_request(obj: StoreObject, items: list[str], visit: date | None = None) -> str:
    visit = visit or obj.accept_date
    when = visit.strftime("%d.%m.%Y") if visit else "__.__.____"
    lines = [f"{i}. {t.strip()}" for i, t in enumerate((t for t in items if t.strip()), 1)]
    return (f"Добрый день,\n{obj.code}, {obj.full_address}\nЗАЯВКА СРОЧНАЯ (ЗАПУСК МАГАЗИНА)\n"
            f"Просьба приехать {when}\n\n" + "\n".join(lines))


def ahch_mail_subject(obj: StoreObject) -> str:
    return f"Заявка на АХЧ работы. Магазин {obj.code}"


def contracts_request(obj: StoreObject, to: Person, slots: list[str] | None = None) -> dict:
    """Письмо «Запросить у …»: только недостающие договоры (или явно переданные)."""
    slots = obj.missing_contracts() if slots is None else slots
    body = (f"{to.first_name}, добрый день!\n\nПросьба предоставить договора:\n"
            + "\n".join(f"• {CONTRACT_TITLES[s]}" for s in slots) + "\n\nЗаранее благодарю!")
    return {"to": to.email, "cc": obj.store_email, "subject": f"{obj.code} Сканы договоров",
            "body": body, "button": f"Запросить у {first_name_genitive(to.name)}" if to.first_name else "Запросить"}


def mops_request(obj: StoreObject) -> str:
    return (f"Просьба добавить в график по замене мопов и ковров магазин {obj.code}, {obj.full_address}.\n"
            "Подскажите, когда будет первый заезд, чтобы мы подготовились.")


def outlook_signature(obj: StoreObject) -> str:
    return ("С уважением,\n" + (obj.director.name or "Фамилия Имя Отчество") + "\nУПРАВЛЯЮЩИЙ МАГАЗИНОМ\n"
            f"ОСП {obj.city.upper()} МАГАЗИН №{obj.code}\nООО \"КАМЕЛОТ-А\"\n"
            f"ТЕЛ.: {phone_plus7(obj.director.phone) or '+7XXXXXXXXXX'}\nE-MAIL: {obj.store_email.upper()}")


def whatsapp_group_name(obj: StoreObject) -> str:
    """«ПР22 Комсомольский 36» — по образцу «М01 Московская 1»."""
    street = re.sub(r"\b(ул|улица|пр-т|проспект|пр|пер|переулок|б-р|бульвар|ш|шоссе)\.?\s*", "", obj.address, flags=re.I)
    street = re.sub(r"[,]", " ", street)
    street = re.sub(r"\s+", " ", street).strip()
    return f"{obj.code} {street}"


def mailto(to: str | list[str], subject: str, body: str = "", cc: str = "") -> str:
    to_s = ";".join(to) if isinstance(to, list) else to
    q = [f"subject={quote(subject)}"]
    if cc:
        q.append(f"cc={quote(cc)}")
    if body:
        q.append(f"body={quote(body)}")
    return f"mailto:{to_s}?" + "&".join(q)


def digits(phone: str) -> str:
    d = re.sub(r"\D", "", phone or "")
    if len(d) == 10:
        d = "8" + d
    if len(d) == 11 and d[0] == "7":
        d = "8" + d[1:]
    return d


def phone_plus7(phone: str) -> str:
    d = digits(phone)
    return "+7" + d[1:] if len(d) == 11 else d
