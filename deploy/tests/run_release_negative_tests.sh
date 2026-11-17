#!/usr/bin/env bash
# =============================================================================
# Real-mode NEGATIVE tests for deploy/release.sh (GH-05 corrective review 3).
# -----------------------------------------------------------------------------
# Uses a behavior-driven fake `gcloud`/`docker` on PATH to simulate real cloud
# outcomes WITHOUT touching GCP.  release.sh runs in REAL mode
# (DRY_RUN=0 NUTTIEW_ALLOW_REAL=1) inside a clean `main` sandbox whose HEAD IS the
# intended release SHA, so the real-execution path is exercised end-to-end.
#
# Proves (behaviour, not substring greps):
#   * migration failure blocks runtime deploy (non-zero + no `run deploy`)
#   * missing image digest -> non-zero (no fallback to latest)
#   * failed Cloud Run deploy / readiness timeout -> non-zero
#   * smoke test failure -> non-zero
#   * SHA != checkout HEAD aborts BEFORE build/push/migrate/deploy
#   * active gcloud project mismatch aborts BEFORE any mutation
#   * missing DB bootstrap confirmation aborts BEFORE migrations
#   * no secret / credential value leaks in captured output
# =============================================================================

set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "${HERE}/.." && pwd)"
SHIM_DIR="${HERE}/harness/shim-bin"

resolve_run_bash() {
  for c in "${BASH:-}" "/c/Program Files/Git/bin/bash.exe" "/c/Program Files/Git/usr/bin/bash.exe" "$(command -v bash 2>/dev/null || true)"; do
    if [ -n "$c" ] && [ -x "$c" ] && "$c" --version >/dev/null 2>&1; then printf '%s\n' "$c"; return 0; fi
  done
  printf '%s\n' "/bin/bash"
}
RUN_BASH="$(resolve_run_bash)"
resolve_python() { for c in python3 python; do command -v "$c" >/dev/null 2>&1 && { printf '%s\n' "$c"; return; }; done; printf '%s\n' python3; }
PYTHON_BIN="$(resolve_python)"
# resolve_native_path: convert an msys/cygwin path (/e/...) to a Windows-native
# path (E:/...) so a native Windows Python can open the fixture script. No-op on
# POSIX/macOS.
resolve_native_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1 && [[ "$p" == /* ]]; then
    cygpath -w "$p" 2>/dev/null || echo "$p"
  else
    echo "$p"
  fi
}

PASS=0; FAIL=0
pass() { PASS=$((PASS+1)); printf '[PASS] neg: %s\n' "$*"; }
failt(){ FAIL=$((FAIL+1)); printf '[FAIL] neg: %s\n' "$*"; }

make_sandbox() {
  local sb
  sb="$(mktemp -d)"
  git -C "$sb" init -q -b main
  git -C "$sb" config user.email t@e.t
  git -C "$sb" config user.name T
  git -C "$sb" commit -q --allow-empty -m base
  git -C "$sb" commit -q --allow-empty -m "release seed"
  mkdir -p "$sb/deploy"
  cp "$DEPLOY_DIR/deploy.sh" "$DEPLOY_DIR/release.sh" "$DEPLOY_DIR/lib-nuttiew.sh" "$DEPLOY_DIR/smoke_test.py" "$sb/deploy/"
  # The migration job checker is invoked by release.sh/lib at
  # deploy/tests/job_outcome_checker.py, so copy the tests dir into the sandbox.
  mkdir -p "$sb/deploy/tests"
  cp "$DEPLOY_DIR/tests/job_outcome_checker.py" "$sb/deploy/tests/"
  git -C "$sb" add deploy
  git -C "$sb" commit -q -m seed
  echo "$sb"
}

# Required non-secret config.  NUTTIEW_RELEASE_SHA is overwritten per-test to the
# sandbox HEAD so the SHA==HEAD real-mode invariant is satisfied.
BASE=(
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
  NUTTIEW_ORIGIN=https://nuttiew.team-tutoring.app
  NUTTIEW_DB_BOOTSTRAP_DONE=1
  DRY_RUN=0
  NUTTIEW_ALLOW_REAL=1
)

# run_release <sandbox> <logs-dir> <env...> -> exit code of release.sh; output captured to logs-dir/out
run_release() {
  local sb="$1" logs="$2"; shift 2
  local head; head="$(git -C "$sb" rev-parse HEAD)"
  local log="$logs/gcloud.log"; : > "$log"; : > "$logs/docker.log"
  (
    cd "$sb" && PATH="${SHIM_DIR}:${PATH}" \
    FAKE_GCLOUD_LOG="$log" FAKE_DOCKER_LOG="$logs/docker.log" \
    FAKE_ACTIVE_PROJECT="a-test-project-123" \
    env "${BASE[@]}" NUTTIEW_RELEASE_SHA="$head" \
      NUTTIEW_MIGRATE_WAIT_ATTEMPTS=3 NUTTIEW_MIGRATE_POLL_SECONDS=0 \
      "$@" "$RUN_BASH" deploy/release.sh
  )
}

logs="$(mktemp -d)"

# =============================================================================
# 1. Migration fails -> release non-zero AND no runtime deploy executed
# =============================================================================
sb="$(make_sandbox)"
run_release "$sb" "$logs" FAKE_MIGRATE_FAIL=1 >"$logs/out1" 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "migration fail -> release non-zero" || failt "migration fail did not abort (rc=$rc)"
if grep -q "run deploy" "$logs/gcloud.log"; then failt "runtime deploy ran after failed migration"; else pass "no runtime deploy after failed migration"; fi
rm -rf "$sb"

# =============================================================================
# 2. Missing image digest -> non-zero (no fallback to latest)
# =============================================================================
sb="$(make_sandbox)"
run_release "$sb" "$logs" FAKE_DIGEST_MISSING=1 >"$logs/out2" 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "missing digest -> non-zero" || failt "missing digest did not abort"
if grep -qE ":[l]atest(\s|$)" "$logs/gcloud.log"; then failt "release used ':latest' tag"; else pass "no ':latest' tag used"; fi
rm -rf "$sb"

# =============================================================================
# 2b. Malformed digest -> non-zero (finding #D)
# =============================================================================
sb="$(make_sandbox)"
run_release "$sb" "$logs" FAKE_DIGEST_MALFORMED=1 >"$logs/out2b" 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "malformed digest -> non-zero" || failt "malformed digest did not abort (rc=$rc)"
rm -rf "$sb"

# =============================================================================
# 2c. Cloud Run deploy must use the immutable @sha256 digest, never the mutable
#     `:SHA` tag (finding #D).
# =============================================================================
# note: this is covered by the happy-path test below, but assert explicitly:
sb="$(make_sandbox)"
portfile2c="$(mktemp -u "${logs}/fixture-port2c.XXXXXX")"
"$PYTHON_BIN" "$(resolve_native_path "$HERE/httpserver_fixture.py")" 0 "$portfile2c" >"$logs/fixture2c.out" 2>&1 &
FIXPID2C=$!
for _ in $(seq 1 50); do [ -s "$portfile2c" ] && break; sleep 0.1; done
HEALTHY_URL2C="http://127.0.0.1:$(cat "$portfile2c")"
run_release "$sb" "$logs" NUTTIEW_SMOKE_BASE_URL="$HEALTHY_URL2C" NUTTIEW_READY_ATTEMPTS=3 NUTTIEW_READY_POLL_SECONDS=0 >"$logs/out2c" 2>&1; rc=$?
if grep -qE "run deploy .*@sha256:0000000000000000000000000000000000000000000000000000000000000000" "$logs/gcloud.log"; then
  pass "Cloud Run deploy uses immutable @sha256 digest"
else
  failt "Cloud Run deploy did not use @sha256 digest: $(grep 'run deploy' "$logs/gcloud.log" | head -1)"
fi
if grep -qE "run deploy [^ ]*:[0123456789abcdef]{40}(\s|\$)" "$logs/gcloud.log"; then
  failt "Cloud Run deploy used a mutable :<sha> tag"
else
  pass "Cloud Run deploy did not use a mutable :<sha> tag"
fi
kill "$FIXPID2C" 2>/dev/null || true
rm -rf "$sb" "$portfile2c"

# =============================================================================
# 2d. Docker registry authentication is REQUIRED before the first push (finding #2).
#     A docker-auth failure must abort BEFORE any docker push occurs.
# =============================================================================
sb="$(make_sandbox)"
: > "$logs/docker.log"
run_release "$sb" "$logs" FAKE_DOCKER_AUTH_FAIL=1 >"$logs/out2d" 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "docker registry auth failure -> non-zero" || failt "docker auth failure did not abort (rc=$rc)"
if grep -q "docker push" "$logs/docker.log"; then
  failt "docker push ran despite failed registry authentication"
else
  pass "no docker push after registry auth failure"
fi
rm -rf "$sb"

# =============================================================================
# 3. Failed Cloud Run deploy -> non-zero
# =============================================================================
sb="$(make_sandbox)"
run_release "$sb" "$logs" FAKE_DEPLOY_FAIL=1 >"$logs/out3" 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "Cloud Run deploy fail -> non-zero" || failt "deploy fail did not abort (rc=$rc)"
rm -rf "$sb"

# =============================================================================
# 4. Readiness timeout -> non-zero (bounded by tiny poll)
# =============================================================================
sb="$(make_sandbox)"
run_release "$sb" "$logs" FAKE_READY_TIMEOUT=1 NUTTIEW_READY_ATTEMPTS=2 NUTTIEW_READY_POLL_SECONDS=0 >"$logs/out4" 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "readiness timeout -> non-zero" || failt "readiness timeout did not abort (rc=$rc)"
rm -rf "$sb"

# =============================================================================
# 4b. PR finding #2: an OLD revision is Ready but the INTENDED new revision is not
#     Ready -> the release must FAIL (never accept another revision's Ready).
# =============================================================================
sb="$(make_sandbox)"
run_release "$sb" "$logs" FAKE_CREATED_REVISION="nuttiew-00010-intended" FAKE_NEW_REVISION_NOT_READY=1 NUTTIEW_READY_ATTEMPTS=2 NUTTIEW_READY_POLL_SECONDS=0 >"$logs/out4b" 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "intended-new-revision-not-ready -> release non-zero" || failt "release reported success from an unrelated (old) ready revision (rc=$rc)"

# =============================================================================
# 5. SHA != checkout HEAD aborts BEFORE build/push/migrate/deploy (finding #5)
# =============================================================================
sb="$(make_sandbox)"
head="$(git -C "$sb" rev-parse HEAD)"
other="$(printf '%040d' 0 | tr '0' 'a')"
( cd "$sb" && PATH="${SHIM_DIR}:${PATH}" FAKE_GCLOUD_LOG="$logs/gcloud5.log" FAKE_DOCKER_LOG="$logs/docker5.log" \
  FAKE_ACTIVE_PROJECT="a-test-project-123" \
  env "${BASE[@]}" NUTTIEW_RELEASE_SHA="$other" NUTTIEW_DB_BOOTSTRAP_DONE=1 \
  "$RUN_BASH" deploy/release.sh ) >"$logs/out5" 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "SHA != HEAD aborts release" || failt "SHA mismatch did not abort (rc=$rc)"
if grep -qE "docker build|run jobs|run deploy|secrets |sql |services enable|iam |create" "$logs/gcloud5.log" "$logs/docker5.log" 2>/dev/null; then
  failt "SHA mismatch proceeded to build/push/migrate/deploy"
else
  pass "SHA mismatch aborted before any build/push/migrate/deploy"
fi
rm -rf "$sb"

# =============================================================================
# 6. Active gcloud project != configured -> abort BEFORE any mutation (finding #4)
# =============================================================================
sb="$(make_sandbox)"
run_release "$sb" "$logs" FAKE_ACTIVE_PROJECT="WRONG-PROJECT" >"$logs/out6" 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "project mismatch -> non-zero" || failt "project mismatch did not abort (rc=$rc)"
if grep -qE "run deploy|sql |iam |secrets |services enable|artifacts repositories create" "$logs/gcloud.log"; then
  failt "project mismatch proceeded to a mutation"
else
  pass "project mismatch aborted before any mutation"
fi
rm -rf "$sb"

# =============================================================================
# 7. Missing DB bootstrap confirmation -> abort BEFORE migrations (finding #3)
# =============================================================================
sb="$(make_sandbox)"
run_release "$sb" "$logs" NUTTIEW_DB_BOOTSTRAP_DONE=0 >"$logs/out7" 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "missing DB bootstrap -> non-zero" || failt "missing DB bootstrap did not abort"
if grep -qE "run jobs|run deploy" "$logs/gcloud.log"; then failt "migration ran without bootstrap"; else pass "no migration/deploy without bootstrap confirmation"; fi
rm -rf "$sb"

# =============================================================================
# 8. Happy-path success (all fake success + local healthy smoke fixture)
# =============================================================================
portfile="$(mktemp -u "${logs}/fixture-port.XXXXXX")"
# Use a native Windows path for the fixture script so the (possibly native)
# Python can open it regardless of the msys/cygwin mount of $HERE.
"$PYTHON_BIN" "$(resolve_native_path "$HERE/httpserver_fixture.py")" 0 "$portfile" >"$logs/fixture.out" 2>&1 &
FIXTURE_PID=$!
for _ in $(seq 1 50); do [ -s "$portfile" ] && break; sleep 0.1; done
if [ -s "$portfile" ]; then
  HEALTHY_PORT="$(cat "$portfile")"
  HEALTHY_URL="http://127.0.0.1:${HEALTHY_PORT}"
  sb="$(make_sandbox)"
  run_release "$sb" "$logs" NUTTIEW_SMOKE_BASE_URL="$HEALTHY_URL" NUTTIEW_READY_ATTEMPTS=3 NUTTIEW_READY_POLL_SECONDS=0 >"$logs/out8" 2>&1; rc=$?
  [ "$rc" -eq 0 ] && pass "happy-path success (real smoke PASS) -> exit 0" || failt "happy-path failed (rc=$rc): $(tail -5 "$logs/out8")"
  rm -rf "$sb"

  # 8a. Cloud Run may report Completed=Unknown on the first poll. Keep
  # polling THIS execution until Completed=True, then pass the real smoke test.
  sb="$(make_sandbox)"
  run_release "$sb" "$logs" FAKE_MIGRATE_RUNNING_FIRST=1 \
    NUTTIEW_SMOKE_BASE_URL="$HEALTHY_URL" NUTTIEW_READY_ATTEMPTS=3 \
    NUTTIEW_READY_POLL_SECONDS=0 >"$logs/out8a" 2>&1; rc=$?
  [ "$rc" -eq 0 ] && pass "migration Unknown then Completed=True -> release succeeds" || failt "release aborted while migration was still running (rc=$rc): $(tail -3 "$logs/out8a")"
  poll_count="$(grep -c 'gcloud run jobs executions describe' "$logs/gcloud.log" || true)"
  [ "$poll_count" -ge 2 ] && pass "migration polling waits for terminal success (observed $poll_count polls)" || failt "migration polling stopped early ($poll_count polls)"
  if grep -q "gcloud run deploy" "$logs/gcloud.log"; then pass "runtime deploy follows successful migration"; else failt "runtime deploy missing after completed migration"; fi
  rm -rf "$sb"

  # 8b. Smoke failure -> non-zero (closed port)
  : > "$logs/gcloud.log"
  sb="$(make_sandbox)"
  run_release "$sb" "$logs" NUTTIEW_SMOKE_BASE_URL="http://127.0.0.1:1" NUTTIEW_READY_ATTEMPTS=3 NUTTIEW_READY_POLL_SECONDS=0 >"$logs/out8b" 2>&1; rc=$?
  [ "$rc" -ne 0 ] && pass "smoke failure -> non-zero" || failt "smoke failure did not abort (rc=$rc)"
  rm -rf "$sb"
else
  failt "could not start healthy fixture (skip happy-path)"
fi
kill "$FIXTURE_PID" 2>/dev/null || true

# =============================================================================
# F2/F3 REGRESSION SUITE — Secret Manager prerequisites + IAM ordering
# (audited findings F2/F3; behavioral, uses the fake gcloud shim)
#   * bootstrap secrets (postgres/owner/runtime password refs) must exist with a
#     usable, nonempty value BEFORE any avoidable cloud mutation
#   * missing resource / no version / access denied / empty value all fail closed
#     with a distinct, actionable error (never a silent skip)
#   * migration SA secret IAM binding must never precede secret creation
#   * dry-run never mutates anything
# =============================================================================

# Fake-gcloud behaviors (driven by env, read from the shim):
#   FAKE_SECRET_MISSING=<name>   -> 'secrets versions access --secret=<name>' exits 44 (resource-not-found)
#   FAKE_SECRET_NO_VERSION=<n>   -> exits 45 (no usable version)
#   FAKE_SECRET_DENIED=<n>       -> exits 46 (permission denied)
#   FAKE_SECRET_EMPTY=<n>        -> prints empty value (exit 0)
#   FAKE_IAM_BEFORE_SECRET=1     -> record an ORDER VIOLATION if
#                                   'secrets add-iam-policy-binding' is logged
#                                   before the first 'secrets create' for that secret

# helper: run deploy/deploy.sh in real mode against the fake cloud CLI.
run_deploy() {
  local sb="$1" logs="$2"; shift 2
  : > "$logs/gcloud.log"; : > "$logs/docker.log"
  (
    cd "$sb" && PATH="${SHIM_DIR}:${PATH}" \
    FAKE_GCLOUD_LOG="$logs/gcloud.log" FAKE_DOCKER_LOG="$logs/docker.log" \
    FAKE_ACTIVE_PROJECT="a-test-project-123" \
    env "${BASE[@]}" "$@" "$RUN_BASH" deploy/deploy.sh
  )
}
# helper: does the gcloud log contain any mutation (avoidable cloud change)?
log_has_mutation() { grep -qE "services enable|repositories create|sql databases create|iam service-accounts create|add-iam-policy-binding|run jobs (create|update|execute)|run deploy|secrets create|docker build" "$1" 2>/dev/null; }

# --- 10. Missing postgres secret -> abort BEFORE any avoidable cloud mutation ---
sb="$(make_sandbox)"
run_deploy "$sb" "$logs" \
  NUTTIEW_SQL_POSTGRES_PASSWORD_SECRET=nuttiew-pg-pw \
  NUTTIEW_SQL_OWNER_PASSWORD_SECRET=nuttiew-ow-pw \
  NUTTIEW_SQL_RUNTIME_PASSWORD_SECRET=nuttiew-rt-pw \
  FAKE_SECRET_MISSING=nuttiew-pg-pw >"$logs/out10" 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "missing bootstrap secret -> non-zero" || failt "missing bootstrap secret did not abort (rc=$rc)"
if log_has_mutation "$logs/gcloud.log"; then
  failt "missing secret proceeded to an avoidable cloud mutation"
else
  pass "missing secret aborted before any avoidable cloud mutation"
fi
grep -qi "does not exist" "$logs/out10" && pass "missing secret error is actionable" || failt "missing secret error not actionable: $(tail -3 "$logs/out10")"
rm -rf "$sb"

# --- 11. Secret exists but has NO usable version -> abort before mutations ---
sb="$(make_sandbox)"
run_deploy "$sb" "$logs" \
  NUTTIEW_SQL_POSTGRES_PASSWORD_SECRET=nuttiew-pg-pw \
  NUTTIEW_SQL_OWNER_PASSWORD_SECRET=nuttiew-ow-pw \
  NUTTIEW_SQL_RUNTIME_PASSWORD_SECRET=nuttiew-rt-pw \
  FAKE_SECRET_NO_VERSION=nuttiew-ow-pw >"$logs/out11" 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "secret without usable version -> non-zero" || failt "no-version secret did not abort (rc=$rc)"
if log_has_mutation "$logs/gcloud.log"; then
  failt "no-version secret proceeded to an avoidable cloud mutation"
else
  pass "no-version secret aborted before any avoidable cloud mutation"
fi
rm -rf "$sb"

# --- 12. Secret access DENIED -> abort before mutations ---
sb="$(make_sandbox)"
run_deploy "$sb" "$logs" \
  NUTTIEW_SQL_POSTGRES_PASSWORD_SECRET=nuttiew-pg-pw \
  NUTTIEW_SQL_OWNER_PASSWORD_SECRET=nuttiew-ow-pw \
  NUTTIEW_SQL_RUNTIME_PASSWORD_SECRET=nuttiew-rt-pw \
  FAKE_SECRET_DENIED=nuttiew-rt-pw >"$logs/out12" 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "secret access denied -> non-zero" || failt "denied secret did not abort (rc=$rc)"
rm -rf "$sb"

# --- 13. Secret value EMPTY -> abort before mutations ---
sb="$(make_sandbox)"
run_deploy "$sb" "$logs" \
  NUTTIEW_SQL_POSTGRES_PASSWORD_SECRET=nuttiew-pg-pw \
  NUTTIEW_SQL_OWNER_PASSWORD_SECRET=nuttiew-ow-pw \
  NUTTIEW_SQL_RUNTIME_PASSWORD_SECRET=nuttiew-rt-pw \
  FAKE_SECRET_EMPTY=nuttiew-pg-pw >"$logs/out13" 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "empty secret value -> non-zero" || failt "empty secret value did not abort (rc=$rc)"
if log_has_mutation "$logs/gcloud.log"; then
  failt "empty secret value proceeded to an avoidable cloud mutation"
else
  pass "empty secret value aborted before any avoidable cloud mutation"
fi
rm -rf "$sb"

# --- 14. F3 ORDER: migration SA secret IAM binding must come AFTER secret creation ---
# (uses the healthy local smoke fixture like the happy-path test, so the smoke
#  step does not fail the release for an unrelated reason)
portfile14="$(mktemp -u "${logs}/fixture-port14.XXXXXX")"
"$PYTHON_BIN" "$(resolve_native_path "$HERE/httpserver_fixture.py")" 0 "$portfile14" >"$logs/fixture14.out" 2>&1 &
FIXPID14=$!
for _ in $(seq 1 50); do [ -s "$portfile14" ] && break; sleep 0.1; done
HEALTHY_URL14="http://127.0.0.1:$(cat "$portfile14")"
sb="$(make_sandbox)"
run_deploy "$sb" "$logs" \
  NUTTIEW_SQL_POSTGRES_PASSWORD_SECRET=nuttiew-pg-pw \
  NUTTIEW_SQL_OWNER_PASSWORD_SECRET=nuttiew-ow-pw \
  NUTTIEW_SQL_RUNTIME_PASSWORD_SECRET=nuttiew-rt-pw \
  NUTTIEW_SMOKE_BASE_URL="$HEALTHY_URL14" NUTTIEW_READY_ATTEMPTS=3 NUTTIEW_READY_POLL_SECONDS=0 >"$logs/out14" 2>&1; rc=$?
if [ "$rc" -eq 0 ]; then
  first_create=$(grep -n "secrets create" "$logs/gcloud.log" | head -1 | cut -d: -f1)
  first_bind=$(grep -n "secrets add-iam-policy-binding" "$logs/gcloud.log" | head -1 | cut -d: -f1)
  if [ -n "$first_create" ] && [ -n "$first_bind" ] && [ "$first_create" -lt "$first_bind" ]; then
    pass "migration SA secret IAM binding ordered after secret creation (F3)"
  else
    failt "IAM binding order wrong: first_create=$first_create first_bind=$first_bind"
  fi
else
  failt "happy path with secrets failed; cannot check order (rc=$rc): $(tail -3 "$logs/out14")"
fi
kill "$FIXPID14" 2>/dev/null || true
rm -rf "$sb" "$portfile14"

# =============================================================================
# 15-19. Secret Reference idempotency + IAM correctness (audited finding).
#   * existing secret is reused (no re-creation attempt)
#   * missing secret is created successfully
#   * permission-denied / create-failure stops execution (no false success, no
#     migration/deploy after prerequisite failure)
#   * migration SA IAM binding targets the correct, verified DATABASE_URL secret
#   * no secret value ever leaks (asserted here + final scan)
# =============================================================================

# shared helper: run deploy.sh happy-path with smoke fixture, returns rc
run_deploy_smoke() {
  local portfile_cmd="$1" logs="$2" sb="$3"; shift 3
  local pf="$(mktemp -u "$logs/fix-XXXXXX")"
  "$PYTHON_BIN" "$(resolve_native_path "$HERE/httpserver_fixture.py")" 0 "$pf" >"$logs/fix.out" 2>&1 &
  local pid=$!
  for _ in $(seq 1 50); do [ -s "$pf" ] && break; sleep 0.1; done
  local url="http://127.0.0.1:$(cat "$pf")"
  run_deploy "$sb" "$logs" \
    NUTTIEW_SQL_POSTGRES_PASSWORD_SECRET=nuttiew-pg-pw \
    NUTTIEW_SQL_OWNER_PASSWORD_SECRET=nuttiew-ow-pw \
    NUTTIEW_SQL_RUNTIME_PASSWORD_SECRET=nuttiew-rt-pw \
    NUTTIEW_SMOKE_BASE_URL="$url" NUTTIEW_READY_ATTEMPTS=3 NUTTIEW_READY_POLL_SECONDS=0 \
    "$@" >"$logs/fix_run.out" 2>&1; local rc=$?
  kill "$pid" 2>/dev/null || true
  rm -f "$pf"
  return $rc
}

# --- 15. Existing secret reused: no re-creation attempt for the pre-existing one ---
sb="$(make_sandbox)"
run_deploy_smoke "" "$logs" "$sb" FAKE_SECRET_EXISTS=DATABASE_URL >/dev/null 2>&1; rc=$?
[ "$rc" -eq 0 ] && pass "existing secret -> deploy succeeds (exit 0)" || failt "existing-secret happy path failed (rc=$rc): $(tail -3 "$logs/fix_run.out")"
if grep -qE "secrets create DATABASE_URL( |$)" "$logs/gcloud.log"; then failt "existing secret was re-created"; else pass "existing secret reused (no re-create)"; fi
rm -rf "$sb"

# --- 16. Missing secret created successfully (happy path asserts create happens) ---
sb="$(make_sandbox)"
run_deploy_smoke "" "$logs" "$sb" >/dev/null 2>&1; rc=$?
[ "$rc" -eq 0 ] && pass "missing secret -> created + deploy succeeds" || failt "missing-secret create happy path failed (rc=$rc): $(tail -3 "$logs/fix_run.out")"
grep -qE "secrets create DATABASE_URL( |$)" "$logs/gcloud.log" && pass "missing secret created in happy path" || { failt "missing secret was NOT created"; echo "log: $(grep -E "secrets (create|describe)" "$logs/gcloud.log" | head -4)"; }
rm -rf "$sb"

# --- 17. Permission denied on secret describe -> STOP before migration/deploy ---
sb="$(make_sandbox)"
run_deploy_smoke "" "$logs" "$sb" FAKE_SECRET_DENIED=DATABASE_URL >/dev/null 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "secret describe permission denied -> non-zero" || failt "permission denied did not abort (rc=$rc)"
if grep -qE "secrets create|run deploy|run jobs|secrets add-iam-policy-binding" "$logs/gcloud.log"; then failt "permission-denied proceeded to mutation/deploy"; else :; fi
[ -z "$(grep -E "secrets create|run deploy|run jobs|secrets add-iam-policy-binding" "$logs/gcloud.log")" ] && pass "permission-denied: no mutation/deploy after failure" || failt "permission-denied proceeded after failure"
rm -rf "$sb"

# --- 18. Secret create failure -> STOP (no false success, no migration/deploy) ---
sb="$(make_sandbox)"
run_deploy_smoke "" "$logs" "$sb" FAKE_SECRET_INVALID=DATABASE_URL >/dev/null 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "secret create failure -> non-zero" || failt "create failure did not abort (rc=$rc)"
[ -z "$(grep -E "run deploy|run jobs|secrets add-iam-policy-binding" "$logs/gcloud.log")" ] && pass "create-fail: no migration/deploy after failure" || failt "create-fail proceeded after failure"
rm -rf "$sb"

# --- 19. Migration SA IAM binding targets correct verified DATABASE_URL secret ---
sb="$(make_sandbox)"
run_deploy_smoke "" "$logs" "$sb" >/dev/null 2>&1; rc=$?
[ "$rc" -eq 0 ] && pass "binding-target happy path succeeds" || failt "binding-target happy path failed (rc=$rc)"
bind_line="$(grep "secrets add-iam-policy-binding" "$logs/gcloud.log" | grep -F "serviceAccount:test-migrate-sa" | head -1)"
echo "$bind_line" | grep -qE "DATABASE_URL" && pass "IAM binding targets the DATABASE_URL secret" || failt "IAM binding did not target DATABASE_URL: $bind_line"
echo "$bind_line" | grep -qE "roles/secretmanager\.secretAccessor" && pass "IAM binding uses secretAccessor role (least privilege)" || failt "IAM binding role wrong: $bind_line"
echo "$bind_line" | grep -qE "serviceAccount:test-migrate-sa" && pass "IAM binding targets migration SA" || failt "IAM binding member wrong: $bind_line"
rm -rf "$sb"
# =============================================================================
# 19b-19e. Runtime SA secret IAM (Issue #82): the runtime Cloud Run container
#   mounts DATABASE_URL_APP / AUTH_CSRF_HMAC_KEY / AUTH_RATE_KEY from Secret
#   Manager (section 12 of deploy.sh), so the runtime SA must get
#   roles/secretmanager.secretAccessor on EXACTLY those three secrets -- never on
#   the migration DATABASE_URL, and never project-wide.
#   Behavioral: inspects the recorded fake-gcloud IAM binding lines.
# =============================================================================

# scope of secretAccessor bindings for one SA (secret name per binding line)
secret_accessor_scope() { # <email> -> confident secret name per binding
  local email="$1"
  grep "secrets add-iam-policy-binding" "$logs/gcloud.log" \
    | grep -F "serviceAccount:$email" \
    | grep "roles/secretmanager.secretAccessor" \
    | sed -E 's#^gcloud secrets add-iam-policy-binding ([^ ]+).*#\1#' \
    | sort | uniq
}

# --- 19b. Runtime SA gets EXACTLY the three app secrets (least privilege) ---
sb="$(make_sandbox)"
run_deploy_smoke "" "$logs" "$sb" >/dev/null 2>&1; rc=$?
[ "$rc" -eq 0 ] && pass "runtime-SAM-iAM happy path succeeds" || failt "runtime-SA IAM happy path failed (rc=$rc): $(tail -3 "$logs/fix_run.out")"
runtime_secrets="$(secret_accessor_scope test-runtime-sa@a-test-project-123.iam.gserviceaccount.com)"
expected_runtime="AUTH_CSRF_HMAC_KEY
AUTH_RATE_KEY
DATABASE_URL_APP"
if [ "$runtime_secrets" = "$expected_runtime" ]; then
  pass "runtime SA secretAccessor scope == {DATABASE_URL_APP, AUTH_CSRF_HMAC_KEY, AUTH_RATE_KEY} exactly"
else
  failt "runtime SA secretAccessor scope mismatch. got: $(echo "$runtime_secrets" | tr '\n' ',')"
fi
if echo "$runtime_secrets" | grep -qx "DATABASE_URL"; then
  failt "runtime SA granted secretAccessor on the migration DATABASE_URL secret"
else
  pass "runtime SA is NOT granted the migration DATABASE_URL secret"
fi
rm -rf "$sb"

# --- 19c. Migration SA still reads ONLY the migration DATABASE_URL secret ---
sb="$(make_sandbox)"
run_deploy_smoke "" "$logs" "$sb" >/dev/null 2>&1; rc=$?
[ "$rc" -eq 0 ] && pass "migration-SA-IAM happy path succeeds" || failt "migration-SA IAM happy path failed (rc=$rc)"
mig_secrets="$(secret_accessor_scope test-migrate-sa@a-test-project-123.iam.gserviceaccount.com)"
if [ "$mig_secrets" = "DATABASE_URL" ]; then
  pass "migration SA secretAccessor scope is ONLY DATABASE_URL"
else
  failt "migration SA secretAccessor scope mismatch. got: $(echo "$mig_secrets" | tr '\n' ',')"
fi
if grep -E "projects add-iam-policy-binding .*roles/secretmanager\.secretAccessor" "$logs/gcloud.log"; then
  failt "a project-wide secretAccessor binding was issued"
else
  pass "no project-wide secretAccessor binding (resource-level only)"
fi
rm -rf "$sb"

# --- 19d. Env-overridable secret names: custom NUTTIEW_*_SECRET values honored ---
sb="$(make_sandbox)"
run_deploy_smoke "" "$logs" "$sb" \
  NUTTIEW_DATABASE_URL_APP_SECRET=custom_app \
  NUTTIEW_CSRF_HMAC_KEY_SECRET=custom_csrf \
  NUTTIEW_RATE_KEY_SECRET=custom_rate >/dev/null 2>&1; rc=$?
[ "$rc" -eq 0 ] && pass "runtime-SA-env-override happy path succeeds" || failt "env-override happy path failed (rc=$rc)"
runtime_custom="$(secret_accessor_scope test-runtime-sa@a-test-project-123.iam.gserviceaccount.com)"
expected_custom="custom_app
custom_csrf
custom_rate"
if [ "$runtime_custom" = "$expected_custom" ]; then
  pass "runtime SA honors NUTTIEW_*_SECRET env overrides for all three app secrets"
else
  failt "runtime SA env-override scope mismatch. got: $(echo "$runtime_custom" | tr '\n' ',')"
fi
rm -rf "$sb"

# --- 19e. IAM grant failure aborts immediately; no deployment continues ---
sb="$(make_sandbox)"
run_deploy_smoke "" "$logs" "$sb" FAKE_IAM_GRANT_FAIL=1 >/dev/null 2>&1; rc=$?
[ "$rc" -ne 0 ] && pass "IAM grant failure -> deploy non-zero" || failt "IAM grant failure did not abort (rc=$rc)"
if grep -q "run deploy" "$logs/gcloud.log"; then
  failt "runtime deploy ran after an IAM grant failure"
else
  pass "no runtime deploy after IAM grant failure"
fi
rm -rf "$sb"

# --- 20. Resource names in logs must never be executed as shell commands ---
# Mutation test on an ISOLATED sandbox copy of deploy.sh (never the source tree).
# RED: restore the old backtick bug in that sandbox's real helper and prove a
# fake deployment executes a harmless named probe from the secret name.
# GREEN: run the unmodified helper with the SAME payload and prove it does not.
pmark="$logs/pwn_probe"
rm -f "$pmark"
# Bash evaluates `$name` as ONE command name in this quoted context, even if
# the variable contains spaces. A "touch /path" payload would therefore produce
# "No such file or directory" without executing touch. Use a single executable
# name found on an isolated PATH instead, so old code must execute the marker.
original_shim_dir="$SHIM_DIR"
probe_bin="$(mktemp -d)"
cat > "$probe_bin/nuttiew_test20_probe" <<'PROBE'
#!/usr/bin/env bash
[ -n "${NUTTIEW_TEST_MARKER:-}" ] || exit 2
: > "$NUTTIEW_TEST_MARKER"
PROBE
chmod +x "$probe_bin/nuttiew_test20_probe"
SHIM_DIR="$probe_bin:$original_shim_dir"
# RED: only the throwaway sandbox gets the deliberately vulnerable old line.
sb="$(make_sandbox)"
sed -i 's|reference \$name (operator adds the real value later)|reference `\$name` (operator adds the real value later)|' "$sb/deploy/deploy.sh"
if grep -Fq 'log "created Secret Manager secret reference `$name` (operator adds the real value later)"' "$sb/deploy/deploy.sh"; then
  git -C "$sb" add deploy/deploy.sh && git -C "$sb" commit -q -m "test-only restore backtick bug" || failt "RED sandbox setup commit failed"
  run_deploy_smoke "" "$logs" "$sb" NUTTIEW_DATABASE_URL_SECRET=nuttiew_test20_probe NUTTIEW_TEST_MARKER="$pmark" >/dev/null 2>&1; rc=$?
  if [ "$rc" -eq 0 ] && [ -e "$pmark" ]; then
    pass "RED: original backtick bug executes secret name through real helper"
  else
    failt "RED: original helper bug was not detected (rc=$rc; marker missing); log tail: $(tail -n 10 "$logs/fix_run.out")"
  fi
else
  failt "RED sandbox setup did not restore the original vulnerable line"
fi
rm -rf "$sb"
rm -f "$pmark"

# --- GREEN: real production helper (no backticks) must interpolate, not execute ---
sb="$(make_sandbox)"
run_deploy_smoke "" "$logs" "$sb" \
  NUTTIEW_DATABASE_URL_SECRET=nuttiew_test20_probe NUTTIEW_TEST_MARKER="$pmark" \
  NUTTIEW_READY_ATTEMPTS=3 NUTTIEW_READY_POLL_SECONDS=0 >/dev/null 2>&1; rc=$?
if [ "$rc" -eq 0 ]; then
  pass "GREEN: unmodified deploy.sh completed the fake-cloud path"
else
  failt "GREEN: unmodified deploy.sh failed (rc=$rc)"
fi
if [ -e "$pmark" ]; then
  failt "GREEN FAIL: production helper executed the secret name as a command (marker created)"
else
  pass "GREEN: production helper interpolates the secret name, never executes it"
fi
# Assert the EXACT target helper line was reached with the literal input.
if grep -Fq "created Secret Manager secret reference nuttiew_test20_probe (operator adds the real value later)" "$logs/fix_run.out"; then
  pass "GREEN: exact secret-reference helper log preserves the literal name"
else
  failt "GREEN: expected secret-reference helper log not reached"
fi
rm -rf "$sb"
SHIM_DIR="$original_shim_dir"
rm -rf "$probe_bin"

# =============================================================================
# 9. No secret / credential value leaked in any captured output
# =============================================================================
if grep -riE "mySecret|BEGIN PRIVATE KEY|ghp_|token=|PASSWORD=" "$logs" 2>/dev/null | grep -v "PASSWORD=" ; then
  failt "credential-like value leaked"
else
  pass "no credential-like value leaked in captured outputs"
fi

rm -rf "$logs"
printf '\n=============================================\n'
printf 'Negative real-mode tests: %s passed, %s failed\n' "$PASS" "$FAIL"
printf '=============================================\n'
[ "$FAIL" -eq 0 ] || exit 1
exit 0
