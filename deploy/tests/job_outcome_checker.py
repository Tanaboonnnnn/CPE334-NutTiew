#!/usr/bin/env python3
"""Cloud Run Job execution OUTCOME evaluator (GH-05 finding #C).

Given a Cloud Run Job execution JSON payload, determine the TERMINAL outcome from
`status.conditions`.  This is not a simple `conditions[0]` read: Cloud Run may
list multiple conditions and their order is not guaranteed, and a non-terminal
condition such as `Ready`/`Started` can be `True` while the job is still running
or later fails.  We therefore scan ALL conditions for a terminal signal.

Terminal rules (in priority order):
  * Any condition with type `Succeeded` is terminal; outcome = `success` if its
    status is `True`, otherwise `failure`.
  * Any condition with reason `JobExecutionSucceeded` / status `True` => success.
  * Any condition with reason `Failed`/`Cancelled`/`BackoffLimitExceeded`/`RetryLimitExceeded`
    and status `True` => failure/cancelled (terminal).
  * A condition with type `Succeeded` but status not `True` after the loop that is
    also marked terminal is a failure.
  * Otherwise => still `pending`/`incomplete`.

Exit codes (for the shell wrapper / offline tests):
  0 = success, 1 = failure/cancelled, 3 = pending/incomplete, 2 = invalid payload.
"""
from __future__ import annotations

import json
import sys


def evaluate(payload: dict):
    status = payload.get("status") or {}
    conditions = status.get("conditions") or []
    # Find terminal signals among all conditions (order-independent).
    terminal = None
    for cond in conditions:
        ctype = cond.get("type") or ""
        state = cond.get("status") or ""
        reason = cond.get("reason") or ""
        # A Succeeded or Completed condition is the terminal signal.
        if ctype in ("Succeeded", "Completed"):
            if state == "True":
                terminal = "success"
            else:
                # Not success; figure out the terminal reason.
                if reason == "Cancelled":
                    terminal = "cancelled"
                else:
                    terminal = "failure"
    if terminal is not None:
        return terminal
    # No Succeeded/Completed condition: look for an explicit failure/cancel reason.
    for cond in conditions:
        reason = cond.get("reason") or ""
        if reason == "Cancelled":
            return "cancelled"
        if reason in ("Failed", "BackoffLimitExceeded", "RetryLimitExceeded",
                      "JobExecutionFailed", "ExecutionFailed"):
            return "failure"
    return "pending"


def main() -> int:
    if len(sys.argv) < 2:
        print("usage: job_outcome_checker.py <execution.json | ->  ('-' reads stdin)", file=sys.stderr)
        return 2
    try:
        if sys.argv[1] == "-":
            payload = json.load(sys.stdin)
        else:
            with open(sys.argv[1], encoding="utf-8") as fh:
                payload = json.load(fh)
    except Exception as exc:  # noqa: BLE001
        print(f"::error::invalid job execution payload: {exc}", file=sys.stderr)
        return 2
    outcome = evaluate(payload)
    print(outcome)
    if outcome == "success":
        return 0
    if outcome in ("failure", "cancelled"):
        return 1
    return 3  # pending/incomplete


if __name__ == "__main__":
    sys.exit(main())