# F-S1-02 — Tutor Slot Part F implementation and setup

**Issue:** [#14](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/14).
**Source:** Part E approved-design PR [#27](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/27)
(merged to `sprint1` as `b3e598e616e6184035beb35a841a21a131e3c5fa`).
**Scope owner:** @Tanaboonnnnn; **peer reviewer:** @Chxtamos.
This file describes the **separate Part F feature branch** and does not itself
constitute review approval, product-policy approval or a Sprint 1 release.

## What the feature implements

- A logged-in, active **Tutor** can open **one** individually dated, strictly
  future **60-minute** Slot on their own schedule. Adjacent Slots are allowed;
  overlapping `Offered` Slots of the **same** Tutor are rejected. Other Tutors
  may use the same time. Each UTC instant is presented in `Asia/Bangkok`.
- Only `POST /api/v1/tutor/slots` and `GET /api/v1/tutor/slots` are exposed
  (server-trusted owner, no detail route, no query parameters/pagination).
  Allowed DTO: `id, startsAt, endsAt, lifecycle, occupancy`, ordered by
  `startsAt ASC,id ASC`, with `occupancy=Unoccupied` until active Booking
  integration in Issue #16.
- Exact-minute protocol: RFC3339 timestamp with explicit offset or `Z`,
  seconds `:00`, optional 1–3 zero-only fractional digits; 13:17 is valid.
  Nonzero seconds/milliseconds and impossible dates are rejected, not rounded.
  No added working hours, maximum advance horizon or minute grid (**owner
  Option A for Sprint 1 scope only**, not stakeholder approval for 24/7).
- `POST` shares the Auth DB-backed session, Tutor role, Origin and HMAC CSRF
  enforcement. Mutations use **one** `pg.PoolClient`, SERIALIZABLE transaction,
  locked Tutor User **and Session**, post-lock PostgreSQL `clock_timestamp()`
  and whole-transaction bounded serialization/deadlock retries. Never respond
  201 before COMMIT.
- A forward-only new Prisma SQL migration adds `Slot`, a 60-minute CHECK,
  a `btree_gist` half-open `[start,end)` same-Tutor Offered exclusion and
  Sprint 1 SQL triggers rejecting direct UPDATE/DELETE/TRUNCATE and
  INSERT of Withdrawn lifecycle. This protects normal SQL DML, **not**
  privileged DDL that can disable/drop a trigger.
- The Tutor React view reads only own committed Slots, offers a Bangkok
  date + any-minute start and derived read-only end, refreshes after success,
  clears protected data on Logout and discards stale GETs. HTTP timeout/503
  reports uncertainty and refreshes the own list before re-submission.

**Out of scope:** Customer browse (#15), Booking/Q05 cutoff (#16), Booking
privacy (#17), final release (#18), Slot edit/delete/withdraw, recurrence,
cancel/reschedule, notifications, payments and S2 history transitions.

## Development and test-only PostgreSQL

Requirements: Node.js **24**, PostgreSQL with `btree_gist` available,
npm and Microsoft Edge for the existing Playwright configuration.

1. Create a **disposable, dedicated database** for tests. Never aim Slot
   integration/E2E/race tests at production or another team's persistent data;
   Slot test fixtures remain immutable and cannot be cleaned up by DELETE.
2. Copy `.env.example` to the **ignored** repo-root `.env` and set a real
   local `DATABASE_URL`, two independent random **32+ byte hex** Auth keys,
   `AUTH_CANONICAL_ORIGIN=http://localhost:5173`, `NODE_ENV=development`
   and `PORT=3001`. Never commit `.env`, access tokens or real passwords.
3. Run `npm ci`, `npm run db:generate`, `npm run db:migrate`, then
   `npm run db:seed` if you need demo accounts. The Slot migration runs **after**
   `20261104000000_auth`; do not rewrite the historical Auth migration.
4. **Required runtime privilege separation:** keep `DATABASE_URL`
   for Prisma migrations/admin CLI and test-owner fixtures. Set
   `DATABASE_URL_APP` in the repo-root `.env` for the Express runtime (and
   its test clients) with a separate login role that **does not own the
   schema/tables**. API and seed config load the repo-root `.env` by an
   absolute path derived from the module location, so `npm run dev -w
   @nuttiew/api` and `npm run db:seed` do not depend on shell CWD. Exported
   environment variables take precedence over values in `.env`. Runtime
   startup fails closed if `DATABASE_URL_APP` is missing or equals
   `DATABASE_URL`; it never falls back to the migration/admin credential.

   Example grants to execute **as DB/schema owner** after both migrations,
   with a securely provisioned `nuttiew_runtime` role and database name
   adjusted to your local setup:

   ```sql
   GRANT CONNECT ON DATABASE nuttiew TO nuttiew_runtime;
   GRANT USAGE ON SCHEMA public TO nuttiew_runtime;
   GRANT SELECT, INSERT, UPDATE, DELETE ON
     "User", "Session", "AuthAttemptBucket", "AuthAttemptReservation"
     TO nuttiew_runtime;
   GRANT SELECT, INSERT ON "Slot", "Booking" TO nuttiew_runtime;
   -- Needed for PostgreSQL SELECT ... FOR UPDATE in the #16 transaction protocol.
   -- Slot immutable trigger still rejects every UPDATE; this is not mutation access.
   GRANT UPDATE ("id") ON "Slot" TO nuttiew_runtime;
   ```

   Do **not** grant table-level UPDATE on `Slot`, UPDATE on any Slot column
   other than `id`, or UPDATE/DELETE/TRUNCATE on `Booking`. The column-scoped
   `UPDATE ("id")` grant exists only because PostgreSQL requires UPDATE
   privilege on at least one column for `SELECT ... FOR UPDATE`; the existing
   `slot_s1_immutable` trigger rejects even a no-op UPDATE. Do not grant
   Slot/Booking DELETE/TRUNCATE, table ownership, superuser/DDL rights or
   permission to disable triggers. The API
   runtime fails closed when `DATABASE_URL_APP` is absent or equals
   `DATABASE_URL`; it never falls back to the migration/admin credential.
   Manage actual role passwords via private environment variables, not Git.
   Production/cloud installation of `btree_gist` and runtime grants must be
   independently validated on the target service.

5. Run `npm run dev` (or start API and web separately) and authenticate with
   a Tutor test account; Customer and anonymous users cannot see this view.

## Verification commands

```powershell
npm run db:generate
npm run db:migrate
npm test
npm run typecheck
npm run build
npm run test:db
npm run test:e2e
```

`npm run test:db` includes the new Slot HTTP, deterministic observed-lock
Race A, direct SQL immutability/privilege and **real Node API process restart**
tests. The race test obtains DB backend PIDs and checks `pg_blocking_pids()`
through a third connection, both A-first and B-first orders, then inspects
committed rows. A 409/201 pair **without** observed lock blocking and DB
row evidence is not accepted as proof.

Playwright runs existing Auth tests plus Tutor UI tests in Microsoft Edge:
Los Angeles browser timezone versus Bangkok business time, cross-midnight
preview, 320/375/768/1280 viewports, 503 uncertainty and stale protected
list after Logout. Screenshots/traces under `test-results/` are **ignored
local artifacts** and are not release evidence without individual review.

See [Part F verification ledger](verification-ledger.md) for **actual
observed** command outcomes and unverified checks; no tests in Part E's
`tests.md` are retroactively relabeled as executed by its design-only PR.

## GitHub Actions CI on Issue #14's Part F PR

This feature branch additionally introduces [`.github/workflows/ci.yml`](../../../.github/workflows/ci.yml)
and a [restricted CI role setup](../../../.github/scripts/prepare-test-db.sh).
On a PR targeting `sprint1` or `main`, or a push to `sprint1`, GitHub
Actions runs **three independently visible checks**:

| Check name | Real verification |
|---|---|
| **Unit / types / build** | Node 24 `npm ci`, Prisma client generation, all Unit tests, API+web TypeScript checks, production build |
| **PostgreSQL 18 / Auth / Slot / Race A** | Isolated PostgreSQL 18 container; original Auth and Slot migrations; non-owner runtime DB grants; `npm run test:db` including true forced lock waits, native SQL protection and API process restart |
| **Microsoft Edge / Auth / Tutor UI E2E** | Separate isolated PostgreSQL service and non-owner runtime role; install Microsoft Edge via Playwright; run all browser tests; upload HTML report and failure traces with seven-day retention |

Workflow security: token permission `contents: read`, `persist-credentials:
false`, independent jobs, short job timeouts and concurrency cancellation.
Runtime HMAC keys are generated independently inside each job. CI database
connection uses **passwordless trust solely in an ephemeral GitHub-hosted
runner service**, never in shared, developer or production databases; the role
setup script rejects any non-CI invocation or a connection string other than
`nuttiew_ci`. All real deployments require normal authenticated
least-privilege DB access.

The workflow **does not** push to Git, approve/merge a PR, deploy a service,
modify Project status or close Issue #14. The independent teammate still
reviews Part F and the team must check real GitHub job conclusions.
**A locally valid YAML file is not evidence of a passing hosted workflow.**

## Known limits and next gates

- `occupancy` is a **temporary derived Unoccupied projection** while
  Booking does not exist; Issue #16 must derive it from committed active
  Booked rows before advertising customer-bookable availability.
- Sprint 2 `Offered → Withdrawn` is **not implemented**; a reviewed forward
  migration and negative anti-reactivation tests are required before that
  behavior exists.
- No official instructor Master/Theme 1 signoff or stakeholder 24/7
  service policy is implied.
- The feature branch must receive independent human review and a separate
  reviewed PR before merging to `sprint1`; do not merge or close #14 solely
  based on automation.
