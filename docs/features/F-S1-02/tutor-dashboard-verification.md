# F-S1-02 — Tutor Calendar Dashboard Part F verification

**Scope:** Issue [#14](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/14), new
Tutor-only Calendar Dashboard implementation. This is **Part F evidence**, not
another Part E change. The approved [Part E amendment PR #30](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/30)
was merged into `sprint1` at `d373e27f24b557f5747467e7ea5eee4eb25df4b4` **before**
this new implementation branch was created. The old combined PR #29 remains
a Draft reference only and is **not** a substitute for this independent
Part F peer review.

**Implementation commit tested:** `baa18de07964efd637a4d936a688dfe2d3812629`
(Tutor UI, tests and browser screenshots). Database/API migrations, routes,
constraints and original Part E contract were **not modified**. This evidence
file is an additional, non-functional documentation commit after that
tested implementation. Record the final PR HEAD and CI status in the PR
review description; do not infer hosted CI approval from local runs.

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
| `npm run test:e2e -- --reporter=line` | **PASS 41/41** Microsoft Edge E2E (Auth 15, baseline Slot 7, Tutor Dashboard 19) |

**109/109 passing assertions across the three executed test suites.**
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

## Reviewed UX contract traceability

| ID | Verified evidence |
|---|---|
| UX-R1 | Functional NutTiew navy/orange Tutor-only shell, current server-derived role/short ID, working account link and Logout; no invented Students/Revenue/Booking |
| UX-R2 | Real PostgreSQL Slot blocks at Bangkok 13:17, 13:59, and 23:30→00:30 across midnight; scrollable 00:00–24:00 timeline; UTC transport unchanged |
| UX-R3 | Client-side Prev/Next/Today/date selection sends **no new API query/filter**; full persisted own-list remains complete and Overview count independent of Calendar viewport |
| UX-R4 | Browser viewport tests 320, 375, 620, 621, 768, 1060, 1061, 1280; no horizontal document overflow, ≤620 mobile agenda, 621–1060 two-day and ≥1061 three-day Calendar, keyboard/focus and touch target checks |
| UX-R4 CTA | Computed fill `#F47736`, dark foreground `#172137` and border `#D96123` on header/create buttons; keyboard focus `#AA4519` 3px outline and 3px offset; CSS token pairing verified in Edge |
| UX-R5-GET-01/02 | Initial GET 503 → failed retry 503 never claims empty/zero; authenticated GET 200 restores all genuine Slot rows or a genuinely empty schedule |
| UX-R5-LOGOUT-01/02 | Immediate private identity/Slot hide and POST guard; uncertain 503 retry/check; same-Tutor `/auth/me` 200 plus own GET 200 before recovery; different identity, GET 503 and /me 401 safety |
| UX-R6 | Real DB-backed Edge captures of desktop/tablet/mobile/creation/error states (links below); original Customer Auth presentation retained |

### Real browser screenshots

The screenshots were captured by Playwright **against the actual app and
disposable PostgreSQL-backed API**, then copied from `test-results` with
matching SHA-256 hashes; no stock/demo appointment objects were inserted
for the screenshots.

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
  not required in the Tutor Dashboard UI-only follow-up.
- **Instructor/stakeholder 24/7 policy approval: NOT ASSERTED.**
  Original owner-selected Option A permits any minute with no invented
  work-hours/horizon rule; calendar ticks do not constrain create times.
- **Other Issues:** Customer availability [#15](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/15),
  exclusive Booking [#16](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/16),
  protected Booking retrieval [#17](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/17)
  and Deliverable 1 release/PDF [#18](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/18)
  remain separate tasks. No Student/revenue/booking data or new
  API/schema was invented here.
- **Peer approval and merge of this Part F code PR: PENDING** until
  @Chxtamos independently reviews the actual new PR HEAD.
