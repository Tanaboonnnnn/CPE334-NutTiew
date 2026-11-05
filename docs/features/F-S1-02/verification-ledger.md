# F-S1-02 — Part F verification ledger (Issue #14)

**Code commit:** `1beeb917c95d30f912f4c99d819f6d161a38f6a1`,
`feature/issue-14-tutor-slots` based on merged `sprint1`
`b3e598e616e6184035beb35a841a21a131e3c5fa`.
**Scope:** Part F implementation of the reviewed Part E contract (PR #27).
**Execution:** 2026-11-05, local Windows, Node **v24.14.0**, npm **11.18.0**,
PostgreSQL **18.3** on a **dedicated disposable test cluster** (port 55414),
Prisma Client **7.10.1**, Vitest **4.1.12**, Microsoft Edge Playwright.
These are **actual locally observed results**, not GitHub Actions results.
The test commands were executed against the code worktree immediately before
the code commit; files in that code commit match the tested implementation.
The subsequent ledger-only documentation commit does not change application
behavior. Source setup: [implementation.md](implementation.md).

## Actual observed command outcomes

| Command | Actual result | Status |
|---|---|---|
| `npm ci` | 355 packages installed; npm reported 0 audited vulnerabilities; install-script approval warnings displayed | **PASS**, warnings noted |
| `npm run db:generate` | Prisma Client 7.10.1 generated from current schema | **PASS** |
| `npm run db:migrate` | Auth migration followed by new `20261105000000_tutor_slots` applied to fresh PostgreSQL test DB; subsequent run reports no pending migrations | **PASS** |
| `npm test` | 3 Vitest files, **25 passed / 0 failed** (14 Slot timestamp + 11 existing Auth/security units) | **PASS** |
| `npm run typecheck` | API and web TypeScript checks exit 0 | **PASS** |
| `npm run build` | API TypeScript and React/Vite production build exit 0 | **PASS** |
| `npm run test:db` | 10 real PostgreSQL Vitest files, **43 passed / 0 failed** (30 existing Auth + 13 Slot integration/race/restart) | **PASS** |
| `npm run test:e2e -- --reporter=line` | Microsoft Edge browser, **19 passed / 0 failed** (15 existing Auth + 4 Slot scenarios) | **PASS** |
| `git diff --check` / staging allowlist | No whitespace errors; 19 intended Part F files in code commit; ignored `.env` not staged | **PASS** |

Total: **87 passing tests** across Unit + DB + Edge E2E. These counts refer to
the precise test command outputs above, not the number of planned STS cases.

### TDD RED → GREEN evidence

- First `test/slot-time.test.ts` run: module `../src/slot-time.js` missing,
  Vitest failed; after implementation **14/14 PASS**.
- First `test/slots.db.test.ts` run: all **4 HTTP behavior tests FAILED**
  with 404 for missing `/api/v1/tutor/slots`; after migration+route+service,
  **4/4 PASS**, later expanded to **6/6 PASS**.
- First `e2e/slots.spec.ts` Tutor create test: missing
  "ตารางเวลาติวของฉัน" heading; after UI implementation, Tutor browser
  tests **4/4 PASS**.
- A newly written revoke-while-waiting real DB race test initially
  **FAILED: 201 instead of 401**. Investigated a stale Serializable Session
  snapshot; added `Session ... FOR UPDATE` with bounded full-transaction
  retry. Re-ran same regression, **PASS: 401 and zero Slot rows**.
- Test-harness fixes are documented as such: `pg_blocking_pids()` needs
  to follow **actual lock blocker chains**, and fresh reserved IP fixtures
  avoid unrelated Auth login rate limits between repeated test runs.

### Actual Race A and native SQL evidence (VC/TEST-S1-37)

**Real PostgreSQL with two separate HTTP-connected DB pools and an independent
observer:** both writers were proven waiting on the same locked Tutor User
before barrier release via `pg_backend_pid()` and `pg_blocking_pids()`
(including chained blockers). Forced winner orders:

| Case | Observed HTTP outcomes | Committed matching Offered rows |
|---|---|---|
| A first (PID 15248), B second (PID 1928), holder PID 13320 | **201 / 409** | Exactly 1, ID `3bc16fdc-6e5e-4f7f-aa13-f489ddb8e2bf` |
| B first (PID 1928), A second (PID 15248), holder PID 13320 | **201 / 409** | Exactly 1, ID `4ac1c0fa-e49e-4387-92ee-811fa00d74fe` |
| Two direct PostgreSQL INSERTs bypass HTTP with real GiST lock wait | Loser SQLSTATE **23P01** | Winner only; exclusion survives HTTP bypass |

Direct SQL negative tests also confirmed CHECK failure for 59-minute Slot,
SQLSTATE **23514** for forbidden `INSERT Withdrawn` and normal direct
`UPDATE` / `DELETE` / `TRUNCATE`, with original committed row unchanged.
Separate runtime test role `slot_runtime_14` had **SELECT/INSERT** on Slot
but **no UPDATE/DELETE/TRUNCATE and no trigger-disabling DDL**.

**Failure + restart:** an actual SQL `22012` division-by-zero after a valid
uncommitted Slot INSERT was followed by rollback and **zero committed rows**.
An unreachable PostgreSQL endpoint caused a safe HTTP **503**, not a false
201, and no Slot row. The real Node API OS process was stopped and restarted
against the same PostgreSQL database; the same Slot ID
`f10db246-95f1-4634-a968-e23d6761d9d1` remained visible through
authenticated GET after restart.

### Browser / privacy verification

- Browser timezone **America/Los_Angeles**: Tutor selected Bangkok 13:17,
  created exactly 60-minute Slot, page reload retained the record.
- Bangkok 23:30 start preview rendered **00:30 next day**.
- At **320, 375, 768, 1280px**, Tutor form/buttons remained visible and
  `document.documentElement.scrollWidth > window.innerWidth` was false.
- Intercepted a 503 POST: no success announcement; form usable and safe
  uncertainty message shown.
- **Original 19/19 run had a narrower SLOT-20 test:** it delayed the
  outgoing own-list request **before** it reached the API, then forwarded
  or cancelled it after Logout. That was **not proof** that an already
  authorized HTTP 200 with private T1 Slots could not reappear. The
  reviewer-requested 200-before-Logout regression is recorded separately
  in the remediation evidence below; do not cite the original test for it.
- Real API cases denied anonymous/Customer roles, forged POST owner and GET
  `?tutorId=...`, unknown query parameters, invalid dates/precision,
  wrong Origin and invalid/cross-session CSRF.

## NOT RUN / gates before merging

- **LOCAL CONFIGURATION CHECK ONLY:** the new GitHub Actions CI workflow
  (`.github/workflows/ci.yml`) defines separate quality, real PostgreSQL
  and Microsoft Edge checks with a CI-only runtime role setup script.
  YAML was parsed and its three jobs/triggers and DB service assertions were
  validated locally using Python/PyYAML; the Bash script passed `bash -n`.
  Both files were added **after** the locally tested code commit. A hosted
  GitHub Actions result must be recorded separately at the exact PR head SHA.
- **NOT YET VERIFIED HERE:** GitHub-hosted CI conclusions at the future PR head.
  Local PASS and YAML validation are **not** CI PASS.
- **NOT RUN:** manual Human WCAG/contrast and keyboard-audit signoff.
  Automated viewport/keyboard cases do not replace human accessibility review.
- **NOT RUN:** production/GCP migration/grant validation and full service
  deployment/failover proof. Test privileges are from a disposable local DB.
- **PARTIAL:** SQL rollback injection and HTTP 503 are proven separately;
  deliberately crashing the real API DB connection **after its Slot INSERT
  but before COMMIT** has not been tested as one combined HTTP fault scenario.
- **OUT OF SCOPE/NOT RUN:** Sprint 2 withdrawal and anti-reactivation transition,
  Customer discovery #15, Booking #16, Booking privacy #17, integrated release #18.
- **AWAITING:** independent teammate Part F code review/approval;
  instructor Master/Theme policy signoff remains unverified.

**Issue #14 remains OPEN** until teammate-reviewed Part F merge and full
Definition of Done. Do not use an AI-assisted design review as a claim of
independent human confirmation.

## PR #28 requested-changes remediation — 2026-11-05 (Asia/Bangkok)

**Reviewer:** @Chxtamos, [requested-changes review](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/28#pullrequestreview-5783653506).
**Implementation commit:** `34bf4174ca8ea8d918d974fc6cc2714ba4a5fdc0`
on `feature/issue-14-tutor-slots`. This is a focused correction to
`e2e/slots.spec.ts` and `apps/web/src/tutor-slots.tsx` only; **no CSS,
theme, layout, colors, API, DB schema or production server code changed**.
The prior `1d0f5ac` [GitHub Actions run #41897343367](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/41897343367)
was 3/3 SUCCESS for **that earlier SHA** only, not proof of CI at this
new review-fix commit.

### P1 — SLOT-20 delayed *authorized* T1 200 (review thread 4479485580)

The new Playwright test inserts two distinguishable PostgreSQL-backed
fixtures (T1 Slot ID and T2 Slot ID; Bangkok 10:06 versus 15:43).
After logging in as T1, it triggers a fresh GET; the route handler invokes
`route.fetch()` **while T1 is authenticated**, verifies HTTP **200** and
asserts the captured DTO contains **T1's exact Slot ID** and **not T2's**.
It retains that actual authorized response without browser fulfillment
while T1 logs out and T2 signs in, verifies T2's own Slot is visible, then
releases the **previous T1 HTTP 200** with `route.fulfill({response})` and
checks again that T2's Slot is visible and T1's distinct times are absent.

**Observed:** targeted SLOT-20 Playwright execution **1/1 PASS**;
the complete browser suite also includes this case below.
The original request-before-authorization test is superseded and is
**not** counted as evidence for this stronger scenario.

### P2 — Timeout / network uncertainty + duplicate-retry gate

`isUncertainWrite` now recognizes DOM `AbortError` by its **name**,
network `TypeError` and uncertain server HTTP 502/503/504, while
preserving specific 400/403/409/422 handling. A potentially committed
POST with a lost response uses the already-existing uncertainty message,
then **authenticates and refreshes its owner-only Slot list** before the
submit control is enabled again. If reconciliation GET fails, the submit
control stays disabled; the existing **โหลดอีกครั้ง** list-retry
action must successfully re-read own Slots before a new submission.
No new visible components or styling were introduced.

Test-first **RED** proof (before the implementation change):

- Network loss **after a real server-committed POST**, injected via
  `route.fetch()` followed by `route.abort('failed')`, **FAILED**:
  expected the uncertainty text but got the generic
  "ไม่สามารถดำเนินการได้ โปรดลองอีกครั้ง".
- Real **10-second AbortController timeout**, triggered by preserving
  a `route.fetch()` POST response but withholding browser fulfillment,
  **FAILED** for the same incorrect generic error message.

After the correction, **4 targeted Playwright cases PASS**: real
ten-second timeout after COMMIT with a GET reconciliation, network
disconnect after COMMIT with GET reconciliation, network disconnect
plus an initially **failed reconciliation GET** (submit remains disabled
until manual list reload succeeds), and P1's old-200/T2-switch test.
Each uncertain-POST case checks no false success notice; the successfully
reconciled DB Slot is visible in the own list.

### Fresh local checks performed after the review fix

Environment: the dedicated local Windows PostgreSQL 18.3 test cluster,
Node v24.14.0, npm 11.18.0 and Microsoft Edge. **No production DB used.**

| Executed command | Observed result |
|---|---|
| `npm run db:generate` | **PASS**; Prisma Client generated |
| `npm run db:migrate` | **PASS**; two migrations present, no pending migrations |
| `npm test` | **PASS, 25/25** |
| `npm run typecheck` | **PASS**, both API and web |
| `npm run build` | **PASS**, API and Vite web |
| `npm run test:db` (first full attempt) | **FAIL, 42/43**; existing `AUTH-19` returned 503 instead of expected 200 in `auth.extended.db.test.ts`. No Auth implementation edits made. |
| `npx vitest run test/auth.extended.db.test.ts` (isolated) | **PASS, 16/16** |
| `npm run test:db` (second full attempt) | **PASS, 43/43** across ten real PostgreSQL test files, including Race A both winner orders |
| `npm run test:e2e -- --reporter=line` | **PASS, 22/22** in Microsoft Edge (15 Auth + 7 Slot), including all newly added scenarios |

**Latest successful full-suite total: 25 Unit + 43 PostgreSQL +
22 Microsoft Edge = 90 automated tests passing.**
The original 42/43 result is not rewritten as a pass: the transient
`AUTH-19` 503 did **not** recur in the isolated run or full rerun,
but its precise cause remains **unconfirmed**. Monitor the next
GitHub-hosted DB job and do not claim the flake has been rooted out.

**Pending at this documentation edit:** 3/3 new-head GitHub Actions CI
verification (must be checked at the subsequently pushed PR HEAD),
fresh independent peer review of both requested corrections, and the
previously documented manual WCAG / production deployment / combined
post-INSERT process fault-injection limitations. **No PR merge** and
**no Issue #14 closure** are authorized by these local results.

### GitHub-hosted first follow-up CI: test selector diagnosis and correction

Run [#42022093365](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/42022093365)
at `84e5c5183e79d821fec5b677730cb1cb973c34b2` completed
**FAILURE**, with **2/3 success**:

- GitHub Unit / TypeScript / production build: **SUCCESS**.
- GitHub PostgreSQL 18 / real Auth + Slot + Race A: **SUCCESS**.
- GitHub Microsoft Edge E2E: **FAILURE, 21/22**. The new
  `SLOT-18 prevents duplicate submission until a failed reconciliation GET
  is retried` test contained an ambiguous
  `page.getByRole('alert')` locator when a fast Linux runner correctly
  displayed **two** simultaneous alerts: the uncertain POST result and
  the failed GET reconciliation. Playwright's strict-mode selector matched
  two nodes and failed at `e2e/slots.spec.ts:178`. This was a **test
  selector error**; the desired app behavior (both alerts visible)
  was present in the captured failure output.

**Surgical correction (test only):** the affected assertion now targets
the existing specific `#slot-error` element, without removing either
alert, changing product behavior or changing visual design/CSS. On the
unchanged application code, local tests after this correction:

- Targeted `SLOT-18 prevents duplicate submission`: **PASS, 1/1**.
- Full `npm run test:e2e -- --reporter=line`: **PASS, 22/22**
  (15 Auth + 7 Slot) in Microsoft Edge.
- `git diff --check`: no whitespace errors.

The **next pushed commit's hosted CI**, not these local reruns, determines
whether the correction is accepted on Linux. Preserve the historical
21/22 hosted failure as evidence; do not overwrite it with a claim that
run #42022093365 succeeded.
