# F-S1-03 — Customer Availability Software Test Specification (Part E)

> **Planned STS only.** All cases are NOT RUN by this documentation PR. Booking-dependent cases require the separately reviewed shared data foundation selected in [Feature SDS §2](specification.md) and the Issue #16 Booking contract. Tutor-name positive-path checks require the separate OD-AV-02 data approval and migration gate.

## 1. Traceability and planned cases

| STS ID | Trace | Scenario | Required result | Dependency |
|---|---|---|---|---|
| AVA-01 | FR-S1-08, AC-S1-15, VC/TEST-S1-15, VAL-006 | C1 requests availability with an eligible future Slot | 200; approved Tutor display name if gate is cleared, otherwise opaque Tutor reference; Slot ID and Bangkok start/end identifiable; deterministic order | Shared Booking data foundation + #13/#14; name field remains gated |
| AVA-02 | FR-S1-09, AC-S1-16, BR-S1-08/21, VC/TEST-S1-22 | One Slot has a committed active Booked row; another is free | Occupied Slot not returned as bookable; other offer remains; no Customer/Booking details | **Shared Booking data foundation required** |
| AVA-03 | FR-S1-09, AC-S1-16, BR-S1-07/11, VC/TEST-S1-17/18, VAL-008/009 | Evaluate a past Slot, exactly 60:00 and 59:59 before start using controlled DB time | Past/59:59 excluded; exactly 60:00 included; browser clock irrelevant | Shared Booking data foundation + DB clock harness |
| AVA-04 | AC-S1-18, BR-S1-12, VC/TEST-S1-13 | Open same offer in Bangkok, UTC and another browser timezone | Same intended Bangkok date/start/end; UTC API instants unchanged | Shared Booking data foundation + browser timezone check |
| AVA-05 | FR-S1-08, NFR-S1-01/08, NFR-007, VAL-036 | Inspect full JSON with multiple Customers/Tutors | Exact allowlist only; no Customer PII, Booking ID/status/reason, email, Session/token/hash, SQL or stack; Tutor identity is `tutorRef` until name approval | Shared Booking data foundation; name field remains gated |
| AVA-06 | BR-S1-17, NFR-S1-01, VC/TEST-S1-05/06, VAL-002 | Anonymous and Tutor call Customer endpoint | Anonymous 401; Tutor 403; no offer data | #13/#14 merged |
| AVA-07 | BR-S1-20, NFR-S1-01 | Customer adds customerId/tutorId/role/page/arbitrary query | 400 INVALID_INPUT; identity/owner scope cannot be changed | #13/#14 merged |
| AVA-08 | AC-S1-15, NFR-S1-07 | Seed same-time offers from different Tutors | Stable startsAt/tutorRef/slotId order; no duplicates/hidden rows | Shared Booking data foundation + #14 merged |
| AVA-09 | AC-S1-15, NFR-S1-07/08, VAL-036 | Customer has no eligible offers | 200 with `data: []`, non-null RFC 3339 `meta.evaluatedAt` from the same DB T_view, and `Cache-Control: no-store`; aggregate still returns one row; errors are never mapped to empty | #13/#14 + shared Booking data foundation for the full predicate |
| AVA-10 | FR-S1-18, NFR-S1-07/08, VAL-036 | GET/retry fails 503/network then later succeeds | Error/retry visible; no empty/zero claim during failure; successful retry restores results | #13/#14 merged |
| AVA-11 | AC-S1-17, FR-S1-09/11, BR-S1-13/21, VC/TEST-S1-22 | Customer selects offer; it becomes occupied or enters Q05 cutoff before Booking | #16 rejects without Booking/false success; UI shows non-success and refreshes | **Shared data foundation + #16 Booking endpoint required** |
| AVA-12 | NFR-S1-01/08, BR-S1-20, VAL-036 | Hold old Customer 200; logout/switch Session before releasing it | Old response never repaints; clear offers/selection on Session binding mismatch | #13/#14 merged |
| AVA-13 | NFR-S1-09, VAL-033 | Keyboard-only browse/select through loading/populated/empty/error at 320/375/768/1280 CSS px | Logical focus order, visible/unobscured focus, semantic loading/result/empty/error announcements, responsive reflow, actionable retry and measured target dimensions; 44px is a design target, not a pass without evidence | Part F manual/browser check |
| AVA-14 | NFR-S1-10, VC/TEST-S1-36 | Benchmark local seeded availability GET after warm-up | Record machine/DB/sample/p95/source SHA and workload; ≤2.0s is reference-only and must not determine pass/fail | Part F measurement; no threshold gate |
| AVA-15 | FR-S1-09/13, AC-S1-16, BR-S1-09, Q28, VAL-011 | C1 has Active Booked interval 13:00–14:00 with Tutor A; a free Tutor B Slot is 13:30–14:30 | Exclude Tutor B Slot for C1 because the authenticated Customer already has an overlapping Active Booking on another Tutor; do not return the conflicting Booking or Customer details | Shared Booking foundation + #16 committed Booking fixture |
| AVA-16 | FR-S1-09/13, AC-S1-16, BR-S1-10, Q28 | C1 has Active Booked interval 13:00–14:00; a free Tutor B Slot is exactly 14:00–15:00 | Include the candidate because `[start,end)` intervals are adjacent, not overlapping; strict predicate permits equality at the boundary | Shared Booking foundation + #16 committed Booking fixture |
| AVA-17 | FR-S1-09/13, BR-S1-09/10, Q28 | A free candidate Slot overlaps either a Cancelled C1 Booking or an Active Booking of C2 on a different Slot/Tutor | Include the candidate for C1 in both controls; only `customerId = principal.userId AND status = Booked` participates in the Customer-overlap predicate. A separate Active Booking on the candidate Slot itself must still exclude it for everyone under AVA-02 | Shared Booking foundation + #16 committed Booking fixtures |
| AVA-18 | FR-S1-08, NFR-S1-01/08, VAL-036 | Inspect Tutor identity before and after OD-AV-02 data approval | Before approval, no `tutorDisplayName` field and no email-derived name; after approved migration/consent, only the approved nullable display-name field may be added to allowlist; no email/phone/profile leakage | Current schema for negative case; separate data approval + migration for positive case |
| AVA-19 | OD-AV-08, AC-S1-15 | Compare Customer Availability with Tutor Dashboard at desktop and mobile breakpoints | Shared NutTiew wordmark, typography, spacing, brand/nav colors, button/focus components and navigation behavior; only role-authorized destinations differ | Part F browser visual review |

## 2. Fixtures and execution method

- Use disposable real PostgreSQL with accepted Auth/Slot migrations and the reviewed Booking migration when available.
- Seed test-only C1/C2 Customers and T1/T2 Tutors; do not commit credentials, tokens, real records or DB dumps.
- Seed future Slots relative to DB time, not fixed dates that expire.
- For AVA-02/09/15/16/17 use the shared data-foundation schema and actual committed Booking fixtures; never simulate occupancy with Slot.isBooked.
- For AVA-11 use the real #16 Booking endpoint and its committed transaction outcome; never simulate a successful or rejected Booking in the UI.
- For AVA-15/16/17 use actual committed `Booked` and `Cancelled` rows for two Customer principals and multiple Tutors; assert owner filtering and half-open boundaries from persisted Booking intervals, never from fake Slot flags.
- For AVA-18 do not derive a display name from email. Run the positive allowlist case only after the Tutor-provided field, opt-in, approving stakeholder and forward-only migration are accepted; test fixtures must be explicitly synthetic/test-only.
- For AVA-19 compare actual Customer/Tutor browser renders and computed shared design tokens; do not infer visual consistency from source-only screenshots or claim accessibility conformance from token comparison.
- API tests inspect full response body/headers; Playwright/browser tests verify UI states and timezone.
- Use controlled DB time or deterministic query seam for 60:00/59:59; no sleeps or browser clock.
- Record exact command, environment, Node/PostgreSQL version, migration, source SHA and PASS/FAIL/SKIP/BLOCKED plus observed rows.

## 3. Error/UI observations

| API outcome | UI behavior |
|---|---|
| 200 with offers | Render approved Tutor display name only after its gate, otherwise `tutorRef`; preserve server order |
| 200 with data: [] | Confirmed-empty state; metadata still includes `evaluatedAt` and response is `no-store` |
| 401 | Clear protected data and return to signed-out Auth |
| 403 | Access denied; no availability data |
| 400 | Safe invalid-request state; do not auto-retry unchanged input |
| 500/503/network/timeout | Error + retry; never empty/success |
| Later #16 stale/occupied/cutoff rejection | Non-success; refresh; do not claim Booking |
| Session-binding mismatch/account switch | Clear offers/selection and ignore stale responses |

## 4. AC coverage

| Acceptance criterion | STS |
|---|---|
| AC-S1-15 | AVA-01, AVA-05, AVA-06, AVA-08, AVA-09, AVA-18 |
| AC-S1-16 | AVA-02, AVA-03, AVA-15, AVA-16, AVA-17 |
| AC-S1-17 | AVA-11 |
| AC-S1-18 | AVA-04 |

## 5. Part E boundary and Part F evidence

- AVA-01..19 are planned; none is a test PASS from this Part E PR.
- All DB-backed availability-query cases (AVA-01..05, AVA-08..10, AVA-12 and AVA-15..17) are BLOCKED until the separately reviewed shared Booking data foundation is merged and its exact schema SHA is recorded. AVA-11 additionally requires the #16 Booking endpoint; #16 owns Booking mutation/revalidation.
- AVA-18 positive-path display-name verification is BLOCKED until the Tutor data source, opt-in/publication approval, migration and allowlist amendment are accepted. Its pre-approval absence/email-leakage checks remain planned.
- AVA-13/19 are manual/browser checks; AVA-14 records p95 only. No WCAG 2.2 AA, 44px target or ≤2.0s performance pass is claimed or used as a gate here.
- No test, migration, API route, query, browser run, benchmark or manual accessibility audit is executed by this STS.
- Part F may run Auth/Slot regressions independently, but must not claim the full Customer availability query works until the shared Booking foundation exists. Then run AVA-01..10, AVA-12 and AVA-15/16/17 with real data; run AVA-11 after the #16 Booking endpoint exists; run AVA-18 positive path only after the name-data gate; and perform AVA-19 browser design-system comparison plus timezone/responsive checks at 320/375/768/1280 CSS px and keyboard/focus/announcement review. Record actual commands/results/screenshots and the exact implementation/schema SHAs.
- Do not claim full WCAG 2.2 AA without a complete manual assessment.
