#!/usr/bin/env bash
# CI-only PostgreSQL role setup, reusable by the integration and browser jobs.
set -euo pipefail

if [[ "${CI:-}" != "true" || "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "Refusing to configure runtime roles outside GitHub Actions CI." >&2
  exit 1
fi

# Guard against accidentally granting privileges in a real or shared DB.
expected="postgresql://postgres@127.0.0.1:5432/nuttiew_ci"
if [[ "${DATABASE_URL:-}" != "$expected" ]]; then
  echo "Refusing to configure any DB other than disposable CI nuttiew_ci." >&2
  exit 1
fi
if [[ -z "${GITHUB_ENV:-}" ]]; then
  echo "GITHUB_ENV is missing." >&2
  exit 1
fi

# Passwordless trust is intentionally limited to the ephemeral postgres:18
# service on a disposable, GitHub-hosted runner; production must use
# authenticated and least-privilege DB connections.
psql "$DATABASE_URL" --set ON_ERROR_STOP=1 <<'SQL'
CREATE ROLE nuttiew_ci_runtime LOGIN;
GRANT CONNECT ON DATABASE nuttiew_ci TO nuttiew_ci_runtime;
GRANT USAGE ON SCHEMA public TO nuttiew_ci_runtime;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "User", "Session", "AuthAttemptBucket", "AuthAttemptReservation"
  TO nuttiew_ci_runtime;
GRANT SELECT, INSERT ON "Slot" TO nuttiew_ci_runtime;
SQL

# Real API and all normal HTTP tests now run as non-owner, so disabling Slot
# triggers or mutating protected rows via DDL/UPDATE/DELETE is impossible.
echo "DATABASE_URL_APP=postgresql://nuttiew_ci_runtime@127.0.0.1:5432/nuttiew_ci" >> "$GITHUB_ENV"
echo "Configured disposable PostgreSQL runtime role with no Slot DDL/UPDATE/DELETE/TRUNCATE."
