# F-S2-05 — Tutor Slot Withdrawal Data Contract (Part E)

> **Proposed data contract for independent review; no Prisma model, SQL migration, trigger, index or database test is added by Issue #114.** Every SQL fragment below is **illustrative and NOT EXECUTED**.

## 1. Canonical source and ownership

The `Slot` table, `slot_exactly_one_hour`, `slot_lifecycle_consistent`, `slot_id_window_unique` and `offered_slot_no_overlap_per_tutor` remain owned by the accepted Sprint 1 migration `20261105000000_tutor_slots`. This feature enables one-way `Offered → Withdrawn` through the reviewed `slot_guard_s2()` replacement shared with F-S2-03. No applied migration is edited and no new table is added.

## 2. Slot fields written by withdrawal

| Field | Rule |
|---|---|
| `id` | Unchanged; no same-ID reuse |
| `tutorId` | Unchanged |
| `startsAt` / `endsAt` | Unchanged; exactly 60 minutes |
| `lifecycle` | `Offered → Withdrawn` only |
| `withdrawnAt` | Set to `T_elig`; required by `slot_lifecycle_consistent` |
| `createdAt` | Unchanged |

No `Booking` row is written; withdrawal is not a cancellation and creates no notice.

## 3. Guard requirement (shared with F-S2-03)

`slot_guard_s2()` must:

| Operation | Rule |
|---|---|
| INSERT | `lifecycle='Offered'` and `withdrawnAt IS NULL` only (preserve Sprint 1 behaviour). |
| UPDATE `Offered → Withdrawn` | Require `withdrawnAt IS NOT NULL`, unchanged `id`/`tutorId`/`startsAt`/`endsAt`, and no `Booked` Booking referencing the Slot; otherwise raise `P0B03 / slot_withdraw_occupied`. |
| UPDATE `Withdrawn → Offered` | Reject unconditionally with `P0B04 / slot_reactivation_forbidden`. |
| Any other UPDATE | Reject with `23514 / slot_s2_immutable`. |
| DELETE / TRUNCATE | Reject unconditionally. |

The guard must run as `SECURITY DEFINER` with a fixed `search_path`, raise a non-success error so the transaction rolls back, and be non-disablable by the runtime role. Exact SQL and trigger order are proven in Part F; the illustrative function is in [F-S2-03 data](../F-S2-03/data-spec.md) §3.

## 4. Constraints and indexes

- Existing `slot_lifecycle_consistent` enforces `Offered ↔ withdrawnAt NULL` / `Withdrawn ↔ withdrawnAt NOT NULL`.
- Existing `offered_slot_no_overlap_per_tutor` has `WHERE lifecycle='Offered'`; a `Withdrawn` row therefore does not block a new distinct overlapping offer.
- Existing `Slot_tutorId_startsAt_idx (tutorId, startsAt, id)` supports the own-list read.
- No new index is required by this feature. Any performance claim must be measured in Part F, not assumed.

## 5. Transaction and persistence proof

- One `UPDATE` affects exactly one row (`rowCount=1`); `lifecycle='Withdrawn'` and `withdrawnAt` are set together.
- After COMMIT, the Slot is absent from Customer availability; the Tutor's own list still returns the historical row.
- An injected failure after the UPDATE and before COMMIT leaves `Offered`/`withdrawnAt NULL`.
- Withdrawal-versus-Booking final rows are only `(Offered + one Booked)` or `(Withdrawn + zero Booked)`.
- Direct SQL occupied withdrawal is rejected by `P0B03`; direct `Withdrawn → Offered` by `P0B04`; direct interval/Tutor/ID change by `slot_s2_immutable`; DELETE/TRUNCATE by the guard.
- A later distinct Slot with a new ID can overlap the withdrawn interval and is accepted if all Sprint 1 creation rules pass.

## 6. DTO extension

| Field | S1 | S2 |
|---|---|---|
| `lifecycle` | `'Offered'` | `'Offered' \| 'Withdrawn'` |
| `withdrawnAt` | absent | ISO string or `null` |
| `occupancy` | `'Occupied' \| 'Unoccupied'` | unchanged |

This is a Sprint 2 change to accepted F-S1-02 output and must be regression-tested. No Customer identity or Booking identity is added to the Tutor Slot DTO.

## 7. No-change layers

- No change to `slot_exactly_one_hour`, `slot_id_window_unique`, the GiST exclusion predicate or its index.
- No change to Booking tables/guards.
- No change to auth/session tables.
- No Slot delete/archive endpoint or retention policy (OD-008).

## 8. Open decisions and migration risks

- **OD-008:** retention of withdrawn Slot history is not separately decided; no delete is authorized.
- **OD-013:** duplicate/uncertain withdrawal protocol is open; a retry after success returns 409.
- **Migration risk:** `slot_guard_s1()` forbids every Slot update. Removing it without the reviewed S2 guard would allow occupied withdrawal and same-ID reactivation. The replacement must be one reviewed migration shared with F-S2-03.
