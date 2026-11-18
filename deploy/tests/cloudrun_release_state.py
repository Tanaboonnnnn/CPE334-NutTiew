#!/usr/bin/env python3
"""Strict offline-testable Cloud Run state checker for human-approved releases.

Input is the JSON printed by `gcloud run ... describe --format=json`.
Exit codes: 0 verified, 1 mismatch/terminal failure, 2 malformed input,
3 still pending.  No secrets are printed.
"""

from __future__ import annotations

import json
import re
import sys
from urllib.parse import urlsplit

NAME = re.compile(r"^[a-z][a-z0-9-]{2,100}$")


def fail(message: str, code: int = 1) -> int:
    print(f"cloudrun-state: {message}", file=sys.stderr)
    return code


def check_tag(service: dict, tag: str) -> int:
    status = service.get("status", {})
    targets = status.get("traffic", [])
    if not isinstance(targets, list):
        return fail("invalid traffic list", 2)
    matches = [x for x in targets if isinstance(x, dict) and x.get("tag") == tag]
    if len(matches) != 1:
        return fail("release tag missing or ambiguous")
    target = matches[0]
    revision = target.get("revisionName", "")
    url = target.get("url", "")
    if not isinstance(revision, str) or not NAME.fullmatch(revision):
        return fail("release tag has no valid revision name")
    if status.get("latestCreatedRevisionName") != revision:
        return fail("release tag does not reference the latest created revision")
    if target.get("percent", 0) != 0:
        return fail("release tag unexpectedly receives production traffic")
    if not isinstance(url, str) or urlsplit(url).scheme != "https" or not urlsplit(url).netloc:
        return fail("release tag has no valid HTTPS URL")
    print(revision)
    print(url)
    return 0


def check_revision(revision: dict, name: str, expected_image: str) -> int:
    if revision.get("metadata", {}).get("name") != name:
        return fail("revision identity mismatch")
    containers = revision.get("spec", {}).get("containers", [])
    if not isinstance(containers, list) or len(containers) != 1:
        return fail("expected exactly one runtime container")
    if containers[0].get("image") != expected_image:
        return fail("revision immutable image digest mismatch")
    conditions = revision.get("status", {}).get("conditions", [])
    if not isinstance(conditions, list):
        return fail("invalid revision conditions", 2)
    states = {c.get("type"): c.get("status") for c in conditions if isinstance(c, dict)}
    if states.get("Ready") == "False" or states.get("Active") == "False":
        return fail("revision is failed or retired, refusing to route traffic")
    if states.get("Ready") == "True" and states.get("Active") == "True":
        print("ready")
        return 0
    print("pending")
    return 3


def check_traffic(service: dict, revision: str) -> int:
    targets = service.get("status", {}).get("traffic", [])
    if not isinstance(targets, list) or not targets:
        return fail("missing traffic assignments", 2)
    allocated = 0
    total = 0
    for item in targets:
        if not isinstance(item, dict):
            return fail("malformed traffic assignment", 2)
        percent = item.get("percent", 0)
        if not isinstance(percent, int) or percent < 0 or percent > 100:
            return fail("invalid traffic percentage", 2)
        total += percent
        if item.get("revisionName") == revision:
            allocated += percent
    if allocated == 100 and total == 100:
        print("routed")
        return 0
    print("pending")
    return 3


def main() -> int:
    if len(sys.argv) < 3:
        return fail("expected mode and required arguments", 2)
    mode, *args = sys.argv[1:]
    if (mode == "tag" and len(args) != 1 or
            mode == "revision" and len(args) != 2 or
            mode == "traffic" and len(args) != 1 or
            mode not in ("tag", "revision", "traffic")):
        return fail("invalid checker arguments", 2)
    try:
        data = json.load(sys.stdin)
        if not isinstance(data, dict):
            return fail("input must be a JSON object", 2)
        if mode == "tag":
            return check_tag(data, args[0])
        if mode == "revision":
            return check_revision(data, args[0], args[1])
        return check_traffic(data, args[0])
    except (ValueError, TypeError, KeyError, AttributeError, IndexError):
        return fail("invalid cloud state JSON", 2)


if __name__ == "__main__":
    sys.exit(main())
