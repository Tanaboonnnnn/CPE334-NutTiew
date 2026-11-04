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

Tutor Schedule is `WHERE tutorId=principal.userId`, not separate writable Schedule table. Once #16 exists, occupancy derives from active Booked rows, not a stored `isBooked` flag.

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
```

Notes: Auth migration already creates `pgcrypto`/UUID generation, but `btree_gist` installation rights must be verified on actual Postgres 17/18 and future GCP. Prisma cannot fully express conditional exclusion: preserve native SQL in later migrations. Do **not** add a time-relative `CHECK startsAt>now()`, as a historical valid Slot becomes past while remaining persisted. A FK alone does not enforce Tutor role: verify/lock User. This SQL **does not yet forbid direct UPDATE of owner/time or DELETE**, nor reactivation of Withdrawn ID; choose a verified trigger or restricted DB role/write privilege in Part F before claiming immutable-slot invariant under direct SQL. The code route will expose no edit/delete/withdraw in Sprint 1.

## Transaction and Race A

1. Verify `requireSession`, Tutor role, Origin and Session CSRF at HTTP edge. Strictly parse RFC3339 start with explicit timezone, derive +60m end on server.
2. Begin **SERIALIZABLE** transaction on one `pg.PoolClient`; don't reuse generic Auth `transaction()` helper that begins with default isolation.
3. Lock `User` row `SELECT id,role,isActive FROM "User" WHERE id=$1 FOR UPDATE` with `principal.userId`. Recheck active and Tutor role **after** lock. Current transaction's locking hierarchy matches System SDS User-before-Slot.
4. Sample fresh DB `clock_timestamp()` after lock. Require start strictly future; **do not impose Q05 Booking lead time** or unapproved working hours/horizon/grid.
5. Insert Offered row using trusted tutorId. Duration CHECK and same-Tutor Offered GiST EXCLUDE are last-resort DB safeguards, including two concurrent writers/instances. Distinct Tutors and adjacent half-open intervals remain allowed.
6. COMMIT **before** 201. On any failure, ROLLBACK and release. Map exclusion `23P01` to safe 409 Conflict; `40001` serialization / `40P01` deadlock eligible for **full fresh transaction** bounded retry (3 attempts proposed), not infinite retry of an actual overlap. DB unavailable/exhaustion -> safe non-success; uncertain client-side response can require owner GET reconciliation.

## Verification obligations

- Fresh disposable DB: apply Auth then Slot migration, inspect native constraints and indexes, regenerate Prisma client; record DB version, actual SQLSTATEs and application behavior.
- Real Race A with two independent connections, explicit lock/barrier ensuring contention, both winner orders and final committed row inspection. Also test direct SQL bypass of HTTP precheck; random `Promise.all()` alone is insufficient.
- Prove 59m duration direct SQL rejected, same-Tutor positive overlap rejected, adjacency and different-Tutor same hour accepted. Inject transactional fault, confirm zero partial commits and no 201.
- Check foreign/missing owner-filtered reads; payload contains only approved fields, no other Customer/Booking information. Test owner/role mutation, revoked session and CSRF failures.
- Retain current `apps/api/package.json` behavior but **wire new Slot DB tests** into `npm run test:db` discovery; current command enumerates Auth tests, so a new file could otherwise be omitted silently.
- Record exact `npm ci`, `db:generate`, `db:migrate`, `typecheck`, `build`, `test`, `test:db`, `test:e2e` and Race A results by SHA in Part F; **none are run by Part E**.

## Review-required engineering decisions

Confirm lock ordering and Serializable behavior against actual pg implementation; DB trigger/privilege rule for immutable Slot IDs/times and withdrawn-state compatibility; response fields/pagination under OD-004; pg/Prisma migration ownership. No blanket architectural refactoring of #13.
