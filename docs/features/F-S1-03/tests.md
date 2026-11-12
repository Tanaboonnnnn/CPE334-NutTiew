# F-S1-03 — Customer Availability Software Test Specification (Part E)

> **UX delta proposed 2026-11-10 (Issue #44, pending peer review):** preserve `AVA-01..19` below (whose initial `#15` executions are recorded in [verification ledger](verification-ledger.md) and which remain mandatory regression checks alongside Option A) and add the planned `UX-CAL-01..10` calendar test cases from [UX decision 2026-11-10](ui-decision-2026-11-10.md) and [amended UI spec](ui-spec.md). All `UX-CAL-01..10` checks and human WCAG 2.2 AA sign-off are **PLANNED / NOT RUN** in this docs-only Part E PR. Do **not** renumber existing `AC-S1-01..35` or `VC/TEST-S1-01..39`.

> **Historical baseline Part E note (PR #32):** All baseline cases below were originally planned prior to `#15` Part F (`PR #37`) and `#16` Part F (`PR #38`). Booking-query cases consumed the merged `#33` schema (`PR #36`); `AVA-11` now exercises the merged `#16` Booking transaction; `OD-AV-02` Tutor public display-name positive-path remains gated.

## 1. Baseline availability STS cases (historical Part E PR #32 — AVA-01..19)

> During Issue [#44](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/44) Part F, existing `AVA-*` browser checks remain required regressions, adapting DOM selection steps only where Option A collapses day/time lists without weakening any eligibility, privacy, order, session-binding, or Booking safety assertion.

| STS ID | Trace | Scenario | Required result | Dependency |
|---|---|---|---|---|
| AVA-01 | FR-S1-08, AC-S1-15, VC/TEST-S1-15, VAL-006 | C1 requests availability with an eligible future Slot | 200; approved Tutor display name if gate is cleared, otherwise opaque Tutor reference; Slot ID and Bangkok start/end identifiable; deterministic order | Shared Booking data foundation + #13/#14; name field remains gated |
| AVA-02 | FR-S1-09, AC-S1-16, BR-S1-08/21, VC/TEST-S1-22 | One Slot has a committed active Booked row; another is free | Occupied Slot not returned as bookable; other offer remains; no Customer/Booking details | Reviewed shared Booking foundation migration + committed test-only Booking rows in disposable PostgreSQL; no #16 endpoint required |
| AVA-03 | FR-S1-09, AC-S1-16, BR-S1-07/11, VC/TEST-S1-17/18, VAL-008/009 | Evaluate a past Slot, exactly 60:00 and 59:59 before start using controlled DB time | Past/59:59 excluded; exactly 60:00 included; browser clock irrelevant | Shared Booking data foundation + DB clock harness |
| AVA-04 | AC-S1-18, BR-S1-12, VC/TEST-S1-13 | Request the same populated fixture with one controlled identical DB `T_view` and PostgreSQL connection `TimeZone` set to `UTC` and `Asia/Bangkok`; also render in Bangkok, UTC and another browser timezone | Wire `startsAt`, `endsAt` and `meta.evaluatedAt` are byte-for-byte identical UTC `...sssZ` strings under both DB settings; Bangkok display is the same intended local date/time under every browser timezone | Reviewed shared Booking foundation migration + populated disposable-DB fixture; DB-session and browser timezone matrix |
| AVA-05 | FR-S1-08, NFR-S1-01/08, NFR-007, VAL-036 | Inspect full JSON with multiple Customers/Tutors | Exact allowlist only; no Customer PII, Booking ID/status/reason, email, Session/token/hash, SQL or stack; Tutor identity is `tutorRef` until name approval | Shared Booking data foundation; name field remains gated |
| AVA-06 | BR-S1-17, NFR-S1-01, VC/TEST-S1-05/06, VAL-002 | Anonymous and Tutor call Customer endpoint | Anonymous 401; Tutor 403; no offer data | #13/#14 merged |
| AVA-07 | BR-S1-20, NFR-S1-01 | Customer adds customerId/tutorId/role/page/arbitrary query | 400 INVALID_INPUT; identity/owner scope cannot be changed | #13/#14 merged |
| AVA-08 | AC-S1-15, NFR-S1-07 | Seed same-time offers from different Tutors | Stable startsAt/tutorRef/slotId order; no duplicates/hidden rows | Shared Booking data foundation + #14 merged |
| AVA-09 | AC-S1-15, NFR-S1-07/08, VAL-036 | With a controlled identical DB `T_view` and no eligible offers, repeat the empty query with PostgreSQL connection `TimeZone` set to `UTC` and `Asia/Bangkok` | Both wire responses return `data: []`, the same non-null `meta.evaluatedAt` formatted as UTC `...sssZ`, and `Cache-Control: no-store`; the aggregate still returns one metadata row; errors are never mapped to empty | Reviewed shared Booking foundation migration + empty disposable-DB fixture; DB-session timezone matrix |
| AVA-10 | FR-S1-18, NFR-S1-07/08, VAL-036 | GET/retry fails 503/network then later succeeds | Error/retry visible; no empty/zero claim during failure; successful retry restores results | #13/#14 merged |
| AVA-11 | AC-S1-17, FR-S1-09/11, BR-S1-13/21, VC/TEST-S1-22 | Customer selects offer; it becomes occupied or enters Q05 cutoff before Booking | #16 rejects without Booking/false success; UI shows non-success and refreshes | **#16 Booking transaction/endpoint required** |
| AVA-12 | NFR-S1-01/08, BR-S1-20, VAL-036 | Hold old Customer 200; logout/switch Session before releasing it | Old response never repaints; clear offers/selection on Session binding mismatch | #13/#14 merged |
| AVA-13 | NFR-S1-09, VAL-033 | Keyboard-only browse/select through loading/populated/empty/error at 320/375/768/1280 CSS px | Logical focus order, visible/unobscured focus, semantic loading/result/empty/error announcements, responsive reflow, actionable retry and measured target dimensions; 44px is a design target, not a pass without evidence | Part F manual/browser check |
| AVA-14 | NFR-S1-10, VC/TEST-S1-36 | Benchmark local seeded availability GET after warm-up | Record machine/DB/sample/p95/source SHA and workload; ≤2.0s is reference-only and must not determine pass/fail | Part F measurement; no threshold gate |
| AVA-15 | FR-S1-09/13, AC-S1-16, BR-S1-09, Q28, VAL-011 | C1 has Active Booked interval 13:00–14:00 with Tutor A; a free Tutor B Slot is 13:30–14:30 | Exclude Tutor B Slot for C1 because the authenticated Customer already has an overlapping Active Booking on another Tutor; do not return the conflicting Booking or Customer details | Reviewed shared Booking foundation migration + committed test-only Booking rows in disposable PostgreSQL; no #16 endpoint required |
| AVA-16 | FR-S1-09/13, AC-S1-16, BR-S1-10, Q28 | C1 has Active Booked interval 13:00–14:00; a free Tutor B Slot is exactly 14:00–15:00 | Include the candidate because `[start,end)` intervals are adjacent, not overlapping; strict predicate permits equality at the boundary | Reviewed shared Booking foundation migration + committed test-only Booking rows in disposable PostgreSQL; no #16 endpoint required |
| AVA-17 | FR-S1-09/13, BR-S1-09/10, Q28 | A free candidate Slot overlaps either a Cancelled C1 Booking or an Active Booking of C2 on a different Slot/Tutor | Include the candidate for C1 in both controls; only `customerId = principal.userId AND status = Booked` participates in the Customer-overlap predicate. A separate Active Booking on the candidate Slot itself must still exclude it for everyone under AVA-02 | Reviewed shared Booking foundation migration + committed test-only Booking rows in disposable PostgreSQL; no #16 endpoint required |
| AVA-18 | FR-S1-08, NFR-S1-01/08, VAL-036 | Inspect Tutor identity before and after OD-AV-02 data approval | Before approval, no `tutorDisplayName` field and no email-derived name; after approved migration/consent, only the approved nullable display-name field may be added to allowlist; no email/phone/profile leakage | Current schema for negative case; separate data approval + migration for positive case |
| AVA-19 | OD-AV-08, AC-S1-15 | Compare Customer Availability with Tutor Dashboard at desktop and mobile breakpoints | Shared NutTiew wordmark, typography, spacing, brand/nav colors, button/focus components and navigation behavior; only role-authorized destinations differ | Part F browser visual review |

## 2. UX calendar planned STS

> All cases below are **PLANNED / NOT RUN** in Issue [#44](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/44) Part E. Execute in the separate Part F implementation branch after this Part E PR merges into `sprint1`.

| STS ID | Trace | Scenario / setup | Required observable result | Method / status |
|---|---|---|---|---|
| **UX-CAL-01** | `FR-S1-08`, `AC-S1-15`, `OD-AV-03`, `UX-CAL` | Authenticated Customer receives `200 OK` with **500+ deterministic offers** across both (a) multi-day distribution up to 60 days and (b) single-day heavy distribution (`> 6` time groups, repeated Tutors) | Renders Option A 7-column monthly calendar + selected day's initial time groups (`<= 6` collapsed groups + `"ดูเวลาเพิ่มเติม"` when `> 6`); no period filter chips; DOM does **not** mount all 500+ offer rows simultaneously; clicking `"ดูเวลาเพิ่มเติม"` reveals all remaining time groups on that day without filtering away eligible offers or sending new HTTP query params | Browser E2E + unit/component check (**PLANNED / NOT RUN**) |
| **UX-CAL-02** | `FR-S1-08/09`, `AC-S1-15/18`, `OD-002`, `OD-AV-03` | Fixture spanning **Nov -> Dec -> Jan** year rollover (`2026-11-28` -> `2027-01-15` within `OD-002` 60-day `T_view`), intermediate empty month (`Dec`), same-time multiple Tutors on one day, and a controlled **leap-year February** (`2028-02-29`) | Initial calendar opens earliest eligible offer month and auto-selects earliest eligible day; each day badge displays **total offer count** (`N ช่วงเวลา`, NOT unique Tutor count); empty dates display non-color empty markings and `disabled`; Prev/Next buttons cross Nov -> Dec -> Jan and Feb 28/29 accurately using server `meta.evaluatedAt` + offers (no browser-clock horizon or hardcoded month count); intermediate empty month renders clear empty message | Controlled `T_view` + Playwright E2E (**PLANNED / NOT RUN**) |
| **UX-CAL-03** | `FR-S1-08`, `AC-S1-15`, `OD-AV-02/03`, `BR-S1-06` | Selected day contains multiple exact `(startsAt, endsAt)` pairs (including non-hourly minutes e.g. `10:15–11:15`, same-time offers from Tutors A/B, and adjacent offers) | Time groups key strictly on exact `(startsAt, endsAt)` pairs without hour snapping or slot merging; selecting a day updates Step 2 only; expanding a time group shows distinct `tutorRef` + `slotId` items in exact server order (`startsAt ASC, tutorRef ASC, slotId ASC`); no email-derived names, ratings, subjects, prices, or private fields appear | Playwright E2E (**PLANNED / NOT RUN**) |
| **UX-CAL-04** | `FR-S1-10/18`, `AC-S1-17`, `BR-S1-21` | Select a Slot, then switch calendar days/months or click `"ดูเวลาเพิ่มเติม"`; repeat while `UnknownBookingOutcome` (`503 BOOKING_OUTCOME_UNKNOWN` / network timeout) is active | Selecting day/month/time NEVER dispatches `POST` and never clears/swaps `selectedSlotId`; `#selected-offer-summary` appears only after clicking a real offer, states selection **is not a Booking**, stays rendered inline (non-sticky) below the day list across day/month changes; when `unknownOutcome` is active, selecting another `slotId` stays disabled until retry reconciles; if refresh removes non-unknown selection, clear selection cleanly and show `staleNotice` without false Booking | Playwright E2E (**PLANNED / NOT RUN**) |
| **UX-CAL-05** | `FR-S1-10..18`, `AC-S1-16..35`, `BOOK-01..33`, `RET-03/06` | End-to-end Booking confirmation and retrieval flows through Option A UI against real PostgreSQL | Confirms `201 Created` (`จองสำเร็จ` + persisted row), `200 OK` natural-key replay, `409 SLOT_UNAVAILABLE`, `409 CUSTOMER_OVERLAP`, `422 BOOKING_NOT_ELIGIBLE` (Q05 cutoff), `503 BOOKING_OUTCOME_UNKNOWN` + `"ส่งคำขอเดิมอีกครั้ง"`, `การจองของฉัน` retrieval tab (`F-S1-05`), and cross-Customer `404` isolation without regression | Real PostgreSQL + Edge E2E (**PLANNED / NOT RUN**) |
| **UX-CAL-06** | `FR-S1-18`, `BR-S1-17/20`, `NFR-S1-01/08` | Inject initial/retry `503`, malformed 200 payload (bad `evaluatedAt` / offer shape), global `200 data: []`, post-refresh/empty-month day empty, `401`/`403`, mismatched `X-NutTiew-Session-Binding`, logout uncertainty, delayed old-Customer `200` after logout/account switch | Fail-closed throughout: loading does not claim empty; `503`/malformed DTO hides calendar/counts and renders retry (`never 0`); only verified `data: []` shows global empty; day empty distinct from global empty; session/binding mismatch, logout, and `401`/`403` abort/clear calendar state immediately and never repaint stale account data | Real DB + mocked HTTP/network fault Edge E2E (**PLANNED / NOT RUN**) |
| **UX-CAL-07** | `AC-S1-18`, `BR-S1-12`, `Q29`, `VC/TEST-S1-13` | Render populated schedule (including midnight-adjacent/cross-midnight `23:30–00:30` Bangkok offer near UTC day change e.g. `16:30Z`) in browsers set to `UTC` and `America/Los_Angeles` | Bangkok month heading, calendar day bucket, `selectedDayKey` header, `HH:mm–HH:mm น.` interval, and `สิ้นสุดในวันถัดไป` badge remain identical across `UTC`, `America/Los_Angeles`, and `Asia/Bangkok` browser timezones | Cross-timezone Playwright E2E (**PLANNED / NOT RUN**) |
| **UX-CAL-08** | `NFR-S1-09`, `VAL-033`, `OD-AV-08` | Keyboard-only flow (`Tab`/`Shift+Tab`/`Enter`/`Space`) across month navigation, active dates, time groups, `"ดูเวลาเพิ่มเติม"`, offer select, inline confirm summary, and cancel/retry; verify ARIA, contrast, `@media (prefers-reduced-motion: reduce)`, and `200%` zoom | Focus ring (`3px solid #AA4519`, offset `3px`) visible and unobscured in all states; `aria-live="polite"` announces `"เลือกวันที่ ... พบ ... ช่วงเวลา"` concisely without dumping all offers; selection/empty meaning uses non-color cues (`aria-pressed`, border/text badge, dash); computed contrast meets `>= 4.5:1` text / `>= 3:1` non-text UI (`5.76:1` dark ink `#172137` on `#F47736`, `#D96123` border, `#66778A` controls); `prefers-reduced-motion` and `200%` zoom remain functional. **Manual human WCAG 2.2 AA audit remains separately tracked `NOT RUN`.** | Edge E2E + CSS telemetry (**PLANNED / NOT RUN**); Human WCAG audit (**NOT RUN Manual Gate**) |
| **UX-CAL-09** | `NFR-S1-09`, `OD-AV-08`, `AVA-01..19`, `BOOK-01..33`, `RET-*` | Capture genuine DB-backed Playwright screenshots at **`320`, `375`, `768`, and `1280` CSS px**; measure element bounding boxes, horizontal overflow, and full sprint regression suites | Zero horizontal overflow (`scrollWidth <= innerWidth`) at all 4 widths; desktop `>= 768px` renders ~40/60 two-pane layout; `320/375px` renders vertical stack with non-sticky inline `#selected-offer-summary` never overlapping focus/buttons; all non-grid controls and `>= 375px` day tiles measure `>= 44×44 CSS px` (`320px` day tiles measure `>= 36×44 CSS px`, exceeding WCAG 2.2 AA `SC 2.5.8` `24×24px`); all existing `AVA`, `BOOK`, `RET`, `Auth`, and `Slot` regressions pass | Real DB + Edge E2E screenshots (**PLANNED / NOT RUN**) |
| **UX-CAL-10** | `NFR-S1-07/12`, `OD-AV-07` | Run `npm test`, `npm run typecheck`, `npm run build`, PostgreSQL integration suite, Playwright Edge suite, and GitHub Actions CI on **exact Part F HEAD** | All automated CI jobs green on exact PR HEAD; ledger records commit SHA, exact PASS/FAIL/SKIP counts, changed test IDs, before/after screenshots, `AVA-14` latency observation with `500+` rows (confirming whether Phase 2 API pagination is needed), and UX rationale | Full Local + Hosted CI (**PLANNED / NOT RUN**) |

> **Manual Accessibility & Phase 2 Gates:** Passing automated checks in `UX-CAL-08`/`UX-CAL-09` does **not** certify full WCAG 2.2 AA compliance; manual human assistive-technology/WCAG inspection stays explicitly marked **`NOT RUN`** unless performed and signed off by a human reviewer. Any Phase 2 server query/pagination (`?from`/`?to`/`?page`) remains out of scope unless Part F profiling justifies a separate reviewed Part E API amendment.

## 3. Fixtures and execution method

- Use disposable real PostgreSQL with accepted Auth/Slot migrations and the reviewed Booking migration when available.
- Seed test-only C1/C2 Customers and T1/T2 Tutors; do not commit credentials, tokens, real records or DB dumps.
- Seed future Slots relative to DB time, not fixed dates that expire.
- For AVA-02/15/16/17, apply the reviewed shared Booking foundation migration to a disposable PostgreSQL database, then create actual persisted `Booked`/`Cancelled` rows with test-only seed SQL/fixtures that satisfy the schema's constraints. Commit the rows in the DB transaction and query them directly; these read-predicate cases do not call or wait for the #16 Booking endpoint. Never simulate occupancy with Slot.isBooked, bypass DB constraints, or fabricate response-only Booking objects.
- For AVA-09 use the same reviewed foundation in a disposable DB and a controlled DB clock; test both populated/empty projection semantics under connection `TimeZone = 'UTC'` and `'Asia/Bangkok'`.
- For AVA-11 use the real #16 Booking endpoint and its committed transaction outcome; never simulate a successful or rejected Booking in the UI.
- For AVA-15/16/17 use actual committed `Booked` and `Cancelled` rows for two Customer principals and multiple Tutors; assert owner filtering and half-open boundaries from persisted Booking intervals, never from fake Slot flags.
- For AVA-18 do not derive a display name from email. Run the positive allowlist case only after the Tutor-provided field, opt-in, approving stakeholder and forward-only migration are accepted; test fixtures must be explicitly synthetic/test-only.
- For AVA-19 compare actual Customer/Tutor browser renders and computed shared design tokens; do not infer visual consistency from source-only screenshots or claim accessibility conformance from token comparison.
- API tests inspect full response body/headers; for AVA-04/09 set PostgreSQL connection `TimeZone` to `UTC` and `Asia/Bangkok` while holding persisted instants (and `T_view` for AVA-09) constant, then assert identical wire timestamps for `startsAt`, `endsAt` and `meta.evaluatedAt`, each matching `YYYY-MM-DDTHH:mm:ss.sssZ`. Playwright/browser tests separately verify Bangkok rendering across browser timezones.
- Use controlled DB time or deterministic query seam for 60:00/59:59; no sleeps or browser clock.
- Record exact command, environment, Node/PostgreSQL version, migration, source SHA and PASS/FAIL/SKIP/BLOCKED plus observed rows.
- **Option A UX calendar fixtures (`UX-CAL-01..10`):**
  - Generate deterministic `500+` synthetic offers covering both multi-day spans (up to `60 days` from controlled DB `T_view`) and single-day dense offers (`> 6` distinct `(startsAt, endsAt)` time groups + repeated same-time offers across multiple Tutors).
  - Include controlled DB `T_view` / route fixtures crossing year rollover (`2026-11 -> 2026-12 -> 2027-01` with `Dec` empty control month) and leap-year February (`2028-02-29`).
  - Browser tests under Playwright must capture **before/after** screenshots on genuine DB-backed Customer sessions at `320`, `375`, `768`, and `1280` CSS px plus explicit `UTC` and `America/Los_Angeles` timezone contexts, measuring computed bounding boxes, `documentElement.scrollWidth <= window.innerWidth`, focus visibility, and computed contrast samples cleanly separated from any unexecuted manual human WCAG sign-off.

## 4. Error/UI observations

| API outcome | UI behavior |
|---|---|
| 200 with offers (historical baseline) | Render approved Tutor display name only after its gate, otherwise `tutorRef`; preserve server order |
| 200 with data: [] | Confirmed-empty state; metadata still includes `evaluatedAt` and response is `no-store` |
| 401 | Clear protected data and return to signed-out Auth |
| 403 | Access denied; no availability data |
| 400 | Safe invalid-request state; do not auto-retry unchanged input |
| 500/503/network/timeout | Error + retry; never empty/success |
| Later #16 stale/occupied/cutoff rejection | Non-success; refresh; do not claim Booking |
| 200 with offers (Option A) | Render monthly calendar opened at earliest eligible month, preselect earliest day (on initial load), display offer counts per day, show `<= 6` collapsed `(startsAt, endsAt)` time groups + `ดูเวลาเพิ่มเติม`, show approved Tutor display name only after `OD-AV-02` gate otherwise `tutorRef`, preserve server order |
| 200 with offers (selected day or month empty) | After refresh or switching to an empty intermediate month within the `T_view` horizon, display explicit day/month-empty message inside Step 2 without falsely asserting global empty when other days retain offers |
| Session-binding mismatch/account switch | Clear offers, calendar state, day index, and selection; ignore stale responses |
| Malformed 200 payload / invalid UTC date | Treat as fail-closed read error (`#availability-error` + `โหลดอีกครั้ง`); never commit partial calendar or claim `0` offers |

## 5. AC coverage

| Acceptance criterion | STS |
|---|---|
| AC-S1-15 | AVA-01, AVA-05, AVA-06, AVA-08, AVA-09, AVA-18 |
| AC-S1-16 | AVA-02, AVA-03, AVA-15, AVA-16, AVA-17 |
| AC-S1-17 | AVA-11 |
| AC-S1-18 | AVA-04 |

### Option A UX follow-up traceability (additive `UX-CAL-01..10`, no renumbering of `AC-S1-01..35`)

| Acceptance / requirement ID | Planned STS |
|---|---|
| AC-S1-15 (`FR-S1-08`, `OD-AV-02/03`) | `AVA-01`, `AVA-05`, `AVA-06`, `AVA-08`, `AVA-09`, `AVA-18`, **`UX-CAL-01..03`** |
| AC-S1-16 (`FR-S1-09`, `OD-002`) | `AVA-02`, `AVA-03`, `AVA-15`, `AVA-16`, `AVA-17`, **`UX-CAL-02`**, **`UX-CAL-05`** |
| AC-S1-17 (`AC-S1-19..35`, `F-S1-04` / `F-S1-05`) | `AVA-11`, **`UX-CAL-04`**, **`UX-CAL-05`** |
| AC-S1-18 (`BR-S1-12`, `VC/TEST-S1-13`) | `AVA-04`, **`UX-CAL-07`** |
| `FR-S1-18`, `NFR-S1-01/08` (fail-closed read & session guards) | `AVA-06`, `AVA-10`, `AVA-12`, **`UX-CAL-06`** |
| `NFR-S1-09`, `OD-AV-08` (accessibility, keyboard, contrast, responsive) | `AVA-13`, `AVA-19`, **`UX-CAL-08`**, **`UX-CAL-09`** |
| `NFR-S1-07/10/12` (CI reproducibility & Phase 2 profiling evidence) | `AVA-14`, **`UX-CAL-10`** |

## 6. Part E boundary and Part F evidence

### Issue #44 Option A UX amendment boundary (current PR)

- **`UX-CAL-01..10` are PLANNED / NOT RUN** in this docs-only Issue [#44](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/44) Part E PR. None of the Option A calendar flows, `500+` DOM/viewport captures, cross-year/leap-year interactions, or accessibility telemetry assertions is claimed as executed or passing here.
- **Documentation-only scope:** No `apps/`, `e2e/`, Prisma/SQL migrations, `scripts/compile-deliverable.mjs`, `DELIVERABLE_1.md`, or `.pdf` deliverable files are modified or re-run in this PR. Deliverable 1 ([PR #43](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/43) / [#18](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/18)) stays untouched.
- **Manual accessibility gate:** Any human WCAG 2.2 AA / assistive-technology inspection remains **NOT RUN** unless executed and signed off separately by a human reviewer; `44×44 CSS px` (`36×44 CSS px` at `320px` day cells) and token contrast values are design targets to verify empirically in Part F, never automated passes.
- **Subsequent Part F execution requirements (separate code PR after `@Tanaboonnnnn` approves and merges Part E to `sprint1`):**
  - Run `UX-CAL-01..10` together with full regressions (`AVA-01..19`, `BOOK-01..33`, `RET-*`, `Auth`, `Slot`) against real PostgreSQL and Microsoft Edge (`npm test`, `npm run typecheck`, `npm run build`, PostgreSQL integration, Playwright Edge suite, and hosted CI on the exact PR HEAD).
  - Capture genuine DB-backed before/after screenshots at `320`, `375`, `768`, and `1280 CSS px` plus `UTC` and `America/Los_Angeles` browser timezone verification; measure `documentElement.scrollWidth <= window.innerWidth`, actual control target boxes, focus visibility, and contrast samples.
  - Record `AVA-14` latency with `500+` seeded rows to verify objectively whether Phase 1 client-side calendar indexing remains sufficient or warrants a separate Phase 2 Part E API query/pagination amendment.
  - Update [verification ledger](verification-ledger.md) with exact commit SHA, hosted CI run URL, pass/fail/skip counts, changed test IDs, screenshot evidence, and explicit `NOT RUN` manual WCAG boundary.

### Historical `#15` baseline Part E note (superseded execution blockers below)

- In the original `#15` Part E baseline (`PR #32`), `AVA-01..19` were planned only with none passing at that stage.
- At that baseline stage, DB-backed cases (`AVA-01..05`, `AVA-08..10`, `AVA-12`, `AVA-15..17`) and `AVA-11` awaited `#33` Booking foundation (`PR #36`), `#15` Part F (`PR #37`), and `#16` Part F (`PR #38`); subsequent merged executions and source SHAs are recorded in [verification ledger](verification-ledger.md).
- `AVA-18` positive-path display-name verification remains **BLOCKED** under `OD-AV-02` until the Tutor data source, opt-in/publication approval, migration, and allowlist amendment are accepted; its pre-approval absence and anti-email-derivation checks remain required regressions.
- AVA-13/19 are manual/browser checks; AVA-14 records p95 only. No WCAG 2.2 AA, 44px target or ≤2.0s performance pass is claimed or used as a gate here.
- Consistent with Part E separation, no test, migration, API route, query, browser run, benchmark, or manual accessibility audit is executed by this STS documentation amendment.
- Historical `#15` Part F sequencing required the merged `#33` Booking foundation for `AVA-01..10`/`12`/`15..17`, the `#16` endpoint for `AVA-11`, and exact `320/375/768/1280 CSS px` + timezone + keyboard/focus evidence; `AVA-18` positive-path display-name display remains blocked until `OD-AV-02` clears.
- Do not claim full WCAG 2.2 AA without a complete manual assessment.
