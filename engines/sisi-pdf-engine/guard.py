"""Rem biaya per instance (port CostGuardMiddleware ba-pdf-engine v1).

- Body > ENGINE_MAX_BODY_BYTES = 413 sebelum Flask membaca body.
- Hitungan request harian per instance (/tmp, reset saat cold start / redeploy):
  >= 85% budget = 1 request per ENGINE_GUARD_COOLDOWN_SECONDS (429), >= 95% = 503 sampai besok (UTC).
- GET / (health) dan GET /guard/status tidak dihitung.
Pengaman utama tetap max-instances=1 di Cloud Run + tanda tangan HMAC (app.py).
"""
import json
import logging
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path

from werkzeug.wrappers import Response


class CostGuard:
    def __init__(self, wrapped, service_name):
        self.wrapped = wrapped
        self.service_name = service_name
        self.daily_budget = max(50, int(os.getenv("ENGINE_DAILY_REQUEST_BUDGET", "500")))
        self.cooldown = max(1, int(os.getenv("ENGINE_GUARD_COOLDOWN_SECONDS", "10")))
        self.max_body = max(1_000_000, int(os.getenv("ENGINE_MAX_BODY_BYTES", "25000000")))
        self.path = Path("/tmp/sisi-guard-%s.json" % service_name)
        self.lock = threading.Lock()
        self.last_request_at = 0.0
        self.warned = set()

    @staticmethod
    def _day():
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _read(self):
        try:
            state = json.loads(self.path.read_text())
        except Exception:
            state = {}
        if state.get("day") != self._day():
            state = {"day": self._day(), "count": 0}
        return state

    def _increment(self):
        with self.lock:
            state = self._read()
            state["count"] = int(state.get("count", 0)) + 1
            tmp = self.path.with_suffix(".tmp")
            tmp.write_text(json.dumps(state, separators=(",", ":")))
            tmp.replace(self.path)
            return state["count"]

    def status(self):
        state = self._read()
        count = int(state.get("count", 0))
        return {"ok": True, "service": self.service_name, "day": state.get("day"), "count": count,
                "budget": self.daily_budget, "ratio": round(count / self.daily_budget, 4),
                "maxBodyBytes": self.max_body, "scope": "instance"}

    @staticmethod
    def _json(environ, start_response, status, body, headers=None):
        return Response(json.dumps(body), status=status, content_type="application/json",
                        headers=headers or {})(environ, start_response)

    def __call__(self, environ, start_response):
        path = environ.get("PATH_INFO", "/")
        if path == "/guard/status":
            return self._json(environ, start_response, 200, self.status(), {"Cache-Control": "no-store"})
        if path == "/":
            return self.wrapped(environ, start_response)
        try:
            length = int(environ.get("CONTENT_LENGTH") or 0)
        except ValueError:
            length = 0
        if length > self.max_body:
            return self._json(environ, start_response, 413,
                              {"ok": False, "kode": "PAYLOAD_TERLALU_BESAR", "pesan": "Payload melewati batas engine."})
        count = self._increment()
        ratio = count / self.daily_budget
        level = 95 if ratio >= .95 else 85 if ratio >= .85 else 70 if ratio >= .70 else 0
        if level and level not in self.warned:
            logging.warning("COST_GUARD service=%s level=%s count=%s budget=%s", self.service_name, level, count,
                            self.daily_budget)
            self.warned.add(level)
        if ratio >= .95:
            return self._json(environ, start_response, 503,
                              {"ok": False, "kode": "BATAS_HARIAN", "pesan": "Batas harian engine tercapai."},
                              {"Retry-After": "3600"})
        if ratio >= .85:
            now = time.monotonic()
            with self.lock:
                wait = self.cooldown - (now - self.last_request_at)
                if wait <= 0:
                    self.last_request_at = now
            if wait > 0:
                return self._json(environ, start_response, 429,
                                  {"ok": False, "kode": "DIREM", "pesan": "Permintaan dibatasi sementara."},
                                  {"Retry-After": str(max(1, int(wait) + 1))})
        return self.wrapped(environ, start_response)
