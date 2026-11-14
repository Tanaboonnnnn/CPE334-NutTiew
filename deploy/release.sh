#!/usr/bin/env bash
# =============================================================================
# NutTiew REPEATABLE RELEASE (GH-05, Issue #68)
# -----------------------------------------------------------------------------
# Deploys an APPROVED release traceable to an exact source commit.
#
# A release is identified by a FULL immutable Git commit SHA.  Short SHAs, moving
# refs/tags, or a fallback to `latest` are REJECTED.  Runtime and migration
# images must correspond to the SAME intended release.
#
# Migrations MUST actually succeed before the runtime is deployed.  There is NO
# declared-success flag; the Cloud Run migration job's real termination state
# gates the runtime deploy.  The read-only smoke test is executed and its real
# exit code decides success - never a hard-coded PASS.
#
# Mode:
#   DRY_RUN=1 (default)                 -> redacted simulated plan; never GCP.
#   DRY_RUN=0 NUTTIEW_ALLOW_REAL=1     -> REAL release (future authorized session).
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-nuttiew.sh
source "$SCRIPT_DIR/lib-nuttiew.sh"

load_defaults
validate_required_config

REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log "NutTiew release runbook"
log "Mode: $([ "$NUTTIEW_REAL_ARMED" = "1" ] && echo 'REAL (armed by operator)' || echo 'DRY-RUN simulation (default, safe)')"
[ "$NUTTIEW_REAL_ARMED" != "1" ] || warn "REAL CLOUD OPERATIONS ARE ARMED - confirm this is intentional"

# -----------------------------------------------------------------------------
# Resolve + validate the release SHA (full immutable SHA, no guessing)
# -----------------------------------------------------------------------------
if [ -n "${NUTTIEW_RELEASE_SHA:-}" ]; then
  RELEASE_SHA="$(validate_full_sha "$NUTTIEW_RELEASE_SHA")"
  log "release SHA from env: ${RELEASE_SHA}"
else
  CURRENT="$(cd "$REPO_ROOT" && git rev-parse HEAD)"
  RELEASE_SHA="$(validate_full_sha "$CURRENT")"
  CURRENT_BRANCH="$(cd "$REPO_ROOT" && git branch --show-current)"
  [ "$CURRENT_BRANCH" = "main" ] \
    || fail "NUTTIEW_RELEASE_SHA not set and current branch is '${CURRENT_BRANCH}' (expected main). Refusing to guess a release base."
  log "release SHA from checkout HEAD: ${RELEASE_SHA}"
fi

# Release checkout hygiene (real mode enforces clean + main; dry-run warns).
release_tree_check "$REPO_ROOT"

# -----------------------------------------------------------------------------
# Finding #5: the built source MUST equal the intended release SHA.
# We build from the CURRENT checkout, so in real mode the checkout HEAD must be
# the release SHA - otherwise a valid older SHA would label a different tree.
# (We never grep for "success"; this is a hard structural guarantee.)
# -----------------------------------------------------------------------------
CHECKOUT_SHA="$(cd "$REPO_ROOT" && git rev-parse HEAD)"
if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
  if [ "$CHECKOUT_SHA" != "$RELEASE_SHA" ]; then
    fail "release SHA mismatch: NUTTIEW_RELEASE_SHA=${RELEASE_SHA} but current checkout HEAD=${CHECKOUT_SHA}. Refusing to build/label a different source tree."
  fi
else
  if [ "$CHECKOUT_SHA" != "$RELEASE_SHA" ]; then
    warn "checkout HEAD (${CHECKOUT_SHA}) != release SHA (${RELEASE_SHA}) - real mode would abort before build/deploy (dry-run preview)"
  fi
fi

# Exact project scope (finding #4) + DB bootstrap prerequisite (finding #3).
require_active_project
require_db_bootstrap

# -----------------------------------------------------------------------------
# Build/tag + publish + resolve immutable digests (no fallback to latest)
# -----------------------------------------------------------------------------
RUNTIME_IMAGE_REF="${NUTTIEW_RUNTIME_IMAGE}:${RELEASE_SHA}"
MIGRATE_IMAGE_REF="${NUTTIEW_MIGRATE_IMAGE}:${RELEASE_SHA}"

docker_safe "release.build.runtime" -- build --target runtime -t "${RUNTIME_IMAGE_REF}" "${REPO_ROOT}"
docker_safe "release.build.migrate"  -- build --target migrate  -t "${MIGRATE_IMAGE_REF}"  "${REPO_ROOT}"

log "resolving immutable digest for ${RUNTIME_IMAGE_REF}"
# Docker must be authenticated to the intended Artifact Registry host BEFORE any
# push (finding #2). Runs only on the real path; aborts rather than falling back
# to anonymous/insecure registry access.
if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
  login_docker_artifact_registry "$(registry_host)"
fi
if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
  # Publish before resolving a digest so the deployed image is actually published.
  docker push "${RUNTIME_IMAGE_REF}" || fail "docker push failed (runtime)"
  docker push "${MIGRATE_IMAGE_REF}"  || fail "docker push failed (migration)"
else
  plan "release.publish" "docker push ${RUNTIME_IMAGE_REF} and ${MIGRATE_IMAGE_REF} (dry-run)"
fi
RUNTIME_DIGEST="$(resolve_image_digest "${RUNTIME_IMAGE_REF}")"
MIGRATE_DIGEST="$(resolve_image_digest "${MIGRATE_IMAGE_REF}")"
# Immutable image refs (finding #D): deploy by `@sha256:`, never a mutable tag.
RUNTIME_DIGEST_REF="$(digest_image_ref "${NUTTIEW_RUNTIME_IMAGE}" "${RUNTIME_DIGEST}")"
MIGRATE_DIGEST_REF="$(digest_image_ref "${NUTTIEW_MIGRATE_IMAGE}" "${MIGRATE_DIGEST}")"
plan "release.digests" "runtime=${RUNTIME_DIGEST} migrate=${MIGRATE_DIGEST}"

# -----------------------------------------------------------------------------
# Migration job (idempotent update to THE RELEASE image, pinned by digest) MUST
# SUCCEED first.  run_migration_job_and_wait updates/creates the job, executes it,
# and waits on THE EXECUTION IT STARTED so a stale success is never mistaken.
# -----------------------------------------------------------------------------
run_migration_job_and_wait "${NUTTIEW_MIGRATE_JOB}" "${NUTTIEW_REGION}" "${MIGRATE_DIGEST_REF}" "${RELEASE_SHA}"
# ABORT: any migration failure above already aborted (non-zero). The runtime is
# deployed ONLY after a SUCCEEDED migration execution of THIS release.

# -----------------------------------------------------------------------------
# Deploy runtime (restricted credential) pinned to the immutable digest, with the
# exact public HTTPS origin.
# -----------------------------------------------------------------------------
gcloud_safe "release.deploy" -- run deploy "${NUTTIEW_CLOUD_RUN_SERVICE}" \
  --image="${RUNTIME_DIGEST_REF}" --region="${NUTTIEW_REGION}" --platform=managed \
  --allow-unauthenticated --service-account="${NUTTIEW_RUNTIME_SA_EMAIL}" \
  --min-instances="${NUTTIEW_MIN_INSTANCES}" --max-instances="${NUTTIEW_MAX_INSTANCES}" \
  --concurrency="${NUTTIEW_CONCURRENCY}" --port="${NUTTIEW_PORT}" \
  --add-cloudsql-instances="${NUTTIEW_PROJECT_ID}:${NUTTIEW_REGION}:${NUTTIEW_SQL_INSTANCE}" \
  --set-env-vars="NODE_ENV=production,AUTH_CANONICAL_ORIGIN=${NUTTIEW_ORIGIN},PORT=${NUTTIEW_PORT},WEB_DIST=/app/apps/web/dist,AUTH_TRUSTED_PROXIES=" \
  --update-secrets="DATABASE_URL_APP=${NUTTIEW_DATABASE_URL_APP_SECRET:-DATABASE_URL_APP}:latest" \
  --update-secrets="AUTH_CSRF_HMAC_KEY=${NUTTIEW_CSRF_HMAC_KEY_SECRET:-AUTH_CSRF_HMAC_KEY}:latest" \
  --update-secrets="AUTH_RATE_KEY=${NUTTIEW_RATE_KEY_SECRET:-AUTH_RATE_KEY}:latest"

SERVICE_URL=""
if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
  SERVICE_URL="$(gcloud run services describe "${NUTTIEW_CLOUD_RUN_SERVICE}" --region="${NUTTIEW_REGION}" --format='value(status.url)')"
  # Revision-specific readiness (finding #7): confirm the revision carrying the
  # expected immutable digest is Ready, not merely the newest unrelated revision.
  wait_for_revision_ready "${NUTTIEW_CLOUD_RUN_SERVICE}" "${NUTTIEW_REGION}" "${RUNTIME_DIGEST_REF}"
  log "Cloud Run URL=${SERVICE_URL}"
else
  SERVICE_URL="${NUTTIEW_ORIGIN}"
  plan "release.url" "Cloud Run URL resolved at real deploy time; canonical HTTPS origin=${NUTTIEW_ORIGIN}"
fi

# -----------------------------------------------------------------------------
# Read-only smoke test (REAL execution path when armed)
# -----------------------------------------------------------------------------
run_smoke_test "${SERVICE_URL}" "${REPO_ROOT}"

# -----------------------------------------------------------------------------
# Release metadata
# -----------------------------------------------------------------------------
plan "release.metadata" "SHA=${RELEASE_SHA} service=${NUTTIEW_CLOUD_RUN_SERVICE} url=${SERVICE_URL} digest=${RUNTIME_DIGEST}"

echo
echo "===================================================================" >&2
if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
  echo "  Release complete (REAL).  SHA=${RELEASE_SHA}" >&2
  echo "  Record digest=${RUNTIME_DIGEST} URL=${SERVICE_URL} as evidence." >&2
else
  echo "  END OF RELEASE PLAN (dry-run).  No migrate, no deploy, no DB change." >&2
  echo "  Release SHA pinned to: ${RELEASE_SHA}" >&2
fi
echo "===================================================================" >&2
exit 0