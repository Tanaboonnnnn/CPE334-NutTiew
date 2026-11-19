#!/usr/bin/env python3
"""Offline contract tests for the Cloud Run staged-revision release verifier."""

import json
import subprocess
import sys
from pathlib import Path

CHECKER = Path(__file__).with_name("cloudrun_release_state.py")
IMAGE = "asia-southeast1-docker.pkg.dev/example/repo/nuttiew@sha256:" + "a" * 64
OLD = "nuttiew-00003-old"
NEW = "nuttiew-00004-new"
TAG = "cd-a1b2c3d4e5f6"
URL = "https://cd-a1b2c3d4e5f6---nuttiew-example.a.run.app"


def run(mode, data, *args):
    return subprocess.run(
        [sys.executable, str(CHECKER), mode, *args],
        input=json.dumps(data), text=True, capture_output=True, check=False,
    )


def service(new_latest=True, promoted=False):
    return {"status": {
        "latestCreatedRevisionName": NEW if new_latest else OLD,
        "traffic": [
            {"revisionName": OLD, "percent": 0 if promoted else 100, "tag": "preview-old"},
            {"revisionName": NEW, "percent": 100 if promoted else 0, "tag": TAG, "url": URL},
        ],
    }}


def revision(ready="True", active="True", image=IMAGE, reason=""):
    return {"metadata": {"name": NEW}, "spec": {"containers": [{"image": image}]},
            "status": {"conditions": [
                {"type": "Ready", "status": ready, "reason": reason},
                {"type": "Active", "status": active, "reason": reason},
            ]}}


def main():
    cases = [
        ("tag binds new revision with 0 percent", "tag", service(), (TAG,), 0, NEW + "\n" + URL),
        ("tag refuses stale latestCreated", "tag", service(new_latest=False), (TAG,), 1, ""),
        ("tag refuses missing tag", "tag", service(), ("other-tag",), 1, ""),
        ("tag refuses tag assigned production traffic", "tag", service(promoted=True), (TAG,), 1, ""),
        ("image and active ready revision", "revision", revision(), (NEW, IMAGE), 0, "ready"),
        ("reject wrong immutable digest", "revision", revision(image=IMAGE.replace("a"*64, "b"*64)), (NEW, IMAGE), 1, ""),
        ("reject another revision identity", "revision", revision(), (OLD, IMAGE), 1, ""),
        ("not ready is pending", "revision", revision(ready="Unknown"), (NEW, IMAGE), 3, "pending"),
        ("retired is not deployable", "revision", revision(active="False", reason="Retired"), (NEW, IMAGE), 1, ""),
        ("promoted exact revision gets all traffic", "traffic", service(promoted=True), (NEW,), 0, "routed"),
        ("old revision still receives traffic", "traffic", service(), (NEW,), 3, "pending"),
        ("reject malformed JSON", "traffic", [], (NEW,), 2, ""),
    ]
    failed = 0
    for name, mode, data, args, want_code, want_text in cases:
        r = run(mode, data, *args)
        ok = r.returncode == want_code and (not want_text or r.stdout.strip() == want_text)
        print(f"[{'PASS' if ok else 'FAIL'}] cloudrun-state: {name}" +
              ("" if ok else f" (exit={r.returncode}, out={r.stdout!r}, err={r.stderr[-160:]!r})"))
        failed += not ok
    print(f"Cloud Run state tests: {len(cases)-failed}/{len(cases)} passed")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
