"""Список «Первый день» и напоминания бота — чистые функции от объекта и даты."""
from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from datetime import date, timedelta

from .models import CONTRACT_TITLES, StoreObject


@dataclass
class Step:
    key: str
    title: str
    hint: str
    state: str = "todo"          # todo | done | blocked | alert
    action: str = ""             # куда ведёт кнопка в приложении
    hidden: bool = False


MEMO_ITEMS = 19          # пункты памятки «Не забывай» = вкладка «Подготовка»; ключи m1…m19


def memo_keys(obj: StoreObject) -> list[str]:
    return ["m20", "m21"] + [f"m{i}" for i in range(1, MEMO_ITEMS + 1) if i != 16 or obj.okrug == "ЦФО"]


def first_day(obj: StoreObject) -> list[Step]:
    done = obj.first_day_done
    missing = obj.missing_contracts()
    steps = [
        Step("razmen", "Размен, печать, доверенность", "заранее; в тот же день — заявка на доступ к кассе"),
        Step("cash", "Доступ к кассе", "заявки в ЯК: себе и продавцам"),
        Step("ahch", "Заявка АХЧ", "16 работ по образцу", action="ahch"),
        Step("hire", "Трудоустройство", "4 бланка + образцы", action="print:blanki"),
        Step("pokup", "Покупюрник", "обложка + 90 листов, двусторонняя", action="print:pokup"),
        Step("forma", "Форма сотрудникам", "после доступа к кассе", action="memo:forma"),
        Step("journals", "Журналы ОТ в ЛМК", "3 журнала в запросе", action="memo:lmk"),
        Step("contracts", "Договоры от РМР",
             "все 4 получены" if not missing else f"{4 - len(missing)} из 4 · нет: " +
             ", ".join(CONTRACT_TITLES[s].replace("Договор ", "") for s in missing), action="contracts"),
        Step("mops", "МОПы и ковры", "подрядчик — только ЦФО", action="mops", hidden=obj.okrug != "ЦФО"),
        Step("dvornik", "Дворник", "объявление, конверт, договор и акт", action="dvornik"),
    ]
    for s in steps:
        if done.get(s.key):
            s.state = "done"
    f = next(s for s in steps if s.key == "forma")
    if f.state != "done" and not done.get("cash"):
        f.state = "blocked"; f.hint = "ждёт доступа к кассе"
    c = next(s for s in steps if s.key == "contracts")
    c.state = "done" if not missing else "alert"
    return [s for s in steps if not s.hidden]


@dataclass
class Reminder:
    key: str
    text: str
    buttons: list[tuple[str, str]] = field(default_factory=list)   # (подпись, callback/ссылка)


def reminders(obj: StoreObject, today: date) -> list[Reminder]:
    out: list[Reminder] = []
    acc = obj.accept_date
    razmen = obj.flags.get("razmen_date")
    if razmen and date.fromisoformat(razmen) == today and not obj.first_day_done.get("cash"):
        out.append(Reminder("cash_request", "Сегодня: размен, печать, доверенность. И заявка в ЯК на доступ к кассе — "
                            "себе и продавцам. Без доступа нельзя заказать форму, пробить чек и распечатать документы на приём.",
                            [("Заявка создана", "done:cash_req"), ("Напомнить завтра", "snooze:cash_request")]))
    if acc and today == acc - timedelta(days=1) and not obj.first_day_done.get("cash"):
        out.append(Reminder("cash_check", "Завтра приёмка. Доступ к кассе есть?",
                            [("Да", "done:cash"), ("Нет, ещё жду", "cash_wait")]))
    missing = obj.missing_contracts()
    if acc and missing and today >= acc + timedelta(days=2) and (today - acc).days % 2 == 0:
        names = ", ".join(CONTRACT_TITLES[s].replace("Договор ", "") for s in missing)
        who = obj.dev_manager
        btns = [("Открыть договоры", "open:contracts")]
        if who.filled:
            from .generators.names import first_name_genitive
            btns.insert(0, (f"Запросить у {first_name_genitive(who.name)}", "open:contracts"))
            if who.phone:
                btns.insert(0, ("Позвонить", f"tel:{who.phone}"))
        out.append(Reminder("contracts", f"Не хватает договоров: {names}.", btns))
    if acc and not obj.first_day_done.get("m20") and today < acc:
        if not obj.trainer.filled or not obj.ahch_curator.filled or not obj.razmen_donor.get("code"):
            miss = [n for n, ok in (("куратора АХЧ", obj.ahch_curator.filled), ("магазин для размена", bool(obj.razmen_donor.get("code")))) if not ok]
            btns = [("Открыть пункт", "open:prep")]
            if obj.trainer.phone:
                btns.insert(0, ("Позвонить тренеру", f"tel:{obj.trainer.phone}"))
            out.append(Reminder("trainer", "Позвоните тренеру по региону: узнайте " + " и ".join(miss or ["контакты"]) + ".", btns))
    if acc and not obj.first_day_done.get("m21") and today in (acc - timedelta(days=3), acc - timedelta(days=1)):
        btns = [("Уведомил", "done:m21"), ("Открыть пункт", "open:prep")]
        if obj.ahch_curator.phone:
            btns.insert(0, (f"Позвонить {obj.ahch_curator.first_name or 'куратору'}", f"tel:{obj.ahch_curator.phone}"))
        out.append(Reminder("ahch_notify", f"Приёмка {acc.strftime('%d.%m')}. Позвоните куратору АХЧ"
                            + (f" ({obj.ahch_curator.name})" if obj.ahch_curator.name else "") + " — чтобы был на приёмке и подписал лист готовности.", btns))
    created = obj.flags.get("created")
    if created and today == date.fromisoformat(created) + timedelta(days=1) and obj.missing_people():
        out.append(Reminder("people", "Не заполнено в данных объекта: " + ", ".join(obj.missing_people()) + ".",
                            [("Заполнить", "open:object")]))
    last = calendar.monthrange(today.year, today.month)[1]
    if obj.flags.get("dvornik_hired") and today.day == last:
        out.append(Reminder("dvornik_act", "Создайте акт дворнику за месяц в МК. 2 экземпляра, один — Светлане Калько.",
                            [("Вкладыш на конверт", "print:konvert"), ("Инструкция", "memo:dvornik")]))
    return out
