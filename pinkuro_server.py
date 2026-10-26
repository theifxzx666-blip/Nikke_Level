from __future__ import annotations

import json
import logging
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import Request, urlopen


ROOT = Path(__file__).resolve().parent
REMOTE = "https://pinkuro.top:9984"


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Never log query strings or request bodies: they may contain a Pinkuro Key.
        if self.path.startswith("/api/pinkuro"):
            return
        logging.info("%s %s", self.command, self.path.split("?", 1)[0])

    def _json(self, status: int, payload: object):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        return json.loads(self.rfile.read(length) or b"{}")

    def _remote(self, method: str, path: str, body: bytes | None = None, headers=None):
        request = Request(REMOTE + path, data=body, method=method, headers=headers or {})
        with urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read().decode("utf-8"))

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/pinkuro/characters":
            keyword = parse_qs(parsed.query).get("keyword", [""])[0]
            status, payload = self._remote("GET", "/api/nikke/public/combat/characters?keyword=" + quote(keyword))
            self._json(status, payload)
            return
        if parsed.path == "/api/health":
            self._json(200, {"ok": True})
            return
        self._serve(parsed.path)

    def do_POST(self):
        parsed = urlparse(self.path)
        try:
            body = self._read_json()
            if parsed.path == "/api/pinkuro/import":
                api_key = str(body.get("key", "")).strip()
                if not api_key:
                    self._json(400, {"success": False, "message": "未提供 Pinkuro Key"})
                    return
                status, payload = self._remote("GET", "/api/nikke/public/combat/import", headers={"X-API-KEY": api_key})
                self._json(status, payload)
                return
            self._json(404, {"success": False, "message": "接口不存在"})
        except (HTTPError, URLError, TimeoutError, ValueError, json.JSONDecodeError):
            self._json(502, {"success": False, "message": "Pinkuro 远端接口失败，请稍后重试"})

    def _serve(self, path: str):
        relative = "index.html" if path in ("", "/") else path.lstrip("/")
        target = (ROOT / relative).resolve()
        if ROOT not in target.parents and target != ROOT:
            self.send_error(403)
            return
        if not target.is_file():
            self.send_error(404)
            return
        content_type = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".json": "application/json; charset=utf-8",
        }.get(target.suffix, "text/plain; charset=utf-8")
        raw = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    server = ThreadingHTTPServer(("127.0.0.1", 8785), Handler)
    print("NIKKE calculator: http://127.0.0.1:8785")
    server.serve_forever()
