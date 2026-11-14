#!/usr/bin/env bash
# =============================================================================
# Verify required GitHub Actions Check Runs for a release SHA (GH-05).
# -----------------------------------------------------------------------------
# Reads the GitHub Actions **Check Runs API** payload (NOT the legacy commit
# status API) and requires that all three required checks:
#     Unit / types / build
#     PostgreSQL 18 / Auth / Slot / Race A
#     Microsoft Edge / Auth / Tutor UI E2E
# have a successful conclusion for the EXACT release SHA.
#
# Modes:
#   --from-gh <owner/repo> --sha <sha>   -> fetch via `gh api .../check-runs`
#                                           (bounded wait for pending checks).
#   --from-file <path>                   -> validate against a local JSON fixture
#                                           (offline tests; bounded loop optional).
#
# Rules:
#   * For each required name, take the LATEST run (by started_at) for the SHA.
#   * conclusion == success -> OK. failure/cancelled/timed_out -> hard FAIL.
#   * pending/queued/missing -> wait (bounded) then fail if never green.
#   * A duplicate/retry of the same check must not create a false success; the
#     LATEST run's conclusion is the one that counts for the intended SHA.
# =============================================================================

set -euo pipefail

MODE=""; OWNER_REPO=""; RELEASE_SHA=""; FIXTURE_FILE=""
# Finding #8: default wait must comfortably exceed the slowest required CI job
# (the Edge E2E took ~209s cold).  Default is ~45 attempts x 6s = 270s, and is
# configurable via env / --max-attempts --poll.  A timeout is never success.
MAX_ATTEMPTS="${VERIFY_MAX_ATTEMPTS:-45}"
POLL="${VERIFY_POLL_SECONDS:-6}"

usage() { echo "usage: $0 --sha <full-sha> (--from-gh owner/repo | --from-file path) [--max-attempts N] [--poll S]" >&2; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --sha) RELEASE_SHA="$2"; shift 2 ;;
    --from-gh) MODE=gh; OWNER_REPO="$2"; shift 2 ;;
    --from-file) MODE=file; FIXTURE_FILE="$2"; shift 2 ;;
    --max-attempts) MAX_ATTEMPTS="$2"; shift 2 ;;
    --poll) POLL="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[ -n "$RELEASE_SHA" ] || usage
[ -n "$MODE" ] || usage
[[ "$RELEASE_SHA" =~ ^[0-9a-f]{40}$ || "$RELEASE_SHA" =~ ^[0-9a-f]{64}$ ]] \
  || { echo "::error::invalid release SHA $RELEASE_SHA" >&2; exit 1; }

REQUIRED_NAMES=(
  "Unit / types / build"
  "PostgreSQL 18 / Auth / Slot / Race A"
  "Microsoft Edge / Auth / Tutor UI E2E"
)

# fetch_payload returns the check-runs JSON for the SHA, or empty on a transient
# API failure so the caller can RETRY (bounded), never turning a timeout or API
# error into success.
fetch_payload() {
  if [ "$MODE" = "gh" ]; then
    # --paginate handles >100 check runs; a transient failure yields empty so the
    # bounded loop retries rather than failing the release on a blip.
    gh api --paginate "repos/${OWNER_REPO}/commits/${RELEASE_SHA}/check-runs" 2>/dev/null || echo ""
  else
    [ -f "$FIXTURE_FILE" ] || { echo ""; return 1; }
    cat "$FIXTURE_FILE"
  fi
}

for ((i=1; i<=MAX_ATTEMPTS; i++)); do
  payload_json="$(fetch_payload || true)"
  [ -n "$payload_json" ] || { echo "waiting...: no check-runs response (attempt $i/${MAX_ATTEMPTS})" >&2; sleep "$POLL"; continue; }
  # Write the payload to a repo-relative temp file that the checker's python can
  # open (mktemp's /tmp path is not openable by a native Python on MSYS).
  payload_file="deploy/tests/.tmp_checks_payload_${RELEASE_SHA}.json"
  printf '%s' "$payload_json" > "$payload_file"
  # checker is executed by git-bash; the payload path is repo-relative with
  # forward slashes so both bash and Python resolve it from the repo root.
  all_green=0
  if python3 deploy/tests/check_runs_checker.py "$payload_file" "${REQUIRED_NAMES[@]}" "$RELEASE_SHA"; then
    all_green=1
  fi
  rm -f "$payload_file"
  if [ "$all_green" = "1" ]; then
    break
  fi
  [ "$i" -lt "$MAX_ATTEMPTS" ] && { echo "waiting for required Check Runs (attempt $i/${MAX_ATTEMPTS})..." >&2; sleep "$POLL"; }
done

if [ "$all_green" = "1" ]; then
  exit 0
fi
echo "::error::required Check Runs did not all succeed within ${MAX_ATTEMPTS} attempts for ${RELEASE_SHA}." >&2
exit 1