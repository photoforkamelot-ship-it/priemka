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
    at: str = "09:00"            # местное время объекта, с которого можно отправлять
    to: int = 0                  # 0 — руководитель и команда; иначе конкретный Telegram id
    window: int = 0              # минут после «at», когда ещё есть смысл слать (0 — до вечера)


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


# ---------- напоминания по времени (тик каждые 30 минут) ----------
CITY_TZ = {"Омск": 6, "Красноярск": 7, "Новосибирск": 7, "Томск": 7, "Кемерово": 7, "Новокузнецк": 7, "Барнаул": 7,
           "Пермь": 5, "Екатеринбург": 5, "Челябинск": 5, "Тюмень": 5, "Курган": 5, "Москва": 3, "Тверь": 3, "Калуга": 3}
OKRUG_TZ = {"СФО": 7, "УФО": 5, "ЦФО": 3}


def tz_hours(obj: StoreObject) -> int:
    """Часовой пояс объекта: по городу, иначе по округу. ЦФО — всегда Москва."""
    return CITY_TZ.get(obj.city, OKRUG_TZ.get(obj.okrug, 7))


def timed(obj: StoreObject, today: date) -> list[Reminder]:
    """Напоминания по ТЗ с временем отправки (местное время объекта)."""
    from .remarks import numbered
    out: list[Reminder] = []
    acc, opn = obj.accept_date, obj.open_date
    ex = obj.extras or {}
    letter = [("Открыть письмо", "open:letter")]
    if acc and today == acc and ex.get("first_sent") != today.isoformat():
        for at in ("12:30", "13:30"):
            out.append(Reminder(f"first_{at}", "Первое письмо — до 14:00" + (" по Москве" if obj.okrug == "ЦФО" else "") +
                                ". Проверьте сроки и фото, скопируйте письмо в Outlook.", letter + [("Письмо отправлено", "sent:first")], at=at, window=55))
    if acc and today == acc and not (obj.statuses or {}).get("passes", {}).get("state"):
        out.append(Reminder("passes", "Этап 2: ключевые проходы соответствуют планировке? Одна отметка — строка уйдёт в письмо.",
                            [("Открыть этап 2", "open:walk2")], at="11:00", window=300))
    open_items = [(sec, n, r) for sec, items in numbered(obj, for_update=True).items() for n, r in items if r.status in ("open", "fixed")]
    if acc and today > acc and open_items:
        if ex.get("zh_ok") != today.isoformat():
            out.append(Reminder("zh_check", "Проверьте, приняла ли Анастасия Жихарева фото исправлений в МАХ.",
                                [("Да, приняла", "zh:ok"), ("Апдейт", "open:update")], at="09:00", window=60))
            out.append(Reminder("update_soon", "До апдейта 20 минут. Без ответа Жихаревой письмо не отправляем.",
                                [("Открыть апдейт", "open:update"), ("Жихарева приняла", "zh:ok")], at="09:40", window=40))
    sec_name = {"build": "стройка", "equip": "оборудование"}
    for sec, n, r in open_items:
        if r.status != "open":
            continue
        if r.deadline:
            d = date.fromisoformat(r.deadline)
            if d == today:
                out.append(Reminder(f"dl_today_{r.id}", f"Срок по пункту №{n} ({sec_name[sec]}) — сегодня: {r.text[:120]}", [("Апдейт", "open:update")], at="09:00"))
            elif d < today:
                late = (today - d).days
                out.append(Reminder(f"dl_late_{r.id}", f"Пункт №{n} ({sec_name[sec]}) просрочен на {late} дн.: {r.text[:120]}"
                                    + (" Смещение больше 2 дней — отклонение от регламента." if late > 2 else ""), [("Апдейт", "open:update")], at="09:00"))
        elif r.deadline_ask and not r.deadline and not r.question and r.author_tg:
            out.append(Reminder(f"ask_{r.id}", f"Срок не указан: «{r.text[:100]}». Уточните у @{r.deadline_ask}.",
                                [("Открыть замечание", f"open:r/{r.id}")], at="00:00", to=r.author_tg))
    if obj.first_day_done.get("cash"):
        out.append(Reminder("forma", "Доступ к кассе есть. Проверьте, что прогружены права старшего продавца и дни трудоустройства, "
                            "и закажите форму — по одному сотруднику за акт.", [("Инструкция «Спецодежда»", "open:memo-forma")], at="09:00"))
    if acc and today == acc + timedelta(days=6):
        out.append(Reminder("delivery6", "6 дней после приёмки: сверьте довоз со списком; что не довезено — в группу МАХ и в ветку письма. "
                            "Позиции РКО — заказать с кассы самим; ассортимент кофестанции — сверить.", [("Недовозы", "open:walk3")], at="10:00"))
    if opn and today in (opn + timedelta(days=6), opn + timedelta(days=13)):
        wk = 1 if today == opn + timedelta(days=6) else 2
        out.append(Reminder(f"feedback{wk}", f"Обратная связь через {wk} нед. после открытия: проблемы, к кому обращались, есть ли прогресс. "
                            "Письмо: Сидоров, Смирнов, Филатова, Суркова, Тимофеева.", [("Черновик письма", "open:feedback")], at="10:00"))
    return out


def due(obj: StoreObject, now_local) -> list[Reminder]:
    """Что отправить на этом тике: утренние (с 9:00) и по времени; каждое — один раз в день."""
    today = now_local.date()
    hm = now_local.strftime("%H:%M")
    sent = (obj.flags.get("sent") or {}) if isinstance(obj.flags.get("sent"), dict) else {}
    snoozed = obj.flags.get("snooze") or {}
    out = []
    for r in reminders(obj, today) + timed(obj, today):
        if sent.get(r.key) == today.isoformat() or snoozed.get(r.key, "") > today.isoformat():
            continue
        if (r.key.startswith("ask_") or r.key == "forma") and sent.get(r.key):   # такие — один раз за всё время
            continue
        if hm < r.at or hm > "21:00":
            continue
        if r.window:
            h, m = map(int, r.at.split(":"))
            if (now_local.hour * 60 + now_local.minute) - (h * 60 + m) > r.window:
                continue
        out.append(r)
    return out
