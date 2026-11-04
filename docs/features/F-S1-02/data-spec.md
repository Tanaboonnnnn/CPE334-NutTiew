# F-S1-02 — Slot Data and Transaction Contract (Part E)

> **PROPOSED SQL, NOT APPLIED OR TESTED.** Issue #14. See [SDS](specification.md), [HTTP](api-spec.md), [UI](ui-spec.md), [STS](tests.md) and whole-product [System SDS](../../system-sds.md) §§3.3, 7.1–7.2.

## Existing DB baseline

Merged PR #26 includes Prisma `User`, `Session`, `AuthAttemptBucket`, `AuthAttemptReservation` and auth migration `20261104000000_auth`; it does **not** include Slot or Booking. Preserve merged auth migration unchanged. Add a **new forward-only Slot migration** and Prisma Slot model/User relation. Auth transactions use `pg` Pool, Prisma for schema/migration; one Slot mutation must use **one pg PoolClient**, not independent Prisma/pg transactions falsely described as atomic.

## Proposed Slot model

| Field | Type / policy |
|---|---|
| `id` | UUID PK, immutable |
| `tutorId` | UUID NOT NULL FK to `User.id`, owner from Session |
| `startsAt`, `endsAt` | TIMESTAMPTZ NOT NULL, exact one hour apart |
| `lifecycle` | Offered now, Withdrawn reserved for Sprint 2 |
| `createdAt` | DB-generated timestamp |
| `withdrawnAt` | NULL for Offered; later Sprint 2 history |

Tutor Schedule is `WHERE tutorId=principal.userId`, not a separate writable Schedule table. Once #16 exists, occupancy derives from active Booked rows, not a stored `isBooked` flag. **Sprint 1 read contract:** only the authenticated Tutor's full owner-list GET (no `:id` route, query filters or pagination); strict-query rejection prevents client-supplied `tutorId` from changing owner scope. Sort by `"startsAt" ASC,"id" ASC` and project **only** the [approved-for-review DTO](api-spec.md) fields. `occupancy` is computed as Unoccupied at #14 because no Booking relation exists yet, and must become derived from active Booked rows in #16.

### Proposed migration fragment (requires peer review and disposable DB proof)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE "Slot" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tutorId" UUID NOT NULL REFERENCES "User"("id") ON DELETE RESTRICT,
  "startsAt" TIMESTAMPTZ NOT NULL,
  "endsAt" TIMESTAMPTZ NOT NULL,
  "lifecycle" TEXT NOT NULL DEFAULT 'Offered'
    CHECK ("lifecycle" IN ('Offered','Withdrawn')),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "withdrawnAt" TIMESTAMPTZ,
  CONSTRAINT slot_exactly_one_hour
    CHECK ("endsAt" = "startsAt" + INTERVAL '60 minutes'),
  CONSTRAINT slot_lifecycle_consistent
    CHECK (
      ("lifecycle"='Offered' AND "withdrawnAt" IS NULL)
      OR ("lifecycle"='Withdrawn' AND "withdrawnAt" IS NOT NULL)
    )
);
CREATE INDEX "Slot_tutorId_startsAt_idx"
  ON "Slot" ("tutorId","startsAt","id");
ALTER TABLE "Slot" ADD CONSTRAINT offered_slot_no_overlap_per_tutor
  EXCLUDE USING gist (
    "tutorId" WITH =,
    tstzrange("startsAt","endsAt",'[)') WITH &&
  )
  WHERE ("lifecycle"='Offered');

-- Sprint 1 ordinary-DML invariant: only new Offered Slots may be inserted.
-- Every UPDATE/DELETE/TRUNCATE is denied at the database, not just in Express.
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
  RETURN NULL; -- Unreachable: every non-INSERT raises an exception.
END;
$$;

CREATE TRIGGER slot_s1_insert_guard BEFORE INSERT ON "Slot"
  FOR EACH ROW EXECUTE FUNCTION slot_guard_s1();
CREATE TRIGGER slot_s1_update_delete_guard BEFORE UPDATE OR DELETE ON "Slot"
  FOR EACH ROW EXECUTE FUNCTION slot_guard_s1();
CREATE TRIGGER slot_s1_truncate_guard BEFORE TRUNCATE ON "Slot"
  FOR EACH STATEMENT EXECUTE FUNCTION slot_guard_s1();
```

Notes: Auth migration already creates `pgcrypto`/UUID generation, but `btree_gist` installation rights must be verified on actual Postgres 17/18 and future deployment. Prisma cannot fully express conditional exclusion or PL/pgSQL guards: preserve native SQL in later migrations. Do **not** add a time-relative `CHECK startsAt>now()`, as a historical valid Slot eventually becomes past while remaining persisted. A FK alone does not enforce authenticated Tutor ownership: verify/lock User in the write transaction. The application exposes **no** update/delete/withdraw route in Sprint 1.

### Database-level operation / transition matrix (P1 review decision)

| Operation attempted by ordinary SQL/API | Sprint 1 result | Expected DB proof |
|---|---|---|
| `INSERT` as `Offered` with NULL `withdrawnAt`, future 60-minute interval, valid owner | **Allowed** only after all server authorization/time and native constraints; direct SQL has **no Session ownership proof** | New row committed if checks pass |
| `INSERT` with `Withdrawn` and a timestamp, or a non-NULL `withdrawnAt` | **Denied** by insert trigger | SQLSTATE **23514**, constraint `slot_s1_insert_lifecycle`; zero rows |
| `UPDATE` any existing row (including `id`, `tutorId`, `startsAt`, `endsAt`, `lifecycle`, `withdrawnAt` or no-op update) | **Denied** unconditionally by row-level trigger | SQLSTATE **23514**, constraint `slot_s1_immutable`; row unchanged |
| `DELETE` any Slot | **Denied** by row-level trigger | SQLSTATE **23514**, constraint `slot_s1_immutable`; row still present |
| `TRUNCATE` Slot | **Denied** by statement trigger; may additionally lack privilege for runtime DB role | SQLSTATE **23514** (owner in test) or **42501** (insufficient privilege), table unchanged |
| `Offered -> Withdrawn` or `Withdrawn -> Offered` | **Neither permitted in Sprint 1**; no `Withdrawn` row can be written normally | Attempted UPDATE rejected as above; direct reactivation fixture deferred until S2 |
| Sprint 2 reviewed `Offered -> Withdrawn` | **NOT IMPLEMENTED**; requires a separate migration replacing the restrictive trigger, one-way transition with non-NULL `withdrawnAt` and an atomic no-active-Booking check | New S2 tests/review, not #14 PASS |
| Sprint 2 attempted `Withdrawn -> Offered` (same ID), change ID/owner/start/end, or DELETE | **Must remain denied** even after S2 one-way migration | Future S2 direct-SQL negative tests; **NOT RUN** in #14 |

The explicit SQLSTATE values above come from **proposed** `RAISE EXCEPTION` clauses, not a claim that this migration has been applied. PostgreSQL privileged DDL can disable/drop triggers; runtime role must not have schema/table ownership, superuser, or trigger-disabling privileges in a production-equivalent environment. Part F must verify the actual role/permission setup; a deployment that uses a schema-owner runtime connection cannot claim resistance to malicious DDL. Privileged test teardown must use an **isolated disposable DB/schema**, not `DELETE FROM "Slot"` that the invariant correctly rejects.

## Transaction and Race A

1. Verify `requireSession`, Tutor role, Origin and Session CSRF at HTTP edge. Strictly parse **valid** RFC3339 start with explicit timezone: seconds exactly `:00`, optional fractional part 1–3 **zero digits only**; e.g. `13:17:00Z` or `13:17:00.000+07:00` permitted, `13:00:30` / `13:00:00.500` rejected **without rounding**, as are invalid civil dates/offsets. Derive +60m end on server.
2. Begin **SERIALIZABLE** transaction on one `pg.PoolClient`; don't reuse generic Auth `transaction()` helper that begins with default isolation.
3. Lock `User` row `SELECT id,role,isActive FROM "User" WHERE id=$1 FOR UPDATE` with `principal.userId`. Recheck active and Tutor role **after** lock. Current transaction's locking hierarchy matches System SDS User-before-Slot.
4. Sample fresh DB `clock_timestamp()` after lock. Require start strictly future; **do not impose Q05 Booking lead time** or unapproved working hours/horizon/grid.
5. Insert Offered row using trusted tutorId. Duration CHECK and same-Tutor Offered GiST EXCLUDE are last-resort DB safeguards, including two concurrent writers/instances. Distinct Tutors and adjacent half-open intervals remain allowed.
6. COMMIT **before** 201. On any failure, ROLLBACK and release. Map exclusion `23P01` to safe 409 Conflict; `40001` serialization / `40P01` deadlock eligible for **full fresh transaction** bounded retry (3 attempts proposed), not infinite retry of an actual overlap. DB unavailable/exhaustion -> safe non-success; uncertain client-side response can require owner GET reconciliation.

## Verification obligations

- Fresh disposable DB: apply Auth then Slot migration, inspect native constraints and indexes, regenerate Prisma client; record DB version, actual SQLSTATEs and application behavior.
- Real Race A with two independent connections, explicit lock/barrier ensuring contention: capture A/B `pg_backend_pid()`, observe `pg_blocking_pids(B_pid)` **containing A_pid** from an independent observer while A holds the User lock; then release A. Require both winner orders, observed HTTP statuses and SQLSTATE (if thrown), committed post-race rows and invariant check. Also test direct SQL bypass of HTTP precheck; random `Promise.all()` alone is insufficient. Avoid a timeout-only or sleep-only "race" proof.
- Prove 59m duration direct SQL rejected, same-Tutor positive overlap rejected, adjacency and different-Tutor same hour accepted. Inject transactional fault, confirm zero partial commits and no 201.
- Check **own-list** SQL owner filter, strict-query denial of `GET /api/v1/tutor/slots?tutorId=T2`, response allowlist, no foreign Customer/Booking information, and no `GET :id` route. Test stale owner-list response arriving after logout/account switch (old T1 payload must never render under T2), role mutation, revoked session and CSRF failures.
- Retain current `apps/api/package.json` behavior but **wire new Slot DB tests** into `npm run test:db` discovery; current command enumerates Auth tests, so a new file could otherwise be omitted silently.
- Record exact `npm ci`, `db:generate`, `db:migrate`, `typecheck`, `build`, `test`, `test:db`, `test:e2e` and Race A results by SHA in Part F; **none are run by Part E**.

## Review-required engineering decisions

Peer review the proposed `slot_guard_s1` trigger and operation matrix, SQLSTATE 23514 assertions, future one-way migration gate, actual runtime DB privilege separation, lock ordering and Serializable behavior; accept/reject no-detail/no-pagination/no-filter own-list and minute-precision transport. No blanket architectural refactoring of #13.
