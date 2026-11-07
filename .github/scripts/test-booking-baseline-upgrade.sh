#!/usr/bin/env bash
# BDF-02: reproduce the exact pre-Booking sprint1 schema, preserve sentinel rows,
# then apply the new forward-only Booking migration. Disposable GitHub CI only.
set -euo pipefail

if [[ "${CI:-}" != "true" || "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "Refusing baseline-upgrade test outside GitHub Actions CI." >&2
  exit 1
fi
if [[ "${DATABASE_URL:-}" != "postgresql://postgres@127.0.0.1:5432/nuttiew_ci" ]]; then
  echo "Refusing baseline-upgrade test against a non-disposable database." >&2
  exit 1
fi

upgrade_url="postgresql://postgres@127.0.0.1:5432/nuttiew_ci_upgrade"
createdb --host=127.0.0.1 --username=postgres nuttiew_ci_upgrade

psql "$upgrade_url" --set ON_ERROR_STOP=1 --file=apps/api/prisma/migrations/20261104000000_auth/migration.sql
psql "$upgrade_url" --set ON_ERROR_STOP=1 --file=apps/api/prisma/migrations/20261105000000_tutor_slots/migration.sql

# Seed pre-existing Auth/Slot data before applying the Booking migration.
psql "$upgrade_url" --set ON_ERROR_STOP=1 <<'SQL'
INSERT INTO "User" ("id","email","passwordHash","role")
VALUES
 ('10000000-0000-4000-8000-000000000001','bdf-upgrade-customer@example.test','test-only','Customer'),
 ('10000000-0000-4000-8000-000000000002','bdf-upgrade-tutor@example.test','test-only','Tutor');
INSERT INTO "Session" ("id","userId","tokenDigest","csrfNonce","expiresAt")
VALUES ('10000000-0000-4000-8000-000000000003',
        '10000000-0000-4000-8000-000000000001',
        decode(repeat('11',32),'hex'), decode(repeat('22',32),'hex'),
        clock_timestamp()+interval '8 hours');
WITH slot_start AS (
  SELECT clock_timestamp()+interval '3 hours' AS starts_at
)
INSERT INTO "Slot" ("id","tutorId","startsAt","endsAt")
SELECT '10000000-0000-4000-8000-000000000004',
       '10000000-0000-4000-8000-000000000002',
       starts_at, starts_at+interval '60 minutes'
FROM slot_start;
SQL

psql "$upgrade_url" --set ON_ERROR_STOP=1 --file=apps/api/prisma/migrations/20261107000000_booking_foundation/migration.sql

psql "$upgrade_url" --set ON_ERROR_STOP=1 <<'SQL'
DO $$
BEGIN
  IF (SELECT count(*) FROM "User") <> 2 THEN
    RAISE EXCEPTION 'BDF-02 failed: pre-existing User rows were not preserved';
  END IF;
  IF (SELECT count(*) FROM "Session") <> 1 THEN
    RAISE EXCEPTION 'BDF-02 failed: pre-existing Session row was not preserved';
  END IF;
  IF (SELECT count(*) FROM "Slot") <> 1 THEN
    RAISE EXCEPTION 'BDF-02 failed: pre-existing Slot row was not preserved';
  END IF;
  IF to_regclass('"Booking"') IS NULL THEN
    RAISE EXCEPTION 'BDF-02 failed: Booking table was not installed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgrelid='"Booking"'::regclass AND tgname='booking_s1_truncate_guard'
  ) THEN
    RAISE EXCEPTION 'BDF-02 failed: Booking TRUNCATE guard missing';
  END IF;
END;
$$;
SELECT 'BDF-02_BASELINE_UPGRADE_PASS' AS evidence;
SQL

dropdb --host=127.0.0.1 --username=postgres nuttiew_ci_upgrade
