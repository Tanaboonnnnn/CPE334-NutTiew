# F-S1-05 — Protected Booking Retrieval Data Contract (Part E)

> **Documentation contract only; not implemented yet.**
> Issue [#17](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/17). This document defines the read-only database queries, data projection models, privacy transformations, and consistency guarantees for F-S1-05.

---

## 1. Schema Authority and Read-Only Boundary

F-S1-05 introduces **zero database schema modifications**, zero new tables, zero new columns, and zero migrations. It reads from the existing canonical tables established in `F-S1-01` (Auth), `F-S1-02` (Slots), and `D1-08A/B` (Booking Data Foundation):

- `"User"`: Authentication identity, roles (`Customer`, `Tutor`), account status (`isActive`).
- `"Slot"`: 60-minute appointment windows (`startsAt`, `endsAt`), owner reference (`tutorId`), lifecycle (`Offered`, `Withdrawn`).
- `"Booking"`: Committed reservations (`id`, `customerId`, `currentSlotId`, `startsAt`, `endsAt`, `status`, `createdAt`, `updatedAt`).

All database access in F-S1-05 consists of pure `SELECT` queries executed at PostgreSQL's default `READ COMMITTED` isolation level against the committed MVCC state. No transaction locks (`FOR UPDATE` or `FOR SHARE`) are acquired.

---

## 2. Server-Authoritative Queries and Projections

### 2.1 Customer: List Own Bookings
Retrieves all Bookings belonging strictly to the authenticated Customer (`customerId = principal.userId`). All rows in the query share a single uniform evaluation snapshot derived via `statement_timestamp()`:

```sql
WITH eval_snapshot AS (
  SELECT statement_timestamp() AT TIME ZONE 'UTC' AS evaluated_at
)
SELECT
  b."id",
  b."currentSlotId" AS "slotId",
  s."tutorId",
  to_char(b."startsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",
  to_char(b."endsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
  b."status",
  to_char(b."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
  CASE
    WHEN b."endsAt" <= s_clock.evaluated_at THEN 'Past'
    ELSE 'Booked'
  END AS "displayStatus",
  to_char(s_clock.evaluated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "evaluatedAt"
FROM eval_snapshot AS s_clock
CROSS JOIN "Booking" AS b
INNER JOIN "Slot" AS s ON s."id" = b."currentSlotId"
WHERE b."customerId" = $1
ORDER BY b."startsAt" ASC, b."id" ASC;
```

**Data Mapping Rules:**
- `tutorRef`: Generated as `"TUTOR-" + row.tutorId.slice(0, 8)`.
- `displayStatus`: Derived conditionally in SQL relative to `s_clock.evaluated_at`. If `endsAt <= evaluated_at`, `displayStatus = 'Past'`; otherwise `'Booked'`. Database `status` remains strictly `'Booked'`.
- `meta.evaluatedAt`: In multi-row results, the uniform `evaluatedAt` string is extracted for `meta.evaluatedAt`. When the query returns 0 rows (`data: []`), the application service captures `statement_timestamp()` (or an explicit evaluation snapshot) so that `meta.evaluatedAt` is always populated as a valid ISO-8601 UTC timestamp.

---

### 2.2 Customer: Get Single Booking Detail
Retrieves one specific Booking by ID, strictly verifying ownership (`b."id" = $1 AND b."customerId" = $2`), using the same single statement evaluation timestamp:

```sql
WITH eval_snapshot AS (
  SELECT statement_timestamp() AT TIME ZONE 'UTC' AS evaluated_at
)
SELECT
  b."id",
  b."currentSlotId" AS "slotId",
  s."tutorId",
  to_char(b."startsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",
  to_char(b."endsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
  b."status",
  to_char(b."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
  to_char(b."updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt",
  CASE
    WHEN b."endsAt" <= s_clock.evaluated_at THEN 'Past'
    ELSE 'Booked'
  END AS "displayStatus",
  to_char(s_clock.evaluated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "evaluatedAt"
FROM eval_snapshot AS s_clock
CROSS JOIN "Booking" AS b
INNER JOIN "Slot" AS s ON s."id" = b."currentSlotId"
WHERE b."id" = $1 AND b."customerId" = $2;
```

**Refusal Policy:**
If the query returns 0 rows, the application throws `BookingError(404, 'BOOKING_NOT_FOUND')`. This completely prevents an attacker from guessing Booking UUIDs to verify their existence.

---

### 2.3 Tutor: List Own Slots with Dynamic Occupancy
Replaces the hardcoded `'Unoccupied'` in `listOwnSlots` with an active `Booking` lookup:

```sql
SELECT
  s."id",
  to_char(s."startsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",
  to_char(s."endsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
  s."lifecycle",
  CASE
    WHEN b."id" IS NOT NULL THEN 'Occupied'
    ELSE 'Unoccupied'
  END AS "occupancy"
FROM "Slot" AS s
LEFT JOIN "Booking" AS b
  ON b."currentSlotId" = s."id" AND b."status" = 'Booked'
WHERE s."tutorId" = $1
ORDER BY s."startsAt" ASC, s."id" ASC;
```

---

### 2.4 Tutor: List Schedule Bookings
Retrieves all Bookings scheduled on Slots owned by the authenticated Tutor (`s."tutorId" = $1`), evaluated against a single statement evaluation timestamp:

```sql
WITH eval_snapshot AS (
  SELECT statement_timestamp() AT TIME ZONE 'UTC' AS evaluated_at
)
SELECT
  b."id",
  b."currentSlotId" AS "slotId",
  s."tutorId",
  b."customerId",
  to_char(b."startsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",
  to_char(b."endsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
  b."status",
  to_char(b."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
  CASE
    WHEN b."endsAt" <= s_clock.evaluated_at THEN 'Past'
    ELSE 'Booked'
  END AS "displayStatus",
  to_char(s_clock.evaluated_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "evaluatedAt"
FROM eval_snapshot AS s_clock
CROSS JOIN "Booking" AS b
INNER JOIN "Slot" AS s ON s."id" = b."currentSlotId"
WHERE s."tutorId" = $1 AND b."status" = 'Booked'
ORDER BY b."startsAt" ASC, b."id" ASC;
```

**Privacy Masking and Pseudonymity:**
- The raw `customerId` column is projected in backend SQL only to construct the pseudonymous truncated reference `customerRef: "CUST-" + row.customerId.slice(0, 8)`.
- This truncated pseudonymous reference provides data minimization for the Tutor schedule view by withholding customer personal identifiers (name, email, phone) and isolating customer UUIDs from the Tutor wire DTO. It is not an irreversible cryptographic anonymization.
- The raw `customerId` UUID is **strictly excluded** from the serialized HTTP JSON response DTO.

---

## 3. Data Integrity and Privacy Invariants

| Invariant | Description |
|---|---|
| **No Schema Drift** | The canonical database schema remains untouched. |
| **No Cross-Customer Leaks** | Customer queries use `WHERE b."customerId" = $1` with parameterized SQL; cross-customer access is physically impossible. |
| **No Cross-Tutor Leaks** | Tutor queries use `WHERE s."tutorId" = $1`; one Tutor can never inspect another Tutor's schedule. |
| **No Secret Columns in DTO** | The fields `passwordHash`, `tokenDigest`, `csrfNonce`, and internal error traces are never selected. |
| **Immutable Past Records** | Elapsed appointments are computed dynamically via `endsAt <= evaluatedAt`; no database mutation occurs. |
