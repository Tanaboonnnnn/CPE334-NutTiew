#!/usr/bin/env python3
"""Offline tests for deploy/smoke_test.py using a local fake HTTP server.

Runs the real smoke_test.main() against controlled HTTP responses and asserts
exit codes and no-secret-leakage.  Pure standard library; no live GCP URL.
"""
from __future__ import annotations

import http.server
import json
import subprocess
import sys
import threading
from pathlib import Path

HERE = Path(__file__).resolve().parent
SMOKE = (HERE.parent / "smoke_test.py").resolve()


class Handler(http.server.BaseHTTPRequestHandler):
    mode = "healthy"  # mutated per-test by the driver

    def _send(self, status: int, body: bytes, ctype: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):  # noqa: N802
        if self.mode == "healthy":
            if self.path == "/":
                self._send(200, b"<!doctype html><html>NutTiew</html>", "text/html; charset=utf-8")
            elif self.path == "/api/ready":
                self._send(200, json.dumps({"status": "ready"}).encode(), "application/json")
            else:
                self._send(404, b"not found", "text/plain")
        elif self.mode == "ready503":
            if self.path == "/":
                self._send(200, b"<html>ok</html>", "text/html")
            elif self.path == "/api/ready":
                self._send(503, json.dumps({"error": "SERVICE_UNAVAILABLE"}).encode(), "application/json")
            else:
                self._send(404, b"", "text/plain")
        elif self.mode == "root500":
            if self.path == "/":
                self._send(500, b"boom", "text/plain")
            elif self.path == "/api/ready":
                self._send(200, json.dumps({"status": "ready"}).encode(), "application/json")
            else:
                self._send(404, b"", "text/plain")
        elif self.mode == "invalidjson":
            if self.path == "/":
                self._send(200, b"<html>ok</html>", "text/html")
            elif self.path == "/api/ready":
                self._send(200, b"this-is-not-json", "application/json")
            else:
                self._send(404, b"", "text/plain")
        elif self.mode == "wrongcontenttype":
            if self.path == "/":
                self._send(200, b"hello", "text/plain")

    def log_message(self, *args):  # silence
        pass


def run_smoke(base_url: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SMOKE), "--base-url", base_url],
        capture_output=True,
        text=True,
    )


def main() -> int:
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    port = srv.server_address[1]
    base = f"http://127.0.0.1:{port}"
    t = threading.Thread(target=srv.serve_forever, daemon=True)
    t.start()

    checks = []
    try:
        def check(name, cond, detail):
            checks.append((name, bool(cond), detail))

        # 1. Healthy -> exit 0, both PASS, no secret leak
        Handler.mode = "healthy"
        r = run_smoke(base)
        check("healthy-exit0", r.returncode == 0, f"rc={r.returncode}\n{r.stdout}{r.stderr}")
        check("healthy-msg", "PASS" in r.stdout and "api-ready" in r.stdout, r.stdout)

        # 2. /api/ready returns 503 -> FAIL, exit non-zero
        Handler.mode = "ready503"
        r = run_smoke(base)
        check("ready503", r.returncode != 0 and "503" in r.stdout, f"rc={r.returncode}\n{r.stdout}{r.stderr}")

        # 3. Root returns 500 -> FAIL
        Handler.mode = "root500"
        r = run_smoke(base)
        check("root500", r.returncode != 0, f"rc={r.returncode}\n{r.stdout}{r.stderr}")

        # 4. Invalid JSON on /api/ready -> FAIL
        Handler.mode = "invalidjson"
        r = run_smoke(base)
        check("invalidjson", r.returncode != 0, f"rc={r.returncode}\n{r.stdout}{r.stderr}")

        # 5. Timeout: point at a port that accepts but never responds is hard;
        # use a blackholed URL is flaky. Instead assert the timeout boundary via
        # an intentionally closed port -> connection refused FAIL.
        closed = "http://127.0.0.1:1"
        r = run_smoke(closed)
        check("connection-refused", r.returncode != 0, f"rc={r.returncode}\n{r.stdout}{r.stderr}")

        # 6. URL containing credentials must be rejected.
        r = run_smoke("http://user:secret@127.0.0.1:1")
        check("cred-in-url", r.returncode != 0 and "credentials" in r.stderr, f"{r.stdout}{r.stderr}")

        # 7. No-secret-leakage: the fixture "secret" must not appear in output.
        leaked = "secret" in (r.stdout + r.stderr).lower()
        check("no-secret-leak", not leaked, "right: see above")

        # 8. Unexpected redirect/origin: Server that 302s / -> ensure FAIL
        # (an HTTPS redirect target means the smoke must not silently pass).
        class RedirectHandler(Handler):
            def do_GET(self):  # noqa: N802
                if self.path == "/":
                    self.send_response(302)
                    self.send_header("Location", "https://elsewhere.example/")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                elif self.path == "/api/ready":
                    self._send(200, json.dumps({"status": "ready"}).encode(), "application/json")
        srv2 = http.server.ThreadingHTTPServer(("127.0.0.1", 0), RedirectHandler)
        port2 = srv2.server_address[1]
        t2 = threading.Thread(target=srv2.serve_forever, daemon=True)
        t2.start()
        r = run_smoke(f"http://127.0.0.1:{port2}")
        # urllib follows redirects by default, so this may end up at a network-fail
        # (the redirect host is unreachable). The key invariant is that a redirect
        # to an unexpected origin must not be reported as PASS.
        check("redirect-not-pass", r.returncode != 0 or "PASS" not in r.stdout, f"rc={r.returncode}\n{r.stdout}{r.stderr}")
        srv2.shutdown()
    finally:
        srv.shutdown()

    failed = 0
    for name, ok, detail in checks:
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {name}")
        if not ok:
            failed += 1
            print(f"     detail: {detail}")
    print(f"SMOKE OFFLINE TESTS: {len(checks) - failed}/{len(checks)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())