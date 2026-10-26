"""Точка входа для PythonAnywhere (и любого WSGI-хостинга).

В файле /var/www/<логин>_pythonanywhere_com_wsgi.py оставьте две строки:
    import sys; sys.path.insert(0, "/home/<логин>/priemka/backend")
    from wsgi import application
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent))

from app.web import MAX_BODY, App  # noqa: E402

app = App()

REASONS = {200: "OK", 400: "Bad Request", 401: "Unauthorized", 403: "Forbidden", 404: "Not Found",
           405: "Method Not Allowed", 413: "Payload Too Large", 500: "Internal Server Error"}


def application(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET")
    path = environ.get("PATH_INFO", "/").encode("latin-1", "replace").decode("utf-8", "replace")  # PEP 3333
    headers = {k[5:].replace("_", "-").title(): v for k, v in environ.items() if k.startswith("HTTP_")}
    if environ.get("CONTENT_TYPE"):
        headers["Content-Type"] = environ["CONTENT_TYPE"]
    n = int(environ.get("CONTENT_LENGTH") or 0)
    if n > MAX_BODY:
        st, hd, body = 413, {}, b"too large"
    else:
        body_in = environ["wsgi.input"].read(n) if n else b""
        st, hd, body = app.route(method, path, headers, body_in)
    hd = dict(hd)
    hd["Content-Length"] = str(len(body))
    start_response(f"{st} {REASONS.get(st, 'OK')}", list(hd.items()))
    return [body]
