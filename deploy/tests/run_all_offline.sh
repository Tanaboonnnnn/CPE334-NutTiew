#!/usr/bin/env bash
# =============================================================================
# NutTiew GH-05 offline verification orchestrator
# -----------------------------------------------------------------------------
# Runs every offline test against the deployment artifacts without ever
# contacting a live cloud project, a registry, or a real database.
#
#   ./deploy/tests/run_all_offline.sh
#
# Sets up safe tool discovery (git-bash on Windows) and reports per-suite
# PASS/FAIL.  Exits non-zero if any suite fails.
# =============================================================================

set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Resolve a working bash + python to run the suites (works across CI ubuntu and
# local git-bash on Windows; avoids the broken WSL relay stub on Windows).
resolve_run_bash() {
  for c in "${BASH:-}" \
           "/c/Program Files/Git/bin/bash.exe" \
           "/c/Program Files/Git/usr/bin/bash.exe" \
           "$(command -v bash 2>/dev/null || true)"; do
    if [ -n "$c" ] && [ -x "$c" ] && "$c" --version >/dev/null 2>&1; then
      printf '%s\n' "$c"; return 0
    fi
  done
  printf '%s\n' "/bin/bash"
}
resolve_python() {
  for c in python3 python; do
    if command -v "$c" >/dev/null 2>&1; then printf '%s\n' "$c"; return 0; fi
  done
  printf '%s\n' python3
}
BASH_BIN="${BASH_BIN:-$(resolve_run_bash)}"
PYTHON_BIN="$(resolve_python)"

FAILED=0
run_suite() {
  local name="$1"; shift
  echo ""
  echo "===== SUITE: ${name} ====="
  if "$@"; then
    echo "SUITE '${name}' PASSED"
  else
    echo "SUITE '${name}' FAILED" >&2
    FAILED=$((FAILED+1))
  fi
}

# PATH-invoked fake tools must be executable on Linux CI runners. Windows Git
# Bash can run them even when Git records mode 100644, hiding this regression.
verify_fake_cli_exec_bits() {
  local repo shim mode
  repo="$(cd "$HERE/../.." && pwd)"
  for shim in gcloud docker; do
    mode="$(git -C "$repo" ls-files --stage -- "deploy/tests/harness/shim-bin/$shim" | awk 'NR==1 {print $1}')"
    if [ "$mode" != "100755" ]; then
      echo "FAIL: fake $shim Git mode is ${mode:-<missing>} (expected executable 100755 for Linux CI)" >&2
      return 1
    fi
  done
  echo "PASS: fake gcloud/docker Git modes are executable (100755)"
}

run_suite "fake CLI executable bits" verify_fake_cli_exec_bits
run_suite "gate behavior"            "$BASH_BIN" "$HERE/test_gate_behavior.sh"
run_suite "shell offline (deploy/release)" "$BASH_BIN" "$HERE/run_offline_shell_tests.sh"
run_suite "release negative (real-mode fake gcloud)" "$BASH_BIN" "$HERE/run_release_negative_tests.sh"
run_suite "job-outcome fixtures (python)" "$PYTHON_BIN" "$HERE/test_job_outcome_offline.py"
run_suite "check-runs fixtures (python)" "$PYTHON_BIN" "$HERE/test_check_runs_offline.py"
run_suite "smoke offline (python)"  "$PYTHON_BIN" "$HERE/test_smoke_offline.py"
run_suite "deploy gate validation" "$PYTHON_BIN" "$HERE/validate_deploy_gate.py"
run_suite "creds exclude gitignore" "$BASH_BIN" "$HERE/verify_gitignore_creds.sh"
run_suite "creds exclude dockerignore" "$BASH_BIN" "$HERE/verify_dockerignore_creds.sh"

echo ""
echo "============================================="
if [ "$FAILED" -eq 0 ]; then
  echo "ALL OFFLINE SUITES PASSED"
  exit 0
else
  echo "${FAILED} OFFLINE SUITE(S) FAILED"
  exit 1
fi
