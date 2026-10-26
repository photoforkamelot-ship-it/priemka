"""HTTP API приложения. Без фреймворка: одна функция handle(), которую вызывают
- Yandex Cloud Function (через API Gateway) — см. function.py;
- локальный сервер для разработки — см. devserver.py.
"""
from __future__ import annotations

import base64
import json
import os
import re
from dataclasses import asdict
from datetime import date

from . import firstday, remarks as rm
from .generators import contracts as gcontracts, pdfs, texts, vcf
from .models import CONTRACT_SLOTS, Person, StoreObject
from .storage import Store, new_id
from .telegram_auth import AuthError, TgUser, verify_init_data

Response = tuple[int, dict, bytes]


def _json(data, status=200) -> Response:
    return status, {"Content-Type": "application/json; charset=utf-8"}, json.dumps(data, ensure_ascii=False, default=str).encode()


def _err(msg, status=400) -> Response:
    return _json({"error": msg}, status)


def _pdf(data: bytes, name: str) -> Response:
    return 200, {"Content-Type": "application/pdf", "Content-Disposition": f'inline; filename="{name}"'}, data


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
            (r"/api/objects", "POST", self.create_object),
            (o, "GET", self.get_object),
            (o, "PUT", self.update_object),
            (o + r"/firstday", "GET", self.get_firstday),
            (o + r"/firstday/(\w+)", "POST", self.toggle_step),
            (o + r"/ahch", "POST", self.ahch),
            (o + r"/contracts/request", "POST", self.contracts_request),
            (o + r"/contracts/upload", "POST", self.contracts_upload),
            (o + r"/texts", "GET", self.get_texts),
            (o + r"/pdf/(konvert|dvornik)", "GET", self.get_pdf),
            (o + r"/print/(konvert|dvornik|vcf)", "POST", self.send_to_chat),
            (o + r"/vcf", "GET", self.get_vcf),
            (o + r"/zones/(\d)", "GET", self.zones),
            (o + r"/zones/(\d)", "POST", self.zone_check),
            (o + r"/people", "GET", self.people),
            (o + r"/remarks", "GET", self.list_remarks),
            (o + r"/remarks", "POST", self.create_remark),
            (o + r"/remarks/([0-9a-f]{12})", "PUT", self.update_remark),
            (o + r"/remarks/([0-9a-f]{12})/photo", "POST", self.remark_photo),
            (o + r"/remarks/([0-9a-f]{12})/status", "POST", self.remark_status),
            (o + r"/remarks/([0-9a-f]{12})/comment", "POST", self.remark_comment),
        ]

    # ---------- объекты ----------
    def list_objects(self, u, *_):
        out = []
        for o in self.store.list_for(u.id):
            steps = firstday.first_day(o)
            out.append({"id": o.id, "code": o.code, "address": o.full_address, "okrug": o.okrug,
                        "accept_date": o.accept_date, "open_date": o.open_date,
                        "firstday_done": sum(s.state == "done" for s in steps), "firstday_total": len(steps),
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
        for k in ("director", "coordinator", "dev_manager", "mops_contractor"):
            if k in d and isinstance(d[k], dict):
                setattr(o, k, Person(**{**asdict(getattr(o, k)), **d[k]}))
        for k in ("razmen_date",):
            if k in d:
                o.flags[k] = d[k]
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

    def get_texts(self, u, _d, _b, oid):
        o = self._obj(oid, u)
        return _json({"whatsapp_group": texts.whatsapp_group_name(o), "outlook_signature": texts.outlook_signature(o),
                      "mops": texts.mops_request(o) if o.okrug == "ЦФО" else None})

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
        if not o.director.phone or not o.director.name:
            raise ValueError("укажите ФИО и телефон директора в данных объекта")
        if kind == "konvert":
            return _pdf(pdfs.envelope_insert(o), f"konvert-{o.code}.pdf")
        return _pdf(pdfs.dvornik_poster(o), f"dvornik-{o.code}.pdf")

    def get_vcf(self, u, _d, _b, oid):
        o = self._obj(oid, u)
        return 200, {"Content-Type": "text/vcard; charset=utf-8",
                     "Content-Disposition": f'attachment; filename="kontakty-{o.code}.vcf"'}, vcf.for_object(o).encode()

    def send_to_chat(self, u, _d, _b, oid, kind):
        """«На печать»: бот присылает файл в чат, дальше «Поделиться» → Kyocera."""
        if not self.sender:
            raise ValueError("бот не подключён")
        o = self._obj(oid, u)
        if kind == "vcf":
            data, name, cap = vcf.for_object(o).encode(), f"kontakty-{o.code}.vcf", "Контакты объекта — откройте, чтобы добавить в телефон"
        else:
            st, _h, data = self.get_pdf(u, None, None, oid, kind)
            name = f"{kind}-{o.code}.pdf"
            cap = "На печать: книжная, 1 копия → «Поделиться» → Kyocera Mobile Print"
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

    def remark_photo(self, u, data, _b, oid, rid):
        if not self.disk:
            raise ValueError("Яндекс Диск не подключён")
        o = self._obj(oid, u)
        r = self._remark(o, rid)
        img = base64.b64decode(data["image_b64"])
        n = len(r.photos) + 1
        path = self.disk.upload(img, o.code, r.zone, f"{r.id}_{n}.jpg")
        r.photos.append({"path": path, "url": self.disk.public_url(path)})
        self.store.put(o)
        return _json(asdict(r))

    def remark_status(self, u, data, _b, oid, rid):
        o = self._obj(oid, u)
        r = self._remark(o, rid)
        rm.set_status(r, data["status"], is_owner=(u.id == o.owner_tg))
        self.store.put(o)
        return _json(asdict(r))

    def remark_comment(self, u, data, _b, oid, rid):
        o = self._obj(oid, u)
        r = self._remark(o, rid)
        rm.add_comment(r, data.get("author") or u.display, data.get("text", ""), data.get("color", ""))
        self.store.put(o)
        return _json(asdict(r))
