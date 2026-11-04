# F-S1-02 — Tutor Slot Software Test Specification (Part E)

> **REVISED PART E / ALL TESTS PLANNED / NOT RUN.** Issue #14, owner @Tanaboonnnnn, reviewer @Chxtamos. Source contracts: [SDS / owner policy decision](specification.md), [HTTP](api-spec.md), [UI](ui-spec.md), [Data / DB trigger matrix](data-spec.md). Baseline `sprint1` `6fd3931` has Auth tests but **no Slot code/migration/test**.

## Test harness, data and TDD evidence

Use **clean disposable** real PostgreSQL with Auth migration plus **new** Slot migration, test-only accounts T1/T2 (Tutor) and C1 (Customer), authenticated session cookies and session-bound CSRF, Supertest/Vitest, at least two independent `pg` connections plus an observer connection, Playwright for real Tutor flow. Test dates are future relative to **database authoritative time**, not hardcoded as perpetually valid. Never commit passwords/keys. Test names must match stable AC/VC and execute through actual npm scripts. Because Slot direct DELETE/TRUNCATE is intentionally blocked, isolate and roll back fixtures or drop an **entire test-owned DB/schema as privileged teardown**; do not depend on deleting persisted production-like Slot rows for test cleanup.

Record **RED** first (missing route/schema/constraint causes expected failure), **GREEN** after implementation, command, exact SHA, PG/Node version, migration revision, PASS/FAIL/SKIP and final DB rows. UI-only warnings and `Promise.all()` without verified contention do not prove Race A.

## Planned test cases

| STS | Trace IDs | Setup/action | Required observable result |
|---|---|---|---|
| SLOT-01 | AC-S1-08, VC/TEST-S1-08, VAL-003 | T1 authenticated, POST future Bangkok 13:00 | 201, one DB Offered Slot owned T1, end exactly 14:00 |
| SLOT-02 | AC-S1-08, VC/TEST-S1-14, VAL-031 | T1 GET own list (no filters), refresh/restart API with same DB | Same committed Slot ID and UTC times, own account from `/auth/me`; exact safe DTO, `startsAt,id` ascending, no in-memory substitute |
| SLOT-03 | AC-S1-09, VC/TEST-S1-09, VAL-004 | T1 already offers 13:00–14:00, proposes 13:30–14:30 | 409; old row unchanged, no second row |
| SLOT-04 | AC-S1-10, VC/TEST-S1-10 | T1 creates 13:00–14:00 then 14:00–15:00 | Both rows committed; adjacency permitted |
| SLOT-05 | AC-S1-11, VC/TEST-S1-11 | T1/T2 both create same 13:00–14:00 future window | Both succeed, distinct owner rows |
| SLOT-06 | AC-S1-12, VC/TEST-S1-12 | Missing/invalid/offsetless timestamps, invalid civil date/offset, past/equal-now, extra client owner/duration | Defined 400/422; no new/modified row; no silent timestamp normalization |
| SLOT-07 | AC-S1-05/06, VC/TEST-S1-05/06, AUTH-07/08 | Anonymous/Customer tries Tutor POST and protected GET | 401/403, no private response or write |
| SLOT-08 | AC-S1-07, VC/TEST-S1-07/31, AUTH-09/16 | T1 GET `/tutor/slots?tutorId=T2`, T1 GET unregistered `/:id` for T2/missing UUID, T1 POST forged `tutorId`/`role` | GET forged query **400**, no T2 rows; no detail route, both detail paths 404/no Slot payload; strict POST 400, T2 unchanged |
| SLOT-09 | AC-S1-14, VC/TEST-S1-13, VAL-013 | Open same Slot in Bangkok, UTC and Tokyo browser zones; cross midnight | Same intended Bangkok date/hour, exact 60m, same UTC instant |
| SLOT-10 | AC-S1-13, **VC/TEST-S1-37**, VAL-005 | Two same-Tutor overlapping creates with deterministic barriers; capture A/B `pg_backend_pid()` and verify observer `pg_blocking_pids(B_pid)` includes A | At most one conflicting Offered row committed; loser non-success; log true lock wait, HTTP outcomes, SQLSTATE and no ghost row |
| SLOT-11 | AC-S1-13, VC/TEST-S1-37 | Reverse A/B winner order using two API instances/independent DB connections; direct SQL bypass of HTTP guard | Native exclusion prevents overlap; record observed blocker/wait, SQLSTATE (often 23P01/40001 depending order), committed rows and exact winner |
| SLOT-12 | NFR-S1-11, BR-S1-18/034 | Inject SQL failure before commit, simulate DB unavailable | Rollback, zero partial data, safe 503/non-success, no false 201 |
| SLOT-13 | NFR-S1-01/08, AUTH-13/16 | Invalid/missing CSRF, wrong Origin, revoked cookie | Denied, DB unchanged; sanitized error without secrets |
| SLOT-14 | AC-S1-08/14, FR-S1-19 | Real Tutor UI login→create→refresh→full own-list (no detail/filter/page); process restart | Database-backed end-to-end path persists; safe DTO/occupancy (Unoccupied at #14), deterministic order |
| SLOT-15 | Proposed NFR-S1-09/VAL-033 | Keyboard, contrast/targets, viewports 320/375/768/1280; 409/422/503 | Visible focus/alerts, no overflow, error recovery and no false success |
| SLOT-16 | SLOT-I1/I2, VAL-004/005 | Direct SQL 59-minute insert, overlap insert; inspect pg constraint/index | CHECK and GiST exclusion deny invalid committed rows |
| SLOT-17 | SLOT-I1/I3/I4/I7 | Lock Tutor, deactivate/role change; direct `INSERT Withdrawn`, `UPDATE` each of `id/tutorId/startsAt/endsAt/lifecycle/withdrawnAt` and a no-op update, `DELETE`, `TRUNCATE` | API rejects invalid owner; S1 DB trigger rejects INSERT Withdrawn/UPDATE/DELETE with **23514** and identified constraint; TRUNCATE **23514/42501**, unchanged committed row counts; no S2 reactivation PASS claim |
| SLOT-18 | SLOT-I5, retry safety | Duplicate POST/unknown network outcome | At most one overlapping offer, GET used for reconciliation, no false exactly-once promise |
| SLOT-19 | AC-S1-12/14, VC/TEST-S1-12/13, OD-003 | Send RFC3339 future `13:00:00`/`13:00:00.000`/`13:17:00` with offsets, and `13:00:30`/`13:00:00.500`, leap-day/invalid-day, missing offset; run in UTC/Tokyo browser zone | Accept second/fraction **zero** and **any minute**; 400 for nonzero seconds/fraction/invalid civil time; no rounding/DB row; Bangkok hour unchanged |
| SLOT-20 | AC-S1-07, AUTH-09/16, privacy | Hold a successful T1 owner-list GET; logout or switch to T2 while pending; release old T1 response after T2/current signed-out state | Old T1 Slots **never reappear**; T2 own-list contains only T2; stale GET cannot update protected view after session change |

## Deterministic Race A procedure

1. Open A/B on **independent** PostgreSQL sessions. Both target overlapping Offered intervals of T1 on an approved future Bangkok date. Prepare T1 identity/auth fixtures.
2. A begins SERIALIZABLE, captures `SELECT pg_backend_pid() AS a_pid` and locks T1 `User FOR UPDATE`; hold A at an **explicit test-only barrier** before COMMIT. B begins with an independently checked-out `pg.PoolClient` / second API instance; a test-only instrumentation seam records B's `pg_backend_pid()` **before** it attempts the same User lock. This seam must not become a production HTTP test hook.
3. Using an independent observer connection, repeatedly query `SELECT pg_blocking_pids($1::int) AS blockers` with B PID under a **bounded test timeout**, until it includes A PID (optionally corroborate `pg_stat_activity.wait_event_type='Lock'`). **Fail the race test** if no actual blocking pair is observed; do not proceed on guessed timing/sleep alone.
4. Release A, let it INSERT+COMMIT, then allow B to resume/full-transaction retry. B either returns a safe conflict or aborts with an attributable SQLSTATE, never commits overlapping Offered state. Record both request statuses (201 vs 409/transaction error as contracted), observed SQLSTATE(s), A/B backend PIDs, blocker observation and retry count.
5. From a **fresh post-commit observer connection**, query `SELECT id,"tutorId","startsAt","endsAt","lifecycle" FROM "Slot" WHERE "tutorId"=$1 ORDER BY "startsAt",id` and independently assert no pair of Offered half-open ranges intersects; record row IDs/counts. Reverse winner order; repeat direct SQL inserts on separate connections that bypass Express to prove GiST backstop. Controls: same-Tutor adjacency and different-Tutor same-hour must both pass.
6. Inject a DB failure before COMMIT and verify rollback plus safe response; restart API and re-read committed rows.

Important: Test with real PostgreSQL, not SQLite, only ORM mock, or HTTP status without DB assertions. A `23P01` conflict is not a successful retry; bounded `40001`/`40P01` retries start new transactions and must still fail an actual overlap. Tests **must** prove B waited on A, not only that two requests were launched.

## Privacy and DB immutability drill-down (planned, no executions)

- **SLOT-08:** authenticate as T1. Request `GET /api/v1/tutor/slots?tutorId=T2`, `?page=1` or another unknown query. All return 400 INVALID_INPUT and no foreign rows; own unfiltered GET returns only T1 rows. `GET /api/v1/tutor/slots/{T2SlotId}` and an unknown UUID both return 404 because **there is no detail route**, not because a foreign record was looked up. A forged `tutorId` in POST is a 400. No query can change `WHERE tutorId=principal.userId`.
- **SLOT-20:** with T1 signed in, intercept/hold a genuine successful T1 GET while the component is mounted. Trigger Logout (or switch auth identity to T2), clear protected state and issue T2 own-list if applicable. Release the **old 200** response **after** logout/new T2 success. Assert no T1 row IDs/time appear; verify T2 can see only T2 data. Repeat with a 401 or network failure from the stale request.
- **SLOT-17:** on an Offered fixture row use real SQL to attempt UPDATE ID, owner, start, end, lifecycle, withdrawnAt, and no-op UPDATE; ordinary UPDATE/DELETE must throw **SQLSTATE 23514 / `slot_s1_immutable`**; INSERT Withdrawn must throw **23514 / `slot_s1_insert_lifecycle`**; TRUNCATE must throw **23514** (or runtime **42501**). Compare pre/post committed row images/count. **Withdrawn→Offered cannot be executed in Sprint 1** because Withdrawn creation and updates are forbidden; mark it **DEFERRED TO SPRINT 2**, not PASS. Sprint 2 migration must explicitly permit one-way Offered→Withdrawn and separately prove no reactivation. Check production-equivalent DB runtime credential cannot disable the protective trigger via DDL; if it can, report the privilege gap rather than claiming immutable DB protection.
- **SLOT-19:** check that the UI produces `HH:mm -> HH:mm:00.000+07:00`, API validates full real civil date+offset, accepts every minute (including 13:17), rejects 13:00:30/13:00:00.500 without rounding and that cross-midnight +60m retains date meaning under UTC/Tokyo browser emulation.

## Feature integration limits

AUTH-07/08/09 and domain part of AUTH-16 are exercised with actual Slot routes in #14. Customer availability and stale selection belong to #15; Booking cutoff Q05 and races B/C belong to #16; Customer-private Booking reads belong to #17; final integrated `sprint1→main` release to #18. Do not report those as #14 PASS.

## Run ledger (Part F only)

| Command/check | Status |
|---|---|
| `npm ci` / `npm run db:generate` / `npm run db:migrate` (fresh DB) | NOT RUN |
| `npm run typecheck` / `npm run build` | NOT RUN |
| `npm test`, `npm run test:db` with Slot test discovered | NOT RUN |
| `npm run test:e2e` including Tutor UI | NOT RUN |
| Real DB Race A observed `pg_blocking_pids()` / direct SQL / rollback / restart | NOT RUN |
| SLOT-17 immutability trigger and Sprint 1 mutation matrix | NOT RUN |
| SLOT-19/20 precision and stale protected GET tests | NOT RUN |
| Human accessibility/privacy/OD decision review | NOT RUN |

**Pre-code review gate:** @Chxtamos reviews case setup, fixtures, AC coverage, actual concurrency orchestration, expected SQL statuses and policy uncertainty; approves/requests edits to this STS **before** code. No Part F work begins merely because a file exists.
