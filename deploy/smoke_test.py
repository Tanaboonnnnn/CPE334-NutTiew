#!/usr/bin/env python3
# =============================================================================
# NutTiew read-only smoke test (GH-05, Issue #68)
# -----------------------------------------------------------------------------
# Verifies a *deployed* NutTiew instance from the public internet without
# writing anything, without creating accounts/slots/bookings, and without ever
# printing passwords, cookies, CSRF tokens, or session data.
#
# Endpoints covered (read-only, per the real NutTiew routes in
# apps/api/src/app.ts and apps/api/src/server.ts):
#   * /            GET  -> the single-origin built React UI (HTML)
#   * /api/ready   GET  -> DB-backed readiness: 200 {"status":"ready"} when the
#                          database is reachable, else 503 SERVICE_UNAVAILABLE
#
# There is intentionally NO /api/health and NO /api/categories in NutTiew; this
# script does not assume TokTickIT endpoints.
#
# Pass/fail semantics:
#   * / : expects HTTP 200 and non-empty HTML content.
#   * /api/ready (REQUIRED): expects HTTP 200 and a JSON body {"status":"ready"}.
#     A 503 means the DB is unreachable -> FAIL (not SKIP).
# Exit code is 0 only when all REQUIRED checks pass.
#
# Standard library only.  Offline-testable against a local fake HTTP server
# (see deploy/tests/test_smoke_offline.py).
# =============================================================================

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from typing import Optional

DEFAULT_TIMEOUT_SECONDS = 10


class SmokeCheckResult:
    def __init__(self, name: str, required: bool = True):
        self.name = name
        self.required = required
        self.status: Optional[str] = None  # PASS / FAIL / SKIP
        self.detail: str = ""

    def mark(self, status: str, detail: str) -> None:
        self.status = status
        self.detail = detail

    def fail(self, detail: str) -> None:
        self.mark("FAIL", detail)

    def skip(self, detail: str) -> None:
        self.mark("SKIP", detail)

    def pass_(self, detail: str) -> None:
        self.mark("PASS", detail)


def http_get(base_url: str, path: str, timeout: int) -> tuple[int, str, str]:
    """Perform a GET and return (status, content_type, body_text).

    Raises subclasses of urllib.error.URLError on network failure.
    """
    url = base_url.rstrip("/") + path
    req = urllib.request.Request(url, method="GET", headers={"Accept": "*/*"})
    with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (read-only public health check)
        status = resp.status if hasattr(resp, "status") else resp.getcode()
        content_type = resp.headers.get("Content-Type", "")
        body = resp.read().decode("utf-8", errors="replace")
        return int(status or 0), content_type, body


def safe_host(base_url: str, result: SmokeCheckResult) -> bool:
    """Ensure we only point at an https/https host to avoid SSRF in the check."""
    import urllib.parse

    parts = urllib.parse.urlparse(base_url)
    if parts.scheme not in ("http", "https"):
        result.fail(f"unsupported scheme in base URL: {base_url!r}")
        return False
    if not parts.netloc:
        result.fail("base URL has no host")
        return False
    return True


def run_smoke(base_url: str, timeout: int) -> list[SmokeCheckResult]:
    results: list[SmokeCheckResult] = []

    if not safe_host(base_url, SmokeCheckResult("url-safety")):
        results.append(_finish_fail(SmokeCheckResult("url-safety")))
        return results

    # --- Root UI (/) ----------------------------------------------------
    root = SmokeCheckResult("root-ui")
    try:
        status, ctype, body = http_get(base_url, "/", timeout)
        if status == 200 and ("text/html" in ctype) and body.strip():
            root.pass_(f"/ returned 200 (content-type={ctype}, {len(body)} bytes)")
        elif status == 200 and "text/html" not in ctype:
            root.fail(f"/ returned 200 but unexpected content-type: {ctype!r}")
        else:
            root.fail(f"/ returned HTTP {status} (expected 200 with HTML)")
    except urllib.error.HTTPError as exc:
        root.fail(f"/ returned HTTP {exc.code} (expected 200)")
    except (urllib.error.URLError, OSError) as exc:
        root.fail(f"/ network error: {exc}")
    results.append(root)

    # --- DB-backed readiness (/api/ready) -------------------------------
    ready = SmokeCheckResult("api-ready", required=True)
    try:
        status, ctype, body = http_get(base_url, "/api/ready", timeout)
        if status == 200 and "application/json" in ctype:
            try:
                payload = json.loads(body)
            except ValueError:
                ready.fail(f"/api/ready returned non-JSON body")
                results.append(ready)
                return results
            if payload.get("status") == "ready":
                ready.pass_(f"/api/ready returned 200 {json.dumps(payload)}")
            else:
                ready.fail(
                    f"/api/ready returned 200 but body did not contain status=ready: {body[:200]!r}"
                )
        elif status == 503:
            ready.fail(
                "/api/ready returned 503 SERVICE_UNAVAILABLE - the database is "
                "unreachable; a healthy deployment must report ready"
            )
        else:
            ready.fail(
                f"/api/ready returned HTTP {status} (expected 200 JSON ready)"
            )
    except urllib.error.HTTPError as exc:
        if exc.code == 503:
            ready.fail(
                "/api/ready returned 503 SERVICE_UNAVAILABLE - database unreachable"
            )
        else:
            ready.fail(f"/api/ready returned HTTP {exc.code}")
    except (urllib.error.URLError, OSError) as exc:
        ready.fail(f"/api/ready network error: {exc}")
    results.append(ready)
    return results


def _finish_fail(result: SmokeCheckResult) -> SmokeCheckResult:
    if not result.status:
        result.fail("failed internal safety check")
    return result


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(
        description="NutTiew read-only smoke test (no writes, no secret output)."
    )
    parser.add_argument("--base-url", required=True, help="public origin, e.g. https://ui.example.com")
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help=f"per-request timeout in seconds (default {DEFAULT_TIMEOUT_SECONDS})",
    )
    args = parser.parse_args(argv)

    # Do not allow printing secret-ish values: reject any URL containing a
    # user:pass@ authority which could leak credentials into logs.
    if "@" in args.base_url.split("//")[-1].split("/")[0]:
        print("ERROR: base URL must not contain credentials", file=sys.stderr)
        return 2

    results = run_smoke(args.base_url, args.timeout)

    required_failed = 0
    for r in results:
        label = f"[{r.status or '?'}] {r.name}"
        print(f"{label}: {r.detail}")
        if r.status == "FAIL" and r.required:
            required_failed += 1

    if required_failed:
        print(f"RESULT: FAIL ({required_failed} required check(s) failed)", file=sys.stderr)
        return 1
    # At least one required check must have run/passed; if all were skipped we
    # should not report success.
    ran = [r for r in results if r.status in ("PASS", "FAIL")]
    if not ran:
        print("RESULT: FAIL (no smoke check executed)", file=sys.stderr)
        return 1
    print("RESULT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())