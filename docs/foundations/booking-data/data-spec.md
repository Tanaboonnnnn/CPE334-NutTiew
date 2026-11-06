# D1-08A — Shared Booking Data Specification (Part E)

> **Proposed mapping and SQL intent only. NOT an applied migration, Prisma schema change, or PostgreSQL test result.** See [foundation SDS](specification.md), [test plan](tests.md), and whole-product [System SDS §§3.2–3.3](../../system-sds.md).

## 1. Canonical Booking fields

| Field | PostgreSQL / Prisma type | Nullability / default | Contract |
|---|---|---|---|
| `id` | `UUID` / `String @db.Uuid` | NOT NULL; generated UUID | Immutable primary key. |
| `customerId` | `UUID` / `String @db.Uuid` | NOT NULL | FK to `User.id`; derived from authenticated Customer Session by #16, never accepted as an owner claim from the client. |
| `currentSlotId` | `UUID` / `String @db.Uuid` | NOT NULL | FK to the selected `Slot`; identifies the currently assigned Slot. |
| `startsAt` | `TIMESTAMPTZ(6)` / `DateTime @db.Timestamptz(6)` | NOT NULL | Persisted copy of the selected Slot's `startsAt`; not client input. |
| `endsAt` | `TIMESTAMPTZ(6)` / `DateTime @db.Timestamptz(6)` | NOT NULL | Persisted copy of the selected Slot's `endsAt`; not client input; must be greater than `startsAt`. |
| `status` | `TEXT` / `String` | NOT NULL; default `Booked` | CHECK permits exactly `Booked` or `Cancelled`. Only `Booked` occupies/conflicts. |
| `createdAt` | `TIMESTAMPTZ(6)` / `DateTime @db.Timestamptz(6)` | NOT NULL; `now()` | Database creation timestamp. |
| `updatedAt` | `TIMESTAMPTZ(6)` / `DateTime @db.Timestamptz(6)` | NOT NULL; initially `now()` | Prisma `@updatedAt` for application updates; metadata only, not a business clock or audit log. |

`tutorId` is intentionally **not** stored on Booking. The current Tutor is `Slot.tutorId` through `currentSlotId`. This prevents a duplicated Tutor reference from diverging from the selected Slot. The authenticated principal's role/active status remains an application authorization check; a normal FK cannot enforce a cross-table `User.role = 'Customer'` condition.

## 2. Relationship and delete/update policy

| Relationship | Cardinality | Proposed FK | Delete / update |
|---|---|---|---|
| `Booking.customerId → User.id` | One User to many Bookings | `booking_customer_fk` | `ON DELETE RESTRICT ON UPDATE RESTRICT` |
| `Booking.(currentSlotId, startsAt, endsAt) → Slot.(id, startsAt, endsAt)` | One Slot to many historical Bookings; zero or one active `Booked` Booking | `booking_current_slot_window_fk` | `ON DELETE RESTRICT ON UPDATE RESTRICT` |

The composite Slot FK requires a matching unique key on `Slot(id, startsAt, endsAt)`. `Slot.id` is already the primary key; the composite unique key exists specifically so PostgreSQL can enforce that the persisted Booking interval always matches its referenced Slot. It also prevents Slot time changes while a Booking references that exact interval. Existing Sprint 1 Slot immutability remains unchanged.

Restricting parent deletion preserves referenced Booking history and avoids cascading away a Customer's or Tutor's appointment record. This is a referential-integrity choice, **not** an approved product data-retention policy. Any future anonymization, deletion, or archival workflow requires a separate decision and migration. Parent IDs are stable; they are not edited in normal operation.

## 3. Status and interval semantics

- `Booked` is the only Active/occupying state. A `Booked` row remains Active even after `endsAt`; elapsed time may be displayed as `Past`, but does not update status, imply attendance, create `Completed`, or release the Slot.
- `Cancelled` is a valid shared state and is excluded from both active constraints. No Customer/Tutor cancellation action is introduced in Sprint 1 by this foundation. Cancelled rows in foundation tests are isolated test fixtures; cancellation workflows and metadata remain later-scope work.
- The database must enforce `startsAt < endsAt`.
- Intervals use half-open `[startsAt, endsAt)` semantics. Positive-duration overlap is exactly `existing.startsAt < candidate.endsAt AND candidate.startsAt < existing.endsAt`. Adjacent intervals are allowed.
- The interval is copied from the actual selected Slot after it is read/locked by #16. A composite FK, not application convention alone, guarantees that `Booking.startsAt/endsAt` equal the referenced Slot's values.

## 4. Proposed Prisma mapping

The following is a **review target**, not code to paste without running Prisma validation against the exact project version. SQL-only partial/exclusion constraints are specified in §5 and must not be removed by a later generated migration.

```prisma
model User {
  // Existing fields/relations remain unchanged.
  customerBookings Booking[] @relation("BookingCustomer")
}

model Slot {
  // Existing fields/relations remain unchanged.
  bookings Booking[] @relation("BookingCurrentSlot")

  // Required target key for the composite Booking FK.
  @@unique([id, startsAt, endsAt], map: "slot_id_window_unique")
}

model Booking {
  id            String   @id @default(uuid()) @db.Uuid
  customerId    String   @db.Uuid
  currentSlotId String   @db.Uuid
  startsAt      DateTime @db.Timestamptz(6)
  endsAt        DateTime @db.Timestamptz(6)
  status        String   @default("Booked")
  createdAt     DateTime @default(now()) @db.Timestamptz(6)
  updatedAt     DateTime @default(now()) @updatedAt @db.Timestamptz(6)

  customer User @relation(
    "BookingCustomer",
    fields: [customerId],
    references: [id],
    onDelete: Restrict,
    onUpdate: Restrict,
    map: "booking_customer_fk"
  )
  currentSlot Slot @relation(
    "BookingCurrentSlot",
    fields: [currentSlotId, startsAt, endsAt],
    references: [id, startsAt, endsAt],
    onDelete: Restrict,
    onUpdate: Restrict,
    map: "booking_current_slot_window_fk"
  )

  @@index([customerId], map: "Booking_customerId_idx")
  @@index([currentSlotId], map: "Booking_currentSlotId_idx")
}
```

Do not add a Prisma `@@unique([currentSlotId])`: that would incorrectly prevent a Cancelled historical Booking and a later Booking from referring to the same Slot. The active-only uniqueness rule is a SQL partial unique index.

## 5. Proposed PostgreSQL migration intent

This fragment records the intended constraints for peer review. It is **not** a complete timestamped migration and has not been run. The implementation must reconcile exact constraint names, Prisma migration output, extension privileges, and System SDS trigger requirements before acceptance.

```sql
-- Already installed by the merged Tutor Slots migration on the normal chain.
-- Keep this idempotent for a fresh/verified baseline; never DROP the extension.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- PostgreSQL requires a unique referenced key for the composite FK.
ALTER TABLE "Slot"
  ADD CONSTRAINT slot_id_window_unique
  UNIQUE ("id", "startsAt", "endsAt");

CREATE TABLE "Booking" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "customerId" UUID NOT NULL,
  "currentSlotId" UUID NOT NULL,
  "startsAt" TIMESTAMPTZ(6) NOT NULL,
  "endsAt" TIMESTAMPTZ(6) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Booked',
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT booking_status_check
    CHECK ("status" IN ('Booked', 'Cancelled')),
  CONSTRAINT booking_positive_interval
    CHECK ("startsAt" < "endsAt"),
  CONSTRAINT booking_customer_fk
    FOREIGN KEY ("customerId")
    REFERENCES "User" ("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT booking_current_slot_window_fk
    FOREIGN KEY ("currentSlotId", "startsAt", "endsAt")
    REFERENCES "Slot" ("id", "startsAt", "endsAt")
    ON DELETE RESTRICT ON UPDATE RESTRICT
);

-- Full indexes also support parent-FK checks for historical Cancelled rows.
CREATE INDEX "Booking_customerId_idx"
  ON "Booking" ("customerId");
CREATE INDEX "Booking_currentSlotId_idx"
  ON "Booking" ("currentSlotId");

-- Race B: one active Booking at most for one exclusive Slot.
CREATE UNIQUE INDEX booking_one_active_per_slot
  ON "Booking" ("currentSlotId")
  WHERE "status" = 'Booked';

-- Race C: one Customer cannot have positive-duration overlapping active windows.
-- [start,end) allows exact adjacency. btree_gist supplies UUID equality in GiST.
ALTER TABLE "Booking"
  ADD CONSTRAINT booked_customer_no_overlap
  EXCLUDE USING gist (
    "customerId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE ("status" = 'Booked');
```

### Constraint behavior matrix

| Attempt | Expected database result |
|---|---|
| Insert valid `Booked` row with real Customer, Slot and matching interval | Accept one committed row. |
| Insert valid `Cancelled` fixture for a real Customer/Slot | Accept; it does not occupy or conflict. |
| Insert `startsAt >= endsAt` | Reject by `booking_positive_interval`. |
| Insert unsupported status | Reject by `booking_status_check`. |
| Insert unknown Customer or Slot | Reject by the corresponding FK. |
| Insert Booking interval that differs from the referenced Slot | Reject by `booking_current_slot_window_fk`. |
| Insert second `Booked` row for same Slot | Reject by `booking_one_active_per_slot`, including concurrent attempts. |
| Insert overlapping `Booked` interval for same Customer on another Tutor's Slot | Reject by `booked_customer_no_overlap`, including concurrent attempts. |
| Insert adjacent `Booked` interval for same Customer | Accept if all other constraints pass. |
| Insert overlapping row after prior row is `Cancelled` | Accept if all other constraints pass. |
| Delete referenced User or Slot / update referenced primary key or Slot window | Reject by restrictive FK. |

## 6. Index and extension notes

- `Booking_customerId_idx` and `Booking_currentSlotId_idx` are full B-tree indexes. They also cover FK checks for Cancelled historical rows; the active-only partial index does not.
- `booking_one_active_per_slot` is partial on `status = 'Booked'`; cancelled history may share a Slot reference.
- `booked_customer_no_overlap` is a GiST exclusion constraint over Customer UUID equality and the half-open timestamp range. `btree_gist` is required for the UUID equality operator class. Verify the extension and its version/permissions on the actual PostgreSQL target; do not assume a local extension install proves managed-database availability.
- The exclusion constraint's GiST index also supports the overlap predicate; any extra query index must be justified by real `EXPLAIN (ANALYZE, BUFFERS)` evidence, not added speculatively.
- `Slot(id, startsAt, endsAt)` composite unique key is required for the composite FK even though `id` is already unique.

## 7. Cross-feature trigger and lifecycle gate

The constraints above do **not** by themselves implement the complete System SDS Booking write protocol. Before the implementation PR is accepted, #16 Part E and the #33 migration plan must reconcile these normative requirements from System SDS §§3.3, 4, 7.1 and 7.3:

1. A Booked Booking must reference a currently Offered Slot; the Booking's interval must match the Slot (the composite FK handles interval equality).
2. The System SDS requires an immediate Booking `BEFORE INSERT/UPDATE` database guard for changes to status/current Slot/interval. It locks and re-reads the referenced Slot; for a new Booking it samples PostgreSQL `clock_timestamp()` for Q05 only after the required contention locks and before accepting the row.
3. The #16 transaction contract must use the shared User/Slot lock order and prove that no conflict-capable index/constraint wait can occur after `T_elig`, or abort/retry the whole transaction with a fresh DB clock when an unaccounted wait is detected. Do not replace this with a commit-time cutoff.
4. If a later Sprint 2 migration introduces `Slot.lifecycle = Withdrawn`, the System SDS requires a complementary Slot lifecycle guard so a Withdrawn Slot cannot retain a Booked Booking and a historical Slot cannot be reactivated. That lifecycle extension is not implemented by this Sprint 1 data contract.

The precise trigger ownership and SQL implementation are an explicit peer-review integration question in [specification.md §6](specification.md#6-peer-review-checklist-and-open-integration-gate). Do not claim that this DDL fragment alone satisfies Q05 or the future Offered/Withdrawn cross-table invariant.

## 8. Migration/backfill constraints

- Use a new forward-only migration after the existing Auth and Tutor Slots migrations.
- The verified baseline contains no Booking table/rows; no backfill or synthetic production data is needed.
- Preserve all existing User, Session, AuthAttempt, Slot rows, indexes, triggers and constraints. Do not edit old migration files.
- Do not add `Slot.isBooked` or another denormalized occupancy flag. Occupancy is derived from `Booking.status = 'Booked'` and `currentSlotId`.
- No Booking API, application service, UI, cancellation/reschedule workflow, history, notification, or OD-013 idempotency mechanism belongs in this migration.
- Run both fresh-database and exact-baseline upgrade tests on disposable PostgreSQL databases. The database version and extension availability are evidence fields in [tests.md](tests.md).
