# F-S1-03 — Customer Availability Software Test Specification (Part E)

> **Planned STS only.** All cases are NOT RUN by this documentation PR. Occupancy/stale-Booking cases require the Issue #16 dependency described in [Feature SDS](specification.md) and [Data](data-spec.md).

## 1. Traceability and planned cases

| STS ID | Trace | Scenario | Required result | Dependency |
|---|---|---|---|---|
| AVA-01 | FR-S1-08, AC-S1-15, VC/TEST-S1-15, VAL-006 | C1 requests availability with an eligible future Slot | 200; Tutor reference, Slot ID and Bangkok start/end identifiable; deterministic order | #13/#14 merged |
| AVA-02 | FR-S1-09, AC-S1-16, BR-S1-08/21, VC/TEST-S1-22 | One Slot has a committed active Booked row; another is free | Occupied Slot not returned as bookable; other offer remains; no Customer/Booking details | **#16 Booking schema required** |
| AVA-03 | FR-S1-09, AC-S1-16, BR-S1-07/11, VC/TEST-S1-17/18, VAL-008/009 | Evaluate a past Slot, exactly 60:00 and 59:59 before start using controlled DB time | Past/59:59 excluded; exactly 60:00 included; browser clock irrelevant | #13/#14 + DB clock harness |
| AVA-04 | AC-S1-18, BR-S1-12, VC/TEST-S1-13 | Open same offer in Bangkok, UTC and another browser timezone | Same intended Bangkok date/start/end; UTC API instants unchanged | #13/#14 merged |
| AVA-05 | FR-S1-08, NFR-S1-01/08, NFR-007, VAL-036 | Inspect full JSON with multiple Customers/Tutors | Exact allowlist only; no Customer PII, Booking ID/status/reason, email, Session/token/hash, SQL or stack | #13/#14; #16 fixture improves occupancy case |
| AVA-06 | BR-S1-17, NFR-S1-01, VC/TEST-S1-05/06, VAL-002 | Anonymous and Tutor call Customer endpoint | Anonymous 401; Tutor 403; no offer data | #13/#14 merged |
| AVA-07 | BR-S1-20, NFR-S1-01 | Customer adds customerId/tutorId/role/page/arbitrary query | 400 INVALID_INPUT; identity/owner scope cannot be changed | #13/#14 merged |
| AVA-08 | AC-S1-15, NFR-S1-07 | Seed same-time offers from different Tutors | Stable startsAt/tutorRef/slotId order; no duplicates/hidden rows | #14 merged |
| AVA-09 | AC-S1-15, NFR-S1-07 | Customer has no eligible offers | Genuine 200 data: []; UI shows confirmed-empty only for this response | #13/#14 merged |
| AVA-10 | FR-S1-18, NFR-S1-07/08, VAL-036 | GET/retry fails 503/network then later succeeds | Error/retry visible; no empty/zero claim during failure; successful retry restores results | #13/#14 merged |
| AVA-11 | AC-S1-17, FR-S1-09/11, BR-S1-13/21, VC/TEST-S1-22 | Customer selects offer; it becomes occupied or enters Q05 cutoff before Booking | #16 rejects without Booking/false success; UI shows non-success and refreshes | **#16 Booking endpoint required** |
| AVA-12 | NFR-S1-01/08, BR-S1-20, VAL-036 | Hold old Customer 200; logout/switch Session before releasing it | Old response never repaints; clear offers/selection on Session binding mismatch | #13/#14 merged |
| AVA-13 | NFR-S1-09 proposed, VAL-033 | Keyboard-only browse/select through loading/populated/empty/error | Logical focus order, visible focus, semantic status and actionable retry | Part F manual browser check |
| AVA-14 | NFR-S1-10 proposed, VC/TEST-S1-36 | Benchmark local seeded availability GET after warm-up | Record machine/DB/sample/p95/SHA; compare to 2.0s only if approved | Part F; target approval |

## 2. Fixtures and execution method

- Use disposable real PostgreSQL with accepted Auth/Slot migrations and the reviewed Booking migration when available.
- Seed test-only C1/C2 Customers and T1/T2 Tutors; do not commit credentials, tokens, real records or DB dumps.
- Seed future Slots relative to DB time, not fixed dates that expire.
- For AVA-02/11 use actual committed Booking rows from #16 fixture/flow; never simulate occupancy with Slot.isBooked.
- API tests inspect full response body/headers; Playwright/browser tests verify UI states and timezone.
- Use controlled DB time or deterministic query seam for 60:00/59:59; no sleeps or browser clock.
- Record exact command, environment, Node/PostgreSQL version, migration, source SHA and PASS/FAIL/SKIP/BLOCKED plus observed rows.

## 3. Error/UI observations

| API outcome | UI behavior |
|---|---|
| 200 with offers | Render authorized offers in returned order |
| 200 with data: [] | Confirmed-empty state |
| 401 | Clear protected data and return to signed-out Auth |
| 403 | Access denied; no availability data |
| 400 | Safe invalid-request state; do not auto-retry unchanged input |
| 500/503/network/timeout | Error + retry; never empty/success |
| Later #16 stale/occupied/cutoff rejection | Non-success; refresh; do not claim Booking |
| Session-binding mismatch/account switch | Clear offers/selection and ignore stale responses |

## 4. AC coverage

| Acceptance criterion | STS |
|---|---|
| AC-S1-15 | AVA-01, AVA-05, AVA-06, AVA-08 |
| AC-S1-16 | AVA-02, AVA-03 |
| AC-S1-17 | AVA-11 |
| AC-S1-18 | AVA-04 |

## 5. Part E boundary and Part F evidence

- AVA-01..14 are planned; none is a test PASS from this Part E PR.
- AVA-02/11 are BLOCKED until #16 Booking data/endpoint dependency is resolved.
- AVA-13/14 are proposed engineering checks, not approved numeric/WCAG claims.
- No test, migration, API route, query, browser run, benchmark or manual accessibility audit is executed by this STS.
- Part F must run relevant Auth/Slot regressions; AVA-01..10 and AVA-12 with real data; AVA-02/11 after the actual Booking schema/endpoint exists; browser timezone/responsive checks at 320/375/768/1280 CSS px; keyboard/visible-focus manual review; and record all actual commands/results/screenshots against the exact implementation SHA.
- Do not claim full WCAG 2.2 AA without a complete manual assessment.
