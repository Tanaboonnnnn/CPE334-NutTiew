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