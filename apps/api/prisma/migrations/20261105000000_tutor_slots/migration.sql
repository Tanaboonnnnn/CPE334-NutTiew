-- F-S1-02: immutable 60-minute Tutor Slot offers; no S2 withdrawal actions.
-- Additive migration after Auth. Do not alter 20261104000000_auth.
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "Slot" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tutorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "startsAt" TIMESTAMPTZ NOT NULL,
  "endsAt" TIMESTAMPTZ NOT NULL,
  "lifecycle" TEXT NOT NULL DEFAULT 'Offered'
    CHECK ("lifecycle" IN ('Offered', 'Withdrawn')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "withdrawnAt" TIMESTAMPTZ,
  CONSTRAINT slot_exactly_one_hour CHECK ("endsAt" = "startsAt" + INTERVAL '60 minutes'),
  CONSTRAINT slot_lifecycle_consistent CHECK (
    ("lifecycle" = 'Offered' AND "withdrawnAt" IS NULL)
    OR ("lifecycle" = 'Withdrawn' AND "withdrawnAt" IS NOT NULL)
  )
);
CREATE INDEX "Slot_tutorId_startsAt_idx" ON "Slot" ("tutorId", "startsAt", "id");
ALTER TABLE "Slot" ADD CONSTRAINT offered_slot_no_overlap_per_tutor
  EXCLUDE USING gist (
    "tutorId" WITH =,
    tstzrange("startsAt", "endsAt", '[)') WITH &&
  ) WHERE ("lifecycle" = 'Offered');

-- Ordinary SQL cannot edit/erase offers or manufacture S2 withdrawal history.
-- S2 needs a separately reviewed migration to allow one-way Offered -> Withdrawn.
CREATE FUNCTION slot_guard_s1() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."lifecycle" <> 'Offered' OR NEW."withdrawnAt" IS NOT NULL THEN
      RAISE EXCEPTION 'Sprint 1 only permits Offered Slot inserts'
        USING ERRCODE = '23514', CONSTRAINT = 'slot_s1_insert_lifecycle';
    END IF;
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Slot mutation is forbidden in Sprint 1'
    USING ERRCODE = '23514', CONSTRAINT = 'slot_s1_immutable';
  RETURN NULL;
END;
$$;
CREATE TRIGGER slot_s1_insert_guard BEFORE INSERT ON "Slot"
  FOR EACH ROW EXECUTE FUNCTION slot_guard_s1();
CREATE TRIGGER slot_s1_update_delete_guard BEFORE UPDATE OR DELETE ON "Slot"
  FOR EACH ROW EXECUTE FUNCTION slot_guard_s1();
CREATE TRIGGER slot_s1_truncate_guard BEFORE TRUNCATE ON "Slot"
  FOR EACH STATEMENT EXECUTE FUNCTION slot_guard_s1();
