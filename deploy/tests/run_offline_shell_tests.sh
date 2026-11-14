#!/usr/bin/env bash
# =============================================================================
# Offline test harness for deploy/deploy.sh and deploy/release.sh (GH-05).
# -----------------------------------------------------------------------------
# Creates a throwaway git repo, seeds the deploy scripts (committed so the tree
# is clean), and asserts:
#   * DRY_RUN=1 never invokes a real (or fake) cloud command,
#   * missing / invalid configuration fails safely,
#   * invalid release SHAs are rejected,
#   * release requires `main` (feature branch is rejected in real mode),
#   * DRY_RUN works on a DIRTY working tree, but REAL deploy rejects it,
#   * secrets are never echoed.
#
# (Real-mode failure injection such as failed migration / failed deploy / smoke
#  failure is covered by run_release_negative_tests.sh with a behavior-driven
#  fake `gcloud`.)
#
# Never contacts a live cloud project.  Deterministic.
# =============================================================================

set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${HERE}/.." && pwd)"
SHIM_DIR="${HERE}/harness/shim-bin"

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
RUN_BASH="$(resolve_run_bash)"

PASS=0; FAIL=0
pass()  { PASS=$((PASS+1)); printf '[PASS] %s\n' "$*"; }
failt() { FAIL=$((FAIL+1)); printf '[FAIL] %s\n' "$*"; }

# --- Clean disposable repo containing seeded deploy scripts (tree committed) ---
make_sandbox() {
  local sb
  sb="$(mktemp -d)"
  git -C "$sb" init -q -b main
  git -C "$sb" config user.email "test@example.test"
  git -C "$sb" config user.name "Offline Test"
  git -C "$sb" commit -q --allow-empty -m "baseline"
  mkdir -p "$sb/deploy"
  cp "$DEPLOY_DIR/deploy.sh" "$DEPLOY_DIR/release.sh" "$DEPLOY_DIR/lib-nuttiew.sh" "$DEPLOY_DIR/smoke_test.py" "$sb/deploy/"
  git -C "$sb" add deploy
  git -C "$sb" commit -q -m "seed deploy scripts"
  echo "$sb"
}

CONFIG=(
  NUTTIEW_PROJECT_ID=a-test-project-123
  NUTTIEW_REGION=asia-southeast1
  NUTTIEW_ARTIFACT_REPO=nuttiew-repo
  NUTTIEW_RUNTIME_IMAGE=asia-southeast1-docker.pkg.dev/a-test-project-123/nuttiew-repo/nuttiew
  NUTTIEW_MIGRATE_IMAGE=asia-southeast1-docker.pkg.dev/a-test-project-123/nuttiew-repo/nuttiew-migrate
  NUTTIEW_SQL_INSTANCE=test-instance
  NUTTIEW_RUNTIME_SA_EMAIL=test-runtime-sa@a-test-project-123.iam.gserviceaccount.com
  NUTTIEW_MIGRATE_SA_EMAIL=test-migrate-sa@a-test-project-123.iam.gserviceaccount.com
  NUTTIEW_DEPLOY_SA_EMAIL=test-deploy-sa@a-test-project-123.iam.gserviceaccount.com
  NUTTIEW_CLOUD_RUN_SERVICE=nuttiew
  NUTTIEW_ORIGIN=https://nuttiew.example.test
  DRY_RUN=1
  NUTTIEW_ALLOW_REAL=0
)

rat_logs="$(mktemp -d)"
rat_sb="$(make_sandbox)"
GCLOUD_LOG="$rat_logs/gcloud.log"; DOCKER_LOG="$rat_logs/docker.log"
: > "$GCLOUD_LOG"; : > "$DOCKER_LOG"
export FAKE_GCLOUD_LOG="$GCLOUD_LOG"
export FAKE_DOCKER_LOG="$DOCKER_LOG"

run_cfg() { ( cd "$rat_sb" && PATH="${SHIM_DIR}:${PATH}" env "${@:2}" "$RUN_BASH" "$1" ); }
# run_cfg <script> <env...>

# =============================================================================
# 1. DRY_RUN deploy.sh must not call gcloud/docker (clean tree)
# =============================================================================
out="$( ( cd "$rat_sb" && PATH="${SHIM_DIR}:${PATH}" env "${CONFIG[@]}" "$RUN_BASH" deploy/deploy.sh ) 2>&1 )"
rc=$?
[ "$rc" -eq 0 ] && pass "deploy.sh DRY_RUN exit 0 (clean tree)" || failt "deploy.sh DRY_RUN exit $rc"
echo "$out" | grep -q "SIMULATED-DRY-RUN" && pass "deploy.sh prints dry-run marker" || failt "deploy.sh lacks dry-run marker"
[ ! -s "$GCLOUD_LOG" ] && pass "deploy.sh DRY_RUN never invoked gcloud" || failt "deploy.sh invoked gcloud: $(cat "$GCLOUD_LOG")"
[ ! -s "$DOCKER_LOG" ] && pass "deploy.sh DRY_RUN never invoked docker" || failt "deploy.sh invoked docker"

# =============================================================================
# 1b. DRY_RUN works on a DIRTY working tree (finding #7) - warns, exit 0
# =============================================================================
echo "dirty file" > "$rat_sb/uncommitted.txt"
out1b="$( ( cd "$rat_sb" && PATH="${SHIM_DIR}:${PATH}" env "${CONFIG[@]}" "$RUN_BASH" deploy/deploy.sh ) 2>&1 )"
rc1b=$?
[ "$rc1b" -eq 0 ] && pass "deploy.sh DRY_RUN works on dirty tree (exit 0)" || failt "deploy.sh DRY_RUN failed on dirty tree (rc=$rc1b)"
echo "$out1b" | grep -qi "working tree is NOT clean" && pass "deploy.sh DRY_RUN warns on dirty tree" || failt "deploy.sh DRY_RUN did not warn on dirty tree"
rm -f "$rat_sb/uncommitted.txt"

# =============================================================================
# 2. Missing required config fails safely
# =============================================================================
out2="$( { ( cd "$rat_sb" && env "${CONFIG[@]:1}" "$RUN_BASH" deploy/deploy.sh ) ; } 2>&1 )"
if echo "$out2" | grep -q "Required deployment configuration missing"; then
  pass "deploy.sh fails on missing config"
else
  failt "deploy.sh did not flag missing config: $(echo "$out2" | head -3)"
fi

# =============================================================================
# 3. Invalid Project ID / region rejected
# =============================================================================
badproj=( "${CONFIG[@]}" NUTTIEW_PROJECT_ID="BAD_INVALID!!" )
out3="$( { ( cd "$rat_sb" && env "${badproj[@]}" "$RUN_BASH" deploy/deploy.sh ) ; } 2>&1 )"
echo "$out3" | grep -q "looks invalid" && pass "deploy.sh rejects invalid project id" || failt "invalid project id not rejected"

badreg=( "${CONFIG[@]}" NUTTIEW_REGION="!!bad!!" )
out4="$( { ( cd "$rat_sb" && env "${badreg[@]}" "$RUN_BASH" deploy/deploy.sh ) ; } 2>&1 )"
echo "$out4" | grep -q "looks invalid" && pass "deploy.sh rejects invalid region" || failt "invalid region not rejected"

# =============================================================================
# 3b. Origin validation (finding #3): real mode must reject non-HTTPS/placeholder/
#     path-containing origins BEFORE any cloud op; dry-run allows local http preview.
# =============================================================================
# Real mode rejects an http:// origin.
httporigin=( "${CONFIG[@]}" DRY_RUN=0 NUTTIEW_ALLOW_REAL=1 NUTTIEW_ORIGIN="http://invalid.example.test" )
out3b1="$( { ( cd "$rat_sb" && env "${httporigin[@]}" "$RUN_BASH" deploy/deploy.sh ) ; } 2>&1 )"
echo "$out3b1" | grep -qi "must be HTTPS" && pass "real deploy rejects http origin" || failt "real deploy allowed http origin"
# Real mode rejects a placeholder/example domain.
phorigin=( "${CONFIG[@]}" DRY_RUN=0 NUTTIEW_ALLOW_REAL=1 NUTTIEW_ORIGIN="https://nuttiew.example.com" )
out3b2="$( { ( cd "$rat_sb" && env "${phorigin[@]}" "$RUN_BASH" deploy/deploy.sh ) ; } 2>&1 )"
echo "$out3b2" | grep -qi "placeholder" && pass "real deploy rejects placeholder origin" || failt "real deploy allowed placeholder origin"
# Real mode rejects an origin that includes a path.
pathorigin=( "${CONFIG[@]}" DRY_RUN=0 NUTTIEW_ALLOW_REAL=1 NUTTIEW_ORIGIN="https://real.team-tutoring.app/custom" )
out3b3="$( { ( cd "$rat_sb" && env "${pathorigin[@]}" "$RUN_BASH" deploy/deploy.sh ) ; } 2>&1 )"
echo "$out3b3" | grep -qiE "must not contain a path|single valid origin" && pass "real deploy rejects origin with path" || failt "real deploy allowed origin with path"
# Dry-run: a local http origin is a warning, not a failure.
dryhttp=( "${CONFIG[@]}" DRY_RUN=1 NUTTIEW_ALLOW_REAL=0 NUTTIEW_ORIGIN="http://localhost:3001" )
{ ( cd "$rat_sb" && env "${dryhttp[@]}" "$RUN_BASH" deploy/deploy.sh ) ; } >"$rat_logs/dryhttp.out" 2>&1; out3b4_rc=$?
[ "$out3b4_rc" -eq 0 ] && pass "dry-run allows local http origin (exit 0)" || failt "dry-run rejected a local http preview origin (rc=$out3b4_rc)"
grep -qi "dry-run" "$rat_logs/dryhttp.out" && pass "dry-run http origin marked as preview" || failt "dry-run http origin not flagged"
# Real mode ACCEPTS a legitimate Cloud Run `a.run.app` HTTPS origin (PR finding #1).
runapp=( "${CONFIG[@]}" DRY_RUN=0 NUTTIEW_ALLOW_REAL=1 NUTTIEW_ORIGIN="https://nuttiew-abcdef12-uc.a.run.app" )
out3b5="$( { ( cd "$rat_sb" && env "${runapp[@]}" "$RUN_BASH" deploy/deploy.sh ) ; } 2>&1 )"
if echo "$out3b5" | grep -qiE "placeholder|well-formed Cloud Run|must be HTTPS|single valid origin"; then
  failt "real deploy rejected a valid run.app origin"
else
  pass "real deploy accepts a valid HTTPS run.app origin"
fi
# Real mode rejects a malformed `a.run.app` origin (missing hash-region shape).
badrunapp=( "${CONFIG[@]}" DRY_RUN=0 NUTTIEW_ALLOW_REAL=1 NUTTIEW_ORIGIN="https://nuttiew.a.run.app" )
out3b6="$( { ( cd "$rat_sb" && env "${badrunapp[@]}" "$RUN_BASH" deploy/deploy.sh ) ; } 2>&1 )"
echo "$out3b6" | grep -qi "not a well-formed Cloud Run URL" && pass "real deploy rejects malformed run.app origin" || failt "real deploy accepted a malformed run.app origin"

# =============================================================================
# 4. release.sh: invalid / truncated SHA rejected
# =============================================================================
badsha=( "${CONFIG[@]}" NUTTIEW_RELEASE_SHA="abc123" )
out5="$( { ( cd "$rat_sb" && env "${badsha[@]}" "$RUN_BASH" deploy/release.sh ) ; } 2>&1 )"
echo "$out5" | grep -qi "invalid release SHA" && pass "release.sh rejects truncated SHA" || failt "release.sh accepted truncated SHA"

# =============================================================================
# 5. release.sh branch-gate: feature branch + no explicit SHA is rejected
# =============================================================================
git -C "$rat_sb" checkout -q -b feature/tmp
out6="$( { ( cd "$rat_sb" && PATH="${SHIM_DIR}:${PATH}" env "${CONFIG[@]}" "$RUN_BASH" deploy/release.sh ) ; } 2>&1 )"
echo "$out6" | grep -qi "expected main" && pass "release.sh rejects non-main in dry-run (no explicit SHA)" || failt "release.sh did not guard feature branch (dry-run)"
git -C "$rat_sb" checkout -q main

# =============================================================================
# 6. Secret redaction: no secret value leaked to output
# =============================================================================
seccfg=( "${CONFIG[@]}" AUTH_CSRF_HMAC_KEY="myTestSecretValueDoNotPrint" NUTTIEW_ALLOW_REAL=0 )
out7="$( { ( cd "$rat_sb" && env "${seccfg[@]}" "$RUN_BASH" deploy/deploy.sh ) ; } 2>&1 )"
echo "$out7" | grep -q "myTestSecretValueDoNotPrint" && failt "secret value leaked to output" || pass "deploy.sh did not print secret value"

# =============================================================================
# 7. Real arming doubly gated: DRY_RUN=0 but ALLOW_REAL unset/false => no gcloud
# =============================================================================
: > "$GCLOUD_LOG"; : > "$DOCKER_LOG"
out8a="$( { ( cd "$rat_sb" && PATH="${SHIM_DIR}:${PATH}" env "${CONFIG[@]}" DRY_RUN=0 NUTTIEW_ALLOW_REAL=0 "$RUN_BASH" deploy/deploy.sh ) ; } 2>&1 )"
[ ! -s "$GCLOUD_LOG" ] && [ ! -s "$DOCKER_LOG" ] && pass "DRY_RUN=0 + ALLOW_REAL=0 => no gcloud/docker" || failt "cloud ran without full arming: $(cat "$GCLOUD_LOG" "$DOCKER_LOG")"

: > "$GCLOUD_LOG"; : > "$DOCKER_LOG"
# DRY_RUN=0 with an EMPTY NUTTIEW_ALLOW_REAL must fail closed (no docker run).
out8c="$( { ( cd "$rat_sb" && PATH="${SHIM_DIR}:${PATH}" env "${CONFIG[@]}" DRY_RUN=0 NUTTIEW_ALLOW_REAL= "$RUN_BASH" deploy/deploy.sh ) ; } 2>&1 )"
[ ! -s "$DOCKER_LOG" ] && pass "DRY_RUN=0 with ALLOW_REAL empty => no docker (fail-closed)" || failt "cloud ran with empty authorization"

# =============================================================================
# 8. release.sh dry-run completes (migration-fail real behavior in negative suite)
# =============================================================================
reldry=( "${CONFIG[@]}" NUTTIEW_RELEASE_SHA="0123456789abcdef0123456789abcdef01234567" )
out9="$( { ( cd "$rat_sb" && PATH="${SHIM_DIR}:${PATH}" env "${reldry[@]}" "$RUN_BASH" deploy/release.sh ) ; } 2>&1 )"
rc9=$?
[ "$rc9" -eq 0 ] && pass "release.sh dry-run with explicit full SHA exits 0" || { failt "release.sh dry-run exit $rc9"; echo "$out9" | tail -10; }

# =============================================================================
# Cleanup
# =============================================================================
rm -rf "$rat_sb" "$rat_logs"

printf '\n=============================================\n'
printf 'Offline shell tests: %s passed, %s failed\n' "$PASS" "$FAIL"
printf '=============================================\n'
[ "$FAIL" -eq 0 ] || exit 1
exit 0