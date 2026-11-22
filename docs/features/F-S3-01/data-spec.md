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
  to_char(s_clock.evaluated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "evaluatedAt",
  b."id",
  b."currentSlotId" AS "slotId",
  b."customerId",
  to_char(b."startsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",
  to_char(b."endsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
  b."status",
  to_char(b."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
FROM eval_snapshot AS s_clock
LEFT JOIN (
  SELECT b.*
  FROM "Booking" AS b
  INNER JOIN "Slot" AS s
    ON s."id" = b."currentSlotId"
  WHERE s."tutorId" = $1::uuid
    AND b."status" = 'Booked'
) AS b
  ON b."endsAt" <= s_clock.evaluated_at
ORDER BY b."endsAt" DESC NULLS LAST, b."id" DESC NULLS LAST;
```

- `$1` is strictly `principal.userId` (verified Tutor).
- `$2` is `NULL` in production (uses PostgreSQL `statement_timestamp()`) and optionally injected only by a test clock hook (`summaryClock`) for deterministic boundary testing (`VAL-028`/`VAL-029`).
- Because `eval_snapshot` is anchored via `LEFT JOIN`, the query **always returns at least one row** containing the exact `evaluatedAt` used for the `b."endsAt" <= s_clock.evaluated_at` predicate — even when the Tutor has 0 matching Past Booked rows (`b."id" IS NULL`). No second timestamp query is ever issued, guaranteeing that `meta.evaluatedAt`, `pastBookedCount`, and `pastBooked` come from one atomic PostgreSQL statement in both non-empty and empty states (`NFR-016`).
- Application projection filters rows where `row.id !== null`, formats `customerRef = 'CUST-' + row.customerId.slice(0, 8)` (matching `F-S1-05`, never serializing raw `customerId`), and sets `pastBookedCount = pastBooked.length`.

## 3. Final three-category extension (planned for 30 Nov, subject to OD-006 stakeholder confirmation)

The Final query uses the same anchored `eval_snapshot LEFT JOIN` pattern (all owned `Booking` rows where `s."tutorId" = $1::uuid`) in one SQL statement and partitions non-null rows under that single `evaluatedAt` into:
- `upcomingBooked` (`status = 'Booked' AND startsAt > evaluatedAt`, ordered `startsAt ASC, id ASC`)
- `inProgressBooked` (`status = 'Booked' AND startsAt <= evaluatedAt AND endsAt > evaluatedAt`, ordered `startsAt ASC, id ASC`; subject to `OD-006` stakeholder disposition)
- `pastBooked` (`status = 'Booked' AND endsAt <= evaluatedAt`, ordered `endsAt DESC, id DESC`)
- `cancelled` (`status = 'Cancelled'`, ordered `cancelledAt DESC, id DESC`; omits `tutorCancellationReason`)

Every category count equals its corresponding list length under the exact same `evaluatedAt` snapshot.
