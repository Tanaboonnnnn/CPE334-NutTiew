#!/usr/bin/env python3
"""Offline fixture tests for deploy/tests/verify_check_runs.sh (GH-05).

Feeds real-shaped Check Runs API JSON payloads to the verifier and asserts exit
codes.  No live GitHub API call is made; payloads are local fixtures.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
VERIFIER = HERE / "verify_check_runs.sh"

# Resolve a WORKING bash (git-bash on Windows; avoids the broken WSL relay stub).
def find_bash() -> str:
    import shutil
    env = os.environ.get("BASH", "")
    if env and os.access(env, os.X_OK):
        return env
    candidates = [
        r"C:\Program Files\Git\bin\bash.exe",
        r"C:\Program Files\Git\usr\bin\bash.exe",
        os.path.expandvars(r"%LOCALAPPDATA%\Programs\Git\bin\bash.exe"),
        "/c/Program Files/Git/bin/bash.exe",
        "/c/Program Files/Git/usr/bin/bash.exe",
        "/bin/bash",
        "/usr/bin/bash",
    ]
    for c in candidates:
        if c and os.access(c, os.X_OK):
            return c
    found = shutil.which("bash")
    return found or "/bin/bash"


BASH = find_bash()

REQUIRED = [
    "Unit / types / build",
    "PostgreSQL 18 / Auth / Slot / Race A",
    "Microsoft Edge / Auth / Tutor UI E2E",
]


def make_payload(name_to_conclusion: dict) -> dict:
    runs = []
    for name, conclusion in name_to_conclusion.items():
        runs.append(
            {
                "name": name,
                "status": "completed",
                "conclusion": conclusion,
                "started_at": "2026-11-14T00:00:00Z",
                "app": {"slug": "github-actions"},
            }
        )
    return {"total_count": len(runs), "check_runs": runs}


def run_verifier(payload, sha: str, raw: str | None = None) -> subprocess.CompletedProcess:
    """Write the fixture to a repo-relative path (avoids Windows path mangling
    when git-bash reads it) and invoke the verifier.  `payload` is a dict; if
    `raw` is given it is written verbatim (e.g. concatenated multi-page JSON)."""
    global _fixture_counter
    _fixture_counter += 1
    fixture = HERE / f".tmp_checks_fixture_{os.getpid()}_{_fixture_counter}.json"
    content = raw if raw is not None else json.dumps(payload)
    with open(fixture, "w", encoding="utf-8") as fh:
        fh.write(content)
        fh.flush()
        os.fsync(fh.fileno())
    rel = fixture.relative_to(HERE.parents[1]).as_posix()  # repo root, forward slashes
    verifier_arg = str(VERIFIER).replace("\\", "/") if os.name == "nt" else str(VERIFIER)
    try:
        return subprocess.run(
            [BASH, verifier_arg, "--sha", sha, "--from-file", str(rel),
             "--max-attempts", "2", "--poll", "0"],
            capture_output=True, text=True,
        )
    finally:
        fixture.unlink(missing_ok=True)


_fixture_counter = 0


SHA = "0123456789abcdef0123456789abcdef01234567"


def main() -> int:
    checks = []

    def check(name, ok, detail):
        checks.append((name, bool(ok), detail))

    # 1. All three required green -> exit 0
    good = {n: "success" for n in REQUIRED}
    r = run_verifier(make_payload(good), SHA)
    check("all-success", r.returncode == 0, f"rc={r.returncode}\nSTDOUT:{r.stdout}\nSTDERR:{r.stderr}")

    # 1b. Pagination (finding #E): the three required checks are split across two
    #     concatenated "pages" (`gh api --paginate` object form) and must still
    #     validate green.
    page1 = make_payload({REQUIRED[0]: "success", "SomeOtherCheck": "success"})
    page2 = make_payload({REQUIRED[1]: "success", REQUIRED[2]: "success"})
    multi = json.dumps(page1) + "\n" + json.dumps(page2)
    r = run_verifier({}, SHA, raw=multi)
    check("multi-page-all-green", r.returncode == 0, f"rc={r.returncode}\nSTDOUT:{r.stdout}\nSTDERR:{r.stderr}")

    # 1c. Pagination with a FAILED required check on the second page -> exit 1.
    page1b = make_payload({REQUIRED[0]: "success"})
    page2b = make_payload({REQUIRED[1]: "failure", REQUIRED[2]: "success"})
    multi2 = json.dumps(page1b) + "\n" + json.dumps(page2b)
    r = run_verifier({}, SHA, raw=multi2)
    check("multi-page-one-failed", r.returncode != 0, f"rc={r.returncode}\nSTDOUT:{r.stdout}\nSTDERR:{r.stderr}")

    # 1d. Malformed trailing JSON (finding #6): a valid green payload followed by
    #     trailing garbage must NOT produce a PASS.
    good_multi = json.dumps(make_payload(good))
    malformed = good_multi + "\n}}not-json{{"   # trailing corrupted content
    r = run_verifier({}, SHA, raw=malformed)
    check("malformed-trailing-json-rejected", r.returncode != 0, f"rc={r.returncode}\nSTDOUT:{r.stdout}\nSTDERR:{r.stderr}")
    # 1e. A single valid doc followed by a stray brace (partial corruption).
    stray = good_multi + "{"
    r = run_verifier({}, SHA, raw=stray)
    check("partial-corruption-never-pass", r.returncode != 0, f"rc={r.returncode}\nSTDOUT:{r.stdout}\nSTDERR:{r.stderr}")

    # 2. One required missing -> exit 1
    missing = {REQUIRED[0]: "success", REQUIRED[1]: "success"}  # third absent
    r = run_verifier(make_payload(missing), SHA)
    check("missing-required", r.returncode != 0, f"rc={r.returncode}\n{r.stdout}{r.stderr}")

    # 3. One failure -> exit 1
    fail = {n: "success" for n in REQUIRED}
    fail[REQUIRED[1]] = "failure"
    r = run_verifier(make_payload(fail), SHA)
    check("one-failure", r.returncode != 0, f"rc={r.returncode}\n{r.stdout}{r.stderr}")

    # 4. One cancelled -> exit 1
    cancelled = {n: "success" for n in REQUIRED}
    cancelled[REQUIRED[2]] = "cancelled"
    r = run_verifier(make_payload(cancelled), SHA)
    check("one-cancelled", r.returncode != 0, f"rc={r.returncode}\n{r.stdout}{r.stderr}")

    # 5. Duplicate/retry: an earlier FAILED run + a later SUCCESS run for the same
    #    check name -> must use the LATEST and pass (no false negative/positive).
    duel = {n: "success" for n in REQUIRED}
    duel[REQUIRED[0]] = "failure"  # this becomes the earliest run; latest is success below
    payload = make_payload(duel)
    earliest = payload["check_runs"][0]
    latest = dict(earliest)
    latest["started_at"] = "2026-11-14T01:00:00Z"
    latest["conclusion"] = "success"
    payload["total_count"] += 1
    payload["check_runs"].append(latest)
    r = run_verifier(payload, SHA)
    check("latest-run-wins-success", r.returncode == 0, f"rc={r.returncode}\n{r.stdout}{r.stderr}")

    # 6. A required check is only pending initially and never completes -> bounded fail
    pending = {n: "success" for n in REQUIRED}
    pending[REQUIRED[0]] = None  # status completed but conclusion null => treated pending
    payload2 = make_payload({name: (c if c else None) for name, c in pending.items()})
    r = run_verifier(payload2, SHA)
    check("pending-gives-up", r.returncode != 0, f"rc={r.returncode}\n{r.stdout}{r.stderr}")

    # 7. Wrong SHA (not hex) rejected
    r = run_verifier(make_payload(good), "not-a-sha")
    check("invalid-sha-rejected", r.returncode != 0, f"rc={r.returncode}\n{r.stdout}{r.stderr}")

    failed = sum(1 for _, ok, _ in checks if not ok)
    for name, ok, detail in checks:
        print(f"[{'PASS' if ok else 'FAIL'}] verify_check_runs: {name}")
        if not ok:
            print(f"     {detail}")
    print(f"CHECK-RUNS FIXTURE TESTS: {len(checks)-failed}/{len(checks)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())