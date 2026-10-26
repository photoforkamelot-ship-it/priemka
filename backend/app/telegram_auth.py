"""Проверка подписи Telegram Mini App (initData).

Каждый запрос из приложения несёт строку initData. Сервер проверяет её
подпись токеном бота: так чужой аккаунт или подделанный запрос ничего не увидит.
https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
"""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from urllib.parse import parse_qsl


class AuthError(Exception):
    pass


@dataclass(frozen=True)
class TgUser:
    id: int
    first_name: str
    last_name: str = ""
    username: str = ""

    @property
    def display(self) -> str:
        return " ".join(p for p in (self.first_name, self.last_name) if p) or self.username or str(self.id)


def verify_init_data(init_data: str, bot_token: str, max_age_s: int = 24 * 3600, now: float | None = None) -> TgUser:
    if not init_data:
        raise AuthError("пустой initData")
    pairs = dict(parse_qsl(init_data, keep_blank_values=True, strict_parsing=False))
    received = pairs.pop("hash", None)
    if not received:
        raise AuthError("нет подписи")
    check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    expected = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, received):
        raise AuthError("подпись не совпала")
    auth_date = int(pairs.get("auth_date", "0") or 0)
    if max_age_s and (now or time.time()) - auth_date > max_age_s:
        raise AuthError("initData устарел")
    try:
        u = json.loads(pairs.get("user", "{}"))
    except ValueError as e:
        raise AuthError("неверный user") from e
    if "id" not in u:
        raise AuthError("нет пользователя")
    return TgUser(id=int(u["id"]), first_name=u.get("first_name", ""), last_name=u.get("last_name", ""), username=u.get("username", ""))


def sign_init_data(fields: dict, bot_token: str) -> str:
    """Для тестов и локальной отладки: собрать подписанный initData."""
    from urllib.parse import urlencode
    pairs = {k: (json.dumps(v, ensure_ascii=False) if isinstance(v, dict) else str(v)) for k, v in fields.items()}
    check = "\n".join(f"{k}={v}" for k, v in sorted(pairs.items()))
    secret = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    pairs["hash"] = hmac.new(secret, check.encode(), hashlib.sha256).hexdigest()
    return urlencode(pairs)
