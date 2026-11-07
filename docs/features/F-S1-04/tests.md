# F-S1-04 — Customer Booking Software Test Specification (Part E)

> **Planned STS only.** No application code, executable test, migration, PostgreSQL run, browser test or PASS result is included. Execute against actual #33 schema after Part F merge and record exact schema/source SHA.

## 1. Traceability and test setup

Sources: [Feature SDS](specification.md), [UI](ui-spec.md), [API](api-spec.md), [data](data-spec.md), [transaction contract](transaction-spec.md), [Sprint 1 requirements](../../requirements.md), [System SDS](../../system-sds.md) and [BDF STS](../../foundations/booking-data/tests.md).

Part F requires disposable PostgreSQL at target major version/exact #33 schema SHA; synthetic active/inactive Customer and role-change User fixtures, Customer A/B and Tutor A/B; Session A/B (including two Sessions for the same User); real future Offered Slots; at least two independent DB sessions; explicit barriers and observer query; controlled DB clock/request arrival/fault injection/lost HTTP response; browser auth/session-epoch control for late-response cases. For post-ROLLBACK authorization races, provide independent User deactivation/role-change and Session revocation transactions and observe lock acquisition order. Capture `pg_backend_pid()` and `pg_blocking_pids`. Random `Promise.all()`, sleep-only race or disabled UI button is insufficient. Inspect final committed rows from a fresh connection.

All cases below are **PLANNED / NOT RUN**.

## 2. Planned STS cases

| ID | Requirement trace | Setup / action | Expected observable result |
|---|---|---|---|
| BOOK-01 | FR-S1-10; AC-S1-19; VC/TEST-S1-16 | Active Customer submits one eligible unoccupied Slot. | 201 only after COMMIT; one `Booked` row with Session Customer, actual Slot and copied interval; response ID equals persisted ID. |
| BOOK-02 | FR-S1-11; AC-S1-20; VC/TEST-S1-17 | Slot starts 15:00; trigger `T_elig` exactly 14:00:00. | 60:00 passes; one Booking may commit if other checks pass. |
| BOOK-03 | FR-S1-11; AC-S1-21; VC/TEST-S1-18 | Slot starts 15:00; trigger `T_elig` 14:00:01. | 59:59 fails; no Booking/occupancy; safe 422. |
| BOOK-04 | BR-S1-08; AC-S1-22; VC/TEST-S1-19 | Customer A has committed Booking; Customer B submits same Slot. | 409; A's row preserved; no A identity/Booking detail disclosed. |
| BOOK-05 | BR-S1-09; AC-S1-23; VC/TEST-S1-20 | Customer has 13:00–14:00 with Tutor A; submits 13:30–14:30 with Tutor B. | 409 `CUSTOMER_OVERLAP`; no second row; first remains. |
| BOOK-06 | BR-S1-10; AC-S1-24; VC/TEST-S1-21 | Customer has 13:00–14:00; requests 14:00–15:00 with another Tutor. | Overlap rule permits adjacency if other checks pass. |
| BOOK-07 | FR-S1-11/18; AC-S1-27; VC/TEST-S1-22 | Offer becomes occupied, its lifecycle is no longer `Offered`, or Q05 becomes too close after browse and before POST. | Server maps occupied/non-Offered to 409 `SLOT_UNAVAILABLE` and Q05 cutoff to 422 `BOOKING_NOT_ELIGIBLE`; no stale-selection success/partial row. |
| BOOK-08 | FR-S1-11/18; AC-S1-27; VC/TEST-S1-23 | Missing/malformed/past Slot or unauthorized caller attempts Booking. | 400/401/403/404/422 as specified; no mutation/private data. |
| BOOK-09 | BR-S1-20; AC-S1-28; VC/TEST-S1-24 | Customer forges `customerId`, `tutorId`, role, Booking ID or interval. | Extra fields rejected; owner remains Session Customer and Tutor/time derive from real Slot. |
| BOOK-10 | FR-S1-12; AC-S1-25; VC/TEST-S1-25; NFR-S1-04 | Two Customers race for one eligible Slot under synchronized barrier. | At most one committed `Booked` row; loser non-success; no partial claim. |
| BOOK-11 | FR-S1-13; AC-S1-26; VC/TEST-S1-26; NFR-S1-05 | Same Customer concurrently submits distinct overlapping Slots from two Tutors; repeat at proposed 10-attempt load. | No two overlapping Active rows commit; adjacent control allowed. |
| BOOK-12 | FR-S1-18; AC-S1-27; VC/TEST-S1-27 and VC/TEST-S1-33 | Inject DB failure after validation/before COMMIT; reopen state via fresh connection. | Whole transaction rolls back; no Booking, phantom occupancy or success; prior rows unchanged. |
| BOOK-13 | AC-S1-29; VC/TEST-S1-38; OD-013 | After commit, same Customer sends same `slotId` POST again. | 200 with exact original Booking ID/DTO; no second row/new ID. |
| BOOK-14 | AC-S1-29; VC/TEST-S1-38; Race B/C | Two same-Customer/same-Slot POSTs overlap in flight under barrier. | One row only; winner 201; duplicate reconciles to 200 with same ID (or retryable abort then same result on fresh attempt). |
| BOOK-15 | AC-S1-29; VC/TEST-S1-38; OD-013 | Let COMMIT succeed but drop HTTP response; Customer resubmits identical POST. | Second request returns 200 with committed original ID; exactly one row. |
| BOOK-16 | AC-S1-29; VC/TEST-S1-38 | Force first attempt to roll back before COMMIT, then retry identical POST. | Retry creates at most one row and returns 201 only after its own COMMIT; no phantom success. |
| BOOK-17 | AC-S1-35; VC/TEST-S1-39; Q05 | 15:00 Slot; HTTP arrives 13:59:59; hold required lock until 14:00:01. | Trigger samples `T_elig` after wait and rejects 59:59; no Booking. |
| BOOK-18 | System SDS §7.1/7.4; SQLSTATE 40001/40P01 | Force serialization failure and deadlock in separate runs. | Roll back whole attempt, rediscover/relock in order and retry no more than three total attempts; no partial rows. |
| BOOK-19 | BDF-23; System SDS §7.3; VC/TEST-S1-39 | Force unexpected unique/exclusion index wait after trigger `T_elig`; instrument PIDs/blockers/trigger time. | Prove no stale-time INSERT can commit, or show full abort/retry with fresh `T_elig`. Otherwise BLOCKED/FAIL. |
| BOOK-20 | NFR-S1-01/08; VC/TEST-S1-23/24 | Inspect full success/error JSON for anonymous, wrong-role, occupied foreign Slot, forged fields and DB errors. | No Customer/Tutor private identity, SQL/stack, credentials, Session/CSRF data or another Booking ID leaks. |
| BOOK-21 | NFR-S1-03/11; VC/TEST-S1-27/33 | Restart app against same DB after success; reopen views after rejected attempt when #17 is integrated. | Committed Booking remains; rejected attempt creates no phantom row/occupancy. |
| BOOK-22 | Transaction contract §2; BDF-23 | Instrument User, Slot and current Session locks for both UUID orderings and concurrent cross-Tutor requests. | Actual acquisition follows User UUID ascending → Slot UUID ascending → current Customer Session auth sub-lock → Booking; domain order remains User → Slot → Booking; no out-of-order acquisition. |
| BOOK-23 | Transaction contract §6.1 | Force three retryable transaction aborts. | Three total attempts maximum; final 503 `TRANSACTION_RETRY_EXHAUSTED`; all attempts rolled back. |
| BOOK-24 | Transaction contract §§2/6 | Change/remove discovered lock-set member between pre-read and locked re-read in isolated fixture. | Abort without acquiring an earlier-order lock late; rediscover/restart whole transaction or safe non-success after budget. |
| BOOK-25 | BDF-23; #33 Part F trigger contract | Independently trigger a non-`Offered` Slot rejection and a Q05 failure at `T_elig`; inspect PostgreSQL SQLSTATE and constraint diagnostics. | Non-Offered is exactly `P0B01 / booking_slot_not_offered` → 409 `SLOT_UNAVAILABLE`; Q05 is exactly `P0B02 / booking_q05_min_notice` → 422 `BOOKING_NOT_ELIGIBLE`. No raw DB diagnostics; any missing/mismatched identifier is BLOCKED. |
| BOOK-26 | BR-S1-13; OD-005-A/B; VC/TEST-S1-23 | Pass HTTP auth, hold the Customer User row in DB session A, start Booking POST in session B and confirm it waits on the User lock. While it waits, revoke that exact Session through logout and commit; then release the User lock. | The Session lock acquired after the wait observes revocation or the stale SERIALIZABLE attempt aborts/retries; fresh attempt returns 401. No 201, no 200 replay, no Booking row and no private replay data. |
| BOOK-27 | BR-S1-13; OD-005-A/B; VC/TEST-S1-23 | Hold selected Slot row in DB session A. Start Booking POST, verify it has acquired User lock and is waiting on Slot; in separate runs, either revoke the Session and commit or allow its `expiresAt` to pass; then release Slot. | Session is locked/revalidated only after the Slot wait; revoked/expired Session returns 401 (or stale snapshot forces full retry then 401). No Booking INSERT, no 200 replay and no private data. |
| BOOK-28 | OD-005-C; VC/TEST-S1-23/24 | Attempt POST with missing CSRF, wrong CSRF, Session A token with Session B cookie (including Session B for the same User), missing/mismatched expected binding, foreign Origin, and `Sec-Fetch-Site: cross-site`. | Reject with 403 `CSRF_DENIED`/`SESSION_BINDING_MISMATCH`/`ORIGIN_DENIED` as applicable (401 for invalid Session); no mutation and no private Booking data. |
| BOOK-29 | OD-005-B/C; VC/TEST-S1-23/24 | Start a POST under Session A and delay its response; logout A or switch to Session B (same User and different User), then deliver A's late response. Also send A's captured expected binding with B's cookie. | UI auth/session epoch discards A's late response and never displays its Booking ID/details under B. Stale A binding with B cookie is rejected before mutation. If A had already committed before logout, do not claim rollback; only the stale response is suppressed. |
| BOOK-30 | BR-S1-13; AC-S1-29; OD-013; VC/TEST-S1-23/38; Transaction contract §6.2 | Cause either (a) a same-pair race that produces the recognized `23505 / booking_one_active_per_slot` after the winning same-pair Booking commits, or (b) a distinct overlapping-Slot conflict that produces `23P01 / booked_customer_no_overlap`; pause after the failed SERIALIZABLE transaction rolls back but before reconciliation. For each cause, run synchronized interleavings where (1) the Customer User is deactivated and committed, (2) its role changes from Customer and commits, (3) the exact Session is revoked and committed, or (4) the barrier is held until DB clock passes Session `expiresAt`; then release. Also run a live active-Customer/live-Session control for each cause. | Reconciliation first locks/revalidates the latest User row: missing/inactive → 401 `UNAUTHENTICATED`; active non-Customer → 403 `FORBIDDEN`; neither reads Session/Booking or returns a DTO. If User remains an active Customer, it locks/revalidates exact Session: revoked/expired → 401 with no Booking read/ID/DTO. For cause (a), live control returns 200 with the original same-pair Booking ID and exactly one committed row; for cause (b), live control returns 409 `CUSTOMER_OVERLAP` and no additional row. Final rows remain unchanged in all rejection cases. If User/Session DB validation is unavailable, return 503; never skip a check. |
| BOOK-31 | Transaction contract §6.2; #33 BDF-D05/D06; AC-S1-22/23; VC/TEST-S1-19/20 | Inject structured PostgreSQL errors for (a) `23505 / booking_one_active_per_slot`, (b) `23P01 / booked_customer_no_overlap`, and negative controls (c) `23505` on a different constraint such as Booking primary key, (d) `23P01` with a different/unknown constraint identifier, and (e) missing constraint metadata. | Only (a)/(b) enter reconciliation. If no exact-pair replay is found, map (a) to 409 `SLOT_UNAVAILABLE` and (b) to 409 `CUSTOMER_OVERLAP`. Negative controls roll back and return safe 500 `INTERNAL_ERROR` without any User/Session/Booking reconciliation read or Booking DTO; never parse error text or infer a business conflict from SQLSTATE alone. Capture structured SQLSTATE/constraint metadata and verify committed rows are unchanged. |

## 3. Required existing-anchor coverage

| Existing anchor | Planned case |
|---|---|
| VC/TEST-S1-16 | BOOK-01 |
| VC/TEST-S1-17 | BOOK-02 |
| VC/TEST-S1-18 | BOOK-03 |
| VC/TEST-S1-19 | BOOK-04, BOOK-31 |
| VC/TEST-S1-20 | BOOK-05, BOOK-31 |
| VC/TEST-S1-21 | BOOK-06 |
| VC/TEST-S1-22 | BOOK-07 |
| VC/TEST-S1-23 | BOOK-08, BOOK-20, BOOK-26..30 |
| VC/TEST-S1-24 | BOOK-09, BOOK-20, BOOK-28..29 |
| VC/TEST-S1-25 | BOOK-10 |
| VC/TEST-S1-26 | BOOK-11 |
| VC/TEST-S1-27 | BOOK-12, BOOK-21 |
| VC/TEST-S1-33 | BOOK-12, BOOK-21 |
| VC/TEST-S1-38 | BOOK-13..16, BOOK-30 |
| VC/TEST-S1-39 | BOOK-17, BOOK-19 |
| AC-S1-22/23 | BOOK-04/05, BOOK-31 |
| AC-S1-19..29 | BOOK-01..16, BOOK-20 and BOOK-26..30 |
| AC-S1-35 | BOOK-17, BOOK-19 |

Existing AC/VC/TEST IDs remain authoritative; BOOK IDs are F-S1-04 STS IDs, not replacements.

## 4. Part E boundary and Part F evidence

**Part E:** contracts and planned cases only. No test result is PASS, no PostgreSQL query has run, and no schema SHA exists yet.

**Part F evidence per run:** test ID; command; source commit; merged #33 schema SHA; PostgreSQL version; synthetic fixture IDs; backend PIDs/barrier; `T_elig`; SQLSTATE/constraint; expected/actual HTTP result; committed rows before/after; PASS/FAIL/SKIP and reason. Redact secrets/PII.

#33 BDF-01..22 and BDF-24..26 are its Part F pre-merge gates. #16 BDF-23 is the post-merge joint integration gate and runs only after #33 Part F merges.

## 5. Independent review checklist

- [ ] Confirm endpoint ownership, auth/role/CSRF, request allowlist and safe errors.
- [ ] Confirm Natural-key OD-013 scope, replay precedence and 201/200 behavior.
- [ ] Confirm canonical #33 mapping and no duplicated schema/trigger.
- [ ] Confirm User → Slot → Session(auth sub-lock) → Booking acquisition, SERIALIZABLE snapshot behavior, post-lock-wait User/Session revalidation, and fresh post-ROLLBACK User-then-Session authorization validation before reconciliation read/200/409.
- [ ] Confirm Auth CSRF acquisition, Session binding, cross-origin rejection and late-response suppression across different Sessions for the same User.
- [ ] Confirm retry classification, three-attempt bound, exact SQLSTATE/constraint allowlist (including negative controls), safe unknown-constraint failure and unknown COMMIT behavior.
- [ ] Challenge no-post-guard-contention strategy against actual #33 trigger/constraints; retain BDF-23 as hard gate.
- [ ] Confirm AC-S1-19..29/35 and VC/TEST-S1-16..27/33/38/39 coverage.
- [ ] Confirm no code, migration, executable tests or S2 workflow is in this Part E PR.
- [ ] Record actual human peer review; self-check is not approval.

**Status:** PLANNED / NOT RUN. Issue #16 remains open until Part F, BDF-23, actual verification and independent review satisfy its DoD.
