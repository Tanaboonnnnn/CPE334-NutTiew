# F-S1-02 — Tutor Calendar Dashboard Part F verification

**Scope:** Issue [#14](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/14), new
Tutor-only Calendar Dashboard implementation. This is **Part F evidence**, not
another Part E change. The approved [Part E amendment PR #30](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/30)
was merged into `sprint1` at `d373e27f24b557f5747467e7ea5eee4eb25df4b4` **before**
this new implementation branch was created. The old combined PR #29 remains
a Draft reference only and is **not** a substitute for this independent
Part F peer review.

**Latest tested implementation commit:** `d048e341196a85ddac647d29c660214988cb411c`
(PR #31 P2 security and non-text contrast correction). The earlier UI
implementation was committed at `baa18de07964efd637a4d936a688dfe2d3812629`.
**No DB migrations, Slot DTO properties, schema or business rules changed.**
The security fix **does** narrowly modify two existing authenticated read
routes to attach a non-credential, hashed per-session response header, and
the existing authenticated POST route to reject an optional mismatched
expected-session header before any write. This is a backward-compatible
principal-binding guard, **not an added public Slot DTO identity field**.
The original peer-approved Part E contract documents are unchanged.
This evidence/screenshots update follows the tested code commit. Confirm
the final PR HEAD and hosted CI on GitHub separately before asserting them.

## Local verification (real executed commands)

Tests ran on Windows with Node 24.14.0, npm 11.18.0, a **disposable
PostgreSQL 18** test cluster and Microsoft Edge Playwright. An ignored,
test-only `.env` was used locally; no secrets are tracked.

| Command | Observed result |
|---|---|
| `npm ci --no-audit --no-fund` | PASS: 355 packages installed; npm printed install-script allowlist warnings, with no installation failure |
| `npm test` | **PASS 25/25** unit (Security 4, client IP 7, Slot time 14) |
| `npm run typecheck` | **PASS** (API and Web TypeScript) |
| `npm run build` | **PASS** (API compilation and Vite production Web bundle) |
| `npm run test:db -w @nuttiew/api -- --maxWorkers=2` | **PASS 43/43** DB Integration, 10 test files |
| `npm run test:e2e -- --reporter=line` | **PASS 46/46** Microsoft Edge E2E (Auth 15, baseline Slot 7, Tutor Dashboard 24) |

**114/114 passing tests across the three executed test suites.**
Do not confuse this with a statement of complete WCAG conformance or
an entire Sprint 1 release. In particular, DB concurrency remained
**unchanged** by this UI PR: the observed Race A ran with **A first and
B first**, each returning **201/409** with exactly one committed
overlapping offer, and the direct PostgreSQL overlapping writer
returned SQLSTATE **23P01**. Real process restart and runtime
least-privilege checks were included in the 43 DB tests.

### Test-first security correction (RED → GREEN)

- **RED before production correction:** replacing the prior incorrect
  "uncertain Logout preserves visible Tutor data" assertion with three
  accepted `UX-R5-LOGOUT` browser cases produced **3/3 expected failures**:
  private Slot cards still rendered after Logout 503; session-recheck
  recovery button was absent; pending Logout did not hide the private
  dashboard.
- **GREEN after correction:** the same three cases passed **3/3** with
  the new pending/uncertain/rechecking state machine, immediate Tutor
  content unmount, synchronous mutation guard and revalidated recovery.
- **Further checks added and executed:** pending Create-CSRF cannot
  become a new Slot POST once Logout starts; fresh same-Tutor
  `/auth/me` **and** fresh own-list GET are required to restore private
  data; a GET failure keeps data hidden; a fresh 401 clears the view;
  other identities cannot unlock old Tutor Slots. Error, empty,
  409, stale real 200, network uncertainty and customer-denied tests
  remain covered.
- An in-flight POST already dispatched **before** Logout can commit.
  This UI work does **not** claim the server rolls back an earlier
  committed write.

### PR #31 peer re-review: two P2 fixes (2026-11-06, RED → GREEN)

**P2-1 — Cross-tab account/session binding (UX-R5-LOGOUT-01/02):**

- **RED:** a deterministic two-tab Edge E2E captured a real T1
  `/api/v1/auth/me` 200, held its browser delivery, then authenticated
  T2 in another tab (replacing the same-origin HttpOnly cookie) before
  allowing the first tab to request the full own-list. Old code wrongly
  restored T1 identity while the subsequent GET used T2's session
  and could render T2 Slots below T1. The new test **failed** on the
  old code because the T1 session-check guard disappeared.
- **GREEN:** `/auth/me` and successful `GET /tutor/slots` now carry
  `X-NutTiew-Session-Binding`, an SHA-256 digest of the authenticated
  user ID plus server-side Session UUID, **not a bearer credential**.
  The client checks equality on every authorized own-list response,
  including initial load, normal refresh, uncertain POST reconciliation
  and post-Logout Session recovery. A missing/mismatched header fails
  closed with `SESSION_MISMATCH` without painting wrong-owner data.
  All actual Slot DTO fields
  and their shape remain unchanged.
- Login verifies the newly authenticated principal and obtains its
  server-issued binding before mounting the private Tutor Dashboard.
  Login/Logout events notify other same-origin tabs through browser
  storage events so they immediately suspend the stale UI and writes;
  stale request generations are ignored and mounted Slot fetches are
  aborted on unmount. When another tab starts Logout but CSRF is still
  held, a second E2E proves the first tab hides its private Slot data.
- **Wrong-account mutation regression:** the Tutor Slot POST accepts an
  optional `X-NutTiew-Expected-Session-Binding`. A mismatched value is
  rejected **403**, before creating any Slot; another real two-tab E2E
  verifies **zero T2 rows** when a stale T1 Create form tries to submit
  under T2's newly selected session. Legacy clients without the optional
  header retain the original authenticated/CSRF-protected API behavior.

**P2-2 — Critical non-text control contrast (UX-R4):**

- **RED:** the two targeted computed-style Edge tests failed on the
  original control borders, notably form input **1.71:1** and
  GET-retry control **1.79:1** against white (below 3:1). An initial
  test-helper parsing issue and one browser navigation timeout were
  corrected/retried; those were not falsely counted as app regressions.
- **GREEN:** CSS `--tutor-control-border: #66778a` is **4.59:1**
  against white and **4.13:1** against hover `#eff3f9`; it is used
  by the form inputs, date picker, Calendar Prev/Next/Today and Retry.
  A disabled Calendar control retains an opaque visible boundary.
  Real-browser E2E measures default, hover, visible keyboard focus,
  disabled and invalid/error states using computed CSS colors and
  a WCAG 2.2 sRGB contrast formula; the keyboard focus outline
  is separately checked. The existing approved orange CTA design
  remains unchanged.

**Executed regression after both fixes:** Unit **25/25**, real
PostgreSQL DB/Race A **43/43**, Edge E2E **46/46**, Typecheck and
Production Build **PASS**. All five new Edge tests (the two-tab held
GET, mismatched POST 403, cross-tab pending Logout signal, non-text
controls and Retry) passed within the **full 46-test suite**. No
manual WCAG 2.2 AA conformance signoff was performed.

## Reviewed UX contract traceability

| ID | Verified evidence |
|---|---|
| UX-R1 | Functional NutTiew navy/orange Tutor-only shell, current server-derived role/short ID, working account link and Logout; no invented Students/Revenue/Booking |
| UX-R2 | Real PostgreSQL Slot blocks at Bangkok 13:17, 13:59, and 23:30→00:30 across midnight; scrollable 00:00–24:00 timeline; UTC transport unchanged |
| UX-R3 | Client-side Prev/Next/Today/date selection sends **no new API query/filter**; full persisted own-list remains complete and Overview count independent of Calendar viewport |
| UX-R4 | Browser viewport tests 320, 375, 620, 621, 768, 1060, 1061, 1280; no horizontal document overflow, ≤620 mobile agenda, 621–1060 two-day and ≥1061 three-day Calendar, keyboard/focus and touch target checks |
| UX-R4 CTA + controls | Computed fill `#F47736`, dark foreground `#172137` and border `#D96123` on header/create buttons; keyboard focus `#AA4519` 3px outline and 3px offset; **other critical control boundaries** (input, calendar buttons, date picker, retry) now computed and checked `>=3:1` in default/hover/focus/disabled/error states |
| UX-R5-GET-01/02 | Initial GET 503 → failed retry 503 never claims empty/zero; authenticated GET 200 restores all genuine Slot rows or a genuinely empty schedule |
| UX-R5-LOGOUT-01/02 | Immediate private identity/Slot hide and POST guard; uncertain 503 retry/check; same-Tutor `/auth/me` 200 plus **same-session-bound** own GET 200 before recovery; cross-tab held T1/T2 GET never mixes owners, wrong-session create 403 with no DB insert, cross-tab Logout signal hides private UI; different identity, GET 503 and /me 401 safety |
| UX-R6 | Real DB-backed Edge captures of desktop/tablet/mobile/creation/error states (links below); original Customer Auth presentation retained |

### Real browser screenshots

The screenshots were **recaptured after the P2 security/contrast fix**
by Playwright against the real app and disposable PostgreSQL-backed
API, then copied from `test-results` with **9/9 matching SHA-256
hashes**. No stock/demo appointment objects were inserted.

| Scenario | Screenshot |
|---|---|
| 320 CSS px mobile full Agenda | [dashboard-320.png](evidence/dashboard-320.png) |
| 375 CSS px mobile full Agenda | [dashboard-375.png](evidence/dashboard-375.png) |
| 768 CSS px two-day timeline | [dashboard-768.png](evidence/dashboard-768.png) |
| 1280 CSS px three-day timeline | [dashboard-1280.png](evidence/dashboard-1280.png) |
| Real newly committed any-minute Slot + persisted Agenda | [dashboard-after-create-1280.png](evidence/dashboard-after-create-1280.png) |
| Real API 409 conflict, previous input retained | [dashboard-conflict-409.png](evidence/dashboard-conflict-409.png) |
| Real empty Tutor own-list | [dashboard-empty-1280.png](evidence/dashboard-empty-1280.png) |
| Own-list GET 503, unknown-not-empty read state | [dashboard-get-error-503.png](evidence/dashboard-get-error-503.png) |
| Logout 503/uncertain, private account and Slots hidden | [dashboard-logout-uncertain-503.png](evidence/dashboard-logout-uncertain-503.png) |

## Open verification and strictly excluded scope

- **Manual human WCAG 2.2 AA audit/signoff: NOT RUN.** Automated Edge
  samples cover selected contrast, visible focus, breakpoints,
  keyboard and target checks but **do not certify** full WCAG AA
  conformance. A reviewer must separately record actual manual
  keyboard/reflow/contrast findings, review date and implementation SHA.
- **Production/GCP/deployment privilege verification: NOT RUN** and
  not required in the Tutor Dashboard follow-up. The two guarded API
  response headers/optional expected-session request header need no
  migration or additional browser-exposed personal data.
- **Instructor/stakeholder 24/7 policy approval: NOT ASSERTED.**
  Original owner-selected Option A permits any minute with no invented
  work-hours/horizon rule; calendar ticks do not constrain create times.
- **Other Issues:** Customer availability [#15](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/15),
  exclusive Booking [#16](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/16),
  protected Booking retrieval [#17](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/17)
  and Deliverable 1 release/PDF [#18](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/18)
  remain separate tasks. No Student/revenue/booking data, new API
  **endpoint**, Slot DTO owner fields or DB schema was invented here.
- **Peer approval and merge of this Part F code PR: PENDING** until
  @Chxtamos independently reviews the actual new PR HEAD.

## Follow-up P2 — successful login must notify other tabs before /me verification (2026-11-06)

Reviewer @Chxtamos accepted and resolved the prior two P2 findings but identified a
remaining login-notification race in `apps/web/src/main.tsx`: a successful
login POST replaces the browser's shared HttpOnly cookie, while the old client
only notified other tabs after the subsequent `/auth/me` succeeded.
If `/auth/me` failed, an older Tutor tab could keep displaying stale private
data indefinitely without another network request.

- **RED (old code, real Microsoft Edge):** the new
  `UX-R5-LOGOUT-01: T2 login with failed /me hides T1 private data in the
  other tab` test failed: Tab A still rendered **4 private T1 Slots** after
  Tab B's real authenticated T2 login returned 200 and its intercepted
  follow-up UI `/auth/me` returned HTTP 503. The test also verified via
  unmocked `other.request.get('/api/v1/auth/me')` that the shared session
  actually belonged to T2.
- **GREEN:** moved the existing `notifyOtherTabs()` invocation immediately
  after successful `request('login')` and before awaiting `request('me')`.
  The existing per-tab session guard, response-binding verification and
  fail-closed recovery remain unchanged. The exact new test passed **1/1**.
- **Full local regression:** `npm test` **25/25 PASS**;
  `npm run typecheck` **PASS**; `npm run build` **PASS**;
  `npm run test:db -w @nuttiew/api -- --maxWorkers=2` **43/43 PASS**;
  `npm run test:e2e -- --reporter=line` **47/47 PASS**, including all
  existing Auth, Slot, Dashboard and the new real two-tab regression.
  **115/115 tests across three suites**; `git diff --check` **PASS**.
- **Scope:** only the login notification ordering in `apps/web/src/main.tsx`,
  one new Playwright test in `e2e/tutor.dashboard.spec.ts`, and this
  verification note. No API, DB, contracts or unrelated features changed.
- **Separate gates:** hosted CI of the eventual new HEAD, peer re-review,
  manual WCAG 2.2 AA signoff and any release/merge decision must be checked
  separately; none is implied by local tests.
