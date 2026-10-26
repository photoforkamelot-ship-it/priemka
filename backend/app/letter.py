"""Письмо о приёмке и ежедневные апдейты — строго по «Шаблону письма о приёмке нового магазина» (03.10.2026)
и правилам апдейтов из ТЗ (по 25 цепочкам писем).

build(obj, mode="first"|"update", today) → {"html", "html_app", "text", "subject", "to", "cc", "cc_missing", "items"}
- html     — чистый HTML для Outlook: Times New Roman 12, жирные заголовки, нумерация, ссылки на фразах; без подсветки авторов;
- html_app — то же с подсветкой авторов и data-rid у пунктов (для экрана приложения);
- text     — простой текст (запасной вариант копирования).
"""
from __future__ import annotations

import html as H
import json
from datetime import date
from pathlib import Path

from .models import Remark, StoreObject
from .norms import LISTS, shortages, survey

ASSETS = Path(__file__).resolve().parent / "assets"
CHECK = json.loads((ASSETS / "checklists.json").read_text(encoding="utf-8"))

ORANGE, GREEN, RED, BLUE = "#ED7D31", "#00B050", "#FF0000", "#0070C0"
PALETTE = ["#7030A0", "#008080", "#996633", "#C00000", "#2F5597", "#806000"]
FIXED_COLORS = {"Жихарева": RED, "Ахпашев": BLUE}
AUTHOR_BG = ["#FFF2CC", "#DDEBF7", "#E2EFDA", "#FCE4D6", "#EDE7F6", "#E0F2F1"]

FONT = "font-family:'Times New Roman',serif;font-size:12pt;color:black"


def fmt(d: str | date | None, short: bool = False) -> str:
    if not d:
        return ""
    d = d if isinstance(d, date) else date.fromisoformat(d)
    return d.strftime("%d.%m" if short else "%d.%m.%Y")


def comment_color(author: str, obj: StoreObject, progress: bool = False) -> str:
    if progress:
        return ORANGE
    for k, c in FIXED_COLORS.items():
        if k in author:
            return c
    if obj.coordinator.name and obj.coordinator.name.split()[0] in author:
        return GREEN
    return PALETTE[sum(map(ord, author)) % len(PALETTE)]


def first_last(name: str) -> str:
    """«Казаков Андрей Владимирович» → «Андрея Казакова» нужен родительный — берём из генератора имён."""
    from .generators.names import first_name_genitive
    parts = name.split()
    if len(parts) >= 2:
        try:
            from pytrovich.enums import Case, Gender, NamePart
            from pytrovich.maker import PetrovichDeclinationMaker
            from .generators.names import gender_of
            m = PetrovichDeclinationMaker()
            g = gender_of(name)
            gen = Gender.FEMALE if g == "f" else Gender.MALE
            return f"{m.make(NamePart.FIRSTNAME, gen, Case.GENITIVE, parts[1])} {m.make(NamePart.LASTNAME, gen, Case.GENITIVE, parts[0])}"
        except Exception:
            return first_name_genitive(name)
    return name


def person_email(name: str, obj: StoreObject) -> str:
    """Почта человека: люди объекта, затем справочник контактов (по совпадению ФИО или фамилии и имени)."""
    for p in (obj.coordinator, obj.director, obj.dev_manager, obj.mops_contractor):
        if p.name and p.email and (p.name == name or p.name.split()[:2] == name.split()[:2]):
            return p.email
    for c in json.loads((ASSETS / "contacts.json").read_text(encoding="utf-8")):
        if c.get("email") and (c["fio"] == name or c["fio"].split()[:2] == name.split()[:2]):
            return c["email"]
    return ""


def recipients(obj: StoreObject) -> tuple[list[tuple[str, str]], list[tuple[str, str]], list[str]]:
    """Кому — Жихарева; копия — по шаблону, с учётом округа и фреш-полки. Возвращает (to, cc, без почты)."""
    s = survey(obj)
    ok = obj.okrug
    omsk = "омск" in (obj.city or "").lower()
    to = [("Жихарева Анастасия Степановна", "a.zhihareva@ya-retail.ru")]
    cc = [("Ямяк Никита Александрович", "n.yamyak@ya-retail.ru"), ("Чивчян Артур Артюшович", "a.chivchyan@ya-retail.ru"),
          ("Ламухина Ольга Павловна", "o.lamuhina@ya-retail.ru")]
    if ok == "ЦФО":
        cc.append(("Фрезе Александр Александрович", "a.freze@ya-retail.ru"))
    if ok == "СФО" and not omsk:
        cc.append(("Галинов Антон Павлович", "a.galinov@ya-retail.ru"))
    if ok == "УФО":
        cc.append(("Ганин Михаил Михайлович", "m.ganin@ya-retail.ru"))
    cc.append(("Ваньков Станислав Сергеевич", "s.vankov@ya-retail.ru"))
    if ok == "УФО" or omsk:
        cc.append(("Черепанов Максим Сергеевич", "m.cherepanov@ya-retail.ru"))
    if ok == "ЦФО":
        cc += [("Такой Андрей Владимирович", "a.takoy@ya-retail.ru"), ("Мирошников Андрей Леонтиевич", "a.miroshnikov@ya-retail.ru")]
    missing = []
    if obj.coordinator.email:
        cc.append((obj.coordinator.name, obj.coordinator.email))
    else:
        missing.append("координатор строительства (укажите почту в данных объекта)")
    cc += [("ГР Дизайнеры фасадов", "facade-designers@kdvm.ru"), ("Слёзкин Сергей Евгеньевич", "s.slyozkin@ya-retail.ru"),
           ("Ильиных Владимир Николаевич", "v.ilinyh@ya-retail.ru"), ("ГР РКО", "open_teamleads@ya-retail.ru"),
           ("Суркова Екатерина Константиновна", "ek.surkova@kdvm.ru"), ("Филатова Анастасия Сергеевна", "a.filatova@ya-retail.ru"),
           ("Черепанова Анастасия Сергеевна", "a.cherepanova@ya-retail.ru"), ("ГР Инженер ХО", "engineer_holod@ya-retail.ru")]
    if s.get("fresh"):
        cc += [("Пестова Юлия Денисовна", "yu.pestova@ya-retail.ru"), ("Степаненко Валерия Олеговна", "vo.stepanenko@ya-retail.ru"),
               ("Китов Никита Андреевич", "n.kitov@ya-retail.ru")]
    cc.append(("ГР Камелот ИТ сопровождение", "kamelot_it_support@magdv.com"))
    if obj.store_email:
        cc.append((f"{obj.code} {obj.city}", obj.store_email))
    for extra in (obj.extras or {}).get("cc_extra", []):
        if extra.get("email"):
            cc.append((extra.get("name", ""), extra["email"]))
    return to, cc, missing


def subject(obj: StoreObject) -> str:
    return f"{obj.code} {obj.city} г, {obj.address} - приемка нового магазина"


# ---------- сборка ----------
class Doc:
    """Пишет одновременно чистый HTML, HTML для приложения и текст."""

    def __init__(self):
        self.h, self.a, self.t = [], [], []

    def p(self, html: str, text: str, app: str | None = None, indent: bool = False):
        st = FONT + (";margin:0 0 0 34pt;text-indent:-17pt" if indent else ";margin:0")
        self.h.append(f'<p style="{st}">{html}</p>')
        self.a.append(f'<p style="{st}">{app if app is not None else html}</p>')
        self.t.append(text)

    def blank(self):
        self.h.append(f'<p style="{FONT};margin:0">&nbsp;</p>'); self.a.append(self.h[-1]); self.t.append("")

    def head(self, title: str):
        self.p(f"<b>{H.escape(title)}</b>", title)


def esc(s: str) -> str:
    return H.escape(s or "")


def color(s: str, c: str) -> str:
    return f'<span style="color:{c}">{s}</span>'


def photo_link(r: Remark) -> str:
    """Одно фото — ссылка на файл; несколько — на публичную папку замечания (открывается галереей)."""
    if not r.photos:
        return ""
    if len(r.photos) > 1 and r.folder_url:
        return r.folder_url
    return r.photos[0].get("url", "")


def remark_line(n: int, r: Remark, obj: StoreObject, mode: str) -> tuple[str, str, list[tuple[str, str]]]:
    """Возвращает (html строки пункта, текст, доп. строки [(html, text)] — комментарии и переносы)."""
    text = r.text.strip().rstrip(".;")
    url = photo_link(r)
    ph = r.phrase.strip()
    i = text.lower().find(ph.lower()) if ph else -1
    if url and i >= 0:
        body_h = esc(text[:i]) + f'<a href="{esc(url)}">{esc(text[i:i + len(ph)])}</a>' + esc(text[i + len(ph):])
    elif url:
        body_h = f'<a href="{esc(url)}">{esc(text)}</a>'
    else:
        body_h = esc(text)
    body_t = text
    tail_h, tail_t, extra = "", "", []
    who_h = who_t = ""
    if r.section == "equip" and r.responsible:
        who = f"@{r.responsible}"
        who_h = f'<a href="mailto:{esc(r.responsible_email)}">{esc(who)}</a>' if r.responsible_email else esc(who)
        who_t = who
    if r.question or (not r.deadline and not r.deadline_text and not r.deadline_ask):
        if who_h:   # вопрос ответственному — «просьба прокомментировать»
            nm = r.responsible.split()[1] if len(r.responsible.split()) > 1 else ""
            tail_h += f"; {who_h} {esc(nm)}, просьба прокомментировать"; tail_t += f"; {who_t} {nm}, просьба прокомментировать"
    elif r.deadline_text:
        tail_h += f"; Срок — {esc(r.deadline_text)}"; tail_t += f"; Срок — {r.deadline_text}"
    elif r.deadline:
        hist = r.deadline_history
        if hist and not any(h.get("reason") for h in hist):
            dates = ", ".join(fmt(h["date"]) for h in hist) + ", " + fmt(r.deadline)
            tail_h += f"; Срок {dates}"; tail_t += f"; Срок {dates}"
        elif hist:
            tail_h += f"; Срок {fmt(hist[0]['date'])}"; tail_t += f"; Срок {fmt(hist[0]['date'])}"
            # причина хранится у переноса: каждый новый срок — с новой строки оранжевым
            new_dates = [h["date"] for h in hist[1:]] + [r.deadline]
            for d, h in zip(new_dates, hist):
                why = h.get("reason", "")
                line = f"Новый срок {fmt(d)}" + (f" — ({why})" if why else "")
                extra.append((color(esc(line), ORANGE), line))
        else:
            tail_h += f"; Срок {fmt(r.deadline)}"; tail_t += f"; Срок {fmt(r.deadline)}"
        if who_h:
            tail_h += f" – {who_h}"; tail_t += f" – {who_t}"
    elif r.deadline_ask:
        # как в цепочках писем: тегаем человека и спрашиваем срок
        ask = r.deadline_ask.strip()
        mail = person_email(ask, obj)
        nm = ask.split()[1] if len(ask.split()) > 1 else ask
        tag_h = f'<a href="mailto:{esc(mail)}">@{esc(ask)}</a>' if mail else f"@{esc(ask)}"
        tail_h += f"; {tag_h} {esc(nm)}, подскажи, пожалуйста, срок исправления"
        tail_t += f"; @{ask} {nm}, подскажи, пожалуйста, срок исправления"
        if who_h and r.responsible != ask:
            tail_h += f" – {who_h}"; tail_t += f" – {who_t}"
    if r.status == "fixed_on_site" and mode == "first":
        tail_h += color(" – устранено в ходе приёмки", GREEN); tail_t += " – устранено в ходе приёмки"
    for c in r.comments:
        col = c.color or comment_color(c.author, obj)
        extra.append((color("– " + esc(c.text), col), "– " + c.text))
    h = f"{n}.&nbsp;&nbsp;&nbsp;{body_h}{tail_h}"
    t = f"{n}. {body_t}{tail_t}"
    return h, t, extra


def build(obj: StoreObject, mode: str = "first", today: date | None = None) -> dict:
    today = today or date.today()
    s = survey(obj)
    ex = obj.extras or {}
    opened = obj.open_date and today >= obj.open_date
    authors = sorted({r.author_name for r in obj.remarks if r.author_name})
    bg = {a: AUTHOR_BG[i % len(AUTHOR_BG)] for i, a in enumerate(authors)}
    doc = Doc()
    items = []

    def remarks_for(section: str, after_open: bool | None) -> list[Remark]:
        rs = [r for r in obj.remarks if r.section == section]
        if mode == "update":
            rs = [r for r in rs if r.status in ("open", "fixed")]
        if after_open is not None and obj.open_date:
            rs = [r for r in rs if (r.created >= obj.open_date.isoformat()) == after_open]
        order = {r.id: i for i, r in enumerate(obj.remarks)}
        rs.sort(key=lambda r: (r.question, order[r.id]))
        return rs

    def section(title: str, rs: list[Remark]):
        if not rs:
            return False
        doc.head(title + ":")
        doc.blank()
        for n, r in enumerate(rs, 1):
            h, t, extra = remark_line(n, r, obj, mode)
            app = f'<span data-rid="{r.id}" style="background:{bg.get(r.author_name, "#fff")};border-radius:3px" title="{esc(r.author_name)}">{h}</span>'
            doc.p(h, t, app, indent=True)
            for eh, et in extra:
                doc.p(eh, et, indent=True)
            items.append({"rid": r.id, "n": n, "section": r.section, "author": r.author_name})
        doc.blank()
        return True

    sh = shortages(obj)
    build_open = remarks_for("build", None)
    equip_open = remarks_for("equip", None)
    anything = build_open or equip_open or any(sh.values())

    if mode == "update" and not anything:
        doc.p(f'<b>{color("Коллеги, добрый день. Все замечания устранены.", "black")}</b>', "Коллеги, добрый день. Все замечания устранены.")
        return _out(obj, doc, items, bg)

    if mode == "update" and ex.get("nochange"):
        doc.p(color("Коллеги, добрый день. Замечания по строительной части", ORANGE), "Коллеги, добрый день. Замечания по строительной части")
    else:
        doc.p("Коллеги, Добрый день!", "Коллеги, Добрый день!")
    doc.blank()
    if mode == "first":
        doc.p("В процессе приёмки выявлены:", "В процессе приёмки выявлены:")
    elif opened:
        doc.p(f"Магазин открыт {fmt(obj.open_date)}. Осталось устранить:", f"Магазин открыт {fmt(obj.open_date)}. Осталось устранить:")
    else:
        doc.p("К исправлению:", "К исправлению:")
    doc.blank()

    split = mode == "update" and opened
    before = (lambda sec: remarks_for(sec, False)) if split else (lambda sec: remarks_for(sec, None))
    b = before("build")
    if mode == "update" and not b:
        doc.head("ВСЕ СТРОИТЕЛЬНЫЕ НЕДОЧЁТЫ УСТРАНЕНЫ.")
        doc.blank()
    else:
        section("СТРОИТЕЛЬНЫЕ НЕДОЧЁТЫ", b)
    section("НЕДОЧЁТЫ ОБОРУДОВАНИЯ И МЕЛКОГО ТОРГОВОГО ОБОРУДОВАНИЯ", before("equip"))
    if split:
        nb, ne = remarks_for("build", True), remarks_for("equip", True)
        if nb or ne:
            doc.p("<b>В процессе работы магазина выявлены:</b>", "В процессе работы магазина выявлены:")
            doc.blank()
            section("СТРОИТЕЛЬНЫЕ НЕДОЧЁТЫ", nb)
            section("НЕДОЧЁТЫ ОБОРУДОВАНИЯ И МЕЛКОГО ТОРГОВОГО ОБОРУДОВАНИЯ", ne)

    show_got = ex.get("show_received")
    for lst, title in LISTS.items():
        rows = sh.get(lst) or []
        if not rows:
            continue
        doc.head(title + ":")
        if lst == "hoz":
            doc.p("(ХОЗТОВАРЫ ПРОДУБЛИРУЕМ В ЗАКАЗЕ С КАССЫ)", "(ХОЗТОВАРЫ ПРОДУБЛИРУЕМ В ЗАКАЗЕ С КАССЫ)")
        doc.blank()
        for x in rows:
            add = f" (вместо {x['norm']} пришло {x['have']})" if show_got and x["have"] else ""
            line = f"{x['n']}. {x['name']} – {x['missing']}{add};"
            doc.p(f"{x['n']}.&nbsp;&nbsp;&nbsp;{esc(x['name'])} – {x['missing']}{esc(add)};", line, indent=True)
        doc.blank()

    if mode == "first":
        if int(s.get("coffee") or 1) == 2:
            m2 = ex.get("module2") or {}
            deliver = [x for x in CHECK["coffee2_module"]["deliver"] if not m2.get(x)]
            have = [x for x in CHECK["coffee2_module"]["have"]]
            doc.head("КОФЕСТАНЦИЯ (2-Й МОДУЛЬ) - К ДОВОЗУ:")
            doc.blank()
            for i, x in enumerate(deliver, 1):
                doc.p(f"{i}.&nbsp;&nbsp;&nbsp;{esc(x)} – 2;", f"{i}. {x} – 2;", indent=True)
            for x in have:
                st = "В НАЛИЧИИ" if m2.get(x, True) else "ОТСУТСТВУЕТ"
                doc.p(f"●&nbsp;&nbsp;&nbsp;{esc(x)} – 2 – {st};", f"● {x} – 2 – {st};", indent=True)
            doc.blank()
        albums = ex.get("albums") or {}
        for key, title in CHECK["photo_albums"]:
            url = albums.get(key)
            if key == "batteries" and not url and not ex.get("batteries"):
                pass
            doc.p(f'<a href="{esc(url)}"><b>{esc(title)}</b></a>' if url else f"<b>{esc(title)}</b>", title + (f" {url}" if url else ""))
        hu, hr = ex.get("height_unloading"), ex.get("height_ramp")
        if hu or hr:
            parts = []
            if hu:
                parts.append(f"ВЫСОТА ПРОЁМА РАЗГРУЗКИ – {hu}М")
            if hr and s.get("ramp", True):
                parts.append(f"ВЫСОТА ПАНДУСА – {hr}М")
            doc.p("<b>" + esc(";".join(parts)) + "</b>", ";".join(parts))
        doc.blank()
        for st in status_lines(obj):
            doc.p(f"●&nbsp;&nbsp;&nbsp;{color(esc(st['text']), st['color'])};", f"● {st['text']};", indent=True)
        if ex.get("ahch_scan"):
            doc.blank()
            doc.p(f'<a href="{esc(ex["ahch_scan"])}"><b>ЛИСТ ГОТОВНОСТИ (АХЧ)</b></a>', f"ЛИСТ ГОТОВНОСТИ (АХЧ) {ex['ahch_scan']}")
    return _out(obj, doc, items, bg)


def batteries_line(obj: StoreObject) -> str:
    groups = [(int(g.get("count") or 0), int(g.get("sections") or 0)) for g in (obj.extras or {}).get("batteries", [])]
    groups = [g for g in groups if g[0] and g[1]]
    if not groups:
        return ""
    return "+".join(f"{c}({s} {sections_word(s)})" for c, s in groups)


def sections_word(n: int) -> str:
    n10, n100 = n % 10, n % 100
    if n10 == 1 and n100 != 11:
        return "СЕКЦИЯ"
    if 2 <= n10 <= 4 and not 12 <= n100 <= 14:
        return "СЕКЦИИ"
    return "СЕКЦИЙ"


def status_lines(obj: StoreObject) -> list[dict]:
    """Блок статусов (●): зелёный — в порядке, оранжевый — критично исправить; «off» и неактуальные — не выводятся."""
    s = survey(obj)
    st = obj.statuses or {}
    out = []
    for it in CHECK["statuses"]:
        need = it.get("needs")
        cur = st.get(it["key"], {})
        state = cur.get("state", "ok")
        if state == "off" or (need and not s.get(need)):
            continue
        text = cur.get("text") or (it["ok"] if state == "ok" else it["bad"])
        out.append({"key": it["key"], "text": text, "state": state, "color": GREEN if state == "ok" else ORANGE})
        if it["key"] == "batteries_move":
            bl = batteries_line(obj)
            if bl:
                out.append({"key": "batteries", "text": f"КОЛИЧЕСТВО БАТАРЕЙ: {bl}", "state": "ok", "color": "black"})
            pumps = (obj.extras or {}).get("pumps")
            if pumps not in (None, ""):
                out.append({"key": "pumps", "text": f"КОЛИЧЕСТВО НАСОСОВ (СОЛОЛИФТОВ): {pumps}", "state": "ok", "color": "black"})
    return out


def _out(obj: StoreObject, doc: Doc, items: list, bg: dict) -> dict:
    to, cc, missing = recipients(obj)
    wrap = f'<div style="{FONT}">' + "{}" + "</div>"
    return {"html": wrap.format("\n".join(doc.h)), "html_app": wrap.format("\n".join(doc.a)), "text": "\n".join(doc.t),
            "subject": subject(obj), "to": to, "cc": cc, "cc_missing": missing, "items": items,
            "authors": [{"name": a, "bg": c} for a, c in bg.items()]}
