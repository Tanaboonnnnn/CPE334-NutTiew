#!/usr/bin/env bash
# =============================================================================
# Behavioral regression tests for the real-execution authorization gate
# (deploy/lib-nuttiew.sh) - GH-05 corrective review.
#
# Provably checks that NUTTIEW_REAL_ARMED is armed ONLY for the exact, documented
# authorized combination (DRY_RUN=0 AND NUTTIEW_ALLOW_REAL=1).  Every other
# combination - unset, empty, malformed, mixed-case, contradictory - must fail
# closed (armed=0).
#
# Safe on any machine: sources lib-nuttiew.sh, never touches GCP or a DB.
# =============================================================================

set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIB="$(cd "${HERE}/.." && pwd)/lib-nuttiew.sh"

PASS=0; FAIL=0
pass(){ PASS=$((PASS+1)); printf '[PASS] gate: %s\n' "$*"; }
fail(){ FAIL=$((FAIL+1)); printf '[FAIL] gate: %s\n' "$*"; }

# Run lib in a fresh subshell with the given DRY_RUN/NUTTIEW_ALLOW_REAL and print
# NUTTIEW_REAL_ARMED.  Unset(sentinel "__UNSET__") means the env is not set.
probe() {
  local d="$1" a="$2"
  (
    unset DRY_RUN NUTTIEW_ALLOW_REAL NUTTIEW_DRY_RUN NUTTIEW_ALLOW_REAL NUTTIEW_REAL_ARMED NUTTIEW_LIB_LOADED
    [ "$d" = "__UNSET__" ] || export DRY_RUN="$d"
    [ "$a" = "__UNSET__" ] || export NUTTIEW_ALLOW_REAL="$a"
    # shellcheck source=lib-nuttiew.sh
    source "$LIB" >/dev/null 2>&1
    printf '%s' "${NUTTIEW_REAL_ARMED}"
  )
}

check_case() {
  local d="$1" a="$2" exp="$3" label="$4"
  got="$(probe "$d" "$a")"
  if [ "$got" = "$exp" ]; then
    pass "$label (DRY_RUN=$d NUTTIEW_ALLOW_REAL=$a -> armed=$got)"
  else
    fail "$label (DRY_RUN=$d NUTTIEW_ALLOW_REAL=$a -> armed=$got, expected $exp)"
  fi
}

# --- CRITICAL: exact authorized combination only ----------------------------
check_case "0" "1" "1" "the ONLY authorized combination (0,1) arms"

# --- DRY_RUN=0 with any non-exact authorization must stay DENIED ------------
check_case "0" "__UNSET__" "0" "authorization unset stays denied (was wrongly ARMED before)"
check_case "0" "0" "0" "authorization=0 denied"
check_case "0" "true" "0" "authorization='true' denied (only exact 1)"
check_case "0" "TRUE" "0" "authorization='TRUE' denied"
check_case "0" "True" "0" "authorization='True' denied"
check_case "0" "yes" "0" "authorization='yes' denied"
check_case "0" "YES" "0" "authorization='YES' denied"
check_case "0" " 1" "0" "authorization=' 1' (space) denied"
check_case "0" "01" "0" "authorization='01' denied (first char only)"
check_case "0" "1 " "0" "authorization='1 ' (trailing space) denied"
check_case "0" "2" "0" "authorization='2' denied"
check_case "0" "maybe" "0" "authorization='maybe' denied"

# --- DRY_RUN safe mode must never arm real execution -------------------------
check_case "1" "1" "0" "DRY_RUN=1 + allow=1 stays dry (run mode wins)"
check_case "true" "1" "0" "DRY_RUN=true stays dry"
check_case "yes" "1" "0" "DRY_RUN=yes stays dry"
check_case "__UNSET__" "1" "0" "DRY_RUN unset (safe default) stays dry"
check_case "" "1" "0" "DRY_RUN empty stays dry"
check_case "bogus" "1" "0" "DRY_RUN malformed stays dry"

echo ""
echo "gate behavior tests: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] || exit 1
exit 0
