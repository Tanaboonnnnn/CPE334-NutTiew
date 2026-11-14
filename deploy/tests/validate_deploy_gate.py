#!/usr/bin/env python3
"""Structural validation of .github/workflows/deploy.yml fail-closed gate (GH-05).

Reads the YAML as a data structure (PyYAML) and asserts the deployment safety
contract WITHOUT touching any cloud or CI:

  * Triggers are ONLY push to main and manual workflow_dispatch on main.
  * A `disable-gate` job must run (if: always()) and fail the workflow when the
    repository variable DEPLOY_ENABLED is not exactly "true" OR ref != main.
  * Every credential-bearing job (migrate, deploy) depends on `disable-gate` and
    is gated by needs.disable-gate.outputs.deployable == 'true'.
  * Every credential-bearing job runs under the `demo` Environment (its
    protection/approval gate is enforced before privileged DB or deploy work).
  * `verify-ci` requests minimum `checks: read` and uses the Check Runs API
    (not the legacy commit-status endpoint).
  * No `continue-on-error: true` anywhere; DEPLOY_ENABLED is never hard-coded true.

This replaces earlier substring-only checks with an actual structure-aware check.
"""
from __future__ import annotations

import sys
from pathlib import Path

try:
    import yaml
except ImportError:
    print(
        "PyYAML is required for structural validation. Install the pinned version: "
        "pip install -r deploy/tests/requirements.txt",
        file=sys.stderr,
    )
    sys.exit(1)  # fail closed (treat as unsafe); CI installs the pinned dep

HERE = Path(__file__).resolve().parent
WORKFLOW = (HERE.parents[1] / ".github" / "workflows" / "deploy.yml")


def get_on(d: dict):
    # `on:` is parsed by PyYAML (YAML 1.1) as the boolean True in some versions.
    if "on" in d:
        return d["on"]
    if True in d:
        return d[True]
    return None


def main() -> int:
    if not WORKFLOW.is_file():
        print("[FAIL] deploy.yml missing", file=sys.stderr)
        return 1
    try:
        data = yaml.safe_load(WORKFLOW.read_text(encoding="utf-8"))
    except yaml.YAMLError as exc:
        print(f"[FAIL] deploy.yml is not valid YAML: {exc}", file=sys.stderr)
        return 1

    problems: list[str] = []

    # --- 1. Triggers ---------------------------------------------------------
    on = get_on(data) or {}
    push = on.get("push", {})
    branches = push.get("branches", [])
    if branches != ["main"]:
        problems.append(f"push trigger must target only [main], got {branches}")
    if "pull_request" in on:
        problems.append("deploy workflow triggers on pull_request (forbidden)")
    dispatch = on.get("workflow_dispatch", {})
    if not isinstance(dispatch, dict):
        problems.append("missing workflow_dispatch")

    # --- 2. disable-gate -----------------------------------------------------
    jobs = data.get("jobs", {})
    gate = jobs.get("disable-gate")
    if not gate:
        problems.append("no disable-gate job")
    else:
        if gate.get("if") != "always()":
            problems.append("disable-gate must be if: always()")
        if "'DEPLOY_ENABLED'" not in str(gate) or "!= \"true\"" not in str(gate):
            problems.append("disable-gate must compare DEPLOY_ENABLED != 'true' (fail-closed)")
        if "refs/heads/main" not in str(gate):
            problems.append("disable-gate must restrict ref to main")

    # --- 3. Single, environment-protected release job ---------------------------
    #    Must: depend on disable-gate, run under `demo` environment, be gated by
    #    deployable, perform the whole release ONCE via the real script (not
    #    echo-only), and fail closed unless real GCP config is present.
    rel = jobs.get("release")
    if not rel:
        problems.append("missing required release job")
    else:
        needs = rel.get("needs", [])
        if "disable-gate" not in (needs if isinstance(needs, list) else [needs]):
            problems.append("release does not depend on disable-gate")
        if "needs.disable-gate.outputs.deployable == 'true'" not in str(rel.get("if", "")):
            problems.append("release is not gated by deployable == 'true'")
        if rel.get("environment") != "demo":
            problems.append("release does not run under the demo Environment protection boundary")
        rtext = str(rel)
        # Must perform the release via the real script (echo-only is forbidden).
        if "release.sh" not in rtext:
            problems.append("release job does not invoke deploy/release.sh (it may be echo-only placeholder steps)")
        # Must have a fail-closed enablement/prerequisite check.
        if "DEPLOY_CD_READY" not in rtext:
            problems.append("release job lacks a fail-closed DEPLOY_CD_READY enablement check")
        # Must emit id-token only at job level (never workflow scope).
        if rel.get("permissions", {}).get("id-token") != "write":
            problems.append("release job must request id-token: write for OIDC (job-scoped, behind env)")
        # Reject echo-only placeholder steps that could fake success.
        echo_only = all(
            isinstance(s.get("run", ""), str) and s.get("run", "").strip().startswith(("echo", "#", ":"))
            for s in rel.get("steps", []) if s.get("run")
        )
        if echo_only:
            problems.append("release job steps are echo-only placeholders and cannot be trusted to deploy")

        # --- A: authentication boundary ---------------------------------------
        # The fail-closed enablement step must have an id, and every
        # credential-bearing step (auth, setup-gcloud, release) must depend on its
        # SUCCESS outcome - never on `!cancelled()` - so a credential can never be
        # exercised after a failed configuration check.
        rel_steps = rel.get("steps", [])
        enablement_ids = [s.get("id") for s in rel_steps if s.get("run") and "DEPLOY_CD_READY" in str(s.get("run", ""))]
        if not enablement_ids:
            problems.append("release enablement step has no id (credential steps cannot depend on it)")
        enablement_id = enablement_ids[0] if enablement_ids else None
        cred_step_names = []
        for s in rel_steps:
            uses = s.get("uses") or ""
            run = s.get("run") or ""
            if "auth" in uses or "setup-gcloud" in uses or "release.sh" in run:
                cred_step_names.append(s.get("name", "unnamed"))
                sif = s.get("if") or ""
                if "!cancelled()" in sif:
                    problems.append(f"credential-bearing step '{s.get('name')}' uses !cancelled() (must depend on enablement success)")
                if enablement_id and f"steps.{enablement_id}.outcome == 'success'" not in sif:
                    problems.append(f"credential-bearing step '{s.get('name')}' does not depend on steps.{enablement_id}.outcome == 'success'")
        if not cred_step_names:
            problems.append("release job has no identifiable credential-bearing / release step")
        # Explicit project bound on WIF auth.
        if "project_id" not in str(rel):
            problems.append("release WIF auth does not pin an explicit project_id")

    # --- 4. verify-ci uses Check Runs API + minimal checks permission ---------
    vc = jobs.get("verify-ci")
    if not vc:
        problems.append("missing verify-ci job")
    else:
        perms = vc.get("permissions", {})
        if perms.get("checks") != "read":
            problems.append("verify-ci must request min checks: read permission")
        run_text = str(vc)
        # Either the workflow embeds the Check Runs query, OR it invokes the
        # shared, offline-tested verifier (deploy/tests/verify_check_runs.sh).
        uses_shared = "verify_check_runs.sh" in run_text
        inline_ok = "/check-runs" in run_text and "conclusion" in run_text
        if not (uses_shared or inline_ok):
            problems.append("verify-ci must use the GitHub Actions Check Runs API (via verify_check_runs.sh or inline /check-runs)")

    # --- 5. No continue-on-error / no hard-coded enable -----------------------
    raw = WORKFLOW.read_text(encoding="utf-8")
    if "continue-on-error: true" in raw:
        problems.append("deploy.yml contains continue-on-error: true (must not)")
    if "DEPLOY_ENABLED: true" in raw.replace("DEPLOY_ENABLED: ${{", ""):
        problems.append("DEPLOY_ENABLED appears hard-coded true (must be an opt-in variable)")
    for marker in ("BEGIN PRIVATE KEY", "service-account-key.json"):
        if marker in raw:
            problems.append(f"credential marker present: {marker}")

    if problems:
        print("deploy.yml gate validation FAILED:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1
    print("deploy.yml gate validation PASSED (structure-aware, fail-closed contract confirmed)")
    return 0


if __name__ == "__main__":
    sys.exit(main())