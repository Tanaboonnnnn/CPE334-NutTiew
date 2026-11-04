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
- Held an old Tutor own-list response until after Logout: late response
  never restored the prior Tutor's protected schedule.
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
