-- D1-08A / Issue #33 Part F: canonical shared Booking persistence.
-- Forward-only migration after Auth and immutable Tutor Slots. Do not rewrite history.
-- btree_gist is installed by the preceding Slot migration; keep this idempotent.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Required referenced key for Booking's immutable Slot-window snapshot.
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

-- Full indexes support FK checks for both Booked and historical Cancelled rows.
CREATE INDEX "Booking_customerId_idx" ON "Booking" ("customerId");
CREATE INDEX "Booking_currentSlotId_idx" ON "Booking" ("currentSlotId");

-- Cancelled history may refer to the same Slot; only Booked rows occupy it.
CREATE UNIQUE INDEX booking_one_active_per_slot
  ON "Booking" ("currentSlotId")
  WHERE "status" = 'Booked';

-- Half-open [start,end) ranges allow exact adjacency; the exclusion
-- constraint owns the required GiST index, so no duplicate index is added.

ALTER TABLE "Booking"
  ADD CONSTRAINT booked_customer_no_overlap
  EXCLUDE USING gist (
    "customerId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  )
  WHERE ("status" = 'Booked');

-- One database-owned guard: #16 owns the application transaction adapter only.
CREATE FUNCTION booking_guard_s1() RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  slot_lifecycle TEXT;
  slot_starts_at TIMESTAMPTZ(6);
  slot_ends_at TIMESTAMPTZ(6);
  eligibility_time TIMESTAMPTZ(6);
BEGIN
  -- The same function is registered for row DML and statement TRUNCATE.
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'Sprint 1 Booking rows cannot be truncated'
      USING ERRCODE = '0A000';
  END IF;

  -- Every row UPDATE/DELETE is rejected before inspecting NEW/OLD or locking Slot.
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Sprint 1 Booking rows are append-only'
      USING ERRCODE = '0A000';
  END IF;

  IF TG_OP <> 'INSERT' THEN
    RAISE EXCEPTION 'Unsupported Booking operation'
      USING ERRCODE = '0A000';
  END IF;

  -- Cancelled fixtures are permitted for shared-state tests, but do not occupy.
  IF NEW."status" = 'Booked' THEN
    SELECT s."lifecycle", s."startsAt", s."endsAt"
      INTO slot_lifecycle, slot_starts_at, slot_ends_at
      FROM "Slot" AS s
      WHERE s."id" = NEW."currentSlotId"
      FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Booking requires an existing Offered Slot'
        USING ERRCODE = '23514', CONSTRAINT = 'booking_slot_offered_guard';
    END IF;

    IF slot_lifecycle IS DISTINCT FROM 'Offered' THEN
      RAISE EXCEPTION 'Booking requires an Offered Slot'
        USING ERRCODE = '23514', CONSTRAINT = 'booking_slot_offered_guard';
    END IF;

    IF slot_starts_at IS DISTINCT FROM NEW."startsAt"
       OR slot_ends_at IS DISTINCT FROM NEW."endsAt" THEN
      RAISE EXCEPTION 'Booking interval must match the selected Slot'
        USING ERRCODE = '23514', CONSTRAINT = 'booking_slot_window_guard';
    END IF;

    -- Sample the authoritative DB wall clock only after the Slot lock wait.
    eligibility_time := clock_timestamp();
    IF slot_starts_at - eligibility_time < INTERVAL '60 minutes' THEN
      RAISE EXCEPTION 'Booking is outside the Sprint 1 eligibility window'
        USING ERRCODE = '23514', CONSTRAINT = 'booking_q05_guard';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER booking_s1_row_guard
  BEFORE INSERT OR UPDATE OR DELETE ON "Booking"
  FOR EACH ROW EXECUTE FUNCTION booking_guard_s1();

CREATE TRIGGER booking_s1_truncate_guard
  BEFORE TRUNCATE ON "Booking"
  FOR EACH STATEMENT EXECUTE FUNCTION booking_guard_s1();
