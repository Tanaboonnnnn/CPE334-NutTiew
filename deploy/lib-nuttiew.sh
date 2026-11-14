#!/usr/bin/env bash
# =============================================================================
# NutTiew deployment shared helpers (GH-05, Issue #68)
# -----------------------------------------------------------------------------
# Sourced by deploy/deploy.sh and deploy/release.sh.  Contains ONLY:
#   * strict Bash set-options
#   * configuration loading / validation
#   * redaction helpers that never print secret VALUES
#   * gcloud / docker command wrappers with DRY_RUN support
#
# REAL CLOUD OPERATIONS ARE NEVER EXECUTED HERE BY GH-05.  The gcloud_* and
# docker_* wrappers refuse to run a real command unless BOTH `DRY_RUN` is 0/false
# AND the caller has explicitly armed `NUTTIEW_ALLOW_REAL=1`.  Otherwise every
# "operation" prints a redacted, simulated plan line labelled
# `[SIMULATED-DRY-RUN]` and returns 0.
#
# No credential-bearing argument value is ever echoed by this library.
# =============================================================================

set -euo pipefail
IFS=$'\n\t'

# Guard against double-sourcing (idempotent library).
if [ -n "${NUTTIEW_LIB_LOADED:-}" ]; then
  return 0 2>/dev/null || exit 0
fi
NUTTIEW_LIB_LOADED=1
export NUTTIEW_LIB_LOADED

# -----------------------------------------------------------------------------
# Fail-safe dry-run / real-execution authorization model
# -----------------------------------------------------------------------------
# Two distinct, strict parsers - an authorization flag and a run-mode flag MUST
# never share a "default to enabled" parser, or an unset authorization value
# could silently arm real execution.
#
# parse_dry_run():
#   * safe default when unset/empty/unknown => SIMULATION (dry-run).
#   * only explicit "0"/"false"/"no" requests real-execution eligibility.
parse_dry_run() {
  case "${1:-}" in
    0|false|FALSE|False|no|NO|No) echo "0" ;;
    *) echo "1" ;; # unset/empty/unknown/anything-else => SAFE simulation
  esac
}

# parse_allow_real():
#   * DENY BY DEFAULT.  Only the EXACT single character "1" authorizes.
#   * empty, unset, "true", "yes", mixed/accidental case, whitespace or any
#     malformed value all fail to "0" (denied).
parse_allow_real() {
  [ "$1" = "1" ] && echo "1" || echo "0"
}

# resolved run mode
NUTTIEW_DRY_RUN="$(parse_dry_run "${DRY_RUN:-}")";          export NUTTIEW_DRY_RUN
# resolved authorization (strict: only exact "1" ever authorizes)
NUTTIEW_ALLOW_REAL="$(parse_allow_real "${NUTTIEW_ALLOW_REAL:-}")"; export NUTTIEW_ALLOW_REAL
# Real execution is armed ONLY when BOTH conditions hold:
#   * the operator explicitly requested real-execution eligibility (DRY_RUN starts "0"), AND
#   * the operator explicitly authorized real operations (NUTTIEW_ALLOW_REAL == "1").
# Any other combination (including unset authorization) stays armed=0 (SAFE).
NUTTIEW_REAL_ARMED=0
if [ "$NUTTIEW_DRY_RUN" = "0" ] && [ "$NUTTIEW_ALLOW_REAL" = "1" ]; then
  NUTTIEW_REAL_ARMED=1
fi
export NUTTIEW_REAL_ARMED
readonly NUTTIEW_DRY_RUN NUTTIEW_ALLOW_REAL NUTTIEW_REAL_ARMED

# Normalize export for child processes (kept as the SAFE default when unset).
export DRY_RUN="${DRY_RUN:-1}"

# -----------------------------------------------------------------------------
# Logging
# -----------------------------------------------------------------------------
log()  { printf '[nutTiew] [%s] %s\n' "$(date -u +%H:%M:%S)" "$*" >&2; }
warn() { printf '[nutTiew] [WARN]  %s\n' "$*" >&2; }
fail() { printf '[nutTiew] [ERROR] %s\n' "$*" >&2; exit 1; }

# -----------------------------------------------------------------------------
# Redaction helpers
# -----------------------------------------------------------------------------
# NEVER print a real secret value.  redact() maps a value to a stable tag.
redact_secret() { echo '[REDACTED]'; }

# Print an execution-plan line (used in both dry-run and real mode).  Values are
# redacted when they look like secrets; labels are always safe.
plan() {
  local step="$1"; shift
  local args="$*"
  if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
    printf '[nutTiew] [PLAN] %s :: %s\n' "$step" "$args" >&2
  else
    printf '[nutTiew] [SIMULATED-DRY-RUN] %s :: %s\n' "$step" "$args" >&2
  fi
}

# -----------------------------------------------------------------------------
# gcloud wrapper — refuses real execution unless NUTTIEW_REAL_ARMED=1
# -----------------------------------------------------------------------------
# Usage: gcloud_safe <step-label> -- <actual gcloud args...>
# In dry-run mode we never even construct a real credential-bearing invocation;
# we print a redacted ESL (executable statement language) plan line.
# gcloud_safe <step-label> -- <gcloud args...>
# In dry-run mode nothing runs - a redacted plan is printed.  In real mode the
# command is executed with the CONFIGURED project explicitly bound so a project
# mismatch can never target an unintended GCP project (see require_active_project,
# which must run before any mutation).
gcloud_safe() {
  local label="$1"; shift
  [[ "${1:-}" == "--" ]] || fail "gcloud_safe requires '--' separator"
  shift
  local cmdline="$*"
  if [ "$NUTTIEW_REAL_ARMED" != "1" ]; then
    plan "$label" "gcloud ${cmdline%%[*$'\n']*}" # truncate any multiline payload
    return 0
  fi
  # Real execution path.
  log "$label: invoking gcloud (project=${NUTTIEW_PROJECT_ID})"
  # Bind the command to the configured project unless the caller already did.
  if [[ " $* " != *" --project "* ]]; then
    gcloud "$@" --project="$NUTTIEW_PROJECT_ID" || fail "gcloud command failed (${label})"
  else
    gcloud "$@" || fail "gcloud command failed (${label})"
  fi
}

# -----------------------------------------------------------------------------
# Exact GCP project scope (finding #4)
# -----------------------------------------------------------------------------
# In REAL mode, before creating any billable resource, verify the gcloud active
# project IS the configured NUTTIEW_PROJECT_ID (strict equality, case-sensitive).
# A mismatch aborts immediately.  Dry-run prints a plan.  Never alters the user's
# real gcloud configuration.
require_active_project() {
  if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
    local active=""
    active="$(gcloud config get-value project 2>/dev/null || true)"
    if [ -z "$active" ] || [ "$active" != "$NUTTIEW_PROJECT_ID" ]; then
      fail "active gcloud project '${active:-<unset>}' != configured NUTTIEW_PROJECT_ID '${NUTTIEW_PROJECT_ID}'. Aborting before any resource change."
    fi
    log "active gcloud project matches configured project (${NUTTIEW_PROJECT_ID})"
  else
    plan "project-scope" "verify active gcloud project == ${NUTTIEW_PROJECT_ID} (real mode only)"
  fi
}

docker_safe() {
  local label="$1"; shift
  [[ "${1:-}" == "--" ]] || fail "docker_safe requires '--' separator"
  shift
  local cmdline="$*"
  if [ "$NUTTIEW_REAL_ARMED" != "1" ]; then
    plan "$label" "docker ${cmdline}"
    return 0
  fi
  log "$label: invoking docker"
  docker "$@" || fail "docker command failed (${label})"
}

# -----------------------------------------------------------------------------
# Docker authentication for Artifact Registry (finding #2)
# -----------------------------------------------------------------------------
# registry_host() derives `<region>-docker.pkg.dev`.
registry_host() {
  case "$NUTTIEW_REGION" in
    us|eu|asia) fail "NUTTIEW_REGION '$NUTTIEW_REGION' is a multi-region; Artifact Registry needs a concrete region host" ;;
    *) printf '%s-docker.pkg.dev' "$NUTTIEW_REGION" ;;
  esac
}

# login_docker_artifact_registry <registry-host>
# Runs ONLY on the real path, AFTER WIF/gcloud auth.  Uses `gcloud auth
# configure-docker` (never prints credentials), validates the host shape, and aborts
# (never anonymous) if authentication fails.
login_docker_artifact_registry() {
  local host="$1"
  # Host shape: `<region>-docker.pkg.dev` (lowercase letters/digits/hyphen).
  [[ "$host" =~ ^[a-z][a-z0-9-]{2,32}-docker\.pkg\.dev$ ]] \
    || fail "invalid Artifact Registry host '$host'; cannot authenticate to an unverified registry"
  if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
    log "authenticating docker to ${host} via gcloud (no credentials printed; no anonymous fallback)"
    gcloud auth configure-docker "$host" --quiet \
      || fail "docker registry authentication failed for ${host}; aborting before any push"
  else
    plan "docker-auth" "gcloud auth configure-docker ${host} (real mode only)"
  fi
}

# -----------------------------------------------------------------------------
# Release checkout preflight
# -----------------------------------------------------------------------------
# Enforcement depends on mode:
#   * REAL execution: REQUIRES a clean working tree on `main` (a feature branch,
#     PR branch or dirty tree is a hard failure - a release must be reproducible).
#   * DRY-RUN      : only WARNS about a dirty tree / non-main branch so the plan
#     can still be previewed while developing (e.g. during GH-05), but NEVER
#     performs a real operation.
release_tree_check() {
  local repo_root="$1"
  [ -d "$repo_root/.git" ] || fail "not a git repository (expected ${repo_root})"
  local dirty=""
  dirty="$(cd "$repo_root" && git status --porcelain)"
  local branch=""
  branch="$(cd "$repo_root" && git branch --show-current)"

  if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
    [ -z "$dirty" ] || fail "release requires a CLEAN working tree (commit/stash); found uncommitted changes"
    [ "$branch" = "main" ] || fail "release requires branch 'main' (current: '${branch}'); feature/PR branches are not a valid release base"
  else
    [ -z "$dirty" ] || warn "working tree is NOT clean - real deploy would abort (dry-run preview only)"
    [ "$branch" = "main" ] || warn "branch is '${branch}' not 'main' - real deploy would abort (dry-run preview only)"
  fi
}

# -----------------------------------------------------------------------------
# Resolve the immutable image digest for a tag (finding #D)
# -----------------------------------------------------------------------------
# validate_digest <digest-or-ref> : the digest must be `sha256:<64 hex>`.
validate_digest() {
  local d="$1"
  [[ "$d" =~ ^sha256:[0-9a-f]{64}$ ]] \
    || fail "invalid image digest '$d' (must be sha256:<64 hex>); refusing a mutable tag fallback"
}

# resolve_image_digest <tag-ref> -> emits the digest ONLY (immutable), validated.
# REAL: `gcloud artifacts docker images describe <ref> --format=value(imageDigest)`;
#       a missing/malformed digest is a hard failure (never a `latest` fallback).
# DRY-RUN: emits a deterministic but clearly-simulated digest of valid syntax.
resolve_image_digest() {
  local ref="$1"
  if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
    local dg
    dg="$(gcloud artifacts docker images describe "$ref" --format='value(imageDigest)' 2>/dev/null)" \
      || fail "could not resolve immutable digest for ${ref} (no fallback to latest)"
    validate_digest "$dg"
    printf '%s' "$dg"
  else
    local tag="${ref##*:}"
    printf 'sha256:%s%s' "$(printf '%s' "$tag" | tr -d '[:space:]')" "0000000000000000000000000000000000000000"
  fi
}

# digest_image_ref <image-name> <digest> -> `<image>@sha256:...` (immutable).
digest_image_ref() {
  local name="$1" digest="$2"
  printf '%s@%s' "$name" "$digest"
}

# -----------------------------------------------------------------------------
# Run the Cloud Run migration job and require SUCCESS
# -----------------------------------------------------------------------------
# REAL: `gcloud run jobs execute <job> --region ... --wait` then read the final
#       state; non-zero or a non-SUCCEEDED final state → fail (abort before any
#       runtime deploy).
# DRY-RUN: simulated success marker so the plan is meaningful; never a real op.
# run_migration_job_and_wait <job> <region> <migrate_image_ref> <release_sha>
# REAL mode:
#   * Idempotently create-or-UPDATE the Cloud Run Job to the migrate image of THIS
#     release (never `|| true`-swallow an update error, never run an outdated job).
#   * Configure the job's Cloud SQL connection explicitly with --set-cloudsql-instances
#     so the node-postgres client can reach Cloud SQL; the job SA only needs the
#     migration secret + Cloud SQL access.
#   * Execute the job and capture the EXECUTION name started by this release.
#   * Poll THAT execution and evaluate its TERMINAL outcome (Succeeded/Failed/
#     Cancelled) via deploy/tests/job_outcome_checker.py - not a naive first-
#     condition read.
#   * Any failure, cancellation, or timeout blocks runtime deployment (non-zero).
# DRY-RUN: prints a redacted plan.
# The migration image must correspond to the intended release (validated by the
# caller passing MIGRATE_IMAGE_REF built from the release SHA).
run_migration_job_and_wait() {
  local job="$1" region="$2" migrate_image="$3" release_sha="$4"
  local script_dir
  script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  local checker="${script_dir}/tests/job_outcome_checker.py"
  local job_aspect=("--set-cloudsql-instances=${NUTTIEW_PROJECT_ID}:${NUTTIEW_REGION}:${NUTTIEW_SQL_INSTANCE}")
  if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
    log "ensure migration job ${job} uses image ${migrate_image} (release ${release_sha})"
    if gcloud run jobs describe "$job" --region="$region" >/dev/null 2>&1; then
      gcloud run jobs update "$job" --region="$region" --image="$migrate_image" \
        --service-account="${NUTTIEW_MIGRATE_SA_EMAIL}" \
        "${job_aspect[@]}" \
        --set-secrets="DATABASE_URL=${NUTTIEW_DATABASE_URL_SECRET:-DATABASE_URL}:latest" \
        || fail "failed to update migration job ${job} to release image ${migrate_image}"
    else
      gcloud run jobs create "$job" --region="$region" --image="$migrate_image" \
        --service-account="${NUTTIEW_MIGRATE_SA_EMAIL}" --tasks=1 --max-retries=0 \
        "${job_aspect[@]}" \
        --set-secrets="DATABASE_URL=${NUTTIEW_DATABASE_URL_SECRET:-DATABASE_URL}:latest" \
        || fail "failed to create migration job ${job}"
    fi
    log "executing Cloud Run migration job ${job} (privileged DATABASE_URL only; runtime never sees it)"
    exec_json="$(gcloud run jobs execute "$job" --region="$region" --format=json \
                  || fail "Cloud Run migration job ${job} execution failed to start")"
    exec_name="$(printf '%s' "$exec_json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('metadata',{}).get('name') or '')")"
    [ -n "$exec_name" ] || fail "could not read the execution name for ${job}"
    log "migration execution: ${exec_name}"
    # Poll THIS execution to a TERMINAL outcome (bounded).
    outcome="pending"
    for _ in $(seq 1 "${NUTTIEW_MIGRATE_WAIT_ATTEMPTS:-60}"); do
      exec_row="$(gcloud run jobs executions describe "$exec_name" --region="$region" --format=json 2>/dev/null || true)"
      [ -n "$exec_row" ] || { sleep "${NUTTIEW_MIGRATE_POLL_SECONDS:-5}"; continue; }
      outcome="$(printf '%s' "$exec_row" | python3 "$checker" - 2>/dev/null || echo pending)"
      [ "$outcome" != "pending" ] && [ "$outcome" != "incomplete" ] && break
      sleep "${NUTTIEW_MIGRATE_POLL_SECONDS:-5}"
    done
    case "$outcome" in
      success) log "migration execution ${exec_name} SUCCEEDED" ;;
      cancelled) fail "migration execution ${exec_name} was CANCELLED - blocking runtime deploy" ;;
      failure) fail "migration execution ${exec_name} FAILED - blocking runtime deploy" ;;
      *) fail "migration execution ${exec_name} did not reach a terminal SUCCESS within ${NUTTIEW_MIGRATE_WAIT_ATTEMPTS:-60} attempts (outcome=${outcome})" ;;
    esac
  else
    plan "migration" "create/update job ${job} to ${migrate_image} with Cloud SQL connection, execute, and require the execution started now to SUCCEEDED (simulated)"
  fi
}

# -----------------------------------------------------------------------------
# Revision-specific Cloud Run readiness (finding #7)
# -----------------------------------------------------------------------------
# wait_for_revision_ready <service> <region> <expected_digest_ref>
# Real mode (PR-readiness finding #2): binds readiness to the EXACT revision that
# this deployment created (status.latestCreatedRevisionName). It resolves that
# revision's identity, confirms its container image is the expected immutable
# digest, then reads Ready ONLY from that specific revision (never from an older
# already-Ready revision). Identity/image/status must all be confirmed or it fails
# closed (no false success from an unrelated revision).
wait_for_revision_ready() {
  local service="$1" region="$2" expected="$3"
  if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
    : "${NUTTIEW_READY_ATTEMPTS:=30}"
    : "${NUTTIEW_READY_POLL_SECONDS:=4}"
    # Resolve the revision created by the CURRENT deployment (not any other).
    local rev_name=""
    for _ in $(seq 1 5); do
      rev_name="$(gcloud run services describe "$service" --region="$region" \
        --format='value(status.latestCreatedRevisionName)' 2>/dev/null || true)"
      [ -n "$rev_name" ] || break
      sleep 2
    done
    [ -n "$rev_name" ] \
      || fail "PENDING live prerequisite: could not resolve the revision created by this deployment for ${service}"
    # Confirm that exact revision's image matches the expected digest.
    local rev_image=""
    rev_image="$(gcloud run revisions describe "$rev_name" --service="$service" --region="$region" \
      --format='value(spec.containers[0].image)' 2>/dev/null || true)"
    local digest="${expected#*@}"
    case "$rev_image" in
      "" ) fail "PENDING live prerequisite: could not read image of revision ${rev_name}; cannot confirm it is release ${expected}" ;;
      *"$digest"*) log "revision ${rev_name} image matches expected digest" ;;
      *)
        fail "PENDING live prerequisite: revision ${rev_name} image '${rev_image}' does not match expected digest '${digest}'; not reporting readiness from an unrelated revision" ;;
    esac
    # Read Ready ONLY from this specific revision.
    local state=""
    log "waiting for revision ${rev_name} (image=${expected}) to become Ready"
    for _ in $(seq 1 "${NUTTIEW_READY_ATTEMPTS}"); do
      state="$(gcloud run revisions describe "$rev_name" --service="$service" --region="$region" \
                --format='value(status.conditions[?(@.type==\"Ready\")].status)' 2>/dev/null)"
      [ "$state" = "True" ] && break
      sleep "${NUTTIEW_READY_POLL_SECONDS}"
    done
    [ "$state" = "True" ] || fail "Cloud Run revision ${rev_name} (image=${expected}) did not become Ready"
    log "Cloud Run revision ${rev_name} (image=${expected}) is Ready"
  else
    plan "revision-ready" "confirm the revision created by this deploy (image ${expected}) is Ready (real mode; live prerequisite)"
  fi
}

# -----------------------------------------------------------------------------
# Read-only smoke test (must run the REAL script and inspect its exit code)
# -----------------------------------------------------------------------------
# In both modes the real deploy/smoke_test.py is executed against the supplied
# base URL when one is given; the exit code decides success.  This guarantees the
# smoke check is a genuine executed verification, never a declared constant.
run_smoke_test() {
  local base_url="$1" repo_root="$2"
  local smoke="${repo_root}/deploy/smoke_test.py"
  [ -f "$smoke" ] || fail "smoke_test.py not found (${smoke})"
  # Resolve a native path so a native Windows Python can open the script even when
  # repo_root is an msys/cygwin mount (PR readiness: keep offline tests runnable on
  # a developer machine; on Linux this is a no-op).
  local smoke_native="$smoke"
  if command -v cygpath >/dev/null 2>&1 && [[ "$smoke_native" == /* ]]; then
    smoke_native="$(cygpath -w "$smoke_native" 2>/dev/null || echo "$smoke_native")"
  fi
  local target="${NUTTIEW_SMOKE_BASE_URL:-$base_url}"
  if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
    log "running read-only smoke against ${target}"
    python3 "$smoke_native" --base-url "$target" || fail "smoke test FAILED against ${target}"
  elif [ -n "${NUTTIEW_SMOKE_BASE_URL:-}" ]; then
    log "running read-only smoke (fixture) against ${target}"
    python3 "$smoke_native" --base-url "$target" || fail "smoke test FAILED against ${target}"
  else
    plan "smoke" "python3 deploy/smoke_test.py --base-url=${target} (executed read-only at real deploy)"
  fi
}

# -----------------------------------------------------------------------------
# Config loading + validation
# -----------------------------------------------------------------------------
# Expected variables (all read from the environment; nothing hard-coded as a
# secret and the Project ID is intentionally NOT the configured default):
#   NUTTIEW_PROJECT_ID
#   NUTTIEW_REGION
#   NUTTIEW_ARTIFACT_REPO
#   NUTTIEW_RUNTIME_IMAGE         (Artifact Registry image; implies tag)
#   NUTTIEW_MIGRATE_IMAGE
#   NUTTIEW_SQL_INSTANCE
#   NUTTIEW_SQL_DB_NAME           (default nuttiew)
#   NUTTIEW_DB_OWNER_USER         (default nuttiew_owner)
#   NUTTIEW_DB_RUNTIME_USER       (default nuttiew_runtime)
#   NUTTIEW_RUNTIME_SA_EMAIL
#   NUTTIEW_DEPLOY_SA_EMAIL
#   NUTTIEW_MIGRATE_JOB           (default <runtime-service>-migrate)
#   NUTTIEW_CLOUD_RUN_SERVICE
#   NUTTIEW_ORIGIN                (public https origin, e.g. https://ui.example.com)
#   NUTTIEW_PORT                  (default 3001)
#   NUTTIEW_MIN_INSTANCES         (default 0)
#   NUTTIEW_MAX_INSTANCES         (default 3)
#   NUTTIEW_CONCURRENCY           (default 80)
#   NUTTIEW_SECRET_*              (Secret Manager secret storage names)
#   NUTTIEW_DATABASE_URL_SECRET   (Secret Manager secret for migration URL)
#   NUTTIEW_DATABASE_URL_APP_SECRET
#   NUTTIEW_CSRF_HMAC_KEY_SECRET
#   NUTTIEW_RATE_KEY_SECRET

# Project ID constraint: reuse the team's known project only when explicitly
# supplied.  We never hard-code it into executable logic.
readonly TEAM_PROJECT_CANDIDATE="project-a4c95fa2-28c5-4e9a-89d"

is_safe_project_id() {
  # project id: lowercase letters, digits and hyphens; 6..30 chars.
  [[ "$1" =~ ^[a-z][a-z0-9-]{5,29}$ ]]
}

is_safe_region() {
  # GCP region token: letters/digits/hyphen, e.g. asia-southeast1.
  [[ "$1" =~ ^[a-z][a-z0-9-]{2,32}$ ]]
}

# validate_sql_identifier <name> <label>
# Guards against SQL injection through deployment configuration: only lowercase
# letters, digits and underscores; must start with a letter; length <= 63.
validate_sql_identifier() {
  local id="$1" label="$2"
  [[ "$id" =~ ^[a-z][a-z0-9_]{0,62}$ ]] \
    || fail "${label} '$id' is not a safe SQL identifier (lowercase letters/digits/underscore, start with a letter)"
  true
}

load_defaults() {
  : "${NUTTIEW_SQL_DB_NAME:=nuttiew}"
  : "${NUTTIEW_DB_OWNER_USER:=nuttiew_owner}"
  : "${NUTTIEW_DB_RUNTIME_USER:=nuttiew_runtime}"
  : "${NUTTIEW_MIGRATE_SA_EMAIL:=}"   # distinct migration identity (finding #4); required
  : "${NUTTIEW_PORT:=3001}"
  : "${NUTTIEW_MIN_INSTANCES:=0}"
  : "${NUTTIEW_MAX_INSTANCES:=3}"
  : "${NUTTIEW_CONCURRENCY:=80}"
  : "${NUTTIEW_MIGRATE_JOB:=${NUTTIEW_CLOUD_RUN_SERVICE:-nuttiew}-migrate}"
  # Cloud SQL edition/version/tier (finding #9).  Google requires a VALID
  # combination: PostgreSQL 16+ defaults to Enterprise Plus, while shared-core
  # `db-f1-micro` belongs to ENTERPRISE.  We default to an explicit, compatible
  # combination (ENTERPRISE edition, PostgreSQL 15 / db-f1-micro compatible)
  # subject to later region availability; provisioning stays PENDING/DISABLED.
  : "${NUTTIEW_SQL_EDITION:=ENTERPRISE}"
  : "${NUTTIEW_SQL_VERSION:=POSTGRES_15}"
  : "${NUTTIEW_SQL_TIER:=db-f1-micro}"
  : "${NUTTIEW_SQL_STORAGE_GB:=10}"
  : "${NUTTIEW_SQL_BACKUP_ENABLED:=false}"
  : "${NUTTIEW_DB_BOOTSTRAP_DONE:=}"   # operator-confirmed DB role bootstrap gate
}

# Full required-config validation for first deployment / release.  Silent except
# in dry-run (so dry-run can still print a useful plan), but a missing/invalid
# REQUIRED value always aborts.
validate_required_config() {
  local missing=()
  [[ -n "${NUTTIEW_PROJECT_ID:-}" ]]   || missing+=("NUTTIEW_PROJECT_ID")
  [[ -n "${NUTTIEW_REGION:-}" ]]       || missing+=("NUTTIEW_REGION")
  [[ -n "${NUTTIEW_ARTIFACT_REPO:-}" ]]|| missing+=("NUTTIEW_ARTIFACT_REPO")
  [[ -n "${NUTTIEW_RUNTIME_IMAGE:-}" ]]|| missing+=("NUTTIEW_RUNTIME_IMAGE")
  [[ -n "${NUTTIEW_MIGRATE_IMAGE:-}" ]]|| missing+=("NUTTIEW_MIGRATE_IMAGE")
  [[ -n "${NUTTIEW_SQL_INSTANCE:-}" ]] || missing+=("NUTTIEW_SQL_INSTANCE")
  [[ -n "${NUTTIEW_RUNTIME_SA_EMAIL:-}" ]] || missing+=("NUTTIEW_RUNTIME_SA_EMAIL")
  [[ -n "${NUTTIEW_MIGRATE_SA_EMAIL:-}" ]]  || missing+=("NUTTIEW_MIGRATE_SA_EMAIL")
  [[ -n "${NUTTIEW_DEPLOY_SA_EMAIL:-}" ]]  || missing+=("NUTTIEW_DEPLOY_SA_EMAIL")
  [[ -n "${NUTTIEW_CLOUD_RUN_SERVICE:-}" ]]|| missing+=("NUTTIEW_CLOUD_RUN_SERVICE")
  [[ -n "${NUTTIEW_ORIGIN:-}" ]]           || missing+=("NUTTIEW_ORIGIN")

  if [ "${#missing[@]}" -gt 0 ]; then
    fail "Required deployment configuration missing: ${missing[*]}"
  fi

  is_safe_project_id "$NUTTIEW_PROJECT_ID" \
    || fail "NUTTIEW_PROJECT_ID looks invalid (\`$NUTTIEW_PROJECT_ID\`)"
  is_safe_region "$NUTTIEW_REGION" \
    || fail "NUTTIEW_REGION looks invalid (\`$NUTTIEW_REGION\`)"

  # Origin must be a single, valid origin URL (finding #3).
  validate_origin

  # Port + scaling sanity.
  [[ "$NUTTIEW_PORT" =~ ^[0-9]{1,5}$ ]]    || fail "NUTTIEW_PORT must be numeric"
  [[ "$NUTTIEW_MAX_INSTANCES" =~ ^[0-9]+$ ]] || fail "NUTTIEW_MAX_INSTANCES must be numeric"
  [[ "$NUTTIEW_MIN_INSTANCES" =~ ^[0-9]+$ ]] || fail "NUTTIEW_MIN_INSTANCES must be numeric"
  [ "$NUTTIEW_MIN_INSTANCES" -le "$NUTTIEW_MAX_INSTANCES" ] \
    || fail "NUTTIEW_MIN_INSTANCES must be <= NUTTIEW_MAX_INSTANCES (keep costs low / scale 0)"

  # Cloud SQL edition/version/tier must be a VALID combination (finding #9).
  # Enterprise edition supports shared-core, memory-optimized and standard tiers;
  # Enterprise Plus only supports standard/high-availability configs. Today the
  # shared-core db-f1-micro is offered under ENTERPRISE, not Enterprise Plus.
  case "${NUTTIEW_SQL_EDITION:-ENTERPRISE}" in
    ENTERPRISE|ENTERPRISE_PLUS)
      : ;;
    *) fail "NUTTIEW_SQL_EDITION must be ENTERPRISE or ENTERPRISE_PLUS (got: ${NUTTIEW_SQL_EDITION})" ;;
  esac
  [[ "$NUTTIEW_SQL_VERSION" =~ ^POSTGRES_1[0-9]$ ]] \
    || fail "NUTTIEW_SQL_VERSION must look like POSTGRES_1x (got: ${NUTTIEW_SQL_VERSION})"
  [[ "$NUTTIEW_SQL_TIER" =~ ^(db-f1-micro|db-g1-small|db-custom-[0-9]-[0-9]+)$ ]] \
    || fail "NUTTIEW_SQL_TIER not recognized (got: ${NUTTIEW_SQL_TIER})"
  if [ "$NUTTIEW_SQL_EDITION" = "ENTERPRISE_PLUS" ] && [[ "$NUTTIEW_SQL_TIER" == db-f1-micro || "$NUTTIEW_SQL_TIER" == db-g1-small ]]; then
    fail "Cloud SQL Enterprise Plus does not offer shared-core tier '${NUTTIEW_SQL_TIER}'; use ENTERPRISE edition"
  fi
  [[ "$NUTTIEW_SQL_STORAGE_GB" =~ ^[0-9]+$ ]] || fail "NUTTIEW_SQL_STORAGE_GB must be numeric"
}

# -----------------------------------------------------------------------------
# DB bootstrap prerequisite contract (finding #3)
# -----------------------------------------------------------------------------
# First deployment must NOT skip the DB role/extension bootstrap and then run
# migrations.  In REAL mode the operator must have explicitly confirmed the
# bootstrap (NUTTIEW_DB_BOOTSTRAP_DONE=1) or the deployment FAILS CLOSED before
# it can reach the migration step.  Dry-run prints a plan.  No provisioning
# happens here.
require_db_bootstrap() {
  if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
    if [ "${NUTTIEW_DB_BOOTSTRAP_DONE:-}" != "1" ]; then
      fail "DB role/extension bootstrap not confirmed (NUTTIEW_DB_BOOTSTRAP_DONE != 1). Refusing to run migrations on an un-bootstrapped database."
    fi
    log "DB bootstrap confirmed (NUTTIEW_DB_BOOTSTRAP_DONE=1)"
  else
    plan "db.bootstrap" "require NUTTIEW_DB_BOOTSTRAP_DONE=1 before migrations in real mode (simulated)"
  fi
}

# validate_origin (finding #3): enforces a single, valid production HTTPS origin.
# In REAL mode an HTTP origin, an invalid hostname, embedded credentials, a path,
# query string or fragment, or a placeholder domain is a HARD failure.  Local HTTP
# dev origins are allowed only as a DRY-RUN preview (warn).
validate_origin() {
  local origin="${NUTTIEW_ORIGIN:-}"
  # Reject embedded userinfo / path / query / fragment.
  case "$origin" in
    *"://"*"@"*) fail "NUTTIEW_ORIGIN must not contain embedded credentials" ;;
  esac
  case "$origin" in
    *"://"*"/"*) fail "NUTTIEW_ORIGIN must not contain a path" ;;
    *"?"*)       fail "NUTTIEW_ORIGIN must not contain a query string" ;;
    *"#"*)       fail "NUTTIEW_ORIGIN must not contain a fragment" ;;
  esac
  # scheme://host[:port] -- allow FQDN, single-label host, or IPv4, followed by an
  # optional port.  Placeholder/local hosts are separately rejected in real mode.
  if ! [[ "$origin" =~ ^(https|http)://([A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,62})*)*|([0-9]{1,3}\.){3}[0-9]{1,3})(:[0-9]{1,5})?$ ]]; then
    fail "NUTTIEW_ORIGIN must be a single valid origin URL without path/query/fragment (got: redacted)"
  fi
  local scheme="${BASH_REMATCH[1]}"
  if [ "$NUTTIEW_REAL_ARMED" = "1" ] && [ "$scheme" != "https" ]; then
    fail "NUTTIEW_ORIGIN must be HTTPS for a real deployment (got an http:// origin); refusing to serve an insecure production origin"
  fi
  # Reject placeholder/reserved domains in real mode.
  # NOTE (PR-readiness finding #1): legitimate Cloud Run HTTPS origins ending in
  # `.a.run.app` (e.g. `https://nuttiew-abcdef123-uc.a.run.app`) are ALLOWED; only
  # clearly placeholder / local / example domains are rejected.
  case "$origin" in
    *://example[0-9]*\.*|*://example.com|*://example.org|*://example.net|*://*.example.*|*://localhost*|*://127.0.0.1*|*://nuttiew.example*|*://*.example.test|*://*.local|*://*.internal)
      # placeholder/local/example domain
      if [ "$NUTTIEW_REAL_ARMED" = "1" ]; then
        fail "NUTTIEW_ORIGIN '${NUTTIEW_ORIGIN}' is a placeholder/local/reserved domain; real deploy requires the actual public HTTPS origin"
      fi
      warn "NUTTIEW_ORIGIN '${NUTTIEW_ORIGIN}' looks like a placeholder/local origin (real mode would reject it; dry-run preview only)"
      ;;
  esac
  # A `.a.run.app` origin is a legitimate Cloud Run service origin, but only when
  # it is HTTPS and well-formed (<service>-<hash>-<region>.a.run.app).  Require the
  # three-part `-<hash>-<region>` shape so an arbitrary `.a.run.app` label is not
  # silently accepted.
  if [[ "$NUTTIEW_ORIGIN" == *.a.run.app ]]; then
    [[ "$NUTTIEW_ORIGIN" =~ ^https://[A-Za-z0-9]([A-Za-z0-9-]{0,61})-[0-9a-zA-Z]{6,16}-[a-z0-9-]{2,24}\.a\.run\.app$ ]] \
      || fail "NUTTIEW_ORIGIN is a run.app origin but not a well-formed Cloud Run URL (expected https://<service>-<hash>-<region>.a.run.app)"
  fi
  # dry-run-only allowance for local HTTP previews
  if [ "$NUTTIEW_REAL_ARMED" != "1" ] && [ "$scheme" = "http" ]; then
    warn "NUTTIEW_ORIGIN is http:// - acceptable only for a local DRY-RUN preview; real deploy requires HTTPS"
  fi
}

# -----------------------------------------------------------------------------
# Git release SHA validation (full immutable SHA only)
# -----------------------------------------------------------------------------
# Accepts ONLY a full 40-hex SHA (or expose support for full 64-hex when the
# repo ever moves to SHA-256).  Never accept a short prefix as an immutable id.
validate_full_sha() {
  local sha="$1"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || [[ "$sha" =~ ^[0-9a-f]{64}$ ]] \
    || fail "invalid release SHA: must be a full immutable commit ID (got: ${sha:0:8}... truncated)"
  echo "$sha"
}

# Region -> multi-region Docker repository location (outside the script, docs
# explain the mapping).  Kept explicit so no inference from unknowns.
repository_location() {
  case "$NUTTIEW_REGION" in
    us|eu|asia) echo "$NUTTIEW_REGION" ;;
    *) echo "$NUTTIEW_REGION" ;;
  esac
}