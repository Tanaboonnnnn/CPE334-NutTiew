#!/usr/bin/env python3
"""GitHub Actions Check Runs verifier (GH-05).

Reads a Check Runs API JSON payload file and requires that every required check
name (given as positional args; last arg is the release SHA) has a LATEST run
(by started_at) whose conclusion == "success".

Exit codes:
  0  - all required checks are green.
  1  - a required check concluded failure/cancelled/timed_out, or is missing.
  3  - a required check is real but not finished (pending/queued).
  2  - invalid payload.

Standard library only.  Offline-testable via local JSON fixtures.
"""
from __future__ import annotations

import json
import os
import sys


def _parse_maybe_multi_doc(raw: str):
    """Parse check-runs payload.

    Handles either a single JSON object, or several JSON objects concatenated on
    stdout (as produced by `gh api --paginate` for an object endpoint).  In the
    multi-doc case, each document's `check_runs` array is merged into one object.
    Returns None if no valid doc is found.
    """
    stripped = raw.strip()
    if not stripped:
        return None
    try:
        return json.loads(stripped)
    except Exception:
        pass
    runs_merged = []
    total_count = 0
    dec = json.JSONDecoder()
    idx = 0
    n = len(raw)
    found = False
    while idx < n:
        while idx < n and raw[idx] in " \t\r\n":
            idx += 1
        if idx >= n:
            break
        try:
            obj, end = dec.raw_decode(raw, idx)
        except ValueError:
            # Partially corrupted / malformed trailing JSON: the input must be
            # consumed COMPLETELY; any leftover non-whitespace means the payload
            # is not trustworthy and must never produce a PASS.
            return None
        found = True
        if isinstance(obj, dict):
            runs_merged.extend(obj.get("check_runs") or [])
            total_count += obj.get("total_count") or 0
        elif isinstance(obj, list):
            runs_merged.extend(obj)
        idx = end
    # Require complete consumption: any trailing non-whitespace is a hard fail.
    if raw[idx:].strip():
        return None
    if not found:
        return None
    return {"total_count": total_count, "check_runs": runs_merged}


def main() -> int:
    args = sys.argv[1:]
    if len(args) < 2:
        print("usage: check_runs_checker.py <payload.json> <name>... <sha>", file=sys.stderr)
        return 2
    payload_file = args[0]
    required = args[1:-1]
    sha = args[-1]

    try:
        with open(payload_file, encoding="utf-8") as fh:
            raw = fh.read()
    except Exception as exc:  # noqa: BLE001
        print(f"::error::could not read check-runs payload {payload_file}: {exc}", file=sys.stderr)
        return 2
    payload = _parse_maybe_multi_doc(raw)
    if payload is None:
        print(f"::error::invalid check-runs payload (not JSON / cannot merge pages) reading {payload_file}", file=sys.stderr)
        return 2

    runs = payload.get("check_runs") or payload.get("check-runs") or []
    for name in required:
        mine = [r for r in runs if r.get("name") == name]
        # Latest run (by started_at) for the intended SHA decides; a retried run
        # that is stale/cancelled does not mask an earlier passing run.
        mine.sort(key=lambda r: r.get("started_at") or "")
        if not mine:
            present = [r.get("name") for r in runs]
            print(
                f"::error::required Check Run '{name}' missing for {sha}."
                f" present={present}",
                file=sys.stderr,
            )
            return 1
        c = mine[-1].get("conclusion") or ""
        if c in ("failure", "cancelled", "timed_out"):
            print(
                f"::error::required Check Run '{name}' concluded '{c}' for {sha}.",
                file=sys.stderr,
            )
            return 1
        if c != "success":
            # pending / queued / not yet complete
            return 3
    print(f"All required Check Runs are green for {sha}.")
    return 0


if __name__ == "__main__":
    sys.exit(main())