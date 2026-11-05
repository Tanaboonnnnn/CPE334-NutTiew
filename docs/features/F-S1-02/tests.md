# F-S1-02 — Tutor Slot Software Test Specification (Part E)

> **UX delta proposed 2026-11-05:** preserve SLOT-01…SLOT-20 below;
> add these *new, not-yet-executed-at-design-time* dashboard checks from
> [the dated UX decision](ui-decision-2026-11-05.md). The older Part E
> run ledger is historical; actual new executions belong in the Part F
> [verification ledger](verification-ledger.md), not this planned list.

| ID | New dashboard evidence to collect |
|---|---|
| UX-R1 | Logged-in Tutor sees original NutTiew identity, navy/orange shell, no fake data or actions; `บัญชีของฉัน` navigates to in-page `#account-details` showing **only role and shortened ID from trusted /auth/me**; Customer sees original authorized Auth page |
| UX-R2 | Real PG Slot at Bangkok 13:17 and 13:59 positions at exact minute-offset, 23:30→00:30 splits over two dates; all 24 hours accessible |
| UX-R3 | Prev/Next/Today and day picker change local view without changing GET URL; all returned Slot IDs remain in chronological agenda. **Overview count** equals full own-list Slot count across **all dates** and is constant across viewport navigation; **ช่วงที่แสดง** separately counts distinct Slots intersecting the current window (including cross-midnight only once per window) |
| UX-R4 | Real app **320/375px = full mobile Agenda** (`<=620px`), **768px = two-day timeline** (`621–1060px`), **1280px = three-day timeline** (`>1060px`); check 620/621 and 1060/1061 boundaries; screenshots, 320 CSS px reflow/no unexpected horizontal scroll, keyboard-only nav and visible unobscured focus, valid labels/status, primary controls **>=44x44 CSS px** and applicable WCAG 2.2 AA target size **>=24x24 CSS px or normative exception**. Record separate **>=4.5:1 normal text**, **>=3:1 large text**, **>=3:1 UI/non-text** computed contrast for all critical states. Automated subset is not conformance; manual human WCAG 2.2 AA signoff **NOT RUN** until actually assessed |
| UX-R5 | Re-run existing SLOT-09/12/14/15/18/20, including real 200-after-switch privacy and uncertain-POST reconciliation, with new shell |
| **UX-R5-GET-01** | Authenticated Tutor with 4 committed own Slots: initial GET 503 → retry GET 503 show loading/error and retry only, **no empty Agenda/Calendar/zero**; next genuine GET 200 restores all 4 Slot IDs, sorted and private |
| **UX-R5-GET-02** | Authenticated Tutor with **no** committed Slot: initial GET 503 → retry GET 503 must not claim an empty schedule; only authorized GET 200 with `data: []` may show true empty state and 0 total |
| **UX-R5-LOGOUT-01** | T1 starts Logout: hold CSRF and Logout requests, then inject HTTP 503, network loss or timeout. **Immediately hide T1 account ID, signed-in status, Calendar, Agenda and private cards; block Create/header CTA and any new protected POST before and after uncertainty**. Attempt creation and verify **zero new POST /api/v1/tutor/slots after Logout begins**, no newly committed Slot row. A pre-Logout in-flight POST may have committed and is not asserted rolled back. A failed `/auth/me` recheck keeps content hidden/actions blocked; do not falsely claim Logout succeeded |
| **UX-R5-LOGOUT-02** | After T1 uncertain Logout, retry Logout or `/auth/me` session check. A **fresh /auth/me 200 matching exact internal T1 ID and Tutor role** must be followed by fresh owner-list GET 200 **before** restoring T1 display or Create; failed owner GET stays hidden/blocked. Fresh Logout 204 or `/auth/me` 401 finalizes signed-out; different account or recheck 503/network stays blocked; stale T1 authorized 200 never repopulates hidden content |
| UX-R6 | Real rendered screenshots from DB-backed Tutor account; no invented data or unimplemented domain action |

**Provenance / test gate:** the above are **Part E planned acceptance
checks**, not outcomes of this docs-only PR. The implementation PR must
link these stable IDs to real Playwright/DB evidence with RED→GREEN
for unsafe Logout and GET states, rerun the original SLOT-01…20 and Auth
regressions, and record exact commit SHA and hosted CI. Do not mark
this design accepted before peer review and merge.

**WCAG evidence gate:** the Part F verification report must distinguish
(a) automated measured contrast/keyboard/viewport samples, (b) manual
inspection of all applicable WCAG 2.2 A/AA criteria including SC
1.4.3/1.4.10/1.4.11, 2.1.1, 2.4.7/2.4.11 and 2.5.8, and (c) explicit
NOT RUN items with reviewer, date and exact implementation SHA.
The old handful of 4.5:1 samples does **not** establish WCAG 2.2 AA.
For UX-R4, validate the CTA's full rendered pairing (not just its
label): `#172137` text/icons on `#F47736` fill (target calculated
**5.76:1**), `#D96123` visible border versus both `#F7F8FB` canvas
and white (calculated **3.48:1 / 3.69:1**), and `#AA4519`
`3px` offset keyboard focus outline against both backgrounds
(calculated **5.53:1 / 5.87:1**). Verify hover, disabled, keyboard,
zoom and any additional component states using **actual computed
browser colors**. White text on orange and borderless orange on
canvas/white are **not accepted**. This is a future Part F test
obligation, not a test PASS recorded by this Part E PR.

> **NEW DASHBOARD UX TESTS PLANNED / NOT RUN IN THIS DOCS-ONLY PR.** The original SLOT-01…SLOT-20 design and earlier implementation/tests from merged PR #28 are historical, **not missing** in today's `sprint1`. Issue #14, owner @Tanaboonnnnn, reviewer @Chxtamos. Source contracts: [SDS / owner policy decision](specification.md), [HTTP](api-spec.md), [UI](ui-spec.md), [Data / DB trigger matrix](data-spec.md).
>
> **Historical baseline only:** `sprint1` `6fd3931` was the **original Part E snapshot before Slot implementation** and had Auth tests but no Slot code/migration/test. **Current PR #30 base:** `sprint1` `ed451be2ca3e366bdfc1900f4c4697aa7e50b6a0` **already contains** the original Slot API, DB migration and tests from merged PR #27/#28. The new dashboard/Logout cases above are not claimed executed by this documentation PR.

## Test harness, data and TDD evidence

Use **clean disposable** real PostgreSQL with Auth migration plus **new** Slot migration, test-only accounts T1/T2 (Tutor) and C1 (Customer), authenticated session cookies and session-bound CSRF, Supertest/Vitest, at least two independent `pg` connections plus an observer connection, Playwright for real Tutor flow. Test dates are future relative to **database authoritative time**, not hardcoded as perpetually valid. Never commit passwords/keys. Test names must match stable AC/VC and execute through actual npm scripts. Because Slot direct DELETE/TRUNCATE is intentionally blocked, isolate and roll back fixtures or drop an **entire test-owned DB/schema as privileged teardown**; do not depend on deleting persisted production-like Slot rows for test cleanup.

Record **RED** first (missing route/schema/constraint causes expected failure), **GREEN** after implementation, command, exact SHA, PG/Node version, migration revision, PASS/FAIL/SKIP and final DB rows. UI-only warnings and `Promise.all()` without verified contention do not prove Race A.

## Original Slot STS cases — historical Part E test plan

The `SLOT-01` through `SLOT-20` cases below were **planned before the
original Slot implementation**, and many were subsequently exercised
by the reviewed Part F work (PR #28). This section records the original
**expected observations**, not the current execution state.
For actual command output, PASS/FAIL/rerun counts and limitations at
their recorded commit SHAs, see the separate
[original Slot Part F verification ledger](verification-ledger.md).
The **new Dashboard UX and Logout tests above are separately PLANNED
and have not been executed by this docs-only PR**.

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

## Original privacy and DB immutability procedures (historical Part E plan)

The procedures below were originally written **before the Slot feature
was implemented**, not as a claim that the original privacy or
immutability tests are still unexecuted. Actual Slot Part F evidence,
including executed SLOT-17/19/20 cases and residual manual/production
verification gaps, is recorded in the
[verification ledger](verification-ledger.md). Do not infer new
Dashboard UX acceptance from these historical checks.

- **SLOT-08:** authenticate as T1. Request `GET /api/v1/tutor/slots?tutorId=T2`, `?page=1` or another unknown query. All return 400 INVALID_INPUT and no foreign rows; own unfiltered GET returns only T1 rows. `GET /api/v1/tutor/slots/{T2SlotId}` and an unknown UUID both return 404 because **there is no detail route**, not because a foreign record was looked up. A forged `tutorId` in POST is a 400. No query can change `WHERE tutorId=principal.userId`.
- **SLOT-20:** with T1 signed in, intercept/hold a genuine successful T1 GET while the component is mounted. Trigger Logout (or switch auth identity to T2), clear protected state and issue T2 own-list if applicable. Release the **old 200** response **after** logout/new T2 success. Assert no T1 row IDs/time appear; verify T2 can see only T2 data. Repeat with a 401 or network failure from the stale request.
- **SLOT-17:** on an Offered fixture row use real SQL to attempt UPDATE ID, owner, start, end, lifecycle, withdrawnAt, and no-op UPDATE; ordinary UPDATE/DELETE must throw **SQLSTATE 23514 / `slot_s1_immutable`**; INSERT Withdrawn must throw **23514 / `slot_s1_insert_lifecycle`**; TRUNCATE must throw **23514** (or runtime **42501**). Compare pre/post committed row images/count. **Withdrawn→Offered cannot be executed in Sprint 1** because Withdrawn creation and updates are forbidden; mark it **DEFERRED TO SPRINT 2**, not PASS. Sprint 2 migration must explicitly permit one-way Offered→Withdrawn and separately prove no reactivation. Check production-equivalent DB runtime credential cannot disable the protective trigger via DDL; if it can, report the privilege gap rather than claiming immutable DB protection.
- **SLOT-19:** check that the UI produces `HH:mm -> HH:mm:00.000+07:00`, API validates full real civil date+offset, accepts every minute (including 13:17), rejects 13:00:30/13:00:00.500 without rounding and that cross-midnight +60m retains date meaning under UTC/Tokyo browser emulation.

## Feature integration limits

AUTH-07/08/09 and domain part of AUTH-16 are exercised with actual Slot routes in #14. Customer availability and stale selection belong to #15; Booking cutoff Q05 and races B/C belong to #16; Customer-private Booking reads belong to #17; final integrated `sprint1→main` release to #18. Do not report those as #14 PASS.

## Original pre-Part-F run checklist — historical planning snapshot

**The status cells below describe the original pre-implementation
checklist, not the present Slot feature or its current PASS/FAIL state.**
The original test commands and Race A/immutability/precision/privacy
cases were subsequently executed in Part F; the authoritative
observed outcomes, any failures, reruns and limitations are in the
[original Slot Part F verification ledger](verification-ledger.md).
The new Dashboard UX-R1…R6, GET/Logout acceptance tests, and any
future regression reruns must be documented **separately** in their
own Part F evidence. Human WCAG signoff remains **NOT RUN** until
performed, and any stakeholder policy approval remains a separate gate.

| Original planned command/check | Historical Part E state — consult linked Part F ledger for actual result |
|---|---|
| `npm ci` / `npm run db:generate` / `npm run db:migrate` (fresh DB) | Planned in original Part E; check actual Part F ledger |
| `npm run typecheck` / `npm run build` | Planned in original Part E; check actual Part F ledger |
| `npm test`, `npm run test:db` with Slot test discovered | Planned in original Part E; check actual Part F ledger |
| `npm run test:e2e` including Tutor UI | Planned in original Part E; check actual Part F ledger |
| Real DB Race A observed `pg_blocking_pids()` / direct SQL / rollback / restart | Planned in original Part E; check actual Part F ledger |
| SLOT-17 immutability trigger and Sprint 1 mutation matrix | Planned in original Part E; check actual Part F ledger |
| SLOT-19/20 precision and stale protected GET tests | Planned in original Part E; check actual Part F ledger |
| Human WCAG/keyboard/contrast signoff (separate manual gate) | **NOT RUN** for the new Dashboard; no human conformance claim |
| Stakeholder/instructor OD policy approvals | Separately gated; no approval implied by test execution |

**Original pre-code review gate (historical):** @Chxtamos reviewed
the original Slot Part E contract through PR #27 before the Slot
implementation in PR #28. For the **new** Tutor Calendar Dashboard,
the amended Part E in PR #30 still requires independent approval and
merge **before** a new code-only Part F PR; this historical checklist
does not satisfy that new gate.
