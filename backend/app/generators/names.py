"""Склонение фамилии в родительный падеж: «Чепкасова Дарья Андреевна» → «ЧЕПКАСОВОЙ Д.А.»."""
from __future__ import annotations

from pytrovich.enums import Case, Gender, NamePart
from pytrovich.maker import PetrovichDeclinationMaker

_maker = PetrovichDeclinationMaker()


def gender_of(parts: list[str]) -> Gender:
    if len(parts) >= 3:
        return Gender.FEMALE if parts[2].lower().endswith(("вна", "чна", "кызы")) else Gender.MALE
    last = parts[0].lower() if parts else ""
    return Gender.FEMALE if last.endswith(("ова", "ева", "ина", "ая", "ына", "ёва")) else Gender.MALE


def from_genitive_short(fio: str) -> str:
    parts = fio.split()
    if not parts:
        return ""
    initials = "".join(p[0] + "." for p in parts[1:3])
    last = _maker.make(NamePart.LASTNAME, gender_of(parts), Case.GENITIVE, parts[0])
    return f"{last} {initials}".strip().upper()


def first_name_genitive(name: str) -> str:
    """«Шаврин Алексей Александрович» → «Алексея» (для кнопки «Запросить у …»)."""
    parts = name.split()
    if len(parts) < 2:
        return parts[0] if parts else ""
    return _maker.make(NamePart.FIRSTNAME, gender_of(parts), Case.GENITIVE, parts[1])
