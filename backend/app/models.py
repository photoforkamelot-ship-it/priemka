"""Модель данных объекта (магазина на приёмке)."""
from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import date
from typing import Literal, Optional

Okrug = Literal["СФО", "УФО", "ЦФО"]

CONTRACT_SLOTS = ("arenda", "tko", "dez", "ops")
CONTRACT_TITLES = {
    "arenda": "Договор аренды помещения",
    "tko": "Договор на ТБО/ТКО",
    "dez": "Договор дезинсекции/дератизации",
    "ops": "Договор ОПС",
}


@dataclass
class Person:
    name: str = ""          # «Чепкасова Дарья Андреевна» / «Шаврин Алексей»
    email: str = ""
    phone: str = ""
    role: str = ""

    @property
    def filled(self) -> bool:
        return bool(self.name and (self.email or self.phone))

    @property
    def first_name(self) -> str:
        """Имя для обращения в письме: «Шаврин Алексей Александрович» → «Алексей»."""
        parts = self.name.split()
        return parts[1] if len(parts) >= 2 else (parts[0] if parts else "")


@dataclass
class ContractSlot:
    slot: str
    status: Literal["missing", "received"] = "missing"
    file_ids: list[str] = field(default_factory=list)
    number: str = ""
    doc_date: str = ""
    summary: str = ""


ZONES = ["Фасад", "Входная группа", "Тамбур", "Торговый зал", "Касса", "Стеллажка", "Пекарня", "Кофестанция",
         "Санузел", "Кабинет", "Склад", "Разгрузка", "Агрегатная", "Конденсаторная опора"]
SECTIONS = {"build": "СТРОИТЕЛЬНЫЕ НЕДОЧЁТЫ",
            "equip": "НЕДОЧЁТЫ ОБОРУДОВАНИЯ И МЕЛКОГО ТОРГОВОГО ОБОРУДОВАНИЯ"}


@dataclass
class Comment:
    author: str
    text: str
    date: str
    color: str = ""          # закреплён за человеком; оранжевый — прогресс и сроки


@dataclass
class Remark:
    id: str
    section: str                    # build | equip
    zone: str
    text: str
    phrase: str = ""                # фраза-ссылка на фото в письме
    photos: list[dict] = field(default_factory=list)       # {path, url}
    deadline: str = ""              # ISO-дата или "" — тогда deadline_ask
    deadline_ask: str = ""          # «уточняется у …»
    deadline_history: list[dict] = field(default_factory=list)   # {date, reason}
    responsible: str = ""           # имя из справочника (для оборудования)
    responsible_email: str = ""
    status: str = "open"            # open | fixed | accepted | fixed_on_site
    question: bool = False          # вопрос на согласование
    comments: list[Comment] = field(default_factory=list)
    author_tg: int = 0
    author_name: str = ""
    created: str = ""
    stage: int = 1
    deadline_text: str = ""         # «по мере поступления» — вместо даты
    accepted_date: str = ""         # когда руководитель поставил «принято»
    fixed_date: str = ""
    item_ref: str = ""
    folder_url: str = ""            # публичная папка замечания на Диске (когда фото больше одного)
    plan_mark: dict = field(default_factory=dict)        # {plan, page, x, y} — точка на плане, x/y в долях 0..1              # пункт листа контроля, из которого создано замечание
    log: list[dict] = field(default_factory=list)          # {who, when, what, before, after}
    fix_photos: list[dict] = field(default_factory=list)   # фото исправления {path, url}
    collages: list[dict] = field(default_factory=list)     # коллажи «до/после» {path, url}

    @property
    def needs_deadline(self) -> bool:
        return not self.deadline and not self.question and self.status == "open"


@dataclass
class StoreObject:
    id: str
    code: str                       # ПР22, КР77
    city: str                       # Пермь
    address: str                    # Комсомольский пр-т, 36
    okrug: Okrug
    accept_date: Optional[date] = None
    open_date: Optional[date] = None
    store_email: str = ""
    director: Person = field(default_factory=Person)
    coordinator: Person = field(default_factory=Person)
    dev_manager: Person = field(default_factory=Person)     # менеджер по развитию региона
    mops_contractor: Person = field(default_factory=Person)  # только ЦФО
    trainer: Person = field(default_factory=Person)          # тренер по региону: у него — куратор АХЧ и где брать размен
    ahch_curator: Person = field(default_factory=Person)     # куратор службы АХЧ в регионе — звоним, чтобы был на приёмке
    razmen_donor: dict = field(default_factory=dict)         # магазин, откуда размен: {code, address, director, director_phone}
    owner_tg: int = 0
    team_tg: list[int] = field(default_factory=list)
    contracts: dict[str, ContractSlot] = field(default_factory=lambda: {s: ContractSlot(s) for s in CONTRACT_SLOTS})
    first_day_done: dict[str, bool] = field(default_factory=dict)
    flags: dict[str, bool] = field(default_factory=dict)    # dvornik_hired, cash_access_ok, ...
    remarks: list[Remark] = field(default_factory=list)
    zones_checked: dict[str, list[str]] = field(default_factory=dict)   # этап → проверенные зоны
    disk_folder: str = ""          # публичная папка на Яндекс Диске
    # Опрос перед приёмкой: от него считаются нормы недовоза и видимость пунктов письма
    survey: dict = field(default_factory=dict)   # coffee 1|2, grids, ends, superstructures, fresh, ramp, entrance_light, fire_cabinet
    # Этапы обхода: отметки пунктов чек-листов. ключ «s1:z3:2» → {"state": "ok"|"remark", "by": имя, "at": дата}
    checks: dict = field(default_factory=dict)
    # Этап 3: сколько привезли по позициям норм. {"mto": {"25": 20}, "hoz": {...}, "coffee": {...}}
    delivery: dict = field(default_factory=dict)
    # Блок статусов (●): ключ → {"state": "ok"|"bad"|"off", "text": "..."}
    statuses: dict = field(default_factory=dict)
    # Прочее для письма: батареи, насосы, высоты, альбомы фото, проходы, свет, лист АХЧ, режимы письма
    extras: dict = field(default_factory=dict)
    # Планы из Кайтена: [{id, title, kind, pages: [{n, w, h, file}], disk_path, uploaded}]
    plans: list = field(default_factory=list)

    @property
    def full_address(self) -> str:
        """«г. Пермь, Комсомольский пр-т, 36»."""
        return f"г. {self.city}, {self.address}" if self.city else self.address

    def missing_people(self) -> list[str]:
        need = {"director": "директор магазина", "coordinator": "координатор строительства",
                "dev_manager": "менеджер по развитию региона"}
        out = [label for key, label in need.items() if not getattr(self, key).filled]
        if not self.store_email:
            out.append("почта магазина")
        return out

    def missing_contracts(self) -> list[str]:
        return [s for s in CONTRACT_SLOTS if self.contracts[s].status != "received"]

    def to_dict(self) -> dict:
        d = asdict(self)
        for k in ("accept_date", "open_date"):
            d[k] = d[k].isoformat() if d[k] else None
        return d

    @classmethod
    def from_dict(cls, d: dict) -> "StoreObject":
        d = dict(d)
        for k in ("director", "coordinator", "dev_manager", "mops_contractor", "trainer", "ahch_curator"):
            d[k] = Person(**(d.get(k) or {}))
        d["remarks"] = [Remark(**{**r, "comments": [Comment(**c) for c in r.get("comments", [])]})
                        for r in d.get("remarks") or []]
        d["contracts"] = {s: ContractSlot(**v) for s, v in (d.get("contracts") or {}).items()} or \
            {s: ContractSlot(s) for s in CONTRACT_SLOTS}
        for k in ("accept_date", "open_date"):
            if d.get(k):
                d[k] = date.fromisoformat(d[k])
        return cls(**d)
