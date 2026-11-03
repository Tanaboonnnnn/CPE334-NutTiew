# Requirement Traceability — Deliverable 1 Part B

DRAFT. Source: [SRS](srs.md), [features](features.md), [Sprint 1 requirements](requirements.md). All validation is PLANNED, NOT EXECUTED.

| Product requirement | SRS intent | Primary owner | Sprint | Planned validation |
|---|---|---|---|---|
| FR-001 |  Customer/Tutor: With existing valid credentials, authenticate and establish only that principal's effective role; reject invalid credentials without  | F-S1-01 | S1 | VAL-001 (planned) |
| FR-002 |  Authenticated Customer/Tutor: Return the current principal's own identity and role without accepting a client-supplied impersonation; anonymous reque | F-S1-01 | S1 | VAL-001 (planned) |
| FR-003 |  Authenticated Customer/Tutor: Log out and render the prior session/access unusable for protected operations; the exact invalidation/expiry method mus | F-S1-01 | S1 | VAL-001 (planned) |
| FR-004 |  Application/server: Authenticate and enforce role and record ownership on every protected Slot, Booking, notification and summary action, including c | F-S1-01 | S1 | VAL-002 (planned) |
| FR-005 |  Tutor: Given authorization to their own schedule and a valid future start, publish exactly one explicit sixty-minute Slot; persist it under the authe | F-S1-02 | S1 | VAL-003 (planned) |
| FR-006 |  Server on Tutor creation: Reject malformed/past Slots and overlaps between currently offered Slots of the same Tutor; permit adjacent intervals and i | F-S1-02 | S1 | VAL-004 (planned) |
| FR-007 |  Tutor: Retrieve own offered Slots and authorized occupied/unoccupied schedule view from committed data; reject another Tutor's protected schedule loo | F-S1-02 | S1 | VAL-002 (planned) |
| FR-008 |  Customer: Browse Tutor/Slot/time information sufficient to choose a specific offer, without disclosure of another Customer's private reservation; the | F-S1-03 | S1 | VAL-006 (planned) |
| FR-009 |  Server/availability view: Mark an offer bookable only when current, unoccupied, eligible and not too close to its start; an earlier view must not gua | F-S1-03 | S1 | VAL-006 (planned) |
| FR-010 |  Customer: Given an eligible Slot and no overlapping Active Booking, request one exclusive reservation for their authenticated identity; commit one Bo | F-S1-04 | S1 | VAL-007 (planned) |
| FR-011 |  Server on Booking: Revalidate offered/unoccupied state, user ownership, cutoff and overlaps immediately before a guarded Booking write; reject stale, | F-S1-04 | S1 | VAL-008 (planned) |
| FR-012 |  Server on competing Bookings: Under simultaneous attempts by different Customers for the same exclusive Slot, allow at most one committed Active Book | F-S1-04 | S1 | VAL-010 (planned) |
| FR-013 |  Server on Customer Booking: Reject the same Customer's overlapping Active reservation, including requests for two different Tutors; accept adjacency  | F-S1-04 | S1 | VAL-004 (planned) |
| FR-014 |  Customer: Retrieve a persisted list and detail of own Bookings with Booking identity, Tutor/Slot/interval and business status; foreign IDs must not d | F-S1-05 | S1 | VAL-012 (planned) |
| FR-015 |  Tutor: Retrieve Bookings attached to the Tutor's authorized schedule only; requesting another Tutor's records must not disclose them.  | F-S1-05 | S1 | VAL-002 (planned) |
| FR-016 |  Application: Authorized reopened/refresh/restart views must reflect successfully committed Slots/Bookings and correct ownership; a failed transaction | F-S1-05 | S1 | VAL-007 (planned) |
| FR-017 |  Application views: Display Booked accurately and, when a Booking's end is past, optionally derive Past; never assert Completed, attendance or auto-re | F-S1-05 | S1 | VAL-013 (planned) |
| FR-018 |  Application/server: Return an observable, non-success rejection for forbidden, invalid, stale, conflicting or failed mutations, without leaking prote | SYS-01 | S1-S3/Lab5+ | VAL-002 (planned) |
| FR-019 |  System: Support the Tutor offer → Customer browse → committed Booking → authorized retrieval journey through a real UI, application/API and durable d | SYS-01 | S1-S3/Lab5+ | VAL-007 (planned) |
| FR-020 |  Owning Customer: Cancel their current Booking when the Appointment starts at least 30 minutes after the server's authoritative decision; at the exact | F-S2-01 | S2 proposed | VAL-015 (planned) |
| FR-021 |  Server on successful Customer cancellation: Change Booking to Cancelled and reopen its same original Slot atomically; keep it unbookable for any late | F-S2-01 | S2 proposed | VAL-015 (planned) |
| FR-022 |  Owning Customer: Initiate rescheduling of an existing Booked Booking; reject nonowners and disallowed Booking state.  | F-S2-02 | S2 proposed | VAL-017 (planned) |
| FR-023 |  Server on reschedule: Require both original Appointment start and destination Slot start to be at least 60 minutes away at authoritative decision; re | F-S2-02 | S2 proposed | VAL-018 (planned) |
| FR-024 |  Owning Customer: Select a valid destination with a different Tutor if desired; do not restrict rescheduling to the original Tutor, while still enforc | F-S2-02 | S2 proposed | VAL-019 (planned) |
| FR-025 |  Server on reschedule: Atomically update Booking assignment, occupy destination, release/reopen original Slot and record history; any validation, conf | F-S2-02 | S2 proposed | VAL-020 (planned) |
| FR-026 |  Server: Preserve the Booking ID across a successful reschedule and append a successful-change record with former/new Tutor, Slot/interval and timesta | F-S2-02 | S2 proposed | VAL-020 (planned) |
| FR-027 |  Server: Permit at most one successful reschedule per Booking; a failed attempt leaves the allowance available, while a second successful-change reque | F-S2-02 | S2 proposed | VAL-017 (planned) |
| FR-028 |  Currently assigned Tutor: Cancel an Active Booking belonging to the Tutor's authorized schedule only when its start is at least 60 minutes away; exac | F-S2-03 | S2 proposed | VAL-021 (planned) |
| FR-029 |  Tutor/server: Require a meaningful nonblank reason before accepting Tutor cancellation; reject absent, whitespace-only or semantically empty reason w | F-S2-03 | S2 proposed | VAL-021 (planned) |
| FR-030 |  Server on successful Tutor cancellation: Mark Booking Cancelled and withdraw its original Slot instead of reopening it; preserve trace/history and en | F-S2-03 | S2 proposed | VAL-022 (planned) |
| FR-031 |  Server: On successful Tutor cancellation create one private in-app notice for that Booking's owning Customer, including the authorized reason; the re | F-S2-04 | S2 proposed | VAL-023 (planned) |
| FR-032 |  Owning Customer: Retrieve and reread Tutor-cancellation notices after marking them read; absence of automatic time-based expiry must hold, while dele | F-S2-04 | S2 proposed | VAL-024 (planned) |
| FR-033 |  Server/Tutor: Forbid direct edit, deletion or withdrawal of a Slot while it carries an Active Booking; require the separate authorized cancellation w | F-S2-05 | S2 proposed | VAL-025 (planned) |
| FR-034 |  Owning Tutor: Withdraw an unoccupied future currently offered Slot while retaining its history; permit later creation of a distinct new Slot with a n | F-S2-05 | S2 proposed | VAL-026 (planned) |
| FR-035 |  Tutor: Retrieve an Appointment Summary with counts and corresponding lists for Upcoming Booked, Past Booked and Cancelled on the Tutor's authorized s | F-S3-01 | S3 proposed | VAL-028 (planned) |
| FR-036 |  Server: Deny Customers, anonymous callers and unrelated Tutors access to the Tutor-only summary and its linked Booking details; counts/lists must sha | F-S3-01 | S3 proposed | VAL-029 (planned) |
| BR-001 |  One Slot reserves one exclusive one-to-one Customer/Tutor session; at most one Active Booking may claim it.  | F-S1-04 | S1 | VAL-007 (planned) |
| BR-002 |  Tutor = Staff and may manage or inspect their own authorized schedule; Customer = learner and may inspect only own private Booking data.  | F-S1-01 | S1 | VAL-002 (planned) |
| BR-003 |  Every Availability Slot has a duration of exactly 60 minutes.  | F-S1-02 | S1 | VAL-003 (planned) |
| BR-004 |  Tutor creates individual explicit Slots; no automatic recurrence or bulk Slot generation is authorized.  | F-S1-02 | S1 | VAL-003 (planned) |
| BR-005 |  For a new Booking, SlotStart - authoritative server eligibility time >= 60 minutes; equality is eligible, even if later commit succeeds after the che | F-S1-04 | S1 | VAL-008 (planned) |
| BR-006 |  Two currently offered Slots of the same Tutor cannot overlap. Adjacent half-open intervals are permitted; different Tutors may independently offer th | F-S1-02 | S1 | VAL-004 (planned) |
| BR-007 |  Only the owning Customer may cancel an Active Booking at least 30 minutes before Appointment start, including equality.  | F-S2-01 | S2 proposed | VAL-015 (planned) |
| BR-008 |  Successful Customer cancellation reopens the original Slot, but a future new Booking still independently requires BR-005.  | F-S2-01 | S2 proposed | VAL-016 (planned) |
| BR-009 |  Only the Booking-owning Customer may initiate its reschedule.  | F-S2-02 | S2 proposed | VAL-017 (planned) |
| BR-010 |  Reschedule's original Appointment must start at least 60 minutes after the authoritative decision; equality passes.  | F-S2-02 | S2 proposed | VAL-018 (planned) |
| BR-011 |  Reschedule's destination Slot must start at least 60 minutes after the authoritative decision; equality passes.  | F-S2-02 | S2 proposed | VAL-018 (planned) |
| BR-012 |  A valid Customer reschedule may move to another Tutor; original-Tutor-only restrictions are forbidden.  | F-S2-02 | S2 proposed | VAL-019 (planned) |
| BR-013 |  Reschedule is all-or-nothing across assignment, both Slot states and successful history. Failure leaves the previous Booking intact.  | F-S2-02 | S2 proposed | VAL-020 (planned) |
| BR-014 |  Successful reschedule reopens the original Slot, subject to independent new-Booking eligibility.  | F-S2-02 | S2 proposed | VAL-020 (planned) |
| BR-015 |  Successful reschedule keeps the same Booking ID and records old/new Tutor, Slot/time and change timestamp.  | F-S2-02 | S2 proposed | VAL-020 (planned) |
| BR-016 |  At most one successful reschedule per Booking; failures do not use that allowance.  | F-S2-02 | S2 proposed | VAL-017 (planned) |
| BR-017 |  Only the currently authorized Tutor assigned to the Booking may cancel it as Tutor.  | F-S2-03 | S2 proposed | VAL-021 (planned) |
| BR-018 |  Tutor cancellation requires Appointment start at least 60 minutes after the authoritative decision, equality included.  | F-S2-03 | S2 proposed | VAL-021 (planned) |
| BR-019 |  Successful Tutor cancellation withdraws the original Slot; it must not reopen it.  | F-S2-03 | S2 proposed | VAL-022 (planned) |
| BR-020 |  Tutor cancellation requires a meaningful nonblank reason; an empty/whitespace-only input is invalid. Further textual-validation details require appro | F-S2-03 | S2 proposed | VAL-021 (planned) |
| BR-021 |  Each successful Tutor cancellation creates an in-app notice for the affected owning Customer only.  | F-S2-04 | S2 proposed | VAL-023 (planned) |
| BR-022 |  Tutor-cancellation reason is visible only to the owning Customer, not to other Customers or unrelated Tutors in accessible results.  | F-S2-04 | S2 proposed | VAL-023 (planned) |
| BR-023 |  That Customer sees the cancellation reason in both the in-app notice and cancelled Booking detail.  | F-S2-04 | S2 proposed | VAL-023 (planned) |
| BR-024 |  Reading a notification does not make it inaccessible; it remains available to reread.  | F-S2-04 | S2 proposed | VAL-024 (planned) |
| BR-025 |  Notifications do not expire automatically with elapsed time. This does not settle user/admin deletion, retention or privacy governance.  | F-S2-04 | S2 proposed | VAL-024 (planned) |
| BR-026 |  Tutor cannot directly edit, delete or withdraw a Slot with an Active Booking; the authorized Booking cancellation must occur first.  | F-S2-05 | S2 proposed | VAL-025 (planned) |
| BR-027 |  Tutor may withdraw an own, unoccupied future Slot and create a separate new Slot while preserving withdrawal history.  | F-S2-05 | S2 proposed | VAL-026 (planned) |
| BR-028 |  One Customer cannot have overlapping Active Bookings across any Tutors; adjacent appointments do not overlap.  | F-S1-04 | S1 | VAL-004 (planned) |
| BR-029 |  Asia/Bangkok (UTC+07:00) is the business timezone; authoritative time comes from the server, not a browser or user-supplied timestamp.  | SYS-01 | S1-S3/Lab5+ | VAL-008 (planned) |
| BR-030 |  Booking business states are Booked and Cancelled; Past is derived from time, not a third state or evidence of Completed/attendance.  | F-S1-05 | S1 | VAL-013 (planned) |
| BR-031 |  Only authorized Tutor gets Appointment Summary counts and lists for Upcoming Booked, Past Booked and Cancelled. Customer gets no Tutor-only summary.  | F-S3-01 | S3 proposed | VAL-028 (planned) |
| BR-032 |  Historical withdrawn Slots do not block a new separate overlapping offer; they are not reactivated under the same historical Slot ID.  | F-S2-05 | S2 proposed | VAL-027 (planned) |
| BR-033 |  Protected actions require server-enforced authenticated role/ownership checks; anonymous, foreign-record and cross-role operations cannot gain privat | F-S1-01 | S1 | VAL-001 (planned) |
| BR-034 |  Accepted Booking/Slot mutations commit an internally consistent outcome; rejected validations, contention and persistence failures cannot leave parti | SYS-01 | S1-S3/Lab5+ | VAL-005 (planned) |
| BR-035 |  Invalid or nonfuture Slot proposals and attempts to book past, occupied or ineligible offers are rejected without changing committed records; rules b | F-S1-02 | S1 | VAL-004 (planned) |
| NFR-001 |  Authorization: every enumerated anonymous, forbidden-role, foreign-Customer and foreign-Tutor protected API path must reject or filter without privat | F-S1-01 | S1 | VAL-002 (planned) |
| NFR-002 |  Credential security: with locally managed passwords, store adaptive salted hashes, not plaintext; tracked repository content contains no real credent | F-S1-01 | S1 | VAL-034 (planned) |
| NFR-003 |  Durability: an accepted Slot/Booking and its authorized view must persist after browser refresh and application-process restart against the same data | SYS-01 | S1-S3/Lab5+ | VAL-007 (planned) |
| NFR-004 |  Concurrent conflict integrity: all three real-DB races must preserve BR-001/006/028, regardless of interleaving; a 20-attempt same-Slot stress burst  | F-S1-04 | S1 | VAL-005 (planned) |
| NFR-005 |  Atomic consistency: accepted cancellation/reschedule/Booking/withdrawal changes all required records together; deliberate persistence failures leave  | SYS-01 | S1-S3/Lab5+ | VAL-014 (planned) |
| NFR-006 |  Time correctness: cutoff checks use server-authoritative instants; accept exact 60:00 or 30:00 boundaries as applicable, reject just-below; Bangkok c | SYS-01 | S1-S3/Lab5+ | VAL-008 (planned) |
| NFR-007 |  Data minimization: protected Booking, reason, notification and report responses do not expose third-party identity, cancellation reason, credentials  | F-S1-05 | S1 | VAL-023 (planned) |
| NFR-008 |  Retry safety: repeated/uncertain-response requests cannot violate exclusivity, successful reschedule quota or atomic history. Whether retries return  | F-S2-02 | S2 proposed | VAL-030 (planned) |
| NFR-009 |  Keyboard usability (PROPOSED): complete login, availability, Booking and own-detail flows by keyboard with visible focus on primary controls; record  | SYS-01 | S1-S3/Lab5+ | VAL-033 (planned) |
| NFR-010 |  Local response time (PROPOSED): p95 availability and own-Booking-detail requests at or below 2.0 s, each measured over at least 50 warm-up-excluded r | SYS-01 | S1-S3/Lab5+ | VAL-032 (planned) |
| NFR-011 |  Change traceability: each implemented requirement must identify source Q/GW/D1, accountable feature/Issue, reviewed contract, planned verification an | SYS-01 | S1-S3/Lab5+ | VAL-031 (planned) |
| NFR-012 |  Reproducibility: engineering evidence must identify code version, environment/setup, DB/seed preparation, test commands and real pass/fail/skip resul | SYS-01 | S1-S3/Lab5+ | VAL-031 (planned) |
| NFR-013 |  Deployment readiness: the selected architecture must support container packaging and durable GCP deployment, with build/tests on relevant PRs and rep | SYS-01 | S1-S3/Lab5+ | VAL-035 (planned) |
| NFR-014 |  Notice durability: a Tutor-cancellation notice remains retrievable after being read and is not removed solely by age; additional retention/deletion r | F-S2-04 | S2 proposed | VAL-024 (planned) |
| NFR-015 |  Safe diagnostics: response errors expose no credentials, session tokens, protected reason or internal stack traces; operational logs must avoid secre | SYS-01 | S1-S3/Lab5+ | VAL-034 (planned) |
| NFR-016 |  Reporting correctness: for every defined Tutor Summary category, count must equal its corresponding accessible row set under the same time/state pred | F-S3-01 | S3 proposed | VAL-028 (planned) |

## Q01–Q32 accountability

Confirmed meanings and full Q-to-FR/BR/VAL crosswalk remain in [SRS §12.2](srs.md).

| Decision | Owner | Sprint |
|---|---|---|
| Q01 | F-S1-04 | S1 |
| Q02 | F-S1-01 | S1 |
| Q03 | F-S1-02 | S1 |
| Q04 | F-S1-02 | S1 |
| Q05 | F-S1-04 | S1 |
| Q06 | F-S1-02 | S1 |
| Q07 | F-S2-01 | S2 proposed |
| Q08 | F-S2-01 | S2 proposed |
| Q09 | F-S2-02 | S2 proposed |
| Q10 | F-S2-02 | S2 proposed |
| Q11 | F-S2-02 | S2 proposed |
| Q12 | F-S2-02 | S2 proposed |
| Q13 | F-S2-02 | S2 proposed |
| Q14 | F-S2-02 | S2 proposed |
| Q15 | F-S2-02 | S2 proposed |
| Q16 | F-S2-02 | S2 proposed |
| Q17 | F-S2-03 | S2 proposed |
| Q18 | F-S2-03 | S2 proposed |
| Q19 | F-S2-03 | S2 proposed |
| Q20 | F-S2-03 | S2 proposed |
| Q21 | F-S2-04 | S2 proposed |
| Q22 | F-S2-04 | S2 proposed |
| Q23 | F-S2-04 | S2 proposed |
| Q24 | F-S2-04 | S2 proposed |
| Q25 | F-S2-04 | S2 proposed |
| Q26 | F-S2-05 | S2 proposed |
| Q27 | F-S2-05 | S2 proposed |
| Q28 | F-S1-04 | S1 |
| Q29 | SYS-01 | S1-S3/Lab5+ |
| Q30 | F-S1-05 | S1 |
| Q31 | F-S3-01 | S3 proposed |
| Q32 | F-S2-05 | S2 proposed |

## Sprint 1 acceptance and test mapping

Existing [requirements.md](requirements.md) retains AC-S1-01..35 and VC/TEST-S1-01..39 as planned test anchors, not executed tests. No IDs are renamed.

| Feature | Existing FR-S1 scope | Planned evidence |
|---|---|---|
| F-S1-01 | FR-S1-01..04, shared 18/19 | Auth and server authorization AC/VC |
| F-S1-02 | FR-S1-05..07, shared 18/19 | Race A AC-S1-13 / VC-S1-37; Slot validation |
| F-S1-03 | FR-S1-08..09, shared 18/19 | Availability privacy and eligibility AC/VC |
| F-S1-04 | FR-S1-10..13/16, shared 18/19 | Race B AC-S1-25/VC-S1-25; Race C AC-S1-26/VC-S1-26; cutoff AC-S1-35/VC-S1-39 |
| F-S1-05 | FR-S1-07/14..17/19 | Protected persistent Booking reads AC/VC |

## Audit and approval gates

FR: 36/36 assigned; BR: 35/35 assigned; NFR: 16/16 assigned; Q: 32/32 assigned. No silent orphans. SYS-01 owns cross-cutting requirements while relevant features must still satisfy them.

S2/S3 assignments are proposals pending team approval in Issue #12. OD-001..015 remain open or conditional per SRS §13; OD-011/012 instructor Master/Theme unverified, so final sign-off is blocked. Proposed NFR-009/010 are not mandatory thresholds until approved.

Issue #10 PR into sprint1 requires @Tanaboonnnnn peer review; this document neither proves test passes nor grants stakeholder approval.
