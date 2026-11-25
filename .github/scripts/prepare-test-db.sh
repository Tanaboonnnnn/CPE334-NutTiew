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
CREATE ROLE nuttiew_ci_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
CREATE ROLE nuttiew_ci_booking_probe LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
GRANT CONNECT ON DATABASE nuttiew_ci TO nuttiew_ci_runtime, nuttiew_ci_booking_probe;
GRANT USAGE ON SCHEMA public TO nuttiew_ci_runtime, nuttiew_ci_booking_probe;
GRANT SELECT, INSERT, UPDATE, DELETE ON
  "User", "Session", "AuthAttemptBucket", "AuthAttemptReservation"
  TO nuttiew_ci_runtime;
GRANT SELECT, INSERT ON "Slot", "Booking" TO nuttiew_ci_runtime;
-- PostgreSQL requires UPDATE privilege on at least one Slot column for SELECT FOR UPDATE.
-- Slot trigger still rejects every UPDATE; this column grant exists only to acquire row locks.
GRANT UPDATE ("id") ON "Slot" TO nuttiew_ci_runtime;
GRANT SELECT ON "Slot" TO nuttiew_ci_booking_probe;
-- The probe may attempt the lifecycle transition so the S2 trigger itself,
-- rather than a missing column privilege, proves the one-way guard.
GRANT UPDATE ("lifecycle", "withdrawnAt") ON "Slot" TO nuttiew_ci_booking_probe;

-- Probe role can issue forbidden DML so BDF tests prove the DB trigger itself.
-- It is not an owner and has no DDL, trigger-disable or replication bypass.
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON "Booking" TO nuttiew_ci_booking_probe;

-- CI creates runtime *after* migrate deploy. Keep S1-only CI working while
-- completing the same narrow grants as the S2 migration when it is installed.
DO $grants$
BEGIN
  IF pg_catalog.to_regprocedure('public.s2_mutate(text,uuid,uuid,uuid,uuid,text)') IS NOT NULL THEN
    -- These roles/variables are disposable CI-only; preserve S1 test defaults.
    CREATE ROLE nuttiew_s2_fixture LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION;
    GRANT CONNECT ON DATABASE nuttiew_ci TO nuttiew_s2_fixture;
    GRANT USAGE ON SCHEMA public TO nuttiew_s2_fixture;
    GRANT SELECT, INSERT ON public."Booking" TO nuttiew_s2_fixture;
    GRANT SELECT ON public."RescheduleHistory", public."Notification" TO nuttiew_ci_runtime;
    GRANT EXECUTE ON FUNCTION public.s2_mutate(text,uuid,uuid,uuid,uuid,text) TO nuttiew_ci_runtime;
  END IF;
END;
$grants$;
SQL

# Assert on a fresh connection as the actual non-owner login, not the admin.
psql "postgresql://nuttiew_ci_runtime@127.0.0.1:5432/nuttiew_ci" --set ON_ERROR_STOP=1 <<'SQL'
DO $verify$
DECLARE mutation oid := pg_catalog.to_regprocedure('public.s2_mutate(text,uuid,uuid,uuid,uuid,text)');
BEGIN
  IF current_user <> 'nuttiew_ci_runtime' THEN RAISE EXCEPTION 'Unexpected runtime login'; END IF;
  IF mutation IS NOT NULL AND NOT pg_catalog.has_function_privilege(current_user, mutation, 'EXECUTE') THEN
    RAISE EXCEPTION 'CI runtime cannot execute s2_mutate';
  END IF;
END;
$verify$;
SQL

candidate=$(psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -Atc "SELECT pg_catalog.to_regprocedure('public.s2_mutate(text,uuid,uuid,uuid,uuid,text)') IS NOT NULL")
if [[ "$candidate" == t ]]; then
  echo 'S2_REGRESSION_SCHEMA=candidate' >> "$GITHUB_ENV"
  echo 'S2_FIXTURE_DATABASE_URL=postgresql://nuttiew_s2_fixture@127.0.0.1:5432/nuttiew_ci' >> "$GITHUB_ENV"
  psql "$DATABASE_URL" --set ON_ERROR_STOP=1 -c "ALTER DATABASE nuttiew_ci SET nuttiew.review_instance = 'github-actions'"
  echo 'S2_REVIEW_DATABASE_URL=postgresql://nuttiew_ci_runtime@127.0.0.1:5432/nuttiew_ci' >> "$GITHUB_ENV"
  echo 'S2_PROBE_DATABASE_URL=postgresql://nuttiew_ci_booking_probe@127.0.0.1:5432/nuttiew_ci' >> "$GITHUB_ENV"
  echo 'S2_REVIEW_DB_NAME=nuttiew_ci' >> "$GITHUB_ENV"
  echo 'S2_REVIEW_INSTANCE=github-actions' >> "$GITHUB_ENV"
fi

# Real API and all normal HTTP tests now run as non-owner, so disabling Slot
# triggers or mutating protected rows via DDL/UPDATE/DELETE is impossible.
echo "DATABASE_URL_APP=postgresql://nuttiew_ci_runtime@127.0.0.1:5432/nuttiew_ci" >> "$GITHUB_ENV"
echo "DATABASE_URL_BOOKING_PROBE=postgresql://nuttiew_ci_booking_probe@127.0.0.1:5432/nuttiew_ci" >> "$GITHUB_ENV"
echo "Configured disposable PostgreSQL runtime and Booking guard-probe roles; runtime has no Booking UPDATE/DELETE/TRUNCATE, probe has DML only and no trigger/DDL bypass."
