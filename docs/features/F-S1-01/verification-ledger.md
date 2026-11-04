# F-S1-01 Part F — Verification ledger (2026-11-04, local Windows)

Source contract: `tests.md` AUTH-01..23. This ledger does **not** replace the STS or reviewer sign-off. Status `PARTIAL` means some assertions passed but the entire AUTH row has not been verified. Author's earlier runs used native Windows PostgreSQL 17.2; reviewer round 3 used isolated PostgreSQL 18.3. No Docker and no CI proof are claimed for current HEAD.

| STS | Status | Evidence / remaining gap |
|---|---|---|
| AUTH-01 | PARTIAL | Customer browser login; Tutor API login; distinct roles not yet both browser-verified with exact fixtures |
| AUTH-02 | PARTIAL | Unknown/wrong/inactive 401 and no cookie; timing/nonenumeration review pending |
| AUTH-03 | PARTIAL | Forged query/header role ignored by `/me`; reusable trusted DB Role Guard + owner-filtered predicate fixture tested; Slot/Booking integrations pending |
| AUTH-04 | PARTIAL | Logout 204, DB replay 401, logout UPDATE fault injection tested; concurrent logout test added at later HEAD, NOT RUN yet |
| AUTH-05 | PASS (auth-only) | Independent A/B sessions; A logout leaves B active |
| AUTH-06 | PARTIAL | Inactive, revoked, expired 401; restart persistence not independently verified |
| AUTH-07 | BLOCKED | Domain Slot/Booking routes not implemented in this PR; `/me` anonymous 401 |
| AUTH-08 | BLOCKED | Tutor Slot route belongs to Issue #14 |
| AUTH-09 | BLOCKED | Tutor ownership route belongs to Issues #14/#17 |
| AUTH-10 | BLOCKED | Customer Booking route belongs to Issues #16/#17 |
| AUTH-11 | PARTIAL | Argon2id + SHA-256 token digest implemented; log/secret audit pending |
| AUTH-12 | PARTIAL | Injected Session INSERT and Logout UPDATE faults: sanitized 503, no false cookie clearing; full DB outage injection still pending |
| AUTH-13 | PARTIAL | Cross-origin/CSRF rejection for auth; unsafe domain routes absent |
| AUTH-14 | PARTIAL | Expiry-at-now and replay checked; concurrent logout test added but NOT RUN at current HEAD; exact clock boundary still pending |
| AUTH-15 | PARTIAL | 7/7 Edge tests: viewports, paste/autocomplete, focus/ARIA/error, pending 10s timeout; WCAG 2.2 and human sign-off pending |
| AUTH-16 | PARTIAL | Reusable requireSession/requireRole/requireOwnedResource exercised on owner-scoped DB fixture; domain Slot/Booking integration BLOCKED by Issues #14–17 |
| AUTH-17 | PARTIAL | 10 repeated CSRF GETs and cross-site rejection verified at c00f63e; concurrent GET/restart/no-session-row-mutation test added at later HEAD, NOT RUN |
| AUTH-18 | PARTIAL | Origin/Referer and CSRF rejection; two-tab unsafe race pending |
| AUTH-19 | PARTIAL | 8h absolute DB expiry and no sliding verified at c00f63e; added latency-tolerant DB-clock expiry probes, NOT RUN and not exact 28,800-second proof |
| AUTH-20 | PARTIAL | 3 successes + 5 failures + 429 and IPv4 quota verified; equivalent IPv6 representations share one HMAC bucket across 20 HTTP attempts, 21st denied 429, PostgreSQL bucket attempts=20 (reviewer verified c00f63e on PostgreSQL 18.3). Additional Unicode byte/length tests added after c00f63e but NOT RUN; full input/proxy matrix pending |
| AUTH-21 | PARTIAL | v1→v2 CSRF rotation, prior-key overlap, old session logout and missing prior-key 503 tested; production rollout still pending |
| AUTH-22 | PARTIAL | Two real API processes, 40 HTTP all-wrong/all-correct stress; 5 expired leases reconciled during new admit; late settlement no Session; deterministic barrier, mixed, crash and DB outage pending |
| AUTH-23 | PARTIAL | Browser current server-derived account reference, refresh/logout; C1/C2/T1/T2 switch/stale-response pending |

### Commands and evidence

- **Reviewer only, HEAD `c00f63e`, isolated PostgreSQL 18.3:** `npm ci`, `npm run db:generate`, `npm run db:migrate`, `npm run typecheck`, `npm run build` PASS; `npm test` 11/11; `npm run test:db` 21/21; `npm run test:e2e` 7/7; `npm run test:stress` 2 API processes × 40 HTTP attempts per all-wrong/all-correct scenario PASS. See PR #26 review #5768247196.
- **Author earlier, HEAD `99b634f`, Windows PostgreSQL 17.2:** unit 8/8; DB 20/20; Edge 7/7; two-process stress PASS. No Docker.
- **Current HEAD after round-3 updates:** new tests added but **NOT RUN**; previous results must not be presented as passing for these changes. No GitHub Actions CI result.
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
