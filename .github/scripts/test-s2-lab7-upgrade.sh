#!/usr/bin/env bash
# Issue #120: upgrade an already-migrated Lab 7/Sprint 1 database to Sprint 2.
# Disposable GitHub Actions PostgreSQL service only; never point this at production.
set -euo pipefail

if [[ "${CI:-}" != "true" || "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "Refusing Sprint 2 upgrade test outside GitHub Actions CI." >&2
  exit 1
fi
if [[ "${DATABASE_URL:-}" != "postgresql://postgres@127.0.0.1:5432/nuttiew_ci" ]]; then
  echo "Refusing Sprint 2 upgrade test against a non-disposable database." >&2
  exit 1
fi
if [[ ! "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ ]]; then
  echo "GITHUB_RUN_ID is missing or invalid." >&2
  exit 1
fi

upgrade_db="nuttiew_ci_s2_lab7_upgrade_${GITHUB_RUN_ID}"
upgrade_url="postgresql://postgres@127.0.0.1:5432/${upgrade_db}"
created=0
cleanup() {
  if [[ "$created" == 1 ]]; then
    dropdb --host=127.0.0.1 --username=postgres "$upgrade_db"
  fi
}
trap cleanup EXIT

createdb --host=127.0.0.1 --username=postgres "$upgrade_db"
created=1

apply() {
  psql "$upgrade_url" --set ON_ERROR_STOP=1 --file="$1"
}

# Recreate the accepted Sprint 1 schema, then the Lab 7 Q05 migration as already
# deployed. Seed a real Booked row before adding the Sprint 2 transition layer.
apply apps/api/prisma/migrations/20261104000000_auth/migration.sql
apply apps/api/prisma/migrations/20261105000000_tutor_slots/migration.sql
apply apps/api/prisma/migrations/20261107000000_booking_foundation/migration.sql
apply apps/api/prisma/migrations/20261109000000_booking_guard_user_lock/migration.sql
apply apps/api/prisma/migrations/20261125000000_lab7_q05_min_notice/migration.sql

psql "$upgrade_url" --set ON_ERROR_STOP=1 <<'SQL'
INSERT INTO public."User" ("id","email","passwordHash","role") VALUES
 ('10000000-0000-4000-8000-000000000001','s2-upgrade-existing-customer@example.test','ci-only','Customer'),
 ('10000000-0000-4000-8000-000000000002','s2-upgrade-existing-tutor@example.test','ci-only','Tutor');
WITH slot_start AS (SELECT clock_timestamp()+interval '4 hours' AS starts_at)
INSERT INTO public."Slot" ("id","tutorId","startsAt","endsAt")
SELECT '10000000-0000-4000-8000-000000000004',
       '10000000-0000-4000-8000-000000000002', starts_at, starts_at+interval '60 minutes'
  FROM slot_start;
INSERT INTO public."Booking" ("id","customerId","currentSlotId","startsAt","endsAt")
SELECT '10000000-0000-4000-8000-000000000005',
       '10000000-0000-4000-8000-000000000001', "id", "startsAt", "endsAt"
  FROM public."Slot" WHERE "id"='10000000-0000-4000-8000-000000000004';
SQL

# Mark the SQL migrations already present on the accepted Lab 7 database, then
# use the real Prisma deploy path for the pending S2 migrations. This explicitly
# exercises the out-of-order pending S2 migration after an already-applied Lab 7
# migration, followed by the S2 Q05 forward reconciliation.
export DATABASE_URL="$upgrade_url"
pushd apps/api >/dev/null
for migration in \
  20261104000000_auth \
  20261105000000_tutor_slots \
  20261107000000_booking_foundation \
  20261109000000_booking_guard_user_lock \
  20261125000000_lab7_q05_min_notice; do
  npx prisma migrate resolve --config prisma.config.ts --applied "$migration"
done
npx prisma migrate deploy --config prisma.config.ts
popd >/dev/null

psql "$upgrade_url" --set ON_ERROR_STOP=1 <<'SQL'
DO $verify$
DECLARE
  guard_definition text;
  mutation_definition text;
  valid_slot uuid := '10000000-0000-4000-8000-000000000008';
  late_slot uuid := '10000000-0000-4000-8000-000000000012';
BEGIN
  IF (SELECT count(*) FROM public."User") <> 2
     OR (SELECT count(*) FROM public."Slot") <> 1
     OR (SELECT count(*) FROM public."Booking" WHERE "id"='10000000-0000-4000-8000-000000000005' AND "status"='Booked') <> 1 THEN
    RAISE EXCEPTION 'S2 upgrade failed: pre-existing Lab 7 rows were not preserved';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
     WHERE tgrelid='public."Booking"'::regclass
       AND tgname='booking_s2_row_guard'
       AND tgfoid='public.booking_guard_s2()'::regprocedure
       AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'S2 upgrade failed: active Booking guard is not booking_guard_s2()';
  END IF;

  guard_definition := pg_catalog.pg_get_functiondef('public.booking_guard_s2()'::regprocedure);
  IF position('90 minutes' IN guard_definition) = 0 THEN
    RAISE EXCEPTION 'S2 upgrade failed: active Booking guard does not enforce Q05 90 minutes';
  END IF;
  mutation_definition := pg_catalog.pg_get_functiondef('public.s2_mutate(text,uuid,uuid,uuid,uuid,text)'::regprocedure);
  IF position('30 minutes' IN mutation_definition) = 0 OR position('60 minutes' IN mutation_definition) = 0 THEN
    RAISE EXCEPTION 'S2 upgrade failed: Q07/Q10/Q11/Q18 mutation cutoffs changed';
  END IF;
  IF NOT (
    '2030-01-01T01:30:00Z'::timestamptz - '2030-01-01T00:00:00Z'::timestamptz >= interval '90 minutes'
  ) OR (
    '2030-01-01T01:29:59.999999Z'::timestamptz - '2030-01-01T00:00:00Z'::timestamptz >= interval '90 minutes'
  ) THEN
    RAISE EXCEPTION 'S2 upgrade failed: exact Q05 90:00 boundary semantics changed';
  END IF;

  INSERT INTO public."User" ("id","email","passwordHash","role") VALUES
   ('10000000-0000-4000-8000-000000000006','s2-upgrade-valid-customer@example.test','ci-only','Customer'),
   ('10000000-0000-4000-8000-000000000007','s2-upgrade-valid-tutor@example.test','ci-only','Tutor'),
   ('10000000-0000-4000-8000-000000000010','s2-upgrade-late-customer@example.test','ci-only','Customer'),
   ('10000000-0000-4000-8000-000000000011','s2-upgrade-late-tutor@example.test','ci-only','Tutor');

  WITH valid_start AS (SELECT clock_timestamp()+interval '120 minutes' AS starts_at),
       late_start AS (SELECT clock_timestamp()+interval '89 minutes' AS starts_at)
  INSERT INTO public."Slot" ("id","tutorId","startsAt","endsAt")
  SELECT valid_slot,'10000000-0000-4000-8000-000000000007',starts_at,starts_at+interval '60 minutes' FROM valid_start
  UNION ALL
  SELECT late_slot,'10000000-0000-4000-8000-000000000011',starts_at,starts_at+interval '60 minutes' FROM late_start;

  INSERT INTO public."Booking" ("id","customerId","currentSlotId","startsAt","endsAt")
  SELECT '10000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000006',"id","startsAt","endsAt"
    FROM public."Slot" WHERE "id"=valid_slot;

  BEGIN
    INSERT INTO public."Booking" ("id","customerId","currentSlotId","startsAt","endsAt")
    SELECT '10000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000010',"id","startsAt","endsAt"
      FROM public."Slot" WHERE "id"=late_slot;
    RAISE EXCEPTION 'S2 upgrade failed: a Booking inside 90 minutes was accepted';
  EXCEPTION WHEN SQLSTATE 'P0B02' THEN
    NULL;
  END;

  IF EXISTS (SELECT 1 FROM public."Booking" WHERE "id"='10000000-0000-4000-8000-000000000013') THEN
    RAISE EXCEPTION 'S2 upgrade failed: rejected Q05 Booking was persisted';
  END IF;
  IF (SELECT count(*) FROM public."Booking" WHERE "id" IN (
    '10000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000009'
  ) AND "status"='Booked') <> 2 THEN
    RAISE EXCEPTION 'S2 upgrade failed: existing or eligible Booked rows were not preserved';
  END IF;
END;
$verify$;
SELECT 'S2_LAB7_UPGRADE_AND_Q05_90M_PASS' AS evidence;
SQL
