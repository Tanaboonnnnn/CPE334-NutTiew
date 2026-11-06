# F-S1-03 — Customer Availability Data Contract (Part E)

> **Logical read contract only.** No Prisma model, SQL migration, Booking table, index or runtime query is created here. See [Feature SDS](specification.md), [API](api-spec.md), [UI](ui-spec.md) and [STS](tests.md).

## 1. Existing records at the Part E base

Verified sprint1 base: 551a9469e3d3a7e8e3ae004a382862c4f3e87e0e.

| Record | Relevant fields | F-S1-03 use |
|---|---|---|
| User | id, role, isActive | Source of opaque Tutor reference; no email/profile is exposed |
| Slot | id, tutorId, startsAt, endsAt, lifecycle | Candidate offer, owner and UTC interval |
| Session | persisted user/session/expiry/revocation data | Auth middleware derives Customer principal; Session fields never enter response |
| Booking | **Not present in current Prisma schema/migrations** | Required future occupancy source; see §2 |

The current Slot table has a Tutor owner index (tutorId, startsAt, id), but no isBooked column. The Tutor own-list DTO temporarily returns occupancy Unoccupied because #16 has not introduced Booking; that is not a valid Customer-availability occupancy source after Booking exists.

## 2. Booking relationship and sequencing gate

The System SDS describes Booking fields including customerId, currentSlotId, startsAt, endsAt and business status (Booked or later Cancelled). A current S1 Booked row is an Active Booking and occupies its referenced Slot. The reviewed #16 schema foundation must expose these persisted fields so #15 can check both Slot occupancy and Customer-specific overlap; #15 still does not create or mutate Booking records.

Required logical relation: Booking.currentSlotId = Slot.id AND Booking.status = Booked.

Required Customer-specific relation: `Booking.customerId = principal.userId AND Booking.status = Booked AND Booking.startsAt < Slot.endsAt AND Slot.startsAt < Booking.endsAt`. `principal.userId` is obtained from the authenticated Session, not request input. Booking interval values are the persisted snapshot of its current Slot interval. This is the half-open `[start,end)` overlap rule from requirements.md §3: a Customer's Active Booking with Tutor A excludes an overlapping offer from Tutor B; exact adjacency does not conflict. Cancelled rows are excluded. The query uses `NOT EXISTS` only and never projects the conflicting Booking, Customer ID or reason.

Neither relation can be queried in the current schema because #16 has not added the Booking model/table. #16 currently depends on #15, creating a sequencing gap for occupied-offer and Customer-overlap implementation. Part E records the correct data source but does not invent Slot.isBooked, assume all Slots remain unoccupied, or create a partial Booking schema under #15.

Before Part F can pass the occupied-Slot and Customer-overlap tests, owner/reviewer must agree whether #16 supplies a reviewed Booking schema/migration foundation before #15 availability implementation, or a separately scoped shared data-foundation change is approved. Record the choice, owner, PR and exact schema SHA. Until then occupancy- and Customer-overlap-dependent Part F checks are **BLOCKED**, not PASS.

## 3. Proposed logical read projection

The following is **pseudocode**, not executable SQL against the current base. `$1` is a bound parameter populated only from `principal.userId` after `requireSession`/`requireRole(Customer)`; it is never copied from client input. The statement returns exactly one aggregate row even when `eligible_slots` is empty, so the API can always build `meta.evaluatedAt` from the same T_view.

~~~sql
WITH view_clock AS MATERIALIZED (
  SELECT clock_timestamp() AS evaluated_at
),
eligible_slots AS MATERIALIZED (
  SELECT
    s."id" AS "slotId",
    s."tutorId" AS "tutorRef",
    s."startsAt" AS "startsAt",
    s."endsAt" AS "endsAt"
  FROM "Slot" AS s
  CROSS JOIN view_clock
  WHERE s."lifecycle" = 'Offered'
    AND s."startsAt" >= view_clock.evaluated_at + INTERVAL '60 minutes'
    AND NOT EXISTS (
      SELECT 1
      FROM "Booking" AS occupied
      WHERE occupied."currentSlotId" = s."id"
        AND occupied."status" = 'Booked'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "Booking" AS customer_conflict
      WHERE customer_conflict."customerId" = $1
        AND customer_conflict."status" = 'Booked'
        AND customer_conflict."startsAt" < s."endsAt"
        AND s."startsAt" < customer_conflict."endsAt"
    )
)
SELECT
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'slotId', eligible_slots."slotId",
        'tutorRef', eligible_slots."tutorRef",
        'startsAt', eligible_slots."startsAt",
        'endsAt', eligible_slots."endsAt"
      )
      ORDER BY eligible_slots."startsAt" ASC,
               eligible_slots."tutorRef" ASC,
               eligible_slots."slotId" ASC
    ) FILTER (WHERE eligible_slots."slotId" IS NOT NULL),
    '[]'::jsonb
  ) AS "data",
  view_clock.evaluated_at AS "evaluatedAt"
FROM view_clock
LEFT JOIN eligible_slots ON TRUE
GROUP BY view_clock.evaluated_at;
~~~

Intent: sample DB clock once as T_view; use persisted Slot lifecycle/interval; exclude active Booked rows on the candidate Slot; exclude any overlapping Active Booking belonging to the authenticated Customer (including another Tutor); return only the safe projection; order deterministically. The outer query starts from the one-row `view_clock` CTE and LEFT JOINs the candidate set, then aggregates with a filtered `jsonb_agg` and `COALESCE`. Therefore it returns one row with `data = []` and the same non-null `evaluatedAt` when no candidate exists. This is one SQL statement, not a second clock read or an application-clock fallback. Exact SQL/Prisma query and read-isolation require peer review and a real PostgreSQL test after Booking schema exists. This pseudocode has not been run.

## 4. Time and timezone

- PostgreSQL stores startsAt/endsAt as TIMESTAMPTZ.
- API returns UTC RFC 3339 strings ending Z.
- UI always formats Asia/Bangkok (UTC+07:00), independent of browser timezone.
- T_view is the DB time for this read; startsAt - T_view >= 60 minutes is the proposed read rule and equality passes.
- A Customer's own `Booked` rows are checked by persisted `[startsAt, endsAt)` intervals; only strict overlap is excluded, so adjacency passes. The principal comes from the Session.
- #16 Booking write uses its own authoritative T_elig after contention waits; it must not trust T_view, evaluatedAt, browser time or prior availability.
- OD-002 (maximum advance horizon) remains OPEN. This contract does not choose an upper bound and does not imply an approved unlimited horizon. Resolve OD-002 before Part F; do not invent work-hour/day, holiday or start-minute rules either.

## 5. Response projection and privacy

| Property | Source | Type | Privacy |
|---|---|---|---|
| slotId | Slot.id | UUID string | Safe selection ID, not Booking ID |
| tutorRef | Slot.tutorId | UUID string | Opaque Tutor reference; no email/name/phone |
| startsAt | Slot.startsAt | UTC ISO string | Required time |
| endsAt | Slot.endsAt | UTC ISO string | Required time |
| meta.evaluatedAt | T_view | UTC ISO string | Read evaluation time, not Booking guarantee |
| meta.requestId | Existing middleware | opaque string | Correlation only |

Never select/serialize Customer ID/name/email/phone, Booking ID/status/reason, Session ID/token/CSRF, password hash or arbitrary Prisma columns. Request fields cannot choose another Customer/Tutor owner. Tutor UUID is not a credential and grants no authorization; UI compaction is presentation only.

## 6. Storage and mutation boundary

F-S1-03 is read-only: no record writes, tables, columns, migrations, indexes, triggers or occupancy denormalization. It does not alter F-S1-02 Slot owner, immutability, duration or overlap constraints. Booking persistence and transaction integrity belong to #16.

## 7. Part F data verification obligations

1. Seed at least two Tutors and two Customers with test-only opaque IDs.
2. Create real future Offered Slots for multiple Tutors, including same-time offers from different Tutors.
3. With no active Booking, verify expected offers.
4. With a committed Booked row for one Slot, verify it is excluded while other offers remain; inspect full JSON for no Customer/Booking leakage.
5. Verify T_view equality (60:00 included) and below-boundary (59:59 excluded) with controlled DB time.
6. Verify deterministic order, UTC serialization and identical Bangkok display from UTC/other-timezone browsers.
7. Inject read failure; verify no false empty list; retry successfully.
8. Verify role/session isolation, session binding and no stale data after logout/account switch.
9. Verify a Customer's overlapping Active Booking on Tutor A hides an overlapping free Slot on Tutor B for that Customer; verify adjacent intervals, Cancelled rows and another Customer's Booking do not incorrectly hide the offer.

All are PLANNED / NOT RUN in Part E. Occupancy- and Customer-overlap-dependent checks remain BLOCKED by the missing #16 Booking schema.
