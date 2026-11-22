# F-S3-01 — Tutor Appointment Summary Data & Query Contract (Part E)

> **Read-only query contract; no new table, column, trigger, or migration is required.**

## 1. Authoritative source tables

- `public."Booking"` (`id`, `customerId`, `currentSlotId`, `startsAt`, `endsAt`, `status`, `cancellationActor`, `cancelledAt`, `createdAt`)
- `public."Slot"` (`id`, `tutorId`)

**No schema migration:** All required columns exist in the accepted Sprint 1 + Sprint 2 (`#128`) schema. `Booking` never stores a `Completed` state (`BR-030`).

## 2. Single-snapshot SQL projection (D2 Past Booked increment)

```sql
WITH eval_snapshot AS (
  SELECT COALESCE($2::timestamptz, statement_timestamp()) AS evaluated_at
)
SELECT
  b."id",
  b."currentSlotId" AS "slotId",
  b."customerId",
  to_char(b."startsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",
  to_char(b."endsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
  b."status",
  to_char(b."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
  to_char(s_clock.evaluated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "evaluatedAt"
FROM eval_snapshot AS s_clock
CROSS JOIN "Booking" AS b
INNER JOIN "Slot" AS s
  ON s."id" = b."currentSlotId"
WHERE s."tutorId" = $1::uuid
  AND b."status" = 'Booked'
  AND b."endsAt" <= s_clock.evaluated_at
ORDER BY b."endsAt" DESC, b."id" DESC;
```

- `$1` is strictly `principal.userId` (verified Tutor).
- `$2` is `NULL` in production (uses PostgreSQL `statement_timestamp()`) and optionally injected only by a test clock hook (`summaryClock`) for deterministic boundary testing (`VAL-028`/`VAL-029`).
- `pastBookedCount` is derived directly from the returned row set (`rows.length`) under the exact same `evaluated_at` snapshot, guaranteeing `pastBookedCount === pastBooked.length` (`NFR-016`).
- When the Tutor has 0 matching rows, `evaluatedAt` is fetched from PostgreSQL `statement_timestamp()` (or injected test clock) and `pastBookedCount = 0`, `pastBooked = []`.
- `customerRef` is formatted in application code as `'CUST-' + row.customerId.slice(0, 8)` (matching `F-S1-05`); `customerId` is never serialized in the HTTP response.

## 3. Final three-category extension (planned for 30 Nov)

The Final query will project all owned Bookings (`s."tutorId" = $1::uuid`) against one `eval_snapshot` CTE and partition in SQL/application into `upcomingBooked` (`status='Booked' AND startsAt > evaluated_at`), `inProgressBooked` (`status='Booked' AND startsAt <= evaluated_at AND endsAt > evaluated_at`, per `OD-006`), `pastBooked` (`status='Booked' AND endsAt <= evaluated_at`), and `cancelled` (`status='Cancelled'`), still guaranteeing every category count equals its corresponding list length under the same snapshot.
