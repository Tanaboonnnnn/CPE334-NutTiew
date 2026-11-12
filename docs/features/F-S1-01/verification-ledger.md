# F-S1-01 Part F — Verification ledger (2026-11-04, local Windows)

Source contract: `tests.md` AUTH-01..23. This ledger does **not** replace the STS or reviewer sign-off. Status `PARTIAL` means some assertions passed but the entire AUTH row has not been verified. Author's earlier runs used native Windows PostgreSQL 17.2; reviewer round 3 used isolated PostgreSQL 18.3. No Docker and no CI proof are claimed for current HEAD.

| STS | Status | Evidence / remaining gap |
|---|---|---|
| AUTH-01 | PARTIAL | Four-account C1/C2/T1/T2 browser identity/role/login/reload/logout matrix ran 1/1 PASS on author Windows; manual/visual acceptance pending |
| AUTH-02 | PARTIAL | Unknown/wrong/inactive 401 and no cookie; timing/nonenumeration review pending |
| AUTH-03 | PARTIAL | Forged query/header role ignored by `/me`; reusable trusted DB Role Guard + owner-filtered predicate fixture tested; Slot/Booking integrations pending |
| AUTH-04 | PARTIAL | Logout 204, DB replay 401, injected UPDATE fault and concurrent logout race verified via 25/25 DB test suite; full crash recovery pending |
| AUTH-05 | PASS (auth-only) | Independent A/B sessions; A logout leaves B active |
| AUTH-06 | PARTIAL | Inactive, revoked, expired 401; restart persistence not independently verified |
| AUTH-07 | BLOCKED | Domain Slot/Booking routes not implemented in this PR; `/me` anonymous 401 |
| AUTH-08 | BLOCKED | Tutor Slot route belongs to Issue #14 |
| AUTH-09 | BLOCKED | Tutor ownership route belongs to Issues #14/#17 |
| AUTH-10 | BLOCKED | Customer Booking route belongs to Issues #16/#17 |
| AUTH-11 | PARTIAL | Argon2id + SHA-256 token digest implemented; log/secret audit pending |
| AUTH-12 | PARTIAL | Injected Session INSERT and Logout UPDATE faults: sanitized 503, no false cookie clearing; full DB outage injection still pending |
| AUTH-13 | PARTIAL | Cross-origin/CSRF rejection for auth; unsafe domain routes absent |
| AUTH-14 | PARTIAL | Expiry/replay and concurrent logout verified; exact PostgreSQL 28,799/28,800/28,801s predicate proven in new DB test. Live HTTP latency-boundary measurement remains separate. |
| AUTH-15 | PARTIAL | Reviewer verified f38a5aa Edge 10/10; new automated contrast, 44px hit-target, keyboard focus, error announcement, and uncertain-logout tests added at follow-up HEAD **NOT RUN**. Human reviewer/date/SHA WCAG/visual sign-off remains pending |
| AUTH-16 | PARTIAL | Reusable requireSession/requireRole/requireOwnedResource exercised on owner-scoped DB fixture; domain Slot/Booking integration BLOCKED by Issues #14–17 |
| AUTH-17 | PARTIAL | Concurrent CSRF GET across reinitialized app and unchanged Session row verified in author DB test 25/25; explicit process restart and all table snapshot pending |
| AUTH-18 | PARTIAL | Origin/Referer and CSRF rejection, 12 concurrent API logouts tested at f38a5aa; new actual two-tab same-Session unsafe logout and persisted revocation test added at follow-up HEAD **NOT RUN** |
| AUTH-19 | PARTIAL | Reviewer f38a5aa: exact DB predicate at 28,799/28,800/28,801s. New HTTP `/auth/me` 200/401/401 test using test-only PostgreSQL clock parameter substitution (production `now()` unchanged) added at follow-up HEAD **NOT RUN**; full production clock/failover not asserted |
| AUTH-20 | PARTIAL | Success/failure quota, IPv4 and equivalent IPv6 HTTP→DB 20+1 shared HMAC bucket, Unicode byte/length negative cases verified on author Windows PostgreSQL 17.2 (25/25); full exact boundaries/proxy matrix pending |
| AUTH-21 | PARTIAL | v1→v2 CSRF rotation, prior-key overlap, old session logout and missing prior-key 503 tested; production rollout still pending |
| AUTH-22 | PARTIAL | Two real API processes: 40 HTTP all-wrong/all-correct/mixed each passed; DB 5 live Argon2-check barrier, sixth correct 429 and retry 200 with account/IP bucket snapshots; genuine child-process exit with five persisted pending reservations, forced lease expiry, immediate recovery and late settlement denial passed. Complete HTTP crash/DB outage and every edge scenario remain outstanding. |
| AUTH-23 | PARTIAL | Reviewer verified f38a5aa four-account Edge matrix and old-200-across-navigation test. New deterministic `React.StrictMode` same-mounted-component cleanup test holds first successful `/me` 200, sends second 401, then releases first 200 and asserts no stale identity; **NOT RUN** on follow-up HEAD |

### Commands and evidence

- **Reviewer only, HEAD `c00f63e`, isolated PostgreSQL 18.3:** `npm ci`, `npm run db:generate`, `npm run db:migrate`, `npm run typecheck`, `npm run build` PASS; `npm test` 11/11; `npm run test:db` 21/21; `npm run test:e2e` 7/7; `npm run test:stress` 2 API processes × 40 HTTP attempts per all-wrong/all-correct scenario PASS. See PR #26 review #5768247196.
- **Author earlier, HEAD `99b634f`, Windows PostgreSQL 17.2:** unit 8/8; DB 20/20; Edge 7/7; two-process stress PASS. No Docker.
- **Author run on synced base HEAD `a2d4910`, Windows PostgreSQL 17.2:** `npm run typecheck`, `npm run build`, `npm test` 11/11, `npm run test:db` 25/25, `npm run test:e2e` 7/7, `npm run test:stress` two processes × 40 wrong and 40 correct login attempts: PASS. A new auth-only C1/C2/T1/T2 Edge matrix + delayed unauthorized `/me` test ran **9/9** Edge PASS on the local uncommitted working tree (as of 2026-11-04); record resulting committed SHA separately. No GitHub Actions CI proof.
- Browser images: `evidence/login-320.png`, `login-375.png`, `login-768.png`, `login-1280.png`, `customer-session.png` (all synthetic test data).
- Automated assertions are narrower than the full contract; a Ready-for-Review PR can be opened for reviewer feedback, but the unresolved rows still block full Issue #13 DoD acceptance and merge.

## Reviewer feedback response (PR #26 review #5767022017)

- **P1 XFF spoofing:** client-ip.ts now validates/canonicalizes IPs and walks right-to-left through only explicitly trusted hops; spoofed leftmost IP ignored; tests in client-ip.test.ts. Deploy with an explicit proxy trust list; never trust arbitrary XFF on direct clients.
- **P1 reusable authorization:** `guards.ts` exports DB-verified `requireSession`, `requireRole` and `requireOwnedResource` with privacy-safe missing/foreign 404. Fixture routes in `guards.db.test.ts` prove 401/403/404 without creating Slot/Booking functionality.
- **P1 stale leases:** `admit` reconciles expired pending reservations while owning the account bucket lock; `settle`/`reapExpired` use consistent account-then-reservation lock ordering. The DB test asserts immediate re-admission after five expirations and late-worker non-settlement.
- **P2 error envelope:** API errors use sanitized {error:{code,message},requestId} without private SQL, request IDs are per request. Tests cover origin denial and injected logout UPDATE failure.
- **P2 UI:** email autocomplete, ARIA error references, input focus, 10s request cancellation, and 7th Edge timeout test added. Not a full human WCAG assessment.
- **P2 approval-state:** PR #25 reviewer approved OD-005-D in comment #6625521193 (confirmation review #5765005104); Part E docs corrected, approval does **not** imply runtime DoD. Author PostgreSQL 17.2 on Windows; reviewer PostgreSQL 18.3 on separate environment; no GitHub Actions CI checks on these test logs.

No Docker. Open review PR does not imply merge or full AUTH-01..23 acceptance.

## PR #26 review round 2 — commit-based change record (2026-11-04)

Reviewer round 2 [#5767788384](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/26#pullrequestreview-5767788384) identified non-canonical equivalent IPv6 texts and stale OD-005-D approval statements. Follow-up branch updates:

- **P1 IPv6:** `client-ip.ts` maps IPv6 textual variants to an identical 128-bit hexadecimal identity and normalizes mapped IPv4 to dotted decimal before `AUTH_RATE_KEY` HMAC and trusted-peer comparison. `client-ip.test.ts` now includes compressed/expanded/case IPv6, mapped v4, proxy-traversal and invalid-form assertions. `auth.db.test.ts` adds a 20-attempt quota and 21st 429 test with rotating equivalent IPv6 strings through the trusted proxy chain.
- **P2 approval state:** `specification.md`, `api-spec.md`, `tests.md` and `data-spec.md` replace stale pending design gate text with the actual approval decision in PR #25 comment [#6625521193](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/25#issuecomment-6625521193). **Design approved does not mean Part F STS complete.**
- **Reviewer-run verification now available for these changes:** @Tanaboonnnnn independently ran HEAD `c00f63e32556dc4498329ec584c2998da6450d9e` on isolated PostgreSQL **18.3**, documented in [PR #26 Review round 3 (#5768247196)](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/26#pullrequestreview-5768247196). `npm ci`, `npm run db:generate`, `npm run db:migrate`, `npm run typecheck`, `npm run build` **PASS**; `npm test` **11/11 PASS**, `npm run test:db` **21/21 PASS**, `npm run test:e2e` **7/7 PASS**, `npm run test:stress` (**2 API processes × 40 HTTP requests in each of all-wrong/all-correct scenarios**) **PASS**. Reviewer specifically verified HTTP→PostgreSQL 20 attempts across equivalent IPv6 strings, 21st denied with 429 and shared bucket. **Author's local Windows PostgreSQL 17.2 was offline for this HEAD; no author-run or GitHub Actions CI result is claimed.** AUTH-20/22 remain PARTIAL and human WCAG sign-off/other PARTIAL/BLOCKED cases remain unchanged.

### PR #26 review round 3 — reviewer-run evidence and remaining scope

- **Verified commit:** `c00f63e32556dc4498329ec584c2998da6450d9e` reviewed by @Tanaboonnnnn on isolated PostgreSQL **18.3** (not author's Windows PostgreSQL 17.2), review [#5768247196](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/26#pullrequestreview-5768247196). Tests: unit **11/11**, DB **21/21**, Edge **7/7**, 2-process all-wrong/all-correct HTTP stress **PASS**. This is the basis for updating the earlier HEAD-specific `NOT RUN` statement, **not a fabricated author-run**.
- **Round-3 documentation feedback:** `data-spec.md` Privacy and failure behavior and `tests.md` AUTH-22 approval language corrected to distinguish **OD-005-D design APPROVED** from **Part F STS PARTIAL**.
- **Not covered by those passes:** AUTH-01/23 browser four-account C1/C2/T1/T2 and stale identity, full Unicode/input boundaries, 8h edge clocks, CSRF restart/no-write/two-tab, deterministic Argon2 barrier/mixed requests, forced crash/DB outage, visual/WCAG human sign-off. Domain cases AUTH-07/08/09/10 and Slot/Booking integrations remain BLOCKED on Issues #14–17; guard fixtures within #13 were verified separately. These cases are not marked PASS without evidence.
- **Patch verification status:** the reviewer-run results above correspond to HEAD `c00f63e` before these two documentation-only changes; they are not CI results and do not certify newly added tests or features.

### Round-3 follow-up: newly authored acceptance probes (unverified)

- GitHub branch changes after reviewer-verified `c00f63e` include three additional DB tests in `apps/api/test/auth.extended.db.test.ts`: concurrent CSRF reads with fresh `createApp` instance and unchanged Session row, concurrent logout with replay rejection, and latency-tolerant expiry probes. A further input test checks UTF-8 byte bounds (multi-byte characters), email length rejection and no cookie on invalid input.
- **Current execution state: NOT RUN.** The connected Windows terminal could not be reached. No pass counts are claimed for the added tests, and any failed check requires correction before a new approval request.
- **Still missing:** deterministic Argon2 barrier/mixed load, actual process crash/DB outage, exact time-boundary test with controlled clock, four-account browser C1/C2/T1/T2 switching/stale identity, human WCAG review. Cross-feature routes remain blocked on Issues #14–17. All unresolved STS items stay PARTIAL/BLOCKED rather than PASS.

### Latest author-run evidence, 2026-11-04

On native Windows PostgreSQL 17.2, synced base commit a2d4910b49f2aea4742ef10d172c05dac2eef1c3: typecheck/build PASS, unit 11/11 PASS, PostgreSQL DB tests 25/25 PASS, Edge 7/7 PASS, two-process stress PASS (wrong 5×401+35×429; correct 5×200+35×429). After adding test-only e2e/auth.matrix.spec.ts, Microsoft Edge **9/9 PASS**: four synthetic accounts C1/C2/T1/T2 with distinct UUID references and roles, repeated login/reload/logout and delayed unauthorized /me after logout. The delayed-401 test does **not** prove an old 200 arriving after a newer 401; that race remains PARTIAL. More work needed for exact-clock timing, mixed/barrier/crash tests and WCAG human sign-off. Test results refer to the working tree of this patch before commit; no CI claim.

### Review #5769210920 ? author-side acceptance expansion (2026-11-04)

**Scope remains Issue #13 Authentication ONLY.** Changes include `e2e/auth.stale.spec.ts`, `apps/api/test/auth.boundary.db.test.ts`, `apps/api/test/auth.barrier.db.test.ts`, `apps/api/test/auth.crash.db.test.ts`, small test-only `credentialVerifier` injection in `createApp`, `scripts/stress.mjs` mixed scenario, and a randomized IPv6 identity in `auth.db.test.ts` to prevent cross-run bucket collisions. No Slot or Booking endpoints.

**Actual author-run on Windows 11, Node 24.14.0, npm 11.9.0, native PostgreSQL 17.2, without Docker:**

| Command | Result | Notes |
|---|---|---|
| `npm run typecheck` | PASS | API and Web |
| `npm run build` | PASS | API TypeScript and Vite production bundle |
| `npm test` | **11/11 PASS** | Unit/auth/IP canonicalization |
| `npm run test:db` | **29/29 PASS** | Five tests files plus crash test, real PostgreSQL. Full rerun after initial test-harness fixes. |
| `npm run test:e2e` | **10/10 PASS** | Microsoft Edge browser; C1/C2/T1/T2 matrix, error/timeout and held old `/me` 200 across newer 401 navigation. |
| `npm run test:stress` | **PASS** | 2 live independent API processes ? 40 each all-wrong/all-correct/mixed. Observed wrong 5?401 + 35?429; correct 5?200 + 35?429; mixed 2?200 + 3?401 + 35?429 on final run. Account `inFlight=0` at completion; `failed` matches 401 count; Session count matches 200. |

**Additional test-level evidence:**

- `AUTH-19`: PostgreSQL authoritative microsecond precision compares `expiresAt > createdAt + {28799,28800,28801} seconds`, result `true,false,false`; no fake 30-second margin. Earlier JavaScript Date rounding produced a red test; replaced by exact DB expression. This is precise DB-predicate proof, **not a fake HTTP clock**.
- `AUTH-22`: deterministic in-process *Argon2 verification hold/release* via test-only injected `credentialVerifier`, with **two separate Express app instances sharing PostgreSQL**. During barrier: account `failed=0,inFlight=5`, IP admissions=5. Sixth correct HTTP login=429 with no cookie and no 6th IP permit. On release five HTTP requests=200, counters `failed=0,inFlight=0`; manual retry sixth=200 and IP admissions=6. This is an actual Argon2 verification barrier, **not two separately running OS HTTP servers for that specific scenario**; two live OS processes were used in the independent 40-request stress script.
- `AUTH-22`: launched a **child Node OS process** which persisted five `pending` reservations, exited with status 77 without calling `settle`; parent read PostgreSQL rows, forced expired leases, admitted new reservation, confirmed `failed=0,inFlight=1` after reconciliation and late settlement false. It simulates process exit during auth admission, not a live HTTP process crash while Argon2 is running. A full DB outage and production failover were **NOT RUN**.
- `AUTH-23`: Edge route interception held a previously fetched authorized HTTP 200 `/me` across navigation, then supplied a newer 401 for the reloaded document and verified no old identity appears. This is deterministic **cross-navigation** delayed-success evidence; a race within the *same mounted React component* remains open because the navigation invalidates the older component.

**Remaining authorization/sign-off:** WCAG 2.2/manual visual review still requires an independent human reviewer and recorded sign-off; injected whole-DB outage, same-mount old-200-vs-newer-401, browser two-tab unsafe race and independent server restart under persistent sessions are not fully established. Domain tests AUTH-07/08/09/10 and domain portion AUTH-16 remain **BLOCKED by Issues #14?17**. Retain `PARTIAL` where applicable; a passing command does not imply complete AUTH-01..23 acceptance or authorization to merge. All results above are author-run on this worktree before commit; record final SHA after commit. No CI proof.

## PR #26 review #5769910107 and subsequent patch (2026-11-04)

**Verified reviewer baseline:** @Tanaboonnnnn's [Review #5769910107](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/26#pullrequestreview-5769910107), on **`f38a5aa1295dbea2bd1042eba29589fb74db07d6`**, Windows Node 24, isolated PostgreSQL 18.3: `npm ci`, Prisma generate/migrate, typecheck/build PASS; **11/11 unit**, **29/29 real DB**, **10/10 Edge**, 2 live OS API servers × 40 login attempts per all-wrong, all-correct, mixed PASS. A separate DB connection-refusal probe returned sanitized **503** for login, authenticated `/me`, logout without falsely setting/clearing cookies; **not** a live DB failover test. This is independent reviewer evidence, not GitHub Actions CI.

**Changes after reviewer baseline — execution NOT RUN:** Windows terminal tunnel has been disconnected during this patch. Changed `implementation.md` evidence from obsolete 8/20/7 totals to accurate reviewer-verified 11/29/10 and preserved historical SHA. Added `e2e/auth.stale.spec.ts` same React `StrictMode` effect test: old GET `/me` 200 captured and delayed, newer 401 completed *within the same mounted React component*, then delayed 200 fulfilled; test checks state stays logged out. Also added 2-tab same-session unsafe logout test with CSRF and PostgreSQL `revokedAt` assertion, and simulated logout 503/uncertain UI state. Added `e2e/auth.a11y.spec.ts` automated four-viewport input/button targets ≥44 px, border/foreground/focus contrast calculations, focus outline and error announcement; automated checks **do not constitute human WCAG sign-off**. Added `apps/api/test/auth.http-clock.db.test.ts` to the `npm run test:db` script: at the HTTP `/me` guard, injects an authoritative PostgreSQL-formatted microsecond timestamp instead of `now()` *only via a test pool adapter*, expecting 200 at 28,799s and 401 at 28,800/28,801s. This tests the production Session/active-User/revocation predicate through the HTTP endpoint under a controlled clock, without modifying production TTL handling.

**Reviewer action required:** Run `npm run typecheck`, `npm run build`, `npm test`, `npm run test:db`, `npm run test:e2e`, `npm run test:stress` against this newer HEAD before claiming PASS; inspect errors and fix any failing tests. Human visual/WCAG review should record reviewer, date, HEAD SHA, 320/375/768/1280px, error/focus/logout-uncertain states, text contrast ≥4.5:1, non-text functional cues ≥3:1, and 44×44px targets in `tests.md` checklist. **No human approval is recorded by this patch.** AUTH-07/08/09/10 and domain AUTH-16 stay BLOCKED on Issues #14–17. Do not merge or mark full Issue #13 DoD based on the older verification totals.

## Issue #50 UI theme alignment (`feature/50-login-ui-theme`, 2026-11-11)

- **Trigger / directive:** `@Tanaboonnnnn` [PR #49 comment #6775767086](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/49#issuecomment-6775767086) requesting that Login/Auth (`F-S1-01`) move off the standalone ZenGreen/cream palette (`#285C4B`, `#F6F4EF`, `#77877B`) onto the canonical NutTiew Navy + Orange + Light Canvas tokens (`#202B44`, `#F47736`, `#F7F8FB`, `#172137`) shared with `tutor-dashboard.css` and `customer-availability.css` via `apps/web/src/tokens.css`, preserving all Auth/Session/CSRF logic and WCAG 2.2 AA contrast.
- **TDD RED -> GREEN evidence:**
  - Before CSS edits (on clean `sprint1@9aa37c0`), added shared-token/alert computed-style assertions to `e2e/auth.a11y.spec.ts` and ran Edge E2E -> **FAIL (RED)** as expected: canvas background `rgb(246, 244, 239)` instead of `rgb(247, 248, 251)` and `#auth-error` background `rgba(0, 0, 0, 0)` instead of `rgb(255, 243, 243)`.
  - After implementing `apps/web/src/tokens.css`, updating `style.css` / `tutor-dashboard.css` / `customer-availability.css` / `main.tsx` Login presentation markup, and syncing `F-S1-01/ui-spec.md` & `tests.md`:
    - `npm test`: **34/34 PASS** (`@nuttiew/api` 29/29 across 4 files; `@nuttiew/web` 5/5 in 1 file)
    - `npm run typecheck`: **PASS** (API and Web)
    - `npm run build`: **PASS** (API TypeScript + Vite production bundle)
    - `npm run test:db`: **107/107 PASS** (14 test files on native Windows PostgreSQL 17.2)
    - `npm run test:e2e -- --reporter=line` (at initial PR #51 commit `c8da6c1`, verified locally and in GitHub Actions run `42883503150`): **67/68 PASS, 1 FAIL** (Microsoft Edge):
      - All Auth E2E (`auth.a11y.spec.ts` 2/2, `auth.matrix.spec.ts` 2/2, `auth.spec.ts` 7/7, `auth.stale.spec.ts` 4/4) **15/15 PASS** (including computed token colors, `320/375/768/1280px` >=44x44px hit targets, zero horizontal overflow, >=4.5:1 / >=3:1 WCAG contrast ratios, `#AA4519` focus outline, and `#FFF3F3` / `#9C2424` error alert).
      - All Customer Availability (`11/11`), Booking (`3/3`), Retrieval (`6/6`), Tutor Slots (`7/7`), and Tutor Dashboard (`25/25`) specs **PASS**.
      - 1 failure in `e2e/sprint1.journey.spec.ts:89`: pre-existing UTC-vs-Bangkok date boundary bug between `00:00–06:59 Asia/Bangkok` (`17:00–23:59 UTC`) where `new Date(Date.now() + 21d).setUTCHours(6,0,0,0)` inserted `raceSlot` on `2026-12-01` while `bangkokDayKey(21)` queried `2026-12-02`.
    - **CI fix follow-up (`e2e/sprint1.journey.spec.ts`):** Aligned `raceStart` to `bangkokInstant(raceDay, '13:00')` (`+07:00` explicit offset matching `booking.spec.ts` and `availability.spec.ts`). Re-ran targeted `npx playwright test e2e/sprint1.journey.spec.ts --reporter=line` (**1/1 PASS** at `02:45+07:00` / `19:45 UTC`) and full `npm run test:e2e -- --reporter=line` (**68/68 PASS**, Microsoft Edge).
- **Visual & evidence artifacts:** Before/After screenshots checked cleanly via synthetic fixtures and stored under `docs/evidence/login-theme/` (`login-before-1280.png`, `login-after-1280.png`, `login-before-375.png`, `login-after-375.png`, `login-before-error-1280.png`, `login-after-error-1280.png`). `docs/evidence/sprint1/` was restored cleanly (`git checkout -- docs/evidence/sprint1/`).
- **Remaining non-automated gate:** Manual Human WCAG 2.2 AA & Screen-Reader visual/semantic review remains **NOT RUN** (human reviewer approval required on PR #50).
