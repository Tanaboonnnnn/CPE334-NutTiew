# Requirement Traceability — Deliverable 1 Part B

DRAFT. Source: [SRS](srs.md), [features](features.md), [Sprint 1 requirements](requirements.md). All validation is PLANNED, NOT EXECUTED.

| Product requirement | Complete SRS intent (linked source) | Accountable feature / responsibility | Target sprint | Planned validation |
|---|---|---|---|---|
| FR-001 | Customer/Tutor: With existing valid credentials, authenticate and establish only that principal's effective role; reject invalid credentials without authenticated access. ([full FR-001](srs.md#5-functional-requirements)) | F-S1-01 | S1 | VAL-001 (planned) |
| FR-002 | Authenticated Customer/Tutor: Return the current principal's own identity and role without accepting a client-supplied impersonation; anonymous requests reveal no protected identity. ([full FR-002](srs.md#5-functional-requirements)) | F-S1-01 | S1 | VAL-001, VAL-002 (planned) |
| FR-003 | Authenticated Customer/Tutor: Log out and render the prior session/access unusable for protected operations; the exact invalidation/expiry method must be decided in the auth contract. ([full FR-003](srs.md#5-functional-requirements)) | F-S1-01 | S1 | VAL-001, VAL-002 (planned) |
| FR-004 | Application/server: Authenticate and enforce role and record ownership on every protected Slot, Booking, notification and summary action, including crafted requests and URL/ID access; reject unauthorized access without private payload. ([full FR-004](srs.md#5-functional-requirements)) | F-S1-01 | S1 / S2 proposed / S3 proposed | VAL-002, VAL-036 (planned) |
| FR-005 | Tutor: Given authorization to their own schedule and a valid future start, publish exactly one explicit sixty-minute Slot; persist it under the authenticated Tutor, without recurrence or auto-generated bulk offers. ([full FR-005](srs.md#5-functional-requirements)) | F-S1-02 | S1 | VAL-003 (planned) |
| FR-006 | Server on Tutor creation: Reject malformed/past Slots and overlaps between currently offered Slots of the same Tutor; permit adjacent intervals and independent same-time offers by another Tutor when otherwise valid; leave existing offers unchanged on rejection. ([full FR-006](srs.md#5-functional-requirements)) | F-S1-02 | S1 | VAL-004, VAL-005 (planned) |
| FR-007 | Tutor: Retrieve own offered Slots and authorized occupied/unoccupied schedule view from committed data; reject another Tutor's protected schedule lookup. ([full FR-007](srs.md#5-functional-requirements)) | F-S1-02 | S1 | VAL-002, VAL-012 (planned) |
| FR-008 | Customer: Browse Tutor/Slot/time information sufficient to choose a specific offer, without disclosure of another Customer's private reservation; the concrete field allowlist remains an API-contract choice. ([full FR-008](srs.md#5-functional-requirements)) | F-S1-03 | S1 | VAL-006, VAL-036 (planned) |
| FR-009 | Server/availability view: Mark an offer bookable only when current, unoccupied, eligible and not too close to its start; an earlier view must not guarantee later acceptance. Hide-versus-disabled presentation is unresolved. ([full FR-009](srs.md#5-functional-requirements)) | F-S1-03 | S1 | VAL-006, VAL-009 (planned) |
| FR-010 | Customer: Given an eligible Slot and no overlapping Active Booking, request one exclusive reservation for their authenticated identity; commit one `Booked` Booking referencing the actual Slot and Tutor before acknowledging success. ([full FR-010](srs.md#5-functional-requirements)) | F-S1-04 | S1 | VAL-007 (planned) |
| FR-011 | Server on Booking: Revalidate offered/unoccupied state, user ownership, cutoff and overlaps immediately before a guarded Booking write; reject stale, invalid, past, too-soon or occupied choices with no partial reservation. ([full FR-011](srs.md#5-functional-requirements)) | F-S1-04 | S1 | VAL-008, VAL-009, VAL-014 (planned) |
| FR-012 | Server on competing Bookings: Under simultaneous attempts by different Customers for the same exclusive Slot, allow at most one committed Active Booking and never return two successful claims. ([full FR-012](srs.md#5-functional-requirements)) | F-S1-04 | S1 | VAL-010 (planned) |
| FR-013 | Server on Customer Booking: Reject the same Customer's overlapping Active reservation, including requests for two different Tutors; accept adjacency under this specific rule, with at most one conflicting success under concurrency. ([full FR-013](srs.md#5-functional-requirements)) | F-S1-04 | S1 | VAL-004, VAL-011 (planned) |
| FR-014 | Customer: Retrieve a persisted list and detail of own Bookings with Booking identity, Tutor/Slot/interval and business status; foreign IDs must not disclose Booking data. ([full FR-014](srs.md#5-functional-requirements)) | F-S1-05 | S1 | VAL-012, VAL-036 (planned) |
| FR-015 | Tutor: Retrieve Bookings attached to the Tutor's authorized schedule only; requesting another Tutor's records must not disclose them. ([full FR-015](srs.md#5-functional-requirements)) | F-S1-05 | S1 | VAL-002, VAL-012 (planned) |
| FR-016 | Application: Authorized reopened/refresh/restart views must reflect successfully committed Slots/Bookings and correct ownership; a failed transaction must not produce a persisted or reported phantom Booking. ([full FR-016](srs.md#5-functional-requirements)) | F-S1-05 | S1 | VAL-007, VAL-014 (planned) |
| FR-017 | Application views: Display `Booked` accurately and, when a Booking's end is past, optionally derive `Past`; never assert `Completed`, attendance or auto-release solely from elapsed time. ([full FR-017](srs.md#5-functional-requirements)) | F-S1-05 | S1 | VAL-013 (planned) |
| FR-018 | Application/server: Return an observable, non-success rejection for forbidden, invalid, stale, conflicting or failed mutations, without leaking protected records or leaving partial state. Specific HTTP status/payload formats remain contract decisions. ([full FR-018](srs.md#5-functional-requirements)) | SYS-01 | S1-S3/Lab5+ | VAL-002, VAL-014, VAL-030 (planned) |
| FR-019 | System: Support the Tutor offer → Customer browse → committed Booking → authorized retrieval journey through a real UI, application/API and durable database, surviving refresh and application restart. ([full FR-019](srs.md#5-functional-requirements)) | SYS-01 | S1-S3/Lab5+ | VAL-007, VAL-031 (planned) |
| FR-020 | Owning Customer: Cancel their current Booking when the Appointment starts at least 30 minutes after the server's authoritative decision; at the exact boundary allow, below it deny; foreign or nonactive Booking cannot be cancelled. ([full FR-020](srs.md#5-functional-requirements)) | F-S2-01 | S2 proposed | VAL-015 (planned) |
| FR-021 | Server on successful Customer cancellation: Change Booking to `Cancelled` and reopen its same original Slot atomically; keep it unbookable for any later new request failing the independent Q05 cutoff. ([full FR-021](srs.md#5-functional-requirements)) | F-S2-01 | S2 proposed | VAL-015, VAL-016 (planned) |
| FR-022 | Owning Customer: Initiate rescheduling of an existing `Booked` Booking; reject nonowners and disallowed Booking state. ([full FR-022](srs.md#5-functional-requirements)) | F-S2-02 | S2 proposed | VAL-017 (planned) |
| FR-023 | Server on reschedule: Require both original Appointment start and destination Slot start to be at least 60 minutes away at authoritative decision; reject either too-late side including the just-below-boundary case. ([full FR-023](srs.md#5-functional-requirements)) | F-S2-02 | S2 proposed | VAL-018 (planned) |
| FR-024 | Owning Customer: Select a valid destination with a different Tutor if desired; do not restrict rescheduling to the original Tutor, while still enforcing destination occupancy and same-Customer overlap. ([full FR-024](srs.md#5-functional-requirements)) | F-S2-02 | S2 proposed | VAL-019 (planned) |
| FR-025 | Server on reschedule: Atomically update Booking assignment, occupy destination, release/reopen original Slot and record history; any validation, conflict or persistence failure leaves all related records at their pre-attempt state. ([full FR-025](srs.md#5-functional-requirements)) | F-S2-02 | S2 proposed | VAL-020 (planned) |
| FR-026 | Server: Preserve the Booking ID across a successful reschedule and append a successful-change record with former/new Tutor, Slot/interval and timestamp; rejected attempts do not create successful history. ([full FR-026](srs.md#5-functional-requirements)) | F-S2-02 | S2 proposed | VAL-020 (planned) |
| FR-027 | Server: Permit at most one successful reschedule per Booking; a failed attempt leaves the allowance available, while a second successful-change request is rejected. ([full FR-027](srs.md#5-functional-requirements)) | F-S2-02 | S2 proposed | VAL-017, VAL-020 (planned) |
| FR-028 | Currently assigned Tutor: Cancel an Active Booking belonging to the Tutor's authorized schedule only when its start is at least 60 minutes away; exact boundary passes and wrong-Tutor/too-late attempts fail. ([full FR-028](srs.md#5-functional-requirements)) | F-S2-03 | S2 proposed | VAL-021 (planned) |
| FR-029 | Tutor/server: Require a meaningful nonblank reason before accepting Tutor cancellation; reject absent, whitespace-only or semantically empty reason without changing Booking or Slot. Length/format details need approved design. ([full FR-029](srs.md#5-functional-requirements)) | F-S2-03 | S2 proposed | VAL-021 (planned) |
| FR-030 | Server on successful Tutor cancellation: Mark Booking `Cancelled` and withdraw its original Slot instead of reopening it; preserve trace/history and ensure no partial outcome. ([full FR-030](srs.md#5-functional-requirements)) | F-S2-03 | S2 proposed | VAL-022 (planned) |
| FR-031 | Server: On successful Tutor cancellation create one private in-app notice for that Booking's owning Customer, including the authorized reason; the reason also appears in that Customer's cancelled Booking details, never in third-party views. ([full FR-031](srs.md#5-functional-requirements)) | F-S2-04 | S2 proposed | VAL-023, VAL-036 (planned) |
| FR-032 | Owning Customer: Retrieve and reread Tutor-cancellation notices after marking them read; absence of automatic time-based expiry must hold, while deletion/retention governance remains undecided. ([full FR-032](srs.md#5-functional-requirements)) | F-S2-04 | S2 proposed | VAL-024 (planned) |
| FR-033 | Server/Tutor: Forbid direct edit, deletion or withdrawal of a Slot while it carries an Active Booking; require the separate authorized cancellation workflow first. ([full FR-033](srs.md#5-functional-requirements)) | F-S2-05 | S2 proposed | VAL-025 (planned) |
| FR-034 | Owning Tutor: Withdraw an unoccupied future currently offered Slot while retaining its history; permit later creation of a distinct new Slot with a new ID that may overlap the withdrawn interval; reject reopening/reactivating the withdrawn historical Slot. ([full FR-034](srs.md#5-functional-requirements)) | F-S2-05 | S2 proposed | VAL-026, VAL-027 (planned) |
| FR-035 | Tutor: Retrieve an Appointment Summary with counts and corresponding lists for Upcoming Booked, Past Booked and Cancelled on the Tutor's authorized schedule, calculated from stored Booking state and server time; in-progress classification remains OD-006. ([full FR-035](srs.md#5-functional-requirements)) | F-S3-01 | S3 proposed | VAL-028, VAL-029 (planned) |
| FR-036 | Server: Deny Customers, anonymous callers and unrelated Tutors access to the Tutor-only summary and its linked Booking details; counts/lists must share the same visibility and classification criteria. ([full FR-036](srs.md#5-functional-requirements)) | F-S3-01 | S3 proposed | VAL-029, VAL-036 (planned) |
| BR-001 | One Slot reserves one exclusive one-to-one Customer/Tutor session; at most one Active Booking may claim it. ([full BR-001](srs.md#6-business-rules)) | F-S1-04 | S1 | VAL-007, VAL-010 (planned) |
| BR-002 | Tutor = Staff and may manage or inspect their own authorized schedule; Customer = learner and may inspect only own private Booking data. ([full BR-002](srs.md#6-business-rules)) | F-S1-01 | S1 | VAL-002, VAL-012 (planned) |
| BR-003 | Every Availability Slot has a duration of exactly 60 minutes. ([full BR-003](srs.md#6-business-rules)) | F-S1-02 | S1 | VAL-003, VAL-004 (planned) |
| BR-004 | Tutor creates individual explicit Slots; no automatic recurrence or bulk Slot generation is authorized. ([full BR-004](srs.md#6-business-rules)) | F-S1-02 | S1 | VAL-003 (planned) |
| BR-005 | For a new Booking, `SlotStart - authoritative server eligibility time >= 60 minutes`; equality is eligible, even if later commit succeeds after the check. A 59:59 remaining interval fails. ([full BR-005](srs.md#6-business-rules)) | F-S1-04 | S1 | VAL-008, VAL-009 (planned) |
| BR-006 | Two currently offered Slots of the same Tutor cannot overlap. Adjacent half-open intervals are permitted; different Tutors may independently offer the same time. ([full BR-006](srs.md#6-business-rules)) | F-S1-02 | S1 | VAL-004, VAL-005 (planned) |
| BR-007 | Only the owning Customer may cancel an Active Booking at least 30 minutes before Appointment start, including equality. ([full BR-007](srs.md#6-business-rules)) | F-S2-01 | S2 proposed | VAL-015 (planned) |
| BR-008 | Successful Customer cancellation reopens the original Slot, but a future new Booking still independently requires BR-005. ([full BR-008](srs.md#6-business-rules)) | F-S2-01 | S2 proposed | VAL-016 (planned) |
| BR-009 | Only the Booking-owning Customer may initiate its reschedule. ([full BR-009](srs.md#6-business-rules)) | F-S2-02 | S2 proposed | VAL-017 (planned) |
| BR-010 | Reschedule's original Appointment must start at least 60 minutes after the authoritative decision; equality passes. ([full BR-010](srs.md#6-business-rules)) | F-S2-02 | S2 proposed | VAL-018 (planned) |
| BR-011 | Reschedule's destination Slot must start at least 60 minutes after the authoritative decision; equality passes. ([full BR-011](srs.md#6-business-rules)) | F-S2-02 | S2 proposed | VAL-018 (planned) |
| BR-012 | A valid Customer reschedule may move to another Tutor; original-Tutor-only restrictions are forbidden. ([full BR-012](srs.md#6-business-rules)) | F-S2-02 | S2 proposed | VAL-019 (planned) |
| BR-013 | Reschedule is all-or-nothing across assignment, both Slot states and successful history. Failure leaves the previous Booking intact. ([full BR-013](srs.md#6-business-rules)) | F-S2-02 | S2 proposed | VAL-020 (planned) |
| BR-014 | Successful reschedule reopens the original Slot, subject to independent new-Booking eligibility. ([full BR-014](srs.md#6-business-rules)) | F-S2-02 | S2 proposed | VAL-016, VAL-020 (planned) |
| BR-015 | Successful reschedule keeps the same Booking ID and records old/new Tutor, Slot/time and change timestamp. ([full BR-015](srs.md#6-business-rules)) | F-S2-02 | S2 proposed | VAL-020 (planned) |
| BR-016 | At most one successful reschedule per Booking; failures do not use that allowance. ([full BR-016](srs.md#6-business-rules)) | F-S2-02 | S2 proposed | VAL-017, VAL-020 (planned) |
| BR-017 | Only the currently authorized Tutor assigned to the Booking may cancel it as Tutor. ([full BR-017](srs.md#6-business-rules)) | F-S2-03 | S2 proposed | VAL-021 (planned) |
| BR-018 | Tutor cancellation requires Appointment start at least 60 minutes after the authoritative decision, equality included. ([full BR-018](srs.md#6-business-rules)) | F-S2-03 | S2 proposed | VAL-021 (planned) |
| BR-019 | Successful Tutor cancellation withdraws the original Slot; it must not reopen it. ([full BR-019](srs.md#6-business-rules)) | F-S2-03 | S2 proposed | VAL-022 (planned) |
| BR-020 | Tutor cancellation requires a meaningful nonblank reason; an empty/whitespace-only input is invalid. Further textual-validation details require approval. ([full BR-020](srs.md#6-business-rules)) | F-S2-03 | S2 proposed | VAL-021 (planned) |
| BR-021 | Each successful Tutor cancellation creates an in-app notice for the affected owning Customer only. ([full BR-021](srs.md#6-business-rules)) | F-S2-04 | S2 proposed | VAL-023 (planned) |
| BR-022 | Tutor-cancellation reason is visible only to the owning Customer, not to other Customers or unrelated Tutors in accessible results. ([full BR-022](srs.md#6-business-rules)) | F-S2-04 | S2 proposed | VAL-023, VAL-036 (planned) |
| BR-023 | That Customer sees the cancellation reason in both the in-app notice and cancelled Booking detail. ([full BR-023](srs.md#6-business-rules)) | F-S2-04 | S2 proposed | VAL-023 (planned) |
| BR-024 | Reading a notification does not make it inaccessible; it remains available to reread. ([full BR-024](srs.md#6-business-rules)) | F-S2-04 | S2 proposed | VAL-024 (planned) |
| BR-025 | Notifications do not expire automatically with elapsed time. This does not settle user/admin deletion, retention or privacy governance. ([full BR-025](srs.md#6-business-rules)) | F-S2-04 | S2 proposed | VAL-024 (planned) |
| BR-026 | Tutor cannot directly edit, delete or withdraw a Slot with an Active Booking; the authorized Booking cancellation must occur first. ([full BR-026](srs.md#6-business-rules)) | F-S2-05 | S2 proposed | VAL-025 (planned) |
| BR-027 | Tutor may withdraw an own, unoccupied future Slot and create a separate new Slot while preserving withdrawal history. ([full BR-027](srs.md#6-business-rules)) | F-S2-05 | S2 proposed | VAL-026 (planned) |
| BR-028 | One Customer cannot have overlapping Active Bookings across any Tutors; adjacent appointments do not overlap. ([full BR-028](srs.md#6-business-rules)) | F-S1-04 | S1 | VAL-004, VAL-011 (planned) |
| BR-029 | `Asia/Bangkok` (UTC+07:00) is the business timezone; authoritative time comes from the server, not a browser or user-supplied timestamp. ([full BR-029](srs.md#6-business-rules)) | SYS-01 | S1-S3/Lab5+ | VAL-008, VAL-013 (planned) |
| BR-030 | Booking business states are `Booked` and `Cancelled`; `Past` is derived from time, not a third state or evidence of `Completed`/attendance. ([full BR-030](srs.md#6-business-rules)) | F-S1-05 (shared: F-S2-01/03, F-S3-01) | S1 / S2 proposed / S3 proposed | VAL-013, VAL-015 (planned) |
| BR-031 | Only authorized Tutor gets Appointment Summary counts and lists for Upcoming Booked, Past Booked and Cancelled. Customer gets no Tutor-only summary. ([full BR-031](srs.md#6-business-rules)) | F-S3-01 | S3 proposed | VAL-028, VAL-029 (planned) |
| BR-032 | Historical withdrawn Slots do not block a new separate overlapping offer; they are not reactivated under the same historical Slot ID. ([full BR-032](srs.md#6-business-rules)) | F-S2-05 | S2 proposed | VAL-027 (planned) |
| BR-033 | Protected actions require server-enforced authenticated role/ownership checks; anonymous, foreign-record and cross-role operations cannot gain private data or mutation rights. ([full BR-033](srs.md#6-business-rules)) | F-S1-01 | S1 / S2 proposed / S3 proposed | VAL-001, VAL-002, VAL-036 (planned) |
| BR-034 | Accepted Booking/Slot mutations commit an internally consistent outcome; rejected validations, contention and persistence failures cannot leave partially claimed Slots, duplicate active reservations or false success. The precise locking/constraint scheme is not selected here. ([full BR-034](srs.md#6-business-rules)) | SYS-01 (shared: F-S1-02/04, F-S2-02/03) | S1 / S2 proposed | VAL-005, VAL-010, VAL-011, VAL-014, VAL-020, VAL-022 (planned) |
| BR-035 | Invalid or nonfuture Slot proposals and attempts to book past, occupied or ineligible offers are rejected without changing committed records; rules beyond confirmed time policies cannot be fabricated. ([full BR-035](srs.md#6-business-rules)) | F-S1-02 | S1 | VAL-004, VAL-006, VAL-014 (planned) |
| NFR-001 | Authorization: every enumerated anonymous, forbidden-role, foreign-Customer and foreign-Tutor protected API path must reject or filter without private payload disclosure. Measure zero unauthorized record disclosure in seeded negative cases. ([full NFR-001](srs.md#7-non-functional-requirements)) | F-S1-01 | S1 | VAL-002, VAL-036 (planned) |
| NFR-002 | Credential security: with locally managed passwords, store adaptive salted hashes, not plaintext; tracked repository content contains no real credentials. Verify using test DB inspection and secret/config review. ([full NFR-002](srs.md#7-non-functional-requirements)) | F-S1-01 | S1 | VAL-034 (planned) |
| NFR-003 | Durability: an accepted Slot/Booking and its authorized view must persist after browser refresh and application-process restart against the same data store; no in-memory-only persistence. ([full NFR-003](srs.md#7-non-functional-requirements)) | SYS-01 | S1 / S2 proposed / S3 proposed | VAL-007, VAL-031 (planned) |
| NFR-004 | Concurrent conflict integrity: all three real-DB races must preserve BR-001/006/028, regardless of interleaving; a 20-attempt same-Slot stress burst and a 10-attempt same-Customer burst are proposed test sizes, not approved business capacity limits. ([full NFR-004](srs.md#7-non-functional-requirements)) | SYS-01 (shared: F-S1-02, F-S1-04) | S1 | VAL-005, VAL-010, VAL-011 (planned) |
| NFR-005 | Atomic consistency: accepted cancellation/reschedule/Booking/withdrawal changes all required records together; deliberate persistence failures leave the prior committed state and no false confirmation. ([full NFR-005](srs.md#7-non-functional-requirements)) | SYS-01 | S1 / S2 proposed / S3 proposed | VAL-014, VAL-020, VAL-022 (planned) |
| NFR-006 | Time correctness: cutoff checks use server-authoritative instants; accept exact 60:00 or 30:00 boundaries as applicable, reject just-below; Bangkok calendar/hour remains stable for a non-Bangkok browser. ([full NFR-006](srs.md#7-non-functional-requirements)) | SYS-01 | S1 / S2 proposed / S3 proposed | VAL-008, VAL-009, VAL-013, VAL-015, VAL-018, VAL-021 (planned) |
| NFR-007 | Data minimization: protected Booking, reason, notification and report responses do not expose third-party identity, cancellation reason, credentials or arbitrary private schedule fields. Review response bodies and negative payloads, not UI controls only. ([full NFR-007](srs.md#7-non-functional-requirements)) | SYS-01 (shared: F-S1-03/05, F-S2-04, F-S3-01) | S1 / S2 proposed / S3 proposed | VAL-006, VAL-012, VAL-023, VAL-029, VAL-036 (planned) |
| NFR-008 | Retry safety: repeated/uncertain-response requests cannot violate exclusivity, successful reschedule quota or atomic history. Whether retries return the original success response and any token format/retention are open. ([full NFR-008](srs.md#7-non-functional-requirements)) | F-S2-02 | S1 / S2 proposed | VAL-020, VAL-030 (planned) |
| NFR-009 | Keyboard usability (PROPOSED): complete login, availability, Booking and own-detail flows by keyboard with visible focus on primary controls; record manual checklist, browser and failures. ([full NFR-009](srs.md#7-non-functional-requirements)) | SYS-01 | S1-S3/Lab5+ | VAL-033 (planned) |
| NFR-010 | Local response time (PROPOSED): p95 availability and own-Booking-detail requests at or below 2.0 s, each measured over at least 50 warm-up-excluded requests with documented hardware, fixture size and database. ([full NFR-010](srs.md#7-non-functional-requirements)) | SYS-01 | S1-S3/Lab5+ | VAL-032 (planned) |
| NFR-011 | Change traceability: each implemented requirement must identify source Q/GW/D1, accountable feature/Issue, reviewed contract, planned verification and release evidence; changes to Q rules need recorded stakeholder approval. ([full NFR-011](srs.md#7-non-functional-requirements)) | SYS-01 | S1-S3/Lab5+ | VAL-031 (planned) |
| NFR-012 | Reproducibility: engineering evidence must identify code version, environment/setup, DB/seed preparation, test commands and real pass/fail/skip results; mere presence of tests is not a pass. ([full NFR-012](srs.md#7-non-functional-requirements)) | SYS-01 | S1-S3/Lab5+ | VAL-031 (planned) |
| NFR-013 | Deployment readiness: the selected architecture must support container packaging and durable GCP deployment, with build/tests on relevant PRs and repeatable accepted release from `main` after Lab 5. No cloud success is asserted at D1. ([full NFR-013](srs.md#7-non-functional-requirements)) | SYS-01 | S1-S3/Lab5+ | VAL-035 (planned) |
| NFR-014 | Notice durability: a Tutor-cancellation notice remains retrievable after being read and is not removed solely by age; additional retention/deletion rights await owner decision. ([full NFR-014](srs.md#7-non-functional-requirements)) | F-S2-04 | S2 proposed | VAL-024 (planned) |
| NFR-015 | Safe diagnostics: response errors expose no credentials, session tokens, protected reason or internal stack traces; operational logs must avoid secrets and preserve enough non-sensitive context to investigate failed mutations. Exact logging fields/retention are engineering decisions. ([full NFR-015](srs.md#7-non-functional-requirements)) | SYS-01 | S1 / S2 proposed / S3 proposed | VAL-034, VAL-036 (planned) |
| NFR-016 | Reporting correctness: for every defined Tutor Summary category, count must equal its corresponding accessible row set under the same time/state predicates; no completion is inferred from elapsed time. Treatment of in-progress sessions remains open. ([full NFR-016](srs.md#7-non-functional-requirements)) | F-S3-01 | S3 proposed | VAL-028, VAL-029 (planned) |

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
| Q30 | F-S1-05 (Booked/Past); F-S2-01 and F-S2-03 (Cancelled); F-S3-01 (summary/report) | S1 / S2 proposed / S3 proposed |
| Q31 | F-S3-01 | S3 proposed |
| Q32 | F-S2-05 | S2 proposed |

## Sprint 1 acceptance and test mapping

All 35 AC and all 39 VC/TEST identifiers below are **planned evidence anchors, not executed results**. IDs, scenarios and expected outcomes are taken from [requirements.md §9 and §13](requirements.md); this document only assigns feature ownership. Shared entries do not dilute primary accountability.

### Acceptance criteria: AC-S1-01..35

| AC ID | Primary owner | Other impacted owner | Baseline scenario and expected result | Planned VC reference |
|---|---|---|---|---|
| AC-S1-01 | F-S1-01 | — | Existing valid Customer credentials — Authenticated principal is Customer; user sees correct own identity/role | VC-01/03 (planned) |
| AC-S1-02 | F-S1-01 | — | Existing valid Tutor credentials — Authenticated principal is Tutor; own-schedule operations are available | VC-01/03 (planned) |
| AC-S1-03 | F-S1-01 | — | Invalid password or unknown credentials — Access denied; no protected identity/session returned | VC-02 (planned) |
| AC-S1-04 | F-S1-01 | — | Authenticated user — Protected action rejected according to documented session lifecycle | VC-04 (planned) |
| AC-S1-05 | F-S1-01 | — | Unauthenticated browser or caller — No operation granted and no private payload disclosed | VC-05 (planned) |
| AC-S1-06 | F-S1-01 | — | Authenticated Customer — Backend denies request; Tutor schedule unchanged | VC-06 (planned) |
| AC-S1-07 | F-S1-01 | F-S1-05 | Tutor A and B have different schedules — No protected records or writes under B's identity | VC-07/31 (planned) |
| AC-S1-08 | F-S1-02 | — | Own authorized Tutor schedule; valid future Bangkok start — Exactly one 60-minute offered Slot is persisted and available on schedule refresh | VC-08/14 (planned) |
| AC-S1-09 | F-S1-02 | — | Same Tutor offers 13:00–14:00 — New Slot rejected, existing Slot unchanged | VC-09 (planned) |
| AC-S1-10 | F-S1-02 | — | Same Tutor offers 13:00–14:00 — Adjacent Slot allowed by non-overlap rule, subject to independent validity | VC-10 (planned) |
| AC-S1-11 | F-S1-02 | — | Tutor A offers 13:00–14:00 — Different Tutor offer permitted | VC-11 (planned) |
| AC-S1-12 | F-S1-02 | — | Invalid or past date/start — No invalid Slot persisted, no collateral mutation | VC-12 (planned) |
| AC-S1-13 | F-S1-02 | — | Same Tutor proposes two overlapping Slot writes concurrently — Database never contains two overlapping currently offered Slots for that Tutor | VC-37 (planned) |
| AC-S1-14 | F-S1-02 | F-S1-03 | Browser timezone is not Bangkok — Same intended Bangkok appointment date and hour displayed | VC-13 (planned) |
| AC-S1-15 | F-S1-03 | — | Customer logged in; eligible offered Slot exists — Selectable Tutor and Bangkok appointment times shown without private other-Customer details | VC-15 (planned) |
| AC-S1-16 | F-S1-03 | — | Offered Slot occupied or inside Q05 cutoff — Slot is not selectable as bookable and never reveals its Customer; proposed default: show only currently bookable offers, pending the reviewed UI contract in TBD-S1-04 | VC-15/22 (planned) |
| AC-S1-17 | F-S1-03 | — | Displayed offer becomes ineligible before submission — Backend rechecks and rejects; UI does not report a successful Booking | VC-22 (planned) |
| AC-S1-18 | F-S1-03 | — | Device locale is another timezone — Bangkok time meaning does not drift with device timezone | VC-13/15 (planned) |
| AC-S1-19 | F-S1-04 | — | Eligible unoccupied Slot, Customer logged in without overlapping Booking — One Booked record is committed with correct Customer, Tutor and Slot identifiers | VC-16 (planned) |
| AC-S1-20 | F-S1-04 | — | Slot begins 15:00; backend `T_elig` is exactly 14:00:00 — Exact 60-minute cutoff accepted if all other checks pass and transaction subsequently commits | VC-17 (planned) |
| AC-S1-21 | F-S1-04 | — | Slot begins 15:00; backend `T_elig` is 14:00:01 — Less-than-60-minute cutoff rejected, no Booking or occupation | VC-18 (planned) |
| AC-S1-22 | F-S1-04 | — | Customer A owns active Booking on Slot X — Second request rejected, first Booking preserved | VC-19 (planned) |
| AC-S1-23 | F-S1-04 | — | Customer holds Tutor A 13:00–14:00 — Reject overlapping appointment even across Tutors | VC-20 (planned) |
| AC-S1-24 | F-S1-04 | — | Customer holds an interval ending 14:00 — Adjacency itself not blocked; other checks still apply | VC-21 (planned) |
| AC-S1-25 | F-S1-04 | — | Two Customers simultaneously request one eligible Slot — At most one committed Active Booking; no false second success | VC-25 (planned) |
| AC-S1-26 | F-S1-04 | — | Same Customer concurrently requests distinct overlapping Tutor Slots — No two overlapping Active Bookings committed for Customer | VC-26 (planned) |
| AC-S1-27 | F-S1-04 | F-S1-02 | Previously eligible Slot becomes invalid/occupied or persistence fails — No phantom success, partial Booking or inconsistent occupied state | VC-22/27/33 (planned) |
| AC-S1-28 | F-S1-04 | F-S1-01 | Customer alters request body to impersonate other identity/Tutor — Owner derived from trusted session; Tutor from actual Slot, not supplied roles | VC-24 (planned) |
| AC-S1-29 | F-S1-04 | — | Customer repeats request while first outcome might be unknown — Exclusivity and Customer-overlap invariants hold; exact retry response remains contract TBD | VC-38 (planned) |
| AC-S1-30 | F-S1-05 | — | Customer already has a committed Booking — Correct Booking identity, Tutor, Bangkok interval and Booked status | VC-28 (planned) |
| AC-S1-31 | F-S1-05 | — | Customer A has Booking; Customer B knows its ID — No protected Booking information disclosed | VC-29 (planned) |
| AC-S1-32 | F-S1-05 | — | Tutor owns current Booking schedule — Authorized Booking visible on own schedule only | VC-30 (planned) |
| AC-S1-33 | F-S1-05 | — | Tutor B knows Tutor A schedule ID — No protected foreign Tutor Booking disclosed | VC-31 (planned) |
| AC-S1-34 | F-S1-05 | — | Booked 13:00–14:00 appointment now ended — Booking still Booked; may show Past; no Completed/attendance assertion | VC-32 (planned) |
| AC-S1-35 | F-S1-04 | — | Slot starts 15:00; Booking HTTP request reaches server at 13:59:59 but waits for contention until final transactional `T_elig` is 14:00:01 — Reject as less than 60 minutes remaining, preserve Slot and all previously committed Bookings, and do not report success merely because HTTP arrival preceded the cutoff | VC-39 (planned) |

### Verification cases: VC/TEST-S1-01..39

| VC / TEST ID | Primary owner | Other impacted owner | Baseline scenario and expected result | Status |
|---|---|---|---|---|
| VC-S1-01/TEST-S1-01 | F-S1-01 | — | Existing Customer and Tutor demo credentials → each logs in — Correct own identity/role; no cross-role grant | Planned, not run |
| VC-S1-02/TEST-S1-02 | F-S1-01 | — | Invalid password → login attempt — Authentication refused; no valid session/identity exposed | Planned, not run |
| VC-S1-03/TEST-S1-03 | F-S1-01 | — | Logged-in user → current identity query — Authenticated user's own ID and role, not arbitrary submitted identity | Planned, not run |
| VC-S1-04/TEST-S1-04 | F-S1-01 | — | Logged-in user → logout → reuse prior access — Protected access rejected according to chosen session lifecycle | Planned, not run |
| VC-S1-05/TEST-S1-05 | F-S1-01 | — | Anonymous caller → private Booking / create Slot / book — All protected actions denied without protected data | Planned, not run |
| VC-S1-06/TEST-S1-06 | F-S1-01 | — | Customer → attempts Tutor-only create action — Rejected by backend, even when request is crafted manually | Planned, not run |
| VC-S1-07/TEST-S1-07 | F-S1-01 | — | Tutor A → attempts to create/view private schedule of Tutor B — Access rejected or B's records absent; A's own schedule unaffected | Planned, not run |
| VC-S1-08/TEST-S1-08 | F-S1-02 | — | Authorized Tutor; future date → create one Slot — Exactly one offered 60-minute Slot persisted under that Tutor | Planned, not run |
| VC-S1-09/TEST-S1-09 | F-S1-02 | — | Tutor's offered Slot 13:00–14:00 → create 13:30–14:30 — Reject overlap; old Slot unchanged, no duplicate offer | Planned, not run |
| VC-S1-10/TEST-S1-10 | F-S1-02 | — | Tutor's offered Slot 13:00–14:00 → create 14:00–15:00 — Overlap rule permits adjacency; other validity checks remain | Planned, not run |
| VC-S1-11/TEST-S1-11 | F-S1-02 | — | Tutor A offers 13:00–14:00 → Tutor B creates same time — Allowed as distinct Tutor offer if valid | Planned, not run |
| VC-S1-12/TEST-S1-12 | F-S1-02 | — | Proposed Slot starts in the past/invalid → Tutor submits — Reject with no stored Slot or collateral mutation | Planned, not run |
| VC-S1-13/TEST-S1-13 | F-S1-02 | F-S1-03 | Time shown by browser in another timezone → create/check Bangkok Slot — Tutor and Customer see same intended Bangkok appointment time | Planned, not run |
| VC-S1-14/TEST-S1-14 | F-S1-02 | — | Tutor owns offered Slot → opens schedule after refresh — Exact Slot and correct offered/occupied state still visible | Planned, not run |
| VC-S1-15/TEST-S1-15 | F-S1-03 | — | Customer logged in; eligible future offered Slot → browse — Tutor and time identifiable; no other Customer's private details exposed | Planned, not run |
| VC-S1-16/TEST-S1-16 | F-S1-04 | — | Eligible unoccupied Slot → Customer requests Booking — One persisted Booking, state Booked, own Customer and selected Tutor/Slot | Planned, not run |
| VC-S1-17/TEST-S1-17 | F-S1-04 | — | Slot at 15:00, backend `T_elig` is 14:00:00 — Exactly 60-minute Q05 lead time passes if otherwise valid; later commit does not retroactively invalidate a passing checked write | Planned, not run |
| VC-S1-18/TEST-S1-18 | F-S1-04 | — | Slot at 15:00, backend `T_elig` is 14:00:01 — Q05 lead time fails; no Booking/occupation | Planned, not run |
| VC-S1-19/TEST-S1-19 | F-S1-04 | — | Offered Slot already occupied → another Customer books it — Reject; previous Booking preserved and only one active claim remains | Planned, not run |
| VC-S1-20/TEST-S1-20 | F-S1-04 | — | Customer holds 13:00–14:00 Tutor A → books 13:30–14:30 Tutor B — Reject cross-Tutor Customer overlap with no second Booking | Planned, not run |
| VC-S1-21/TEST-S1-21 | F-S1-04 | — | Customer holds 13:00–14:00 → requests 14:00–15:00 — Customer-overlap check permits adjacent interval, subject to lead time | Planned, not run |
| VC-S1-22/TEST-S1-22 | F-S1-04 | F-S1-03 | Selected Slot was eligible at browse but is taken/too soon by submission — Backend rejects stale selection; no false success | Planned, not run |
| VC-S1-23/TEST-S1-23 | F-S1-04 | F-S1-01 | Invalid/missing/past Slot or unauthorized actor → booking attempt — Reject without claimed Slot or private data disclosure | Planned, not run |
| VC-S1-24/TEST-S1-24 | F-S1-04 | F-S1-01 | Customer alters client-supplied user/Tutor ownership IDs — Persist Booking only for authenticated Customer and actual Slot Tutor, or reject | Planned, not run |
| VC-S1-25/TEST-S1-25 | F-S1-04 | — | Two distinct Customers submit concurrently for same eligible exclusive Slot — At most one committed Active Booking; other gets non-success; DB invariant holds | Planned, not run |
| VC-S1-26/TEST-S1-26 | F-S1-04 | — | One Customer submits concurrently for distinct overlapping eligible Slots of two Tutors — No two overlapping Active Bookings commit; no partial losing claim | Planned, not run |
| VC-S1-27/TEST-S1-27 | F-S1-04 | — | Persistence failure injected before Booking transaction finishes — No false success, no committed Booking or partial occupied Slot | Planned, not run |
| VC-S1-28/TEST-S1-28 | F-S1-05 | — | Customer creates successful Booking → refresh/restart app with same DB — Own Booking and identity/time/state retrievable unchanged | Planned, not run |
| VC-S1-29/TEST-S1-29 | F-S1-05 | — | Customer B knows Customer A's Booking ID → tries detail/list — Private Booking content not revealed | Planned, not run |
| VC-S1-30/TEST-S1-30 | F-S1-05 | — | Tutor A → inspect own schedule with Booking — Correct assigned Booking visible without exposing another Tutor's protected records | Planned, not run |
| VC-S1-31/TEST-S1-31 | F-S1-05 | — | Tutor B knows Tutor A's schedule/Booking identifiers → read attempt — Access denied/filtered; Tutor A records remain private | Planned, not run |
| VC-S1-32/TEST-S1-32 | F-S1-05 | — | Booking interval fully elapsed, no cancellation → open Booking — Business state remains Booked; may show Past; never Completed or assumed attended | Planned, not run |
| VC-S1-33/TEST-S1-33 | F-S1-04 | — | User submits failed/invalid request → reopen respective views — No new phantom Booking, no changed Slot occupancy from failed attempt | Planned, not run |
| VC-S1-34/TEST-S1-34 | SYS-01 | F-S1-01/02/03/04/05 | Real app boot and seed setup → complete J-S1-01 then J-S1-02 through UI and DB — Full verified workflow, repeatable commands and actual test results recorded later | Planned, not run |
| VC-S1-35/TEST-S1-35 | SYS-01 | F-S1-01 | Test invalid access and inspect tracked env/config — No plaintext stored passwords/secrets and no private-data leaks | Planned, not run |
| VC-S1-36/TEST-S1-36 | SYS-01 | F-S1-03/05 | Benchmark local availability/details and keyboard-only walk-through — Record measurements/checklist; compare with proposed, not approved, UX/performance targets | Planned, not run |
| VC-S1-37/TEST-S1-37 | F-S1-02 | — | Two requests concurrently create overlapping future offered Slots for same Tutor — At most one overlapping offer commits; no partial side effects | Planned, not run |
| VC-S1-38/TEST-S1-38 | F-S1-04 | — | Customer duplicates Booking submission while first outcome is in flight or unknown — At most one Active Booking for a Slot; Customer overlap invariant preserved, response semantics defined later | Planned, not run |
| VC-S1-39/TEST-S1-39 | F-S1-04 | — | For 15:00 Slot, request arrives at 13:59:59 but transaction waits until `T_elig = 14:00:01` before final guarded write — Refuse too-late Booking with no partial occupancy, despite pre-cutoff arrival; use controlled server clock/transaction synchronization, not client timestamps | Planned, not run |

### Three separate real-database race obligations

| Race | Owner | AC and VC/TEST evidence | Must prove |
|---|---|---|---|
| A: same Tutor creates overlapping offered Slots | F-S1-02 | AC-S1-13; VC/TEST-S1-37 | At most one conflicting current offer commits |
| B: two Customers compete for one exclusive Slot | F-S1-04 | AC-S1-25; VC/TEST-S1-25 | At most one active claim commits, no false success |
| C: one Customer books overlapping Slots with different Tutors | F-S1-04 | AC-S1-26; VC/TEST-S1-26 | No overlapping active Bookings commit for that Customer |

Changes to future-sprint validation or policy proposals require the SRS §13 approval gates. There is no claim that any of the above tests has been run.

## Audit and approval gates

FR: 36/36 assigned; BR: 35/35 assigned; NFR: 16/16 assigned; Q: 32/32 assigned. No silent orphans. SYS-01 owns cross-cutting requirements while relevant features must still satisfy them.

S2/S3 assignments are proposals pending team approval in Issue #12. OD-001..015 remain open or conditional per SRS §13; OD-011/012 instructor Master/Theme unverified, so final sign-off is blocked. Proposed NFR-009/010 are not mandatory thresholds until approved.

Issue #10 PR into sprint1 requires @Tanaboonnnnn peer review; this document neither proves test passes nor grants stakeholder approval.
