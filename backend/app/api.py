"""HTTP API приложения. Без фреймворка: одна функция handle(), которую вызывают
- рабочий сервер — см. server.py (любой VPS/хостинг с Python);
- локальный сервер для разработки — см. devserver.py.
"""
from __future__ import annotations

import base64
import json
import os
import re
from dataclasses import asdict
from datetime import date, timedelta
from pathlib import Path

from . import firstday, remarks as rm
from . import norms as norms_mod
from . import plans as plans_mod
from .generators import contracts as gcontracts, pdfs, texts, vcf
from .models import CONTRACT_SLOTS, Person, StoreObject
from .storage import Store, new_id
from .telegram_auth import AuthError, TgUser, verify_init_data

Response = tuple[int, dict, bytes]


def _json(data, status=200) -> Response:
    return status, {"Content-Type": "application/json; charset=utf-8"}, json.dumps(data, ensure_ascii=False, default=str).encode()


def _err(msg, status=400) -> Response:
    return _json({"error": msg}, status)


def _disp(kind: str, name: str) -> str:
    """Имя файла в заголовке: латиница для старых клиентов + UTF-8 (кириллица в коде магазина ломала latin-1)."""
    from urllib.parse import quote
    ascii_ = name.encode("ascii", "replace").decode().replace("?", "_")
    return f"{kind}; filename=\"{ascii_}\"; filename*=UTF-8''{quote(name)}"


def _pdf(data: bytes, name: str) -> Response:
    return 200, {"Content-Type": "application/pdf", "Content-Disposition": _disp("inline", name)}, data


THUMBS = Path(os.environ.get("THUMBS_DIR") or Path(__file__).resolve().parent.parent / "data" / "thumbs")
_STORES: dict | None = None


def _stores() -> dict:
    """Справочник магазинов (tools/import_stores.py). Лежит в backend/data/ — в git не попадает."""
    global _STORES
    if _STORES is None:
        from pathlib import Path
        f = Path(os.environ.get("STORES_FILE") or Path(__file__).resolve().parent.parent / "data" / "stores.json")
        _STORES = json.loads(f.read_text(encoding="utf-8")) if f.exists() else {"stores": [], "email_prefix": {}}
    return _STORES


class Api:
    def __init__(self, store: Store, bot_token: str, dev_user: TgUser | None = None, sender=None, disk=None):
        self.store, self.bot_token, self.dev_user, self.disk = store, bot_token, dev_user, disk
        self.sender = sender            # bot.sender.Sender — отправка файлов в чат «на печать»

    # ---------- авторизация ----------
    def user(self, headers: dict) -> TgUser:
        init = headers.get("x-telegram-init-data") or headers.get("X-Telegram-Init-Data") or ""
        if not init and self.dev_user:
            return self.dev_user
        return verify_init_data(init, self.bot_token)

    def _obj(self, obj_id: str, u: TgUser) -> StoreObject:
        o = self.store.get(obj_id)
        if not o or (o.owner_tg != u.id and u.id not in o.team_tg):
            raise LookupError("объект не найден")
        return o

    # ---------- маршрутизация ----------
    def handle(self, method: str, path: str, headers: dict, body: bytes) -> Response:
        try:
            u = self.user({k.lower(): v for k, v in headers.items()})
        except AuthError as e:
            return _err(f"нет доступа: {e}", 401)
        try:
            data = json.loads(body or b"{}") if method in ("POST", "PUT") and body else {}
            for pattern, m, fn in self.routes():
                mm = re.fullmatch(pattern, path)
                if mm and m == method:
                    return fn(u, data, body, *mm.groups())
            return _err("нет такого адреса", 404)
        except PermissionError as e:
            return _err(str(e), 403)
        except LookupError as e:
            return _err(str(e), 404)
        except (ValueError, KeyError) as e:
            return _err(str(e), 400)

    def routes(self):
        o = r"/api/objects/([0-9a-f]{12})"
        return [
            (r"/api/objects", "GET", self.list_objects),
            (r"/api/sources", "GET", self.list_sources),
            (r"/api/sources/(\w+)", "POST", self.replace_source),
            (r"/api/sources/archive/([\w.-]+\.pdf)", "GET", self.source_archive),
            (r"/api/print-file", "POST", self.print_file),
            (r"/api/objects", "POST", self.create_object),
            (o, "GET", self.get_object),
            (o, "PUT", self.update_object),
            (o + r"/firstday", "GET", self.get_firstday),
            (o + r"/firstday/(\w+)", "POST", self.toggle_step),
            (o + r"/ahch", "POST", self.ahch),
            (o + r"/contracts/request", "POST", self.contracts_request),
            (o + r"/contracts/upload", "POST", self.contracts_upload),
            (o + r"/texts", "GET", self.get_texts),
            (o + r"/survey", "PUT", self.put_survey),
            (o + r"/checklists", "GET", self.get_checklists),
            (o + r"/checks", "POST", self.put_check),
            (o + r"/norms", "GET", self.get_norms),
            (o + r"/delivery", "PUT", self.put_delivery),
            (o + r"/statuses", "PUT", self.put_status),
            (o + r"/extras", "PUT", self.put_extras),
            (o + r"/album/(\w+)", "POST", self.album_photo),
            (o + r"/letter/(first|update)", "GET", self.get_letter),
            (r"^/api/directory$", "GET", self.directory),
            (r"^/api/store/([^/]+)$", "GET", self.store_hint),
            (o + r"/pdf/(konvert|dvornik|ahchlist)", "GET", self.get_pdf),
            (o + r"/print/(konvert|dvornik|vcf|ahchlist|maxvcf)", "POST", self.send_to_chat),
            (o + r"/max-icon", "POST", self.max_icon),
            (o + r"/ahch-scan", "POST", self.ahch_scan),
            (o + r"/docs", "GET", self.get_docs),
            (o + r"/feedback", "GET", self.get_feedback),
            (o + r"/feedback", "PUT", self.put_feedback),
            (o + r"/docs/(elab|eom|other)", "POST", self.upload_doc),
            (o + r"/vcf", "GET", self.get_vcf),
            (o + r"/zones/(\d)", "GET", self.zones),
            (o + r"/zones/(\d)", "POST", self.zone_check),
            (o + r"/people", "GET", self.people),
            (o + r"/plans", "GET", self.list_plans),
            (o + r"/plans", "POST", self.upload_plan),
            (o + r"/plans/([0-9a-f]{12})", "PUT", self.edit_plan),
            (o + r"/plans/([0-9a-f]{12})/delete", "POST", self.delete_plan),
            (o + r"/plans/([0-9a-f]{12})/apply", "POST", self.apply_plan),
            (o + r"/plans/([0-9a-f]{12})/crop", "POST", self.crop_plan),
            (o + r"/plan-image/([0-9a-f]{12}_\d+\.jpg)", "GET", self.plan_image),
            (o + r"/remarks", "GET", self.list_remarks),
            (o + r"/remarks", "POST", self.create_remark),
            (o + r"/remarks/([0-9a-f]{12})", "PUT", self.update_remark),
            (o + r"/remarks/([0-9a-f]{12})/photo", "POST", self.remark_photo),
            (o + r"/remarks/([0-9a-f]{12})/img/(before|fix)(\d+)", "GET", self.remark_img),
            (o + r"/remarks/([0-9a-f]{12})/collage", "POST", self.remark_collage),
            (o + r"/groups", "POST", self.create_group),
            (o + r"/check1", "GET", self.get_check1),
            (o + r"/check1", "POST", self.put_check1),
            (o + r"/groups/([0-9a-f]{8})/delete", "POST", self.delete_group),
            (o + r"/remarks/([0-9a-f]{12})/status", "POST", self.remark_status),
            (o + r"/remarks/([0-9a-f]{12})/comment", "POST", self.remark_comment),
        ]

    # ---------- объекты ----------
    def list_objects(self, u, *_):
        out = []
        for o in self.store.list_for(u.id):
            keys = firstday.memo_keys(o)
            out.append({"id": o.id, "code": o.code, "city": o.city, "address": o.address, "full_address": o.full_address,
                        "okrug": o.okrug, "accept_date": o.accept_date, "open_date": o.open_date,
                        "firstday_done": sum(bool(o.first_day_done.get(k)) for k in keys), "firstday_total": len(keys),
                        "remarks_open": sum(r.status in ("open", "fixed") for r in o.remarks),
                        "missing_people": len(o.missing_people()), "missing_contracts": len(o.missing_contracts())})
        return _json(sorted(out, key=lambda x: str(x["accept_date"] or "9999")))

    def create_object(self, u, data, *_):
        o = StoreObject(id=new_id(), code=data["code"].strip().upper(), city=data.get("city", "").strip(),
                        address=data.get("address", "").strip(), okrug=data.get("okrug", "СФО"), owner_tg=u.id)
        self._apply(o, data)
        o.flags["created"] = date.today().isoformat()
        self.store.put(o)
        return _json(o.to_dict(), 201)

    def get_object(self, u, _d, _b, oid):
        o = self._obj(oid, u)
        d = o.to_dict()
        d["missing_people"] = o.missing_people()
        # подсказки из прошлых объектов того же города (не подставляются сами — руководитель подтверждает)
        hints = {}
        for x in self.store.list_for(u.id):
            if x.id == o.id or not o.city or x.city != o.city:
                continue
            for k in ("trainer", "ahch_curator"):
                p = getattr(x, k)
                if p.name and k not in hints:
                    hints[k] = asdict(p)
        d["hints"] = hints
        return _json(d)

    def update_object(self, u, data, _b, oid):
        o = self._obj(oid, u)
        self._apply(o, data)
        self.store.put(o)
        return self.get_object(u, None, None, oid)

    def _apply(self, o: StoreObject, d: dict):
        for k in ("code", "city", "address", "okrug", "store_email"):
            if k in d:
                setattr(o, k, d[k].strip() if isinstance(d[k], str) else d[k])
        o.code = o.code.upper()
        if o.okrug not in ("СФО", "УФО", "ЦФО"):
            raise ValueError("округ: СФО, УФО или ЦФО")
        for k in ("accept_date", "open_date"):
            if k in d:
                setattr(o, k, date.fromisoformat(d[k]) if d[k] else None)
        for k in ("director", "coordinator", "dev_manager", "mops_contractor", "trainer", "ahch_curator"):
            if k in d and isinstance(d[k], dict):
                setattr(o, k, Person(**{**asdict(getattr(o, k)), **d[k]}))
        for k in ("razmen_date", "incass_days", "ahch_notified_on"):
            if k in d:
                o.flags[k] = d[k]
        if "razmen_donor" in d:
            don = d["razmen_donor"] or {}
            code = (don.get("code") or "").strip().upper()
            hit = next((x for x in _stores()["stores"] if x["code"] == code), None) if code else None
            o.razmen_donor = {"code": code, **({k: hit.get(k, "") for k in ("address", "director", "director_phone", "email")} if hit else {}),
                              **{k: v for k, v in don.items() if k != "code" and v}}
        # дата открытия по умолчанию — приёмка + 4 дня
        if o.accept_date and not o.open_date:
            o.open_date = o.accept_date + timedelta(days=4)
        for k in ("dvornik_hired",):
            if k in d:
                o.flags[k] = bool(d[k])

    # ---------- первый день ----------
    def get_firstday(self, u, _d, _b, oid):
        o = self._obj(oid, u)
        return _json([asdict(s) for s in firstday.first_day(o)])

    def toggle_step(self, u, data, _b, oid, key):
        o = self._obj(oid, u)
        o.first_day_done[key] = bool(data.get("done", True))
        self.store.put(o)
        return self.get_firstday(u, None, None, oid)

    # ---------- тексты ----------
    def ahch(self, u, data, _b, oid):
        o = self._obj(oid, u)
        items = data.get("items") or texts.AHCH_DEFAULT
        visit = date.fromisoformat(data["visit"]) if data.get("visit") else None
        ch = dict(texts.AHCH_CHANNEL.get(o.okrug, {}))
        if data.get("tver_kaluga"):
            ch = dict(texts.AHCH_TVER_KALUGA, subject=texts.ahch_mail_subject(o))
        return _json({"text": texts.ahch_request(o, items, visit), "channel": ch, "defaults": texts.AHCH_DEFAULT})

    def directory(self, u, *_):
        """Справочник для подсказок в полях: контакты команды + люди из прошлых объектов пользователя."""
        from .generators.vcf import CONTACTS
        out, seen = [], set()
        for c in json.loads(CONTACTS.read_text(encoding="utf-8")):
            out.append({"name": c["fio"], "phone": (c.get("phones") or [""])[0], "email": c.get("email", ""),
                        "role": c.get("role", ""), "area": c.get("area", ""), "scope": c.get("scope", "")})
            seen.add(c["fio"])
        cities = set()
        for o in self.store.list_for(u.id):
            if o.city:
                cities.add(o.city)
            for k, title in (("director", "Директор магазина"), ("coordinator", "Координатор строительства"),
                             ("dev_manager", "Менеджер по развитию"), ("mops_contractor", "Подрядчик МОПы")):
                p = getattr(o, k)
                if p.name and p.name not in seen:
                    seen.add(p.name)
                    out.append({"name": p.name, "phone": p.phone, "email": p.email, "role": title,
                                "area": o.city, "scope": "mine", "slot": k})
        for st in _stores()["stores"]:
            if st["director"] and st["director"] not in seen:
                seen.add(st["director"])
                out.append({"name": st["director"], "phone": st["director_phone"], "email": "", "role": f"Управляющий {st['code']}",
                            "area": st["city"], "scope": "store"})
        return _json({"people": out, "cities": sorted(cities | {x["city"] for x in _stores()["stores"] if x["city"]})})

    def store_hint(self, u, _d, _b, code):
        """Подсказка по коду магазина: из справочника магазинов или по похожим кодам (округ, город, почта)."""
        from urllib.parse import unquote
        code = unquote(code).strip().upper()
        data = _stores()
        hit = next((x for x in data["stores"] if x["code"] == code), None)
        if hit:
            return _json({"found": True, **hit})
        m = re.match(r"^([А-ЯЁA-Z]+)(\d+)", code)
        if not m:
            return _json({"found": False})
        pre, num = m.groups()
        same = [x for x in data["stores"] if re.match(rf"^{pre}\d", x["code"])]
        out = {"found": False}
        if same:
            from collections import Counter
            out["okrug"] = Counter(x["okrug"] for x in same).most_common(1)[0][0]
            cities = Counter(x["city"] for x in same if x["city"])
            if cities:
                out["city"] = cities.most_common(1)[0][0]
        if pre in data["email_prefix"]:
            out["email"] = f"{data['email_prefix'][pre]}{num}@ya-retail.ru"
        return _json(out)

    def get_texts(self, u, _d, _b, oid):
        o = self._obj(oid, u)
        return _json({"whatsapp_group": texts.whatsapp_group_name(o), "outlook_signature": texts.outlook_signature(o),
                      "mops": texts.mops_request(o) if o.okrug == "ЦФО" else None})

    # ---------- планы магазина ----------
    def list_plans(self, u, _d, _b, oid):
        o = self._obj(oid, u)
        marks = [{"rid": r.id, "status": r.status, "section": r.section, "text": r.text, "zone": r.zone,
                  "deadline": r.deadline, "photos": len(r.photos), "author": r.author_name, **r.plan_mark}
                 for r in o.remarks if r.plan_mark]
        points = [{"i": i, **m} for i, m in enumerate(o.extras.get("measures", [])) if re.fullmatch(r"[0-9a-f]{12}", str(m.get("plan", "")))]
        return _json({"plans": o.plans, "marks": marks, "points": points, "kinds": plans_mod.KINDS})

    def upload_plan(self, u, data, _b, oid):
        o = self._obj(oid, u)
        pdf = base64.b64decode(data["file_b64"])
        if not pdf.startswith(b"%PDF"):
            raise ValueError("нужен PDF (DWG сначала сохраните в PDF)")
        pid = new_id()
        kind = data.get("kind") or plans_mod.guess_kind(plans_mod.first_text(pdf))
        pages = plans_mod.render(pdf, o.id, pid)
        plans_mod.save_source(pdf, o.id, pid)
        title = (data.get("title") or "").strip() or plans_mod.KINDS.get(kind, "План")
        parsed = plans_mod.parse_sheet(pdf)
        if parsed["luminaires"]:
            kind = data.get("kind") or "light"
        if not re.search(r"[А-Яа-яЁё]{3}", title) or re.search(r"_{3,}", title):   # имя файла вида «3be6f7b7-____36» — даём понятное
            title = plans_mod.KINDS.get(kind, "План")
        plan = {"id": pid, "title": title, "kind": kind, "pages": pages, "uploaded": date.today().isoformat(), "disk_path": "", "parsed": parsed}
        if self.disk:
            try:
                plan["disk_path"] = self.disk.upload(pdf, o.code, "Планы", f"{title}.pdf")
            except Exception:
                pass
        o.plans.append(plan)
        self.store.put(o)
        return self.list_plans(u, None, None, oid)

    def edit_plan(self, u, data, _b, oid, pid):
        o = self._obj(oid, u)
        p = next((x for x in o.plans if x["id"] == pid), None)
        if not p:
            raise LookupError("план не найден")
        for k in ("title", "kind"):
            if data.get(k):
                p[k] = data[k]
        self.store.put(o)
        return self.list_plans(u, None, None, oid)

    def crop_plan(self, u, data, _b, oid, pid):
        """Фрагмент плана крупно на A4: PDF в ответе или файлом в чат с ботом («На печать»). Рамка сохраняется как зона."""
        o = self._obj(oid, u)
        p = next((x for x in o.plans if x["id"] == pid), None)
        if not p:
            raise LookupError("план не найден")
        page = int(data.get("page") or 1)
        box = tuple(float(v) for v in data["box"])
        name = (data.get("name") or "").strip()
        marks = []
        if data.get("marks", True):
            for sec, items in rm.numbered(o).items():
                for n, r in items:
                    pm = r.plan_mark or {}
                    if pm.get("plan") == pid and int(pm.get("page") or 1) == page:
                        marks.append({"x": pm["x"], "y": pm["y"], "n": n, "status": r.status})
        title = f"{o.code} · {p['title']}" + (f" · {name}" if name else " · фрагмент")
        pdf = plans_mod.crop_print(o.id, p, page, box, int(data.get("sheets") or 0), marks, title)
        if name:
            crops = [c for c in p.setdefault("crops", []) if c.get("name") != name]
            crops.append({"name": name, "page": page, "box": list(box), "sheets": int(data.get("sheets") or 0)})
            p["crops"] = crops
            self.store.put(o)
        fname = f"plan-{o.code}-{name or 'fragment'}.pdf"
        if data.get("send"):
            if not self.sender:
                raise ValueError("бот не подключён")
            pages = __import__("pymupdf").open(stream=pdf).page_count
            self.sender.send_document(u.id, fname, pdf, f"План: {name or 'фрагмент'} — {pages} лист(а) A4, 1 копия, без масштабирования → «Поделиться» → Kyocera Mobile Print")
            return _json({"sent": True, "pages": pages})
        return _pdf(pdf, fname)

    def apply_plan(self, u, data, _b, oid, pid):
        """«Подставить из файла»: сетки, торцы, кофестанция — в опрос; светильники по типам и аварийные — в световой план этапа 2."""
        o = self._obj(oid, u)
        p = next((x for x in o.plans if x["id"] == pid), None)
        if not p or not p.get("parsed"):
            raise LookupError("в этом плане нечего подставлять")
        pr = p["parsed"]
        pas = pr.get("passport", {})
        for k in ("grids", "ends", "coffee", "cash"):
            if pas.get(k) is not None:
                o.survey[k] = pas[k]
        if pr.get("luminaires"):
            light = dict(o.extras.get("light") or {})
            facts = {x["name"]: x.get("fact", "") for x in light.get("types", [])}
            light["types"] = [{**x, "fact": facts.get(x["name"], "")} for x in pr["luminaires"]]
            light["emergency_plan"] = pr.get("emergency", 0)
            light["source"] = p["title"]
            o.extras["light"] = light
        o.extras["passport"] = {**(o.extras.get("passport") or {}), **pas, "discrepancies": pr.get("discrepancies", [])}
        self.store.put(o)
        return self.list_plans(u, None, None, oid)

    def delete_plan(self, u, _d, _b, oid, pid):
        o = self._obj(oid, u)
        o.plans = [x for x in o.plans if x["id"] != pid]
        for r in o.remarks:
            if r.plan_mark.get("plan") == pid:
                r.plan_mark = {}
        plans_mod.remove(o.id, pid)
        self.store.put(o)
        return self.list_plans(u, None, None, oid)

    def plan_image(self, u, _d, _b, oid, name):
        o = self._obj(oid, u)
        f = plans_mod.page_file(o.id, name)
        return 200, {"Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400"}, f.read_bytes()

    # ---------- опрос, этапы, недовозы, статусы, письмо ----------
    def put_survey(self, u, data, _b, oid):
        o = self._obj(oid, u)
        allowed = {"coffee", "grids", "ends", "superstructures", "fresh", "ramp", "entrance_light", "fire_cabinet", "cash"}
        for k, v in data.items():
            if k in allowed:
                o.survey[k] = v
        self.store.put(o)
        return self.get_norms(u, None, None, oid)

    def get_checklists(self, u, _d, _b, oid):
        from .letter import status_lines
        o = self._obj(oid, u)
        from .letter import CHECK, status_lines
        refs = {}
        for r in o.remarks:
            if r.item_ref:
                refs.setdefault(r.item_ref, []).append({"id": r.id, "author": r.author_name, "status": r.status})
        sv = norms_mod.survey(o)
        cash = sv.get("cash") or next((p.get("parsed", {}).get("passport", {}).get("cash") for p in o.plans
                                       if p.get("parsed", {}).get("passport", {}).get("cash")), None)
        n = int(cash) if cash else None
        stage2 = []
        for z in CHECK["stage2"]:
            if z["key"] == "e10":
                fmt_ = {"cash": n if n else "N (по числу касс)", "scales": n + 1 if n else "N+1"}
                z = {**z, "items": [x.format(**fmt_) for x in z["items"]], "cash": n}
            stage2.append(z)
        return _json({"stage1": CHECK["stage1"], "stage2": stage2, "statuses": CHECK["statuses"],
                      "albums": CHECK["photo_albums"], "module2": CHECK["coffee2_module"],
                      "checks": o.checks, "refs": refs, "state": o.statuses, "extras": o.extras, "survey": norms_mod.survey(o),
                      "lines": status_lines(o), "people": [p["name"] for p in rm.people_for(o)]})

    def put_check(self, u, data, _b, oid):
        o = self._obj(oid, u)
        key = data["key"]
        if data.get("state"):
            o.checks[key] = {"state": data["state"], "by": u.display, "at": date.today().isoformat()}
        else:
            o.checks.pop(key, None)
        self.store.put(o)
        return _json({"key": key, "check": o.checks.get(key)})

    def get_norms(self, u, _d, _b, oid):
        o = self._obj(oid, u)
        return _json({"norms": norms_mod.norms(o), "delivery": o.delivery, "survey": norms_mod.survey(o),
                      "survey_missing": norms_mod.survey_missing(o), "shortages": norms_mod.shortages(o)})

    def put_delivery(self, u, data, _b, oid):
        o = self._obj(oid, u)
        lst = data["list"]
        if lst not in norms_mod.LISTS:
            raise ValueError("список: mto, hoz или coffee")
        cur = o.delivery.setdefault(lst, {})
        if "missing" in data:                  # пакетом: {n: сколько к довозу}; 0 — пришло полностью
            norm = {str(it["n"]): it["norm"] for it in norms_mod.norms(o)[lst]}
            for n, miss in data["missing"].items():
                if norm.get(str(n)) is not None:
                    cur[str(n)] = max(0, norm[str(n)] - max(0, int(miss or 0)))
        elif "all" in data:                    # «всё пришло» / «сбросить» по списку
            for it in norms_mod.norms(o)[lst]:
                if it["norm"] is not None:
                    cur[str(it["n"])] = it["norm"] if data["all"] else 0
        else:
            cur[str(data["n"])] = max(0, int(data.get("have") or 0))
        self.store.put(o)
        return self.get_norms(u, None, None, oid)

    def put_status(self, u, data, _b, oid):
        o = self._obj(oid, u)
        st = o.statuses.setdefault(data["key"], {})
        if data.get("state") in ("ok", "na", "bad", "off"):
            if st.get("state") != data["state"]:
                st.pop("phrase", None)
            st["state"] = data["state"]
        for k in ("phrase", "note", "ask", "question"):
            if k in data:
                st[k] = (data[k] or "").strip()
        if "count" in data:
            st["count"] = str(data["count"] or "").strip()
        if "deadline" in data:
            st["deadline"] = data["deadline"] or ""
        st["by"] = u.display
        self.store.put(o)
        from .letter import status_lines
        return _json({"statuses": o.statuses, "lines": status_lines(o)})

    def put_extras(self, u, data, _b, oid):
        o = self._obj(oid, u)
        allowed = {"batteries", "pumps", "height_unloading", "height_ramp", "module2", "nochange", "show_received",
                   "ahch_scan", "measures", "light", "cc_extra", "first_sent", "zh_ok"}
        for k, v in data.items():
            if k in allowed:
                o.extras[k] = v
        self.store.put(o)
        return _json(o.extras)

    def album_photo(self, u, data, _b, oid, key):
        if not self.disk:
            raise ValueError("Яндекс Диск не подключён")
        o = self._obj(oid, u)
        from .letter import CHECK
        titles = dict(CHECK["photo_albums"])
        titles.update({x["key"]: x["subject"].replace("/", " ").strip() for x in CHECK["statuses"] if x.get("photo")})
        if key not in titles:
            raise ValueError("неизвестный альбом")
        img = base64.b64decode(data["image_b64"])
        cnt = o.extras.setdefault("album_count", {})
        cnt[key] = cnt.get(key, 0) + 1
        title = titles[key][:60]
        path = self.disk.upload(img, o.code, "Фото для письма", f"{title}_{cnt[key]}.jpg", sub=title)
        folder = path.rsplit("/", 1)[0]
        # одно фото — ссылка на файл, несколько — на папку (открывается галереей)
        o.extras.setdefault("albums", {})[key] = self.disk.public_url(folder if cnt[key] > 1 else path)
        self.store.put(o)
        return _json({"albums": o.extras["albums"], "count": cnt})

    def get_letter(self, u, _d, _b, oid, mode):
        o = self._obj(oid, u)
        from . import letter
        out = letter.build(o, mode)
        out["mailto"] = texts.mailto(", ".join(e for _, e in out["to"]), out["subject"], "", ", ".join(e for _, e in out["cc"]))
        out["deadline_hint"] = "Письмо — до 14:00 (ЦФО — до 14:00 МСК)" if mode == "first" else \
            "Апдейт — до 10:00, только после того, как Жихарева приняла фото исправлений в МАХ"
        return _json(out)

    # ---------- договоры ----------
    def contracts_request(self, u, data, _b, oid):
        o = self._obj(oid, u)
        to = o.dev_manager if data.get("to", "dev_manager") == "dev_manager" else Person(**data["custom"])
        if not to.filled or not to.email:
            raise ValueError("выберите, у кого запросить: нужны имя и почта")
        slots = data.get("slots")
        if slots is not None and any(s not in CONTRACT_SLOTS for s in slots):
            raise ValueError("неизвестный договор")
        r = texts.contracts_request(o, to, slots)
        if not (slots if slots is not None else o.missing_contracts()):
            return _json({"all_received": True})
        r["mailto"] = texts.mailto(r["to"], r["subject"], r["body"], r["cc"])
        o.flags[f"contracts_requested"] = date.today().isoformat()
        self.store.put(o)
        return _json(r)

    def contracts_upload(self, u, _d, body, oid):
        o = self._obj(oid, u)
        payload = _d
        pdf = base64.b64decode(payload["file_b64"])
        det = gcontracts.detect_pdf(pdf, o.address)
        slots = payload.get("slots") or det.slots          # ручной выбор места, если не распознано
        if not det.text_found and not payload.get("slots"):
            return _json({"need_manual": True, "reason": "текст не распознан — выберите, какой это договор"})
        if det.text_found and not det.has_address and not payload.get("force"):
            return _json({"warn_address": True, "slots": slots, "reason": "в файле нет адреса магазина — файл не про этот магазин?"})
        for s in slots:
            c = o.contracts[s]
            c.status, c.number, c.doc_date = "received", det.number or c.number, det.doc_date or c.doc_date
            c.file_ids.append(payload.get("file_id", ""))
        self.store.put(o)
        return _json({"slots": slots, "contracts": {k: asdict(v) for k, v in o.contracts.items()}})

    # ---------- файлы ----------
    def get_pdf(self, u, _d, _b, oid, kind):
        o = self._obj(oid, u)
        if kind == "ahchlist":
            return _pdf(pdfs.readiness_list(o, rko=u.display), f"list-gotovnosti-{o.code}.pdf")
        if not o.director.phone or not o.director.name:
            raise ValueError("укажите ФИО и телефон директора в данных объекта")
        if kind == "konvert":
            return _pdf(pdfs.envelope_insert(o), f"konvert-{o.code}.pdf")
        return _pdf(pdfs.dvornik_poster(o), f"dvornik-{o.code}.pdf")

    # ---------- исходные документы и печать файлов ----------
    def _is_admin(self, u) -> bool:
        adm = os.environ.get("ADMIN_TG", "")
        return bool(self.dev_user) or (adm and str(u.id) in adm.replace(" ", "").split(","))

    def list_sources(self, u, *_):
        from . import sources
        return _json({"sources": sources.listing(), "stale": sources.stale_pages(), "admin": self._is_admin(u)})

    def replace_source(self, u, data, _b, sid):
        """Новая версия исходника: старая — в архив, инструкции на её основе — «источник обновлён», всем руководителям — сообщение."""
        from . import sources
        if not self._is_admin(u):
            raise PermissionError("заменять исходные документы может только администратор справочников")
        s = sources.replace(sid, base64.b64decode(data["file_b64"]), data.get("version", ""), u.display)
        if self.sender:
            users = {x for o in self.store.all() for x in (o.owner_tg, *o.team_tg) if x}
            for uid in users:
                try:
                    self.sender.send_text(uid, f"Обновлён документ «{s['title']}», версия от {s['version']}. "
                                               "Инструкции на его основе помечены «источник обновлён — проверить».",
                                          [("Открыть приложение", "open:objects")])
                except Exception:
                    pass
        return self.list_sources(u)

    def source_archive(self, u, _d, _b, name):
        from . import sources
        return _pdf(sources.archive_file(name).read_bytes(), name)

    def print_file(self, u, data, *_):
        """«На печать» любого PDF из памятки: бот присылает файл в чат → «Поделиться» → Kyocera."""
        from . import sources
        if not self.sender:
            raise ValueError("бот не подключён")
        f = sources.printable(data.get("path", ""))
        if f.stat().st_size > 49 * 1024 * 1024:
            raise ValueError("файл больше 50 МБ — Telegram не пропустит")
        hint = data.get("hint") or "1 копия"
        name = os.path.basename((data.get("path", "")).split("#")[0].split("?")[0]) or f.name
        self.sender.send_document(u.id, name, f.read_bytes(), f"На печать: {hint} → «Поделиться» → Kyocera Mobile Print")
        return _json({"sent": True})

    FEEDBACK_TO = ["Сидоров Алексей Вадимович", "Смирнов Сергей Владимирович", "Филатова Анастасия Сергеевна",
                   "Суркова Екатерина Константиновна", "Тимофеева Ксения Александровна"]

    def get_feedback(self, u, _d, _b, oid):
        """Обратная связь через 1 и 2 недели после открытия: опросник → черновик письма."""
        from .letter import person_email
        o = self._obj(oid, u)
        fb = o.extras.get("feedback") or {}
        to = [(n, person_email(n, o)) for n in self.FEEDBACK_TO]
        wk = fb.get("week") or 1
        rows = [x for x in fb.get("rows", []) if (x.get("problem") or "").strip()]
        lines = [f"Коллеги, добрый день!", "",
                 f"Обратная связь по магазину {o.code}, {o.full_address} — {wk} нед. после открытия" + (f" ({o.open_date:%d.%m.%Y})" if o.open_date else "") + ".", ""]
        if rows:
            for i, x in enumerate(rows, 1):
                lines.append(f"{i}. {x['problem'].strip()}" + (f" — обращались: {x['who'].strip()}" if x.get("who") else "")
                             + (f"; прогресс: {x['progress'].strip()}" if x.get("progress") else "; прогресса нет"))
        else:
            lines.append("Проблем нет, магазин работает в штатном режиме.")
        lines += ["", "С уважением,", u.display]
        subj = f"{o.code} {o.city} г, {o.address} - обратная связь ({wk} нед. после открытия)"
        body = "\n".join(lines)
        return _json({"week": wk, "rows": fb.get("rows", []), "to": to, "subject": subj, "body": body,
                      "mailto": texts.mailto(", ".join(e for _, e in to if e), subj, body, o.store_email)})

    def put_feedback(self, u, data, _b, oid):
        o = self._obj(oid, u)
        fb = o.extras.setdefault("feedback", {})
        if "week" in data:
            fb["week"] = int(data["week"] or 1)
        if "rows" in data:
            fb["rows"] = [{k: str(x.get(k, ""))[:500] for k in ("problem", "who", "progress")} for x in data["rows"]][:20]
        self.store.put(o)
        return self.get_feedback(u, None, None, oid)

    DOCS = {"elab": "Отчёт электролаборатории", "eom": "ЭОМ (проект электроснабжения)", "other": "Прочие документы"}

    def get_docs(self, u, _d, _b, oid):
        o = self._obj(oid, u)
        docs = o.extras.get("docs") or {}
        slots = [{"key": k, "title": v, **docs.get(k, {})} for k, v in self.DOCS.items()]
        c = o.contracts
        return _json({"slots": slots, "contracts": {"got": sum(x.status == "received" for x in c.values()), "total": len(c)},
                      "ahch": {"url": o.extras.get("ahch_scan", ""), "updated": bool(o.extras.get("ahch_updated"))}})

    def upload_doc(self, u, data, _b, oid, key):
        """Документы объекта вне письма: файлы → Диск «Документы/<слот>», публичная ссылка на папку или файл."""
        if not self.disk:
            raise ValueError("Яндекс Диск не подключён")
        o = self._obj(oid, u)
        docs = o.extras.setdefault("docs", {})
        if data.get("clear"):
            docs.pop(key, None)
            self.store.put(o)
            return self.get_docs(u, None, None, oid)
        files = data.get("files") or []
        if not files:
            raise ValueError("нет файла")
        cur = docs.get(key) or {}
        n0 = int(cur.get("count") or 0)
        title = self.DOCS[key]
        paths = []
        for i, f in enumerate(files, n0 + 1):
            ext = "pdf" if f.get("pdf") else "jpg"
            paths.append(self.disk.upload(base64.b64decode(f["b64"]), o.code, "Документы", f"{title}_{i}.{ext}", sub=title))
        count = n0 + len(paths)
        target = paths[0] if count == 1 else paths[0].rsplit("/", 1)[0]
        docs[key] = {"url": self.disk.public_url(target), "count": count, "date": date.today().isoformat(),
                     "by": u.display, "note": (data.get("note") or cur.get("note") or "").strip()}
        self.store.put(o)
        return self.get_docs(u, None, None, oid)

    def ahch_scan(self, u, data, _b, oid):
        """Скан или фото заполненного листа готовности → Диск → ссылка в письме. Повторная загрузка — «ОБНОВЛЁННЫЙ ЛИСТ»."""
        o = self._obj(oid, u)
        if data.get("remove"):
            o.extras["ahch_in_letter"] = False
            self.store.put(o)
            return _json(o.extras)
        if data.get("restore"):
            o.extras["ahch_in_letter"] = True
            self.store.put(o)
            return _json(o.extras)
        if not self.disk:
            raise ValueError("Яндекс Диск не подключён")
        files = data.get("files") or []
        if not files:
            raise ValueError("нет файла")
        had = bool(o.extras.get("ahch_scan"))
        ver = int(o.extras.get("ahch_ver") or 0) + 1
        sub = f"Лист готовности АХЧ{'' if ver == 1 else ' — обновлённый ' + str(ver)}"
        paths = []
        for i, f in enumerate(files, 1):
            ext = "pdf" if f.get("pdf") else "jpg"
            paths.append(self.disk.upload(base64.b64decode(f["b64"]), o.code, "Фото для письма", f"Лист готовности_{i}.{ext}", sub=sub))
        target = paths[0] if len(paths) == 1 else paths[0].rsplit("/", 1)[0]
        o.extras.update({"ahch_scan": self.disk.public_url(target), "ahch_ver": ver, "ahch_updated": had,
                         "ahch_in_letter": True, "ahch_date": date.today().isoformat()})
        self.store.put(o)
        return _json(o.extras)

    def max_icon(self, u, data, _b, oid):
        """Квадратная иконка группы в МАХ из фрагмента плана — в чат с ботом (сохранить и поставить на группу)."""
        o = self._obj(oid, u)
        if not self.sender:
            raise ValueError("бот не подключён")
        self.sender.send_document(u.id, f"ikonka-{o.code}.jpg", base64.b64decode(data["image_b64"]), "Иконка группы в МАХ: сохраните фото → в группе «Изменить» → фото")
        return _json({"sent": True})

    def get_vcf(self, u, _d, _b, oid):
        o = self._obj(oid, u)
        return 200, {"Content-Type": "text/vcard; charset=utf-8",
                     "Content-Disposition": _disp("attachment", f"kontakty-{o.code}.vcf")}, vcf.for_object(o).encode()

    def send_to_chat(self, u, _d, _b, oid, kind):
        """«На печать»: бот присылает файл в чат, дальше «Поделиться» → Kyocera."""
        if not self.sender:
            raise ValueError("бот не подключён")
        o = self._obj(oid, u)
        if kind == "maxvcf":
            data, name, cap = vcf.max_group(o).encode(), f"gruppa-max-{o.code}.vcf", "Участники группы в МАХ — откройте, добавьте в контакты, затем в группу"
        elif kind == "vcf":
            data, name, cap = vcf.for_object(o).encode(), f"kontakty-{o.code}.vcf", "Контакты объекта — откройте, чтобы добавить в телефон"
        else:
            st, _h, data = self.get_pdf(u, None, None, oid, kind)
            name = f"{kind}-{o.code}.pdf"
            cap = ("Лист готовности АХЧ: двусторонняя, книжная, 1 копия → «Поделиться» → Kyocera Mobile Print. "
                   "Заполняется и подписывается на приёмке, потом — фото или скан в приложение") if kind == "ahchlist" else \
                "На печать: книжная, 1 копия → «Поделиться» → Kyocera Mobile Print"
        self.sender.send_document(u.id, name, data, cap)
        return _json({"sent": True})

    # ---------- обход и замечания ----------
    def zones(self, u, _d, _b, oid, stage):
        return _json(rm.zone_summary(self._obj(oid, u), int(stage)))

    def zone_check(self, u, data, _b, oid, stage):
        o = self._obj(oid, u)
        lst = set(o.zones_checked.get(stage, []))
        (lst.add if data.get("checked", True) else lst.discard)(data["zone"])
        o.zones_checked[stage] = sorted(lst)
        self.store.put(o)
        return self.zones(u, None, None, oid, stage)

    def people(self, u, _d, _b, oid):
        return _json(rm.people_for(self._obj(oid, u)))

    def _remark(self, o, rid):
        r = next((r for r in o.remarks if r.id == rid), None)
        if not r:
            raise LookupError("замечание не найдено")
        return r

    def list_remarks(self, u, _d, _b, oid):
        o = self._obj(oid, u)
        out = []
        for sec, items in rm.numbered(o).items():
            for n, r in items:
                d = asdict(r); d["n"] = n; d["needs_deadline"] = r.needs_deadline
                out.append(d)
        return _json(out)

    def create_remark(self, u, data, _b, oid):
        o = self._obj(oid, u)
        r = rm.create(o, data, u.id, u.display)
        self.store.put(o)
        return _json(asdict(r), 201)

    def update_remark(self, u, data, _b, oid, rid):
        o = self._obj(oid, u)
        r = self._remark(o, rid)
        rm.update(r, data)
        self.store.put(o)
        return _json(asdict(r))

    def _thumb(self, oid: str, rid: str, kind: str, n: int) -> Path:
        d = THUMBS / oid
        d.mkdir(parents=True, exist_ok=True)
        return d / f"{rid}_{kind}{n}.jpg"

    def remark_photo(self, u, data, _b, oid, rid):
        """Фото замечания («до») или исправления («после», kind=fix): на Диск; локальная копия — для коллажа."""
        if not self.disk:
            raise ValueError("Яндекс Диск не подключён")
        o = self._obj(oid, u)
        r = self._remark(o, rid)
        img = base64.b64decode(data["image_b64"])
        num = next((i for i, x in enumerate(o.remarks, 1) if x.id == r.id), 0)
        if data.get("kind") == "fix":
            n = len(r.fix_photos) + 1
            path = self.disk.upload(img, o.code, "Исправления до-после", f"{num:02d}_{r.zone}_{r.phrase[:40]}_после_{n}.jpg")
            r.fix_photos.append({"path": path, "url": self.disk.public_url(path)})
            self._thumb(o.id, r.id, "fix", n).write_bytes(img)
            if r.status == "open":
                rm.set_status(r, "fixed", is_owner=False)
            r.log.append({"who": u.display, "when": date.today().isoformat(), "what": "исправление", "before": "", "after": f"фото после {n}"})
        else:
            n = len(r.photos) + 1
            sub = f"{num:02d}_{r.phrase[:40]}"
            path = self.disk.upload(img, o.code, r.zone, f"{num:02d}_{r.zone}_{r.phrase[:40]}_{n}.jpg", sub=sub)
            r.photos.append({"path": path, "url": self.disk.public_url(path)})
            if len(r.photos) > 1:
                r.folder_url = self.disk.public_url(path.rsplit("/", 1)[0])
            self._thumb(o.id, r.id, "before", n).write_bytes(img)
        self.store.put(o)
        return _json(asdict(r))

    def remark_img(self, u, _d, _b, oid, rid, kind, n):
        o = self._obj(oid, u)
        f = self._thumb(o.id, rid, kind, int(n))
        if not f.exists():
            raise LookupError("фото нет на сервере (загружено до обновления) — снимите заново")
        return 200, {"Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400"}, f.read_bytes()

    def remark_collage(self, u, data, _b, oid, rid):
        """Коллаж «до/после» собирается на телефоне → Диск («Исправления до-после») → в чат с ботом для пересылки в МАХ."""
        o = self._obj(oid, u)
        r = self._remark(o, rid)
        img = base64.b64decode(data["image_b64"])
        num = next((i for i, x in enumerate(o.remarks, 1) if x.id == r.id), 0)
        name = f"{num:02d}_{r.zone}_{r.phrase[:40]}_до-после_{len(r.collages) + 1}.jpg"
        if self.disk:
            path = self.disk.upload(img, o.code, "Исправления до-после", name)
            r.collages.append({"path": path, "url": self.disk.public_url(path)})
        self.store.put(o)
        sent = False
        if self.sender:
            try:
                self.sender.send_document(u.id, name, img, f"{o.code} · №{num} {r.text[:80]} — до/после. Перешлите в группу МАХ")
                sent = True
            except Exception:
                pass
        return _json({"remark": asdict(r), "sent": sent})

    # ---------- Москва: письмо о первых пробитых чеках ----------
    @staticmethod
    def _is_moscow(o) -> bool:
        return o.okrug == "ЦФО" and (o.code or "").upper().startswith("М") and "москв" in ((o.city or "") + " " + (o.address or "")).lower()

    def _check1_letter(self, o) -> dict:
        from .letter import FONT, esc
        rows = o.extras.get("check1") or {}
        n = int(norms_mod.survey(o).get("cash") or max([3] + [int(k) for k in rows]))
        lines_h, lines_t = [], []
        for i in range(1, n + 1):
            x = rows.get(str(i)) or {}
            dt = ", ".join(v for v in (x.get("date", ""), x.get("time", "")) if v) or "дата, время чека"
            link = f' — <a href="{esc(x["url"])}">фото</a>' if x.get("url") else ""
            lines_h.append(f"ККМ {i}: {esc(dt)}{link}"); lines_t.append(f"ККМ {i}: {dt}" + (f" — фото: {x['url']}" if x.get("url") else ""))
        p = lambda s: f'<p style="{FONT};margin:0">{s}</p>'
        html = "".join([p("Добрый день!"), p("Информация по первым пробитым чекам:")] + [p(x) for x in lines_h] +
                       [p("Фото чеков — по ссылкам" + (" и во вложении" if any((rows.get(str(i)) or {}).get("url") for i in range(1, n + 1)) else ""))])
        text = "\n".join(["Добрый день!", "Информация по первым пробитым чекам:"] + lines_t + ["Фото чеков — по ссылкам"])
        subject = f"{o.code} Первый Чек"
        to = "e.sergeeva@ya-retail.ru"
        return {"html": f'<div style="{FONT}">{html}</div>', "text": text, "subject": subject, "to": [["Сергеева Елена", to]],
                "mailto": texts.mailto(to, subject, "", o.store_email or ""), "rows": rows, "kkm": n, "moscow": self._is_moscow(o)}

    def get_check1(self, u, _d, _b, oid):
        return _json(self._check1_letter(self._obj(oid, u)))

    def put_check1(self, u, data, _b, oid):
        """Чек по ККМ: фото → Диск («Первый чек»), дата и время (распознаны на телефоне или вписаны)."""
        o = self._obj(oid, u)
        k = str(int(data["kkm"]))
        row = o.extras.setdefault("check1", {}).setdefault(k, {})
        for f in ("date", "time"):
            if f in data:
                row[f] = (data[f] or "").strip()
        if data.get("image_b64") and self.disk:
            img = base64.b64decode(data["image_b64"])
            path = self.disk.upload(img, o.code, "Первый чек", f"ККМ {k} — первый чек.jpg")
            row["url"] = self.disk.public_url(path)
            if self.sender:
                try:
                    self.sender.send_document(u.id, f"{o.code} ККМ {k} первый чек.jpg", img, "Фото первого чека — приложите к письму Сергеевой")
                except Exception:
                    pass
        self.store.put(o)
        return _json(self._check1_letter(o))

    def create_group(self, u, data, _b, oid):
        """Объединение пунктов в подпункты: общая формулировка; у подпунктов остаются свои сроки, фото и точки на плане."""
        o = self._obj(oid, u)
        ids = [x for x in data.get("members", []) if any(r.id == x for r in o.remarks)]
        text = (data.get("text") or "").strip()
        if len(ids) < 2:
            raise ValueError("выберите хотя бы два пункта")
        if not text:
            raise ValueError("впишите общую формулировку")
        secs = {r.section for r in o.remarks if r.id in ids}
        if len(secs) > 1:
            raise ValueError("стройку и оборудование объединить нельзя")
        groups = [g for g in o.extras.get("groups", []) if not set(g["members"]) & set(ids)]
        groups.append({"id": os.urandom(4).hex(), "text": text, "members": ids, "by": u.display, "when": date.today().isoformat()})
        o.extras["groups"] = groups
        self.store.put(o)
        return _json({"groups": groups})

    def delete_group(self, u, _d, _b, oid, gid):
        o = self._obj(oid, u)
        o.extras["groups"] = [g for g in o.extras.get("groups", []) if g["id"] != gid]
        self.store.put(o)
        return _json({"groups": o.extras["groups"]})

    def remark_status(self, u, data, _b, oid, rid):
        o = self._obj(oid, u)
        r = self._remark(o, rid)
        rm.set_status(r, data["status"], is_owner=(u.id == o.owner_tg))
        self.store.put(o)
        return _json(asdict(r))

    def remark_comment(self, u, data, _b, oid, rid):
        o = self._obj(oid, u)
        r = self._remark(o, rid)
        col = data.get("color", "")
        if data.get("progress"):
            from .letter import ORANGE
            col = ORANGE
        rm.add_comment(r, data.get("author") or u.display, data.get("text", ""), col)
        self.store.put(o)
        return _json(asdict(r))
