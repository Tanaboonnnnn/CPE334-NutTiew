#!/usr/bin/env python3
"""Offline tests for deploy/tests/job_outcome_checker.py (GH-05 finding #C).

Feeds synthetic Cloud Run Job execution JSON payloads and asserts the terminal
outcome.  Covers success, failure, cancelled, pending, and misleading condition
ordering (a non-terminal `Active`/`Ready` condition with status True must not be
mistaken for success).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
CHECKER = HERE / "job_outcome_checker.py"


def run(payload: dict, via_stdin: bool = False) -> subprocess.CompletedProcess:
    # Resolve a working python; on Windows launch the checker via `python`.
    py = os.environ.get("PYTHON_BIN") or next((c for c in ("python3", "python") if _which(c)), "python3")
    if via_stdin:
        return subprocess.run([py, str(CHECKER), "-"], input=json.dumps(payload),
                              capture_output=True, text=True)
    with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as fh:
        json.dump(payload, fh)
        path = fh.name
    try:
        return subprocess.run([py, str(CHECKER), path], capture_output=True, text=True)
    finally:
        os.unlink(path)


def _which(c):
    from shutil import which
    return which(c)


def _job(conditions):
    return {"status": {"conditions": conditions}}


SUC_COND = [
    {"type": "Active", "status": "True"},
    {"type": "Completed", "status": "True"},
    {"type": "Succeeded", "status": "True", "reason": "JobExecutionSucceeded"},
]
FAIL_COND = [
    {"type": "Active", "status": "True"},
    {"type": "Succeeded", "status": "False", "reason": "Failed"},
]
CANCEL_COND = [
    {"type": "Active", "status": "True"},
    {"type": "Completed", "status": "False", "reason": "Cancelled"},
]
PENDING_COND = [
    {"type": "Active", "status": "True"},
    {"type": "Ready", "status": "True"},  # misleading: first True, not terminal
]
# Misleading order: Succeeded=True listed last; a naive conditions[0] (Active=True)
# must NOT be treated as success by the old logic, but the checker sees the True.
MISLEAD_COND = [
    {"type": "Active", "status": "True"},
    {"type": "Succeeded", "status": "True", "reason": "JobExecutionSucceeded"},
]


def main() -> int:
    checks = []

    def check(name, ok, detail):
        checks.append((name, bool(ok), detail))

    r = run(_job(SUC_COND))
    check("success", r.returncode == 0 and "success" in r.stdout, f"rc={r.returncode} out={r.stdout} err={r.stderr}")

    r = run(_job(FAIL_COND))
    check("failure", r.returncode == 1 and "failure" in r.stdout, f"rc={r.returncode} out={r.stdout} err={r.stderr}")

    r = run(_job(CANCEL_COND))
    check("cancelled", r.returncode == 1 and "cancelled" in r.stdout, f"rc={r.returncode} out={r.stdout} err={r.stderr}")

    r = run(_job(PENDING_COND))
    check("pending-not-success", r.returncode == 3 and "pending" in r.stdout, f"rc={r.returncode} out={r.stdout} err={r.stderr}")

    r = run(_job(MISLEAD_COND))
    check("misleading-condition-order", r.returncode == 0 and "success" in r.stdout, f"rc={r.returncode} out={r.stdout} err={r.stderr}")

    r = run(_job(SUC_COND), via_stdin=True)
    check("stdin-support", r.returncode == 0 and "success" in r.stdout, f"rc={r.returncode} out={r.stdout} err={r.stderr}")

    r = run({"status": {}}, via_stdin=True)
    check("empty-conditions-pending", r.returncode == 3, f"rc={r.returncode} out={r.stdout} err={r.stderr}")

    failed = sum(1 for _, ok, _ in checks if not ok)
    for name, ok, detail in checks:
        print(f"[{'PASS' if ok else 'FAIL'}] job-outcome: {name}")
        if not ok:
            print(f"     {detail}")
    print(f"JOB-OUTCOME FIXTURE TESTS: {len(checks)-failed}/{len(checks)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())