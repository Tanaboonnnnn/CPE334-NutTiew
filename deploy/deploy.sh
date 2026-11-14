#!/usr/bin/env bash
# =============================================================================
# NutTiew FIRST DEPLOYMENT runbook (GH-05, Issue #68)
# -----------------------------------------------------------------------------
# Provisions NutTiew on Google Cloud Run + Cloud SQL + Artifact Registry +
# Secret Manager.  Contains COMPLETE guarded execution paths for every step; all
# real cloud operations are executed ONLY when the operator explicitly arms
# real execution with DRY_RUN=0 AND NUTTIEW_ALLOW_REAL=1 (see lib-nuttiew.sh).
#
#   DRY_RUN=1 (default)        -> prints a redacted, simulated plan; never GCP.
#   DRY_RUN=0 NUTTIEW_ALLOW_REAL=1 ====> REAL provisioning (future authorized
#                                        GCP session only; never in GH-05).
#
# Credential boundary:
#   * migration/admin credential (DATABASE_URL) is used ONLY by the isolated
#     Cloud Run migration job; it is NEVER passed to the runtime container.
#   * runtime service uses DATABASE_URL_APP (restricted non-owner role) only.
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib-nuttiew.sh
source "$SCRIPT_DIR/lib-nuttiew.sh"

load_defaults
validate_required_config

REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log "NutTiew deployment runbook"
log "Mode: $([ "$NUTTIEW_REAL_ARMED" = "1" ] && echo 'REAL (armed by operator)' || echo 'DRY-RUN simulation (default, safe)')"
[ "$NUTTIEW_REAL_ARMED" != "1" ] || warn "REAL CLOUD OPERATIONS ARE ARMED - confirm this is intentional"

FULL_SHA="$(cd "$REPO_ROOT" && git rev-parse HEAD)"
validate_full_sha "$FULL_SHA"

# -----------------------------------------------------------------------------
# 1. Preflight + confirmation
# -----------------------------------------------------------------------------
# DRY_RUN works on a dirty tree / feature branch (warns only); a REAL deployment
# strictly requires a clean, approved `main` checkout.
plan "1.preflight" "verify git repo clean and on an authorized branch"
release_tree_check "$REPO_ROOT"
plan "1.preflight" "release SHA=${FULL_SHA}"

# -----------------------------------------------------------------------------
# 2. Configuration + permission preflight
# -----------------------------------------------------------------------------
plan "2.config" "Project=${NUTTIEW_PROJECT_ID} Region=${NUTTIEW_REGION} origin=${NUTTIEW_ORIGIN}"
log "preflight requires deploy SA to hold: ArtifactRegistry.Writer, CloudRun.Developer, CloudSQL.Client, SecretManager.Accessor"
# Canonical origin must be a real, non-placeholder HTTPS origin before it can be
# served publicly (finding #7). A placeholder is a hard failure in real mode.
if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
  case "$NUTTIEW_ORIGIN" in
    https://*/*|https://*-*-*-*.a.run.app|https://nuttiew.example.com*)
      fail "NUTTIEW_ORIGIN looks like a placeholder/unresolved origin (${NUTTIEW_ORIGIN}); real deploy requires the actual public HTTPS origin" ;;
  esac
fi

# -----------------------------------------------------------------------------
# 3. EXACT project scope check, then enable required GCP APIs (finding #4)
# -----------------------------------------------------------------------------
require_active_project
gcloud_safe "3.apis" -- services enable \
  artifactregistry.googleapis.com \
  cloudrun.googleapis.com \
  sqladmin.googleapis.com \
  secretmanager.googleapis.com

# -----------------------------------------------------------------------------
# 4. Artifact Registry repository (create if absent, never delete)
# -----------------------------------------------------------------------------
if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
  if gcloud artifacts repositories describe "${NUTTIEW_ARTIFACT_REPO}" --location="${NUTTIEW_REGION}" "project=${NUTTIEW_PROJECT_ID}" >/dev/null 2>&1; then
    log "Artifact Registry repo ${NUTTIEW_ARTIFACT_REPO} already exists (reuse)"
  else
    gcloud artifacts repositories create "${NUTTIEW_ARTIFACT_REPO}" \
      --repository-format=docker --location="${NUTTIEW_REGION}"
  fi
else
  plan "4.artifact" "ensure/create Artifact Registry docker repo ${NUTTIEW_ARTIFACT_REPO} in ${NUTTIEW_REGION} (never delete)"
fi

# -----------------------------------------------------------------------------
# 5. Cloud SQL for PostgreSQL (create only when absent; explicit edition/tier)
# -----------------------------------------------------------------------------
# Finding #9: use the validated edition/version/tier combination. Provisioning is
# PENDING until the operator confirms region availability + Free Trial limits.
# Finding #B: in REAL mode we do NOT continue if the intended instance does not
# exist and provisioning is deliberately deferred - that is a hard PENDING stop,
# not a silent skip. DB/role identifier validation happens before any SQL.
validate_sql_identifier "${NUTTIEW_SQL_DB_NAME}" "NUTTIEW_SQL_DB_NAME"
validate_sql_identifier "${NUTTIEW_DB_OWNER_USER}" "NUTTIEW_DB_OWNER_USER"
validate_sql_identifier "${NUTTIEW_DB_RUNTIME_USER}" "NUTTIEW_DB_RUNTIME_USER"
if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
  if gcloud sql instances describe "${NUTTIEW_SQL_INSTANCE}" >/dev/null 2>&1; then
    log "Cloud SQL instance ${NUTTIEW_SQL_INSTANCE} exists (reuse; do NOT upsize without approval)"
  else
    fail "PENDING live step: Cloud SQL instance '${NUTTIEW_SQL_INSTANCE}' does not exist and provisioning is deliberately deferred. Stop here; a separately authorized GCP session must create it (edition=${NUTTIEW_SQL_EDITION}, version=${NUTTIEW_SQL_VERSION}, tier=${NUTTIEW_SQL_TIER}, ~${NUTTIEW_SQL_STORAGE_GB}GB)."
  fi
  # Ensure the database exists.  A failed CREATE is a hard error (not suppressed).
  if ! gcloud sql databases list --instance="${NUTTIEW_SQL_INSTANCE}" --project="${NUTTIEW_PROJECT_ID}" --format='value(name)' 2>/dev/null | grep -qx "${NUTTIEW_SQL_DB_NAME}"; then
    gcloud_safe "5.sql.db" -- sql databases create "${NUTTIEW_SQL_DB_NAME}" --instance="${NUTTIEW_SQL_INSTANCE}" --project="${NUTTIEW_PROJECT_ID}"
  fi
else
  plan "5.sql" "require/verify Cloud SQL ${NUTTIEW_SQL_INSTANCE} (edition=${NUTTIEW_SQL_EDITION}, version=${NUTTIEW_SQL_VERSION}, tier=${NUTTIEW_SQL_TIER}) + database ${NUTTIEW_SQL_DB_NAME}"
fi

# -----------------------------------------------------------------------------
# 6. Bootstrap DB roles + extensions + ownership (Cloud SQL, NOT compose/db-init.sh)
#    (finding #3 + #B) - REQUIRED before migrations.  Real execution uses gcloud
#    sql connect as the postgres superuser.  All secrets are read from Secret
#    Manager refs and NEVER echoed.  Creates the owner/runtime LOGIN roles with a
#    usable password auth, then ALTER owner/extension, then (after migrations) the
#    restricted runtime grants.  This is a LIVE-only step; if any secret ref is
#    missing it FAILS CLOSED (PENDING), never a silent skip.
# -----------------------------------------------------------------------------
read_secret() { # read_secret <secret-ref>
  local ref="$1" val=""
  [ -n "$ref" ] || { echo ""; return 1; }
  val="$(gcloud secrets versions access latest --secret="$ref" 2>/dev/null)" || { echo ""; return 1; }
  printf '%s' "$val"
}
bootstrap_cloud_sql_db() {
  if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
    local pg_secret="${NUTTIEW_SQL_POSTGRES_PASSWORD_SECRET:-}"
    local ow_secret="${NUTTIEW_SQL_OWNER_PASSWORD_SECRET:-}"
    local rt_secret="${NUTTIEW_SQL_RUNTIME_PASSWORD_SECRET:-}"
    [ -n "$pg_secret" ] || fail "PENDING live step: NUTTIEW_SQL_POSTGRES_PASSWORD_SECRET not set (postgres superuser). DB bootstrap cannot run."
    [ -n "$ow_secret" ] || fail "PENDING live step: NUTTIEW_SQL_OWNER_PASSWORD_SECRET not set (owner role password). DB bootstrap cannot run."
    [ -n "$rt_secret" ] || fail "PENDING live step: NUTTIEW_SQL_RUNTIME_PASSWORD_SECRET not set (runtime role password). DB bootstrap cannot run."
    local pg_password ow_password rt_password
    pg_password="$(read_secret "$pg_secret")" || pg_password=""
    [ -n "$pg_password" ] || fail "could not read postgres superuser secret '$pg_secret'"
    ow_password="$(read_secret "$ow_secret")" || fail "could not read owner password secret"
    rt_password="$(read_secret "$rt_secret")" || fail "could not read runtime password secret"
    # Escape single quotes defensively for SQL literals; values are never echoed.
    ow_esc="${ow_password//\'/\'\'}"
    rt_esc="${rt_password//\'/\'\'}"
    log "bootstrapping Cloud SQL roles (passwords sourced from Secret Manager, never printed)"
    PGPASSWORD="$pg_password" gcloud sql connect "${NUTTIEW_SQL_INSTANCE}" \
      --database="postgres" --user="postgres" --quiet <<SQL || fail "Cloud SQL role bootstrap SQL failed"
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${NUTTIEW_DB_OWNER_USER}') THEN
    CREATE ROLE ${NUTTIEW_DB_OWNER_USER} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION PASSWORD '${ow_esc}';
  ELSE
    ALTER ROLE ${NUTTIEW_DB_OWNER_USER} WITH LOGIN PASSWORD '${ow_esc}';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${NUTTIEW_DB_RUNTIME_USER}') THEN
    CREATE ROLE ${NUTTIEW_DB_RUNTIME_USER} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION PASSWORD '${rt_esc}';
  ELSE
    ALTER ROLE ${NUTTIEW_DB_RUNTIME_USER} WITH LOGIN PASSWORD '${rt_esc}';
  END IF;
END \$\$;
SQL
    PGPASSWORD="$pg_password" gcloud sql connect "${NUTTIEW_SQL_INSTANCE}" \
      --database="${NUTTIEW_SQL_DB_NAME}" --user="postgres" --quiet <<SQL || fail "Cloud SQL DB ownership/extension SQL failed"
ALTER DATABASE ${NUTTIEW_SQL_DB_NAME} OWNER TO ${NUTTIEW_DB_OWNER_USER};
ALTER SCHEMA public OWNER TO ${NUTTIEW_DB_OWNER_USER};
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;
SQL
    log "bootstrap roles/ownership/extensions issued; operator confirms NUTTIEW_DB_BOOTSTRAP_DONE=1 after VERIFYING the DB is actually operational."
  else
    plan "6.db.bootstrap" "provision roles ${NUTTIEW_DB_OWNER_USER}/${NUTTIEW_DB_RUNTIME_USER} (LOGIN, secret-managed passwords), owner grants, pgcrypto/btree_gist (real mode, live GCP only)"
  fi
}
bootstrap_cloud_sql_db
# Deterministic prerequisite contract: migrations MUST NOT run on a DB that was
# not bootstrapped AND verified.  NUTTIEW_DB_BOOTSTRAP_DONE is an OPERATOR
# ACKNOWLEDGEMENT, not proof the DB is operational - therefore real mode also
# runs a read-only preflight that verifies the roles/extensions/grants exist.
# Real mode fails closed on either an unconfirmed or an unverified DB.
require_db_bootstrap

if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
  # Read-only DB readiness preflight (finding #B): before migrations, confirm the
  # instance, database, roles, extensions and initial grants actually exist.  This
  # is not a substitute for the operator's NUTTIEW_DB_BOOTSTRAP_DONE, and it never
  # prints passwords.
  verify_cloud_sql_readiness() {
    gcloud sql instances describe "${NUTTIEW_SQL_INSTANCE}" >/dev/null 2>&1 \
      || fail "PENDING: Cloud SQL instance '${NUTTIEW_SQL_INSTANCE}' missing"
    if ! gcloud sql databases list --instance="${NUTTIEW_SQL_INSTANCE}" --project="${NUTTIEW_PROJECT_ID}" --format='value(name)' 2>/dev/null | grep -qx "${NUTTIEW_SQL_DB_NAME}"; then
      fail "PENDING: database '${NUTTIEW_SQL_DB_NAME}' missing on ${NUTTIEW_SQL_INSTANCE}"
    fi
    # Strict, injection-safe DB readiness verification (finding #5, PR #3).
    # Uses `gcloud sql connect` reading SQL from STDIN (NOT the unsupported `-c`
    # flag, which belongs to psql, not gcloud). The role identifiers are validated
    # safe, so inlining to the SQL string is safe. We extract the EXACT integer
    # count (never a "contains the digit" match); verification must be conclusive.
    local role_count=""
    role_count="$(gcloud sql connect "${NUTTIEW_SQL_INSTANCE}" --database="postgres" --user="postgres" --quiet 2>/dev/null <<SQL \
        | grep -E '^[[:space:]]*[0-9]+[[:space:]]*$' | tr -d '[:space:]' | tail -n1 || true
SELECT count(*) FROM pg_roles WHERE rolname IN ('${NUTTIEW_DB_OWNER_USER}','${NUTTIEW_DB_RUNTIME_USER}');
SQL
)"
    if [ -z "$role_count" ]; then
      fail "PENDING: DB readiness verification inconclusive (role count query produced no numeric result) - cannot confirm the database is operational"
    fi
    [ "$role_count" = "2" ] \
      || fail "PENDING: expected exactly 2 DB roles (${NUTTIEW_DB_OWNER_USER}, ${NUTTIEW_DB_RUNTIME_USER}) but found count=${role_count}"
    # Explicitly confirm each required extension exists (SQL read-only, via stdin).
    local exts=""
    exts="$(gcloud sql connect "${NUTTIEW_SQL_INSTANCE}" --database="${NUTTIEW_SQL_DB_NAME}" --user="postgres" --quiet 2>/dev/null <<SQL || true
SELECT extname FROM pg_extension WHERE extname IN ('pgcrypto','btree_gist') ORDER BY extname;
SQL
)"
    for e in pgcrypto btree_gist; do
      printf '%s\n' "$exts" | grep -qx "$e" \
        || fail "PENDING: required extension '$e' missing on database ${NUTTIEW_SQL_DB_NAME}"
    done
    log "read-only DB readiness preflight passed (instance, database, roles, extensions all present and verified)."
  }
  verify_cloud_sql_readiness
else
  plan "6.db.preflight" "verify Cloud SQL instance/database/roles/extensions exist before migrations (real mode only)"
fi

# -----------------------------------------------------------------------------
# 7. Least-privilege service accounts
# -----------------------------------------------------------------------------
gcloud_safe "7.sa.runtime" -- iam service-accounts create "${NUTTIEW_RUNTIME_SA_EMAIL%%@*}" \
  --display-name="NutTiew runtime SA" || true
gcloud_safe "7.sa.runtime" -- projects add-iam-policy-binding "${NUTTIEW_PROJECT_ID}" \
  --member="serviceAccount:${NUTTIEW_RUNTIME_SA_EMAIL}" --role="roles/cloudsql.client"
gcloud_safe "7.sa.deploy" -- iam service-accounts create "${NUTTIEW_DEPLOY_SA_EMAIL%%@*}" \
  --display-name="NutTiew deploy SA" || true
gcloud_safe "7.sa.deploy" -- projects add-iam-policy-binding "${NUTTIEW_PROJECT_ID}" \
  --member="serviceAccount:${NUTTIEW_DEPLOY_SA_EMAIL}" --role="roles/artifactregistry.writer"
gcloud_safe "7.sa.deploy" -- projects add-iam-policy-binding "${NUTTIEW_PROJECT_ID}" \
  --member="serviceAccount:${NUTTIEW_DEPLOY_SA_EMAIL}" --role="roles/run.developer"
gcloud_safe "7.sa.deploy" -- projects add-iam-policy-binding "${NUTTIEW_PROJECT_ID}" \
  --member="serviceAccount:${NUTTIEW_DEPLOY_SA_EMAIL}" --role="roles/cloudsql.client"
gcloud_safe "7.sa.deploy" -- projects add-iam-policy-binding "${NUTTIEW_PROJECT_ID}" \
  --member="serviceAccount:${NUTTIEW_DEPLOY_SA_EMAIL}" --role="roles/secretmanager.admin"
# --- Dedicated MIGRATION identity (finding #4): least-privilege, only what the
#     migration job needs: Cloud SQL client + read the migration DATABASE_URL
#     secret. It does NOT receive deployment administration or broad Secret
#     Manager access.
gcloud_safe "7.sa.migrate" -- iam service-accounts create "${NUTTIEW_MIGRATE_SA_EMAIL%%@*}" \
  --display-name="NutTiew migrate SA" || true
gcloud_safe "7.sa.migrate" -- projects add-iam-policy-binding "${NUTTIEW_PROJECT_ID}" \
  --member="serviceAccount:${NUTTIEW_MIGRATE_SA_EMAIL}" --role="roles/cloudsql.client"
# PR finding #3: a FAILED required permission grant is NOT suppressed (gcloud_safe
# already aborts on non-zero; no `|| true` here). The migrate SA must be able to
# read the migration DATABASE_URL secret.
gcloud_safe "7.sa.migrate" -- secrets add-iam-policy-binding "${NUTTIEW_DATABASE_URL_SECRET:-DATABASE_URL}" \
  --member="serviceAccount:${NUTTIEW_MIGRATE_SA_EMAIL}" --role="roles/secretmanager.secretAccessor"

# -----------------------------------------------------------------------------
# 8. Secret Manager references (created; operator supplies VALUES later)
# -----------------------------------------------------------------------------
for sec in "${NUTTIEW_DATABASE_URL_SECRET:-DATABASE_URL}" \
           "${NUTTIEW_DATABASE_URL_APP_SECRET:-DATABASE_URL_APP}" \
           "${NUTTIEW_CSRF_HMAC_KEY_SECRET:-AUTH_CSRF_HMAC_KEY}" \
           "${NUTTIEW_RATE_KEY_SECRET:-AUTH_RATE_KEY}"; do
  gcloud_safe "8.secrets" -- secrets create "$sec" --project="${NUTTIEW_PROJECT_ID}" || true
done
plan "8.secrets" "secret references ready; operator supplies real VALUES in the real GCP session; none are read/printed here"

# -----------------------------------------------------------------------------
# 9. Build + publish full-SHA images, then resolve immutable digests (finding #5)
# -----------------------------------------------------------------------------
RUNTIME_IMAGE_REF="${NUTTIEW_RUNTIME_IMAGE}:${FULL_SHA}"
MIGRATE_IMAGE_REF="${NUTTIEW_MIGRATE_IMAGE}:${FULL_SHA}"
docker_safe "9.build.runtime" -- build --target runtime -t "${RUNTIME_IMAGE_REF}" "${REPO_ROOT}"
docker_safe "9.build.migrate"  -- build --target migrate  -t "${MIGRATE_IMAGE_REF}"  "${REPO_ROOT}"
# Push to Artifact Registry BEFORE resolving a digest so we never resolve a digest
# for an image that was not actually published.
gcloud_safe "9.push.runtime" -- artifacts docker images list "${NUTTIEW_RUNTIME_IMAGE}" --location="${NUTTIEW_REGION}" --filter="tags:${FULL_SHA}" || true
gcloud_safe "9.publish.runtime" -- auth configure-docker "${NUTTIEW_REGION}-docker.pkg.dev" || true
if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
  docker push "${RUNTIME_IMAGE_REF}" || fail "docker push failed (runtime ${RUNTIME_IMAGE_REF})"
  docker push "${MIGRATE_IMAGE_REF}" || fail "docker push failed (migration ${MIGRATE_IMAGE_REF})"
else
  plan "9.publish" "docker push ${RUNTIME_IMAGE_REF} and ${MIGRATE_IMAGE_REF} to Artifact Registry (dry-run)"
fi
RUNTIME_DIGEST="$(resolve_image_digest "${RUNTIME_IMAGE_REF}")"
MIGRATE_DIGEST="$(resolve_image_digest "${MIGRATE_IMAGE_REF}")"
# Immutable image refs (finding #D): deploy by `@sha256:` digest, never by a
# mutable tag on Cloud Run.
RUNTIME_DIGEST_REF="$(digest_image_ref "${NUTTIEW_RUNTIME_IMAGE}" "${RUNTIME_DIGEST}")"
MIGRATE_DIGEST_REF="$(digest_image_ref "${NUTTIEW_MIGRATE_IMAGE}" "${MIGRATE_DIGEST}")"
plan "9.digests" "runtime digest=${RUNTIME_DIGEST}"
plan "9.digests" "migrate digest=${MIGRATE_DIGEST}"

# -----------------------------------------------------------------------------
# 10-11. Isolated Cloud Run migration job (idempotent update to release image)
#        then run migrations and VERIFY THIS release's execution succeeded.
# -----------------------------------------------------------------------------
# The migration job alone receives the privileged DATABASE_URL (from Secret
# Manager); this is the ONLY place that credential is used.  The runtime never
# sees it.  The job is pinned to the immutable MIGRATE_DIGEST_REF.
run_migration_job_and_wait "${NUTTIEW_MIGRATE_JOB}" "${NUTTIEW_REGION}" "${MIGRATE_DIGEST_REF}" "${FULL_SHA}"

# -----------------------------------------------------------------------------
# 12. Deploy runtime to Cloud Run (restricted credential) pinned to the immutable
#     RUNTIME_DIGEST_REF.  AUTH_CANONICAL_ORIGIN is required by server.ts BEFORE
#     listening, so it is provided on the FIRST deploy (finding #7).  The Cloud SQL
#     instance is attached via the Cloud SQL Proxy/connector.
# -----------------------------------------------------------------------------
gcloud_safe "12.cloudrun" -- run deploy "${NUTTIEW_CLOUD_RUN_SERVICE}" \
  --image="${RUNTIME_DIGEST_REF}" --region="${NUTTIEW_REGION}" --platform=managed \
  --allow-unauthenticated --service-account="${NUTTIEW_RUNTIME_SA_EMAIL}" \
  --min-instances="${NUTTIEW_MIN_INSTANCES}" --max-instances="${NUTTIEW_MAX_INSTANCES}" \
  --concurrency="${NUTTIEW_CONCURRENCY}" --port="${NUTTIEW_PORT}" \
  --add-cloudsql-instances="${NUTTIEW_PROJECT_ID}:${NUTTIEW_REGION}:${NUTTIEW_SQL_INSTANCE}" \
  --set-env-vars="NODE_ENV=production,AUTH_CANONICAL_ORIGIN=${NUTTIEW_ORIGIN},PORT=${NUTTIEW_PORT},WEB_DIST=/app/apps/web/dist,AUTH_TRUSTED_PROXIES=" \
  --update-secrets="DATABASE_URL_APP=${NUTTIEW_DATABASE_URL_APP_SECRET:-DATABASE_URL_APP}:latest" \
  --update-secrets="AUTH_CSRF_HMAC_KEY=${NUTTIEW_CSRF_HMAC_KEY_SECRET:-AUTH_CSRF_HMAC_KEY}:latest" \
  --update-secrets="AUTH_RATE_KEY=${NUTTIEW_RATE_KEY_SECRET:-AUTH_RATE_KEY}:latest"

# -----------------------------------------------------------------------------
# 13. Revision-specific readiness (finding #7): confirm the revision carrying the
#     expected immutable digest is Ready, not merely the newest unrelated one.
# -----------------------------------------------------------------------------
if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
  wait_for_revision_ready "${NUTTIEW_CLOUD_RUN_SERVICE}" "${NUTTIEW_REGION}" "${RUNTIME_DIGEST_REF}"
fi

# -----------------------------------------------------------------------------
# 14. Resolve real public service URL + final canonical HTTPS origin
# -----------------------------------------------------------------------------
SERVICE_URL=""
if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
  SERVICE_URL="$(gcloud run services describe "${NUTTIEW_CLOUD_RUN_SERVICE}" --region="${NUTTIEW_REGION}" --format='value(status.url)')"
  log "Cloud Run URL=${SERVICE_URL}"
  # Ensure the public origin used for cookies/CSRF is the final valid HTTPS origin.
  gcloud_safe "14.origin" -- run services update "${NUTTIEW_CLOUD_RUN_SERVICE}" --region="${NUTTIEW_REGION}" \
    --set-env-vars="NODE_ENV=production,AUTH_CANONICAL_ORIGIN=${NUTTIEW_ORIGIN},PORT=${NUTTIEW_PORT}"
else
  SERVICE_URL="${NUTTIEW_ORIGIN}"
  plan "14.url" "Cloud Run URL resolved at real deploy time; canonical HTTPS origin=${NUTTIEW_ORIGIN}"
fi

# -----------------------------------------------------------------------------
# 15. Read-only smoke checks (executed script, real exit code when armed)
# -----------------------------------------------------------------------------
run_smoke_test "${SERVICE_URL}" "${REPO_ROOT}"

# -----------------------------------------------------------------------------
# 16. Record release metadata
# -----------------------------------------------------------------------------
plan "16.metadata" "SHA=${FULL_SHA} runtime_digest=${RUNTIME_DIGEST} migrate_digest=${MIGRATE_DIGEST} service=${NUTTIEW_CLOUD_RUN_SERVICE} url=${SERVICE_URL}"

echo
echo "===================================================================" >&2
if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
  echo "  END OF FIRST DEPLOYMENT (REAL).  SHA=${FULL_SHA}" >&2
  echo "  Record the digest(s) and URL above as release evidence." >&2
else
  echo "  END OF PLAN - SIMULATION ONLY (dry-run).  No GCP resource was created," >&2
  echo "  enabled, modified or deleted, and no secret value was accessed." >&2
  echo "  To perform a REAL deployment a separately authorized GCP session must" >&2
  echo "  set DRY_RUN=0 NUTTIEW_ALLOW_REAL=1 and supply all config + secrets." >&2
fi
echo "===================================================================" >&2
exit 0
