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
    owner_tg: int = 0
    team_tg: list[int] = field(default_factory=list)
    contracts: dict[str, ContractSlot] = field(default_factory=lambda: {s: ContractSlot(s) for s in CONTRACT_SLOTS})
    first_day_done: dict[str, bool] = field(default_factory=dict)
    flags: dict[str, bool] = field(default_factory=dict)    # dvornik_hired, cash_access_ok, ...

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
        for k in ("director", "coordinator", "dev_manager", "mops_contractor"):
            d[k] = Person(**(d.get(k) or {}))
        d["contracts"] = {s: ContractSlot(**v) for s, v in (d.get("contracts") or {}).items()} or \
            {s: ContractSlot(s) for s in CONTRACT_SLOTS}
        for k in ("accept_date", "open_date"):
            if d.get(k):
                d[k] = date.fromisoformat(d[k])
        return cls(**d)
