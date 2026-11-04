# F-S1-02 — Tutor Slot Software Test Specification (Part E)

> **ALL TESTS PLANNED / NOT RUN.** Issue #14, owner @Tanaboonnnnn, reviewer @Chxtamos. Source contracts: [SDS](specification.md), [HTTP](api-spec.md), [UI](ui-spec.md), [Data](data-spec.md). Baseline `sprint1` `6fd3931` has Auth tests but **no Slot code/migration/test**.

## Test harness, data and TDD evidence

Use clean disposable real PostgreSQL with Auth migration plus **new** Slot migration, test-only accounts T1/T2 (Tutor) and C1 (Customer), authenticated session cookies and session-bound CSRF, Supertest/Vitest, at least two independent `pg` connections, Playwright for real Tutor flow. Test dates are future relative to **database authoritative time**, not hardcoded as perpetually valid. Never commit passwords/keys. Test names should match stable AC/VC and execute through actual npm scripts.

Record **RED** first (missing route/schema/constraint causes expected failure), **GREEN** after implementation, command, exact SHA, PG/Node version, migration revision, PASS/FAIL/SKIP and final DB rows. UI-only warnings and `Promise.all()` without verified contention do not prove Race A.

## Planned test cases

| STS | Trace IDs | Setup/action | Required observable result |
|---|---|---|---|
| SLOT-01 | AC-S1-08, VC/TEST-S1-08, VAL-003 | T1 authenticated, POST future Bangkok 13:00 | 201, one DB Offered Slot owned T1, end exactly 14:00 |
| SLOT-02 | AC-S1-08, VC/TEST-S1-14, VAL-031 | T1 GET own list, refresh/restart API with same DB | Same committed Slot ID, UTC times, owner visible; no in-memory substitute |
| SLOT-03 | AC-S1-09, VC/TEST-S1-09, VAL-004 | T1 already offers 13:00–14:00, proposes 13:30–14:30 | 409; old row unchanged, no second row |
| SLOT-04 | AC-S1-10, VC/TEST-S1-10 | T1 creates 13:00–14:00 then 14:00–15:00 | Both rows committed; adjacency permitted |
| SLOT-05 | AC-S1-11, VC/TEST-S1-11 | T1/T2 both create same 13:00–14:00 future window | Both succeed, distinct owner rows |
| SLOT-06 | AC-S1-12, VC/TEST-S1-12 | Missing/invalid/offsetless timestamps, invalid date, past/equal-now, extra client owner/duration | Defined 400/422; no new/modified row |
| SLOT-07 | AC-S1-05/06, VC/TEST-S1-05/06, AUTH-07/08 | Anonymous/Customer tries Tutor POST and protected GET | 401/403, no private response or write |
| SLOT-08 | AC-S1-07, VC/TEST-S1-07/31, AUTH-09/16 | T1 guesses T2 Slot ID, forges tutorId/role | Owner-filtered safe 404 if detail route; strict POST rejects extra owner; T2 unchanged |
| SLOT-09 | AC-S1-14, VC/TEST-S1-13, VAL-013 | Open same Slot in Bangkok, UTC and Tokyo browser zones; cross midnight | Same intended Bangkok date/hour, exact 60m, same UTC instant |
| SLOT-10 | AC-S1-13, **VC/TEST-S1-37**, VAL-005 | Two same-Tutor overlapping creates with barrier/forced lock contention | At most one conflicting Offered row committed; loser non-success; no ghost row |
| SLOT-11 | AC-S1-13, VC/TEST-S1-37 | Race A through independent DB connections/two API instances; direct SQL | Native exclusion prevents overlap even when bypassing HTTP precheck |
| SLOT-12 | NFR-S1-11, BR-S1-18/034 | Inject SQL failure before commit, simulate DB unavailable | Rollback, zero partial data, safe 503/non-success, no false 201 |
| SLOT-13 | NFR-S1-01/08, AUTH-13/16 | Invalid/missing CSRF, wrong Origin, revoked cookie | Denied, DB unchanged; sanitized error without secrets |
| SLOT-14 | AC-S1-08/14, FR-S1-19 | Real Tutor UI login→create→refresh→own list; process restart | Database-backed end-to-end path persists |
| SLOT-15 | Proposed NFR-S1-09/VAL-033 | Keyboard, contrast/targets, viewports 320/375/768/1280; 409/422/503 | Visible focus/alerts, no overflow, error recovery and no false success |
| SLOT-16 | SLOT-I1/I2, VAL-004/005 | Direct SQL 59-minute insert, overlap insert; inspect pg constraint/index | CHECK and GiST exclusion deny invalid committed rows |
| SLOT-17 | SLOT-I3/I4/I7 | Lock Tutor, deactivate/role change; attempt direct updates to immutable fields; withdrawn ID reactivation once enabled | Forbidden mutation or explicit design gate; never label unimplemented S2 checks PASS |
| SLOT-18 | SLOT-I5, retry safety | Duplicate POST/unknown network outcome | At most one overlapping offer, GET used for reconciliation, no false exactly-once promise |

## Deterministic Race A procedure

1. Open A/B on **independent** PostgreSQL sessions. Both target overlapping Offered intervals of T1 on an approved future Bangkok date. Prepare T1 identity/auth fixtures.
2. Transaction A begins SERIALIZABLE, locks T1 `User FOR UPDATE` and holds an explicit test-controlled barrier; B begins attempt and reaches **observed lock wait** (verify, not merely sleep or uncoordinated Promise.all).
3. Release A after its insert and COMMIT. B resumes/retries under full transaction rules; verify it either safely rejects as overlap or aborts, never commits overlapping Offered state.
4. Query **committed rows** after both settle, assert zero intersecting Offered pairs of same Tutor and zero phantom side effects; check both HTTP results and actual SQLSTATE mapping.
5. Reverse winner order, repeat direct SQL inserts on separate connections to prove exclusion backstop. Control: same-Tutor adjacency and different-Tutor same-hour must pass.
6. Inject a DB failure before COMMIT and verify rollback plus safe response; restart API and re-read committed rows.

Important: Test with real PostgreSQL, not SQLite, only ORM mock, or HTTP status without DB assertions. A `23P01` conflict is not a successful retry. Tests must synchronize contention and store evidence of which Session waited.

## Feature integration limits

AUTH-07/08/09 and domain part of AUTH-16 are exercised with actual Slot routes in #14. Customer availability and stale selection belong to #15; Booking cutoff Q05 and races B/C belong to #16; Customer-private Booking reads belong to #17; final integrated `sprint1→main` release to #18. Do not report those as #14 PASS.

## Run ledger (Part F only)

| Command/check | Status |
|---|---|
| `npm ci` / `npm run db:generate` / `npm run db:migrate` (fresh DB) | NOT RUN |
| `npm run typecheck` / `npm run build` | NOT RUN |
| `npm test`, `npm run test:db` with Slot test discovered | NOT RUN |
| `npm run test:e2e` including Tutor UI | NOT RUN |
| Real DB Race A barrier/direct SQL/rollback/restart | NOT RUN |
| Human accessibility/privacy/OD decision review | NOT RUN |

**Pre-code review gate:** @Chxtamos reviews case setup, fixtures, AC coverage, actual concurrency orchestration, expected SQL statuses and policy uncertainty; approves/requests edits to this STS **before** code. No Part F work begins merely because a file exists.
