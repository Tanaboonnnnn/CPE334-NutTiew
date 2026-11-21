#!/usr/bin/env bash
# Review only: use the pre-provisioned databases in the disposable Docker instance.
set -euo pipefail
[[ "$S2_REVIEW_CONTAINER" =~ ^[0-9a-f]{64}$ ]]
[[ "$(docker inspect -f '{{.Id}} {{.HostConfig.AutoRemove}}' nuttiew-s2-migration-review)" == "$S2_REVIEW_CONTAINER true" ]]
[[ "$(docker port "$S2_REVIEW_CONTAINER" 5432/tcp)" == '127.0.0.1:15439' ]]
probe=$(node -p "require('crypto').randomBytes(24).toString('hex')")
fixture=$(node -p "require('crypto').randomBytes(24).toString('hex')")
docker exec -i "$S2_REVIEW_CONTAINER" psql -q -v ON_ERROR_STOP=1 -U postgres -d nuttiew_s2_pair_final -v probe="$probe" -v fixture="$fixture" <<'SQL'
ALTER ROLE s2_review_probe PASSWORD :'probe';
ALTER ROLE nuttiew_s2_fixture PASSWORD :'fixture';
SQL
# Unique database names; never reset or drop an existing database.
suffix=$(node -p "require('crypto').randomBytes(5).toString('hex')")
baseline=nuttiew_s2_pair_a_$suffix
candidate=nuttiew_s2_pair_final_$suffix
instance=s2_$suffix
draft=apps/api/prisma/migrations/20261110000000_s2_shared_transition_foundation/migration.sql
psql_review() {
  docker exec -i "$S2_REVIEW_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres "$@"
}
apply() {
  (printf 'SET ROLE s2_review_owner;\n'; tr -d '\r' < "$2") | psql_review -q -d "$1"
}
check_s1() {
  [[ "$(psql_review -At -d "$1" -c "SELECT to_regclass('public.s2_slot_guard') IS NULL AND to_regprocedure('public.s2_mutate(text,uuid,uuid,uuid,uuid,text)') IS NULL AND EXISTS (SELECT FROM pg_trigger WHERE tgname='booking_s1_row_guard') AND NOT EXISTS (SELECT FROM information_schema.columns WHERE table_schema='public' AND table_name='Booking' AND column_name='cancellationActor')")" == t ]]
}
for d in "$baseline" "$candidate"; do
  docker exec "$S2_REVIEW_CONTAINER" createdb -U postgres -O s2_review_owner "$d"
  # The candidate is in Prisma migrations for PR CI. Keep the paired runner's
  # baseline at S1, then apply this exact candidate only to the S2 side.
  for f in apps/api/prisma/migrations/*/migration.sql; do
    if [[ "$f" == "$draft" ]]; then continue; fi
    apply "$d" "$f"
  done
  psql_review -q -d "$d" <<'SQL'
GRANT SELECT,INSERT ON "Slot","Booking" TO nuttiew_ci_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON "User","Session","AuthAttemptBucket","AuthAttemptReservation" TO nuttiew_ci_runtime;
GRANT UPDATE ("id") ON "Slot" TO nuttiew_ci_runtime;
GRANT SELECT,UPDATE ON "Slot" TO s2_review_probe;
GRANT SELECT,INSERT,UPDATE,DELETE,TRUNCATE ON "Booking" TO s2_review_probe;
SQL
done
# Insert deliberate failure immediately before COMMIT in a streamed test copy.
fault_log=$(mktemp)
if (printf 'SET ROLE s2_review_owner;\n'; tr -d '\r' < "$draft" | awk '/^COMMIT;$/ { print "SELECT 1/0;" } { print }') | psql_review -q -d "$candidate" > "$fault_log" 2>&1; then
  echo 'Expected late DDL failure' >&2; exit 1
fi
[[ "$(awk '/division by zero/ { found=1 } END { print found+0 }' "$fault_log")" == 1 ]]
check_s1 "$candidate"
echo "Late DDL rollback PASS: $fault_log"
apply "$candidate" "$draft"
psql_review -q -d "$candidate" -c "ALTER DATABASE $candidate SET nuttiew.review_instance TO $instance"
psql_review -q -d "$candidate" <<'SQL'
GRANT SELECT,INSERT ON "Booking" TO nuttiew_s2_fixture;
SQL
printf 'Fresh replay PASS: %s / %s\n' "$baseline" "$candidate"
runner=0
for side in baseline candidate; do
  if [[ "$side" == baseline ]]; then
    d=$baseline
    unset S2_FIXTURE_DATABASE_URL
  else
    d=$candidate
    export S2_FIXTURE_DATABASE_URL="postgresql://nuttiew_s2_fixture:$fixture@127.0.0.1:15439/$d"
  fi
  export DATABASE_URL="postgresql://postgres:$S2_REVIEW_DB_PASSWORD@127.0.0.1:15439/$d"
  export DATABASE_URL_APP="postgresql://nuttiew_ci_runtime:$S2_REVIEW_DB_PASSWORD@127.0.0.1:15439/$d"
  export DATABASE_URL_BOOKING_PROBE="postgresql://s2_review_probe:$probe@127.0.0.1:15439/$d"
  export S2_REGRESSION_SCHEMA="$side"
  export AUTH_CSRF_HMAC_KEY=$(node -p "require('crypto').randomBytes(32).toString('hex')")
  export AUTH_RATE_KEY=$(node -p "require('crypto').randomBytes(32).toString('hex')")
  log=$(mktemp)
  status=0
  npm run test:db > "$log" 2>&1 || status=$?
  printf '%s exit=%s log=%s\n' "$side" "$status" "$log"
  awk '/ FAIL |Test Files |Tests  /' "$log"
  if [[ "$status" != 0 ]]; then runner=1; fi
  if [[ "$side" == candidate ]]; then
    S2_REVIEW_INSTANCE="$instance" S2_REVIEW_DB_NAME="$d" S2_REVIEW_DATABASE_URL="$DATABASE_URL_APP" S2_PROBE_DATABASE_URL="$DATABASE_URL_BOOKING_PROBE" \
      node node_modules/vitest/vitest.mjs run apps/api/test/s2.shared-migration.db.test.ts || runner=1
    npx prisma migrate diff --config apps/api/prisma.config.ts --from-config-datasource --to-schema apps/api/prisma/schema.prisma --exit-code || runner=1
  fi
done
if [[ "$runner" == 0 ]]; then
  count_sql="SELECT count(*) FROM public.\"Booking\" WHERE status='Cancelled'"
  before=$(psql_review -At -d "$baseline" -c "$count_sql")
  [[ "$before" -gt 0 ]]
  refusal_log=$(mktemp)
  if apply "$baseline" "$draft" > "$refusal_log" 2>&1; then echo 'Expected legacy refusal' >&2; exit 1; fi
  [[ "$(awk '/S2 migration refused/ { found=1 } END { print found+0 }' "$refusal_log")" == 1 ]]
  check_s1 "$baseline"
  [[ "$(psql_review -At -d "$baseline" -c "$count_sql")" == "$before" ]]
  echo "Legacy refusal PASS: $before rows retained; $refusal_log"
fi
exit "$runner"
