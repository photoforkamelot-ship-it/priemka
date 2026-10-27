"""Исходные документы памятки: версии, замена файла с архивом и отметкой «источник обновлён», печать через бота.

Сами PDF лежат в miniapp/memo (в репозитории). Новая версия, загруженная из приложения, кладётся в data/sources/
и отдаётся вместо файла из репозитория по тому же адресу — ссылки в инструкциях менять не нужно.
"""
from __future__ import annotations

import json
import os
import re
from datetime import date
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
MINIAPP = BACKEND.parent / "miniapp"
DIR = Path(os.environ.get("SOURCES_DIR") or BACKEND / "data" / "sources")
META = DIR / "sources.json"
M1, M2, I = "memo/pamyatka-originaly-1/", "memo/pamyatka-originaly-2/", "memo/pamyatka-otkrytiya/instr/"

SOURCES = [
    {"id": "mk", "title": "Инструкция «Мобильные кадры»", "path": M1 + "mobilnye-kadry-instrukciya-19.06.2025.pdf", "version": "19.06.2025",
     "used": [I + "mk/mk-ios.html", I + "mk/mk-android.html", I + "priem/priem.html"]},
    {"id": "yk", "title": "Инструкция ИС Ярче «Ярче Коммуникации»", "path": M1 + "yarche-kommunikacii-instrukciya-11.08.2026.pdf", "version": "11.08.2026",
     "used": [I + "yk/index.html", I + "yk/yk-android.html", I + "ahch/index.html", I + "ds/peredacha-ds.html"]},
    {"id": "kdp", "title": "Памятка «Кадровое делопроизводство»", "path": M2 + "kadrovoe-deloproizvodstvo-2025.pdf", "version": "10.09.2025",
     "used": [I + "priem/priem.html"]},
    {"id": "kd_sfo", "title": "«Кассовая дисциплина» СФО и УФО", "path": M2 + "kassovaya-disciplina-sfo-ufo-01.07.2026.pdf", "version": "01.07.2026",
     "used": [I + "pokup/pokupyurnik.html", I + "ds/peredacha-ds.html"]},
    {"id": "kd_cfo", "title": "«Кассовая дисциплина» ЦФО", "path": M2 + "kassovaya-disciplina-cfo-02.07.2025.pdf", "version": "02.07.2025",
     "used": [I + "pokup/pokupyurnik.html", I + "ds/peredacha-ds.html"]},
    {"id": "mk_dog", "title": "МК: «Договоры и акты»", "path": M2 + "mk-dogovory-i-akty-19.06.2025.pdf", "version": "19.06.2025",
     "used": [I + "dvornik/dvornik.html"]},
    {"id": "dvornik", "title": "Памятка «Дворник по договору ГПХ»", "path": M2 + "pamyatka-dvornik-gph-02.05.2023.pdf", "version": "02.05.2023",
     "used": [I + "dvornik/dvornik.html"]},
    {"id": "forma", "title": "«Заказ и учёт спецодежды»", "path": I + "forma/specodezhda.pdf", "version": "",
     "used": [I + "forma/forma.html"]},
]
BY_ID = {s["id"]: s for s in SOURCES}
BY_PATH = {s["path"]: s for s in SOURCES}


def _meta() -> dict:
    try:
        return json.loads(META.read_text(encoding="utf-8"))
    except Exception:
        return {}


def listing() -> list[dict]:
    m = _meta()
    out = []
    for s in SOURCES:
        cur = m.get(s["id"]) or {}
        out.append({**s, "version": cur.get("version") or s["version"], "replaced": cur.get("replaced", ""),
                    "by": cur.get("by", ""), "archive": cur.get("archive", [])})
    return out


def stale_pages() -> dict[str, str]:
    """Инструкции, чей исходник заменён после их сборки: путь страницы → название документа."""
    out = {}
    for s in listing():
        if s["replaced"]:
            for p in s["used"]:
                out[p] = s["title"]
    return out


def override(path: str) -> Path | None:
    """Если исходник по этому адресу заменён — новый файл."""
    s = BY_PATH.get(os.path.normpath(path.lstrip("/").split("#")[0]))
    if s:
        f = DIR / f"{s['id']}.pdf"
        if f.exists():
            return f
    return None


def guess_version(pdf: bytes) -> str:
    try:
        import pymupdf
        d = pymupdf.open(stream=pdf, filetype="pdf")
        text = " ".join(d[i].get_text() for i in range(min(3, len(d))))
    except Exception:
        return ""
    m = re.search(r"(?:[Вв]ерси[яи]\s+от|актуальн\w*\s+(?:на|от)|\bот)\s+(\d{2}\.\d{2}\.\d{4})", text) or \
        re.search(r"(\d{2}\.\d{2}\.\d{4})", text)
    return m.group(1) if m else ""


def replace(sid: str, pdf: bytes, version: str = "", by: str = "") -> dict:
    s = BY_ID.get(sid)
    if not s:
        raise LookupError("нет такого документа")
    if not pdf.startswith(b"%PDF"):
        raise ValueError("нужен PDF")
    DIR.mkdir(parents=True, exist_ok=True)
    (DIR / "archive").mkdir(exist_ok=True)
    m = _meta()
    cur = m.get(sid) or {}
    old_ver = cur.get("version") or s["version"] or "без даты"
    old = DIR / f"{sid}.pdf"
    src = old if old.exists() else MINIAPP / s["path"]
    arch = DIR / "archive" / f"{sid}-{old_ver}.pdf"
    if src.exists():
        arch.write_bytes(src.read_bytes())
    old.write_bytes(pdf)
    ver = version.strip() or guess_version(pdf) or date.today().strftime("%d.%m.%Y")
    archive = cur.get("archive", []) + [{"version": old_ver, "file": arch.name}]
    m[sid] = {"version": ver, "replaced": date.today().isoformat(), "by": by, "archive": archive}
    META.write_text(json.dumps(m, ensure_ascii=False, indent=1), encoding="utf-8")
    return {**s, **m[sid]}


def archive_file(name: str) -> Path:
    if not re.fullmatch(r"[\w.-]+\.pdf", name):
        raise LookupError("нет такого файла")
    f = DIR / "archive" / name
    if not f.exists():
        raise LookupError("нет такого файла")
    return f


def printable(path: str) -> Path:
    """Файл для «На печать»: только PDF из памятки (с учётом заменённых исходников)."""
    path = os.path.normpath(path.lstrip("/").split("#")[0].split("?")[0])
    o = override(path)
    if o:
        return o
    p = (MINIAPP / path).resolve()
    if not str(p).startswith(str((MINIAPP / "memo").resolve())) or p.suffix.lower() != ".pdf" or not p.is_file():
        raise LookupError("этот файл нельзя отправить на печать")
    return p
