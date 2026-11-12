# Tutoring Appointment System: whole-product software requirements specification

## 0. Document control

| Field | Value |
|---|---|
| Product | CPE334 NutTiew, Theme 1: Appointment and Scheduling (tutoring context) |
| Course | CPE334, Introduction to Software Engineering in the Age of AI Agents, semester 1/2026 |
| Repository | [Tanaboonnnnn/CPE334-NutTiew](https://github.com/Tanaboonnnnn/CPE334-NutTiew) |
| Artifact / version | `docs/srs.md`, v0.1.0, 3 November 2026 |
| Status | **DRAFT FOR PEER REVIEW; NOT INSTRUCTOR-APPROVED** |
| Requirements engineer / PR author | @Tanaboonnnnn |
| Required independent reviewer | @Chxtamos (review request and approval are separate actions) |
| Coverage | Whole-product software requirements for Sprints 1, 2 and 3 |
| Primary readers | Stakeholder/instructor, peer reviewer, requirements/design engineers, test authors and release reviewers |
| Baseline | Confirmed stakeholder decisions Q01-Q32, reviewed Sprint 1 `docs/requirements.md`, available instructor handouts |
| Instructor-source status | `group_work_specs_v1.pdf` was examined; explicitly **Draft for instructor review**, issued 6 October 2026. The final `group_work_specs.docx`, amendments and Theme 1 eligibility are **UNVERIFIED**; formal sign-off is blocked (OD-011/012). |
| Implementation and verification status | This artifact specifies planned behavior and planned validation. It does not certify code, executed tests, a deployed release or passed acceptance tests. |
| Delivery boundary | Deliverable 1 **Part A only**. Parts B-F and Labs 5-7 are separate deliverables. |

### 0.1 Reading rules and status vocabulary

- **Confirmed (Qxx):** a stakeholder decision recorded in the agreed Q01-Q32 baseline. Its product behavior is binding unless a new decision is explicitly approved.
- **Instructor-draft requirement (GW/D1):** a rule contained in the instructor-format handouts actually examined. Treat it as the available course baseline, subject to comparison with the final Master Specification.
- **Engineering interpretation:** a precise, reviewable reading of a confirmed outcome, not a new stakeholder policy (for example, transaction-safe evaluation of Q05).
- **Proposed:** a team suggestion or target that cannot be presented as approved until its owner decides.
- **Open / pending approval:** the source does not settle a policy or the necessary independent confirmation is absent.
- **Verified:** a test or source check actually performed with recorded evidence. No application verification is claimed here.

The statement `MUST` denotes a confirmed stakeholder rule or an applicable instructor-draft minimum, with its provenance in the requirement catalog. `SHOULD (PROPOSED)` is not an acceptance condition until approved. New numeric limits, schema fields, API responses, or service policies must not be disguised as existing requirements.

### 0.2 Navigation

1. [Executive overview](#1-executive-overview)
2. [Stakeholders, actors and glossary](#2-stakeholders-actors-and-glossary)
3. [Product scope and sprint boundaries](#3-product-scope-and-sprint-boundaries)
4. [System context and user journeys](#4-system-context-and-user-journeys)
5. [Functional requirements](#5-functional-requirements)
6. [Business rules](#6-business-rules)
7. [Non-functional requirements](#7-non-functional-requirements)
8. [Authorization and privacy](#8-authorization-and-privacy)
9. [Logical domain and lifecycle](#9-logical-domain-and-lifecycle)
10. [Time, conflicts and concurrency](#10-time-conflicts-and-concurrency)
11. [Exception and boundary scenarios](#11-exception-and-boundary-scenarios)
12. [Source and requirement traceability](#12-source-and-requirement-traceability)
13. [Open decisions and approval gates](#13-open-decisions-and-approval-gates)
14. [Exclusions and future compatibility](#14-exclusions-and-future-compatibility)
15. [Verification planning](#15-verification-planning)
16. [Risks, dependencies and change control](#16-risks-dependencies-and-change-control)
17. [Review checklist and sign-off](#17-review-checklist-and-sign-off)
18. [References](#18-references)

### 0.3 Document history

| Version | Date | Change | Review / approval |
|---|---|---|---|
| 0.1.0 | 2026-11-03 | Initial whole-product SRS based on Q01-Q32, the Sprint 1 baseline and identified instructor handouts | Draft; independent review and instructor Master verification outstanding |

## 1. Executive overview

### 1.1 Problem, objective and value

Learners need a dependable way to reserve one-to-one lessons with a Tutor at times the Tutor has actually offered. Tutors need control of their own availability and a trustworthy view of reservations. Without a single authoritative reservation workflow, a learner may see stale availability, two learners may claim the same lesson, or one learner may inadvertently reserve overlapping lessons with different Tutors. Cancellation, rescheduling and schedule changes add further ways for the displayed calendar to disagree with the saved records.

NutTiew will let a Tutor publish individual sixty-minute offers and let a Customer reserve an eligible offer. The complete product will support tightly governed cancellation and rescheduling, private Tutor-cancellation notifications, controlled withdrawal of unused offers and a Tutor-only appointment summary. A successful operation must leave coherent persisted records; a failed operation must not change the booking/schedule outcome by accident.

Business value is a clear reservation trail and fewer schedule conflicts, with the Tutor and Customer seeing only records their roles are permitted to access. Payment collection, lesson delivery and attendance certification are not part of the confirmed service.

### 1.2 System boundary and principal risks

The software boundary covers authenticated web interactions, server-side role/ownership and business-rule checks, and persistent storage of Slots, Bookings, history and authorized notifications. A browser's display is never authoritative for a reservation; accepted mutations are determined by the server against current committed data.

Principal risks are simultaneous conflicting writes, ambiguous scheduling policies, disclosure of another learner's booking/cancellation reason, incorrect timezone or cutoff interpretation, loss of history on rescheduling/withdrawal, and treating proposed engineering limits as stakeholder approvals. The final instructor Master and team Theme allocation are also unverified (Section 13).

### 1.3 Agreed product model

One Booking reserves **one exclusive 60-minute Slot** for **one Customer and one Tutor**. The Tutor is the Staff actor; the Customer is the learner. Slots are explicitly published one at a time. Same-Tutor currently offered Slots do not overlap, and one Customer's active reservations do not overlap across Tutors. Adjacent time intervals are permitted by the conflict rules. Appointments that have ended remain `Booked` unless legitimately cancelled; their `Past` label is a time-derived presentation, not evidence that a lesson was completed.

## 2. Stakeholders, actors and glossary

### 2.1 Roles and boundaries

| Actor / stakeholder | Goal and responsibility | Permitted product operations | Trust, visibility and restrictions |
|---|---|---|---|
| **Customer (Learner)** | Find and reserve one-to-one tutoring; maintain their own bookings | Authenticated availability, create Booking, view own Booking, cancel and reschedule their own eligible Booking, read own Tutor-cancellation notification | Cannot publish/manage Tutor Slots, view another Customer's private records, see Tutor-only summary, or cancel/reschedule another Customer's Booking |
| **Tutor (Staff)** | Offer time, serve assigned Bookings, maintain own timetable | Publish individual Slots, view own authorized schedule/Bookings, cancel assigned Booking within policy, withdraw eligible own Slot, read own Appointment Summary | No global management of another Tutor's schedule; no Customer-originated rescheduling; no arbitrary Customer private data |
| **Anonymous visitor** | Reach the entry/login experience | Access a login interface; authenticate with valid credentials | Cannot read protected identity, private availability/schedule/Booking/notification data, or mutate Slots/Bookings. Public availability is not promised by the baseline. |
| **Application / server** | Apply business policy and own data consistency | Authenticate session, authorize requests, sample server time, arbitrate conflicts, persist atomic outcomes and return role-filtered views | Client IDs, clocks, role flags and stale UI state cannot override server rules |
| **Instructor / product owner** | Confirm permitted theme, assess business baseline and approve material changes | Review the SRS, decide unresolved policy and course-source conflicts | Final Master and Theme assignment require dated evidence |
| **Team reviewer** | Independently check requirements, tests and change history | Review the Issue-linked PR and approve/request changes | Review request, review submission, approval and merge are distinct recorded states |

**Tutor = Staff** is a role equivalence in this product. It does not introduce a separate administrator role. If a Tutor also wants to book a lesson as a learner, an explicit account/role policy would be required; staff privileges alone do not grant Customer-only actions.

### 2.2 Glossary

| Term | Definition |
|---|---|
| Availability Slot / Slot | One Tutor-owned individual offer with a specified start and end exactly 60 minutes apart (Q03-Q04) |
| Currently offered Slot | A published, not-withdrawn offer; it may be unoccupied or occupied |
| Bookable Slot | Currently offered, unoccupied, valid future Slot satisfying the new-Booking cutoff and all eligibility checks at the authoritative decision time |
| Withdrawn Slot | Retained historical Slot that is no longer offered; cannot itself be reactivated (Q32) |
| Appointment | Scheduled one-to-one Customer/Tutor interval associated with a Booking and Slot; not proof of attendance |
| Booking | Persistent reservation with stable identity, owner, assigned Slot/Tutor and business state |
| Active Booking | A `Booked` reservation that has not been cancelled; passage of the session end does not automatically release it |
| Cancelled Booking | Booking transitioned to `Cancelled` by an authorized cancellation workflow; retained according to unresolved data-governance policy |
| Reschedule | Authorized atomic reassignment of an existing Booking to a different eligible Slot while preserving Booking ID and success history |
| Reschedule history | Record of a **successful** change containing old/new Tutor, Slot/time and change timestamp (Q15) |
| In-app notification | Private persisted message for a Customer whose Booking was cancelled by their Tutor (Q21-Q25) |
| Appointment Summary | Tutor-only view of the authorized Tutor's Upcoming Booked, Past Booked and Cancelled counts and underlying lists (Q31) |
| Half-open interval | `[start, end)`; includes the start, excludes the end, permitting back-to-back adjacency without overlap |
| Business timezone | `Asia/Bangkok` (UTC+07:00), uniform for scheduling and display; the server clock is authoritative |
| T_elig | Server-derived eligibility instant sampled in the final guarded transaction check after any contention wait; adopted as the precise Sprint 1 review interpretation of Q05, subject to Feature SDS approval |
| FR / BR / NFR | Functional requirement / business rule / non-functional requirement |
| AC / STS / VAL | Acceptance criterion / software test specification / **planned** validation scenario in this SRS |

## 3. Product scope and sprint boundaries

### 3.1 Confirmed whole-product capabilities

The agreed product includes Tutor-owned 60-minute slot publishing; Customer browsing and exclusive booking; persisted, role-limited Booking views; Customer cancellation with reopening; Customer-initiated one-time atomic rescheduling (including across Tutors); Tutor cancellation with mandatory reason and Slot withdrawal; private in-app notice with durable read access; controlled withdrawal/replacement of unoccupied future offers; and an authorized Tutor summary. Q01-Q32 are the behavioral baseline, not thirty-two optional enhancements.

### 3.2 Instructor minimum and technical constraints

The examined Group Work Specification v1 §§5-6 and Theme 1 example require a meaningful, tested UI → API/application → persistent-database journey, real login/logout/current identity in Sprint 1, Customer and Staff roles, backend authorization, protected Customer/Staff data, persistent Booking, past/invalid/occupied rejection and concurrent single-Slot exclusivity. The instructor materials call for versioned engineering contracts, automated tests, reviewed GitHub PRs, and later Docker/GCP/CI deployment; the Sprint 1 working software and evidence are **separate Issues** from this SRS.

### 3.3 Sprint allocation is a planning proposal

| Sprint | Proposed delivery responsibility | Requirement status |
|---|---|---|
| **Sprint 1, Deliverable 1** | Login/logout/current identity, role/ownership enforcement, manual sixty-minute Tutor Slots, own Tutor schedule, availability browsing, exclusive Booking, own Customer/Tutor reads, persistence, invalid/too-soon/overlap rejection, three concurrency invariants, Bangkok time, Booked/Past correctness | Scope aligns with reviewed `docs/requirements.md` and the available Theme 1 minimum |
| **Sprint 2, proposed** | Customer cancellation/reopening; one-time Customer reschedule across Tutors, atomic history; Tutor cancellation/reason/withdrawal; authorized unoccupied Slot withdrawal; private cancellation notifications and history | Q07-Q27 and Q32 are confirmed **product rules**; placing these in Sprint 2 is a **proposal**, not an additional stakeholder decision |
| **Sprint 3, proposed** | Tutor-only summary with three categories, counts and lists; remaining approved refinements, integration and full regression | Q31 is a confirmed product rule; timing and scope allocation require review in Issue #12 |

Part D's detailed three-sprint plan belongs to **Issue #12**. This table assigns responsibility so SRS verification is understandable without writing that separate plan. A later-sprint requirement is not a claim that its UI, API or code already exists.

### 3.4 Explicit exclusions, assumptions and unresolved policy

Payments, pricing, self-registration, email/SMS/push reminders, group sessions, lesson platform/location, external calendar synchronization, attendance verification, automatic recurring Slots, and a global administrator are **not approved product capabilities**. They are excluded from the currently agreed baseline; adding them requires a decision and change review, not implementation by inference.

Working hours, permitted days, maximum look-ahead, allowed start-minute grid, exact availability presentation, retention/deletion policy, in-progress summary classification, session/token mechanics, retry response behavior and proposed quality thresholds are **open** (Section 13). In particular, no confirmed working-hours restriction does not establish a promise of twenty-four-hour service.

## 4. System context and user journeys

For each journey below, `S1/S2/S3` is the **proposed verification sprint**, not proof of delivery. On any rejected mutation, previously committed records remain authoritative. API paths, database schema, error codes and UI field layouts belong to the separate design/contracts.

### 4.1 J-01: Tutor publishes one Slot (S1)

**Preconditions:** authenticated Tutor; proposed start is valid/future and does not intersect a currently offered Slot belonging to the same Tutor. **Flow:** Tutor selects one Bangkok start; server derives/checks a sixty-minute interval, confirms ownership and current-offer non-overlap, then persists one offer. **Alternatives/failures:** invalid, past, wrong-role or conflicting proposals are refused; simultaneous overlapping proposals must not both commit. **Postcondition:** the Tutor can retrieve the new unoccupied Slot on their own schedule. **References:** FR-005..007, BR-002..004/006/035; VAL-003..005.

### 4.2 J-02: Customer finds an eligible Slot (S1)

**Preconditions:** authenticated Customer and one or more current offers. **Flow:** server returns permitted Tutor/time details and correct eligibility as of the lookup; Customer selects an offer. **Alternatives/failures:** occupied, too-soon and past Slots cannot be presented as guaranteed bookable; no third-party Booking or cancellation reason is disclosed. Whether ineligible offers are hidden or visibly marked is an open UI decision. **Postcondition:** a possible selection, **not** a reservation. **References:** FR-008/009, BR-005/028/029; VAL-006/036.

### 4.3 J-03: Customer books an exclusive session (S1)

**Preconditions:** authenticated Customer; unoccupied currently offered Slot; no overlapping Active Booking for that Customer; at least 60 minutes before start at authoritative eligibility check. **Flow:** server revalidates all rules under transaction/concurrency control, commits one `Booked` record with trusted Customer and Slot's Tutor, then returns success. **Alternatives/failures:** stale selection, too-soon request, duplicate claim, same-Customer overlap or persistence failure produces no conflicting/partial committed claim. **Postcondition:** Slot is occupied and the Booking is retrievable by its owner and authorized Tutor. **References:** FR-010..013/016/018, BR-001/005/028/034; VAL-007..011/014/030.

### 4.4 J-04: Customer retrieves their Booking (S1)

**Preconditions:** Customer owns a committed Booking. **Flow:** Customer requests own list/detail; server authenticates and filters by ownership, returning saved Tutor/Slot/interval and correct business state. **Alternatives/failures:** a known foreign Booking ID yields no private payload; expired session cannot recover protected content. **Postcondition:** no state change; elapsed appointment may display `Past` while retaining `Booked`. **References:** FR-014/016/017, BR-002/030; VAL-012/013.

### 4.5 J-05: Tutor inspects their schedule and Bookings (S1)

**Preconditions:** authenticated Tutor. **Flow:** server retrieves only Slots and associated Bookings on the Tutor's authorized schedule. **Alternatives/failures:** another Tutor's ID or manipulated filters cannot expand access; no global Customer data retrieval. **Postcondition:** read-only, persisted schedule/Booking view. **References:** FR-007/015, BR-002/033; VAL-002/012.

### 4.6 J-06: Customer cancels own Booking (S2)

**Preconditions:** authenticated owning Customer; active Booking starts at least 30 minutes from authoritative request decision. **Flow:** cancel the Booking as `Cancelled` and reopen its original Slot as one consistent persisted change. **Alternatives/failures:** nonowner, already cancelled or less-than-30-minute attempt is rejected with unchanged records. **Postcondition:** the reopened offer may still be **unbookable** under the independent 60-minute new-Booking rule. **References:** FR-020/021, BR-007/008; VAL-015/016.

### 4.7 J-07: Customer reschedules once (S2)

**Preconditions:** owning Customer; current `Booked` appointment and desired unoccupied Slot; original and destination each start at least 60 minutes after the authoritative decision; no earlier successful reschedule. **Flow:** atomically move the same Booking ID to the destination (possibly a different Tutor), reopen the old Slot, record old/new Tutor/Slot/interval and change time, and increment successful-reschedule count once. **Alternatives/failures:** late original/destination, occupied destination, unauthorized owner, quota exhausted, conflict or persistence failure leaves original Booking, old Slot, destination and history unchanged; failed attempt does **not** consume allowance. **Postcondition:** one live reservation with retained identity and audit history. **References:** FR-022..027, BR-009..016; VAL-017..020.

### 4.8 J-08: Tutor cancels their assigned Booking (S2)

**Preconditions:** authenticated currently assigned Tutor, active Booking at least 60 minutes away, meaningful nonblank reason. **Flow:** server atomically cancels the Booking, withdraws its Slot instead of reopening it, preserves the reason for the owning Customer and creates their private in-app notification. **Alternatives/failures:** wrong Tutor, too-late request, blank/meaningless reason or failed persistence gives no partial cancellation/withdrawal/notification. **Postcondition:** Booking is `Cancelled`, original Slot withdrawn and the Customer informed through the application. **References:** FR-028..031, BR-017..023/026; VAL-021..023.

### 4.9 J-09: Customer reads and rereads a private notice (S2)

**Preconditions:** successful Tutor cancellation created a notice addressed to Customer. **Flow:** Customer reads notice and reason, marks it read if supported, and later opens it again; cancelled Booking detail also shows the authorized reason. **Alternatives/failures:** different Customer, Tutor without applicable authorization or anonymous request gets no notice/reason. **Postcondition:** read state must not erase the message, and no timer automatically expires it. A separate retention/deletion policy remains open. **References:** FR-031/032, BR-021..025; VAL-023/024.

### 4.10 J-10: Tutor withdraws an unoccupied future Slot (S2)

**Preconditions:** authenticated owning Tutor; unoccupied future currently offered Slot. **Flow:** Tutor withdraws that Slot, preserves it as history, then may independently create a **new Slot ID** at a permitted time, even if it overlaps the withdrawn interval. **Alternatives/failures:** direct edit/delete/withdraw while an Active Booking exists is forbidden; withdrawn Slot cannot be reactivated under the same identity. **Postcondition:** old Slot remains historical and no longer blocks current-offer overlap checks. **References:** FR-033/034, BR-026/027/032; VAL-025..027.

### 4.11 J-11: Tutor views Appointment Summary (S3)

**Preconditions:** authenticated Tutor with authorized scheduling records. **Flow:** server provides counts and corresponding lists for Upcoming Booked, Past Booked and Cancelled, restricted to that Tutor's authorized scope; summary rows may lead to permitted details. **Alternatives/failures:** Customer/anonymous/foreign Tutor access is denied; an appointment in progress has no approved bucket until OD-006 is resolved. **Postcondition:** report read changes no Booking business state and does not imply attendance. **References:** FR-035/036, BR-030/031; VAL-028/029.

## 5. Functional requirements

Every `FR-xxx` is a stable **whole-product** identifier. `FR-S1-01..19` remain unchanged in the reviewed Sprint 1 source; the explicit crosswalk is in §12.4. `M` means Must for the stated **product baseline**, not an assertion that a later-sprint feature is due in Sprint 1. Sprint allocation is proposed in §3.3. Each `VAL-xxx` identifies a **planned** way to inspect the requirement, never a passed test. Every mutating FR implicitly requires the backend identity, ownership, timing and transaction rules in §§6, 8 and 10.

### 5.1 Identity and access

| ID | Actor and testable requirement, including safe failure | Source | Priority / sprint | Planned proof; dependency |
|---|---|---|---|---|
| **FR-001** | **Customer/Tutor:** With existing valid credentials, authenticate and establish only that principal's effective role; reject invalid credentials without authenticated access. | GW §5.2; Sprint 1 baseline | M / S1 | VAL-001; identity contract |
| **FR-002** | **Authenticated Customer/Tutor:** Return the current principal's own identity and role without accepting a client-supplied impersonation; anonymous requests reveal no protected identity. | GW §5.2 | M / S1 | VAL-001/002; FR-001 |
| **FR-003** | **Authenticated Customer/Tutor:** Log out and render the prior session/access unusable for protected operations; the exact invalidation/expiry method must be decided in the auth contract. | GW §5.2 | M / S1 | VAL-001/002; OD-005 |
| **FR-004** | **Application/server:** Authenticate and enforce role and record ownership on every protected Slot, Booking, notification and summary action, including crafted requests and URL/ID access; reject unauthorized access without private payload. | GW §5.2/Theme 1; Q02 | M / S1, extended S2/S3 | VAL-002/036; FR-001/002 |

### 5.2 Tutor availability, discovery and new Booking

| ID | Actor and testable requirement, including safe failure | Source | Priority / sprint | Planned proof; dependency |
|---|---|---|---|---|
| **FR-005** | **Tutor:** Given authorization to their own schedule and a valid future start, publish exactly one explicit sixty-minute Slot; persist it under the authenticated Tutor, without recurrence or auto-generated bulk offers. | Q02-Q04; Theme 1 | M / S1 | VAL-003; FR-004, OD-001..003 |
| **FR-006** | **Server on Tutor creation:** Reject malformed/past Slots and overlaps between currently offered Slots of the same Tutor; permit adjacent intervals and independent same-time offers by another Tutor when otherwise valid; leave existing offers unchanged on rejection. | Q03/Q06/Q29; Theme 1 | M / S1 | VAL-004/005; FR-005 |
| **FR-007** | **Tutor:** Retrieve own offered Slots and authorized occupied/unoccupied schedule view from committed data; reject another Tutor's protected schedule lookup. | Q02; Theme 1 | M / S1 | VAL-002/012; FR-004/005 |
| **FR-008** | **Customer:** Browse Tutor/Slot/time information sufficient to choose a specific offer, without disclosure of another Customer's private reservation; the concrete field allowlist remains an API-contract choice. | Q01/Q02; Theme 1 | M / S1 | VAL-006/036; FR-004/005 |
| **FR-009** | **Server/availability view:** Mark an offer bookable only when current, unoccupied, eligible and not too close to its start; an earlier view must not guarantee later acceptance. Hide-versus-disabled presentation is unresolved. | Q05/Q06; Theme 1 | M / S1 | VAL-006/009; OD-004 |
| **FR-010** | **Customer:** Given an eligible Slot and no overlapping Active Booking, request one exclusive reservation for their authenticated identity; commit one `Booked` Booking referencing the actual Slot and Tutor before acknowledging success. | Q01/Q05; Theme 1 | M / S1 | VAL-007; FR-001/004/005 |
| **FR-011** | **Server on Booking:** Revalidate offered/unoccupied state, user ownership, cutoff and overlaps immediately before a guarded Booking write; reject stale, invalid, past, too-soon or occupied choices with no partial reservation. | Q05/Q06/Q28; Theme 1; engineering interpretation of T_elig | M / S1 | VAL-008/009/014; FR-010 |
| **FR-012** | **Server on competing Bookings:** Under simultaneous attempts by different Customers for the same exclusive Slot, allow at most one committed Active Booking and never return two successful claims. | Q01; Theme 1 | M / S1 | VAL-010; FR-010/011 |
| **FR-013** | **Server on Customer Booking:** Reject the same Customer's overlapping Active reservation, including requests for two different Tutors; accept adjacency under this specific rule, with at most one conflicting success under concurrency. | Q28 | M / S1 | VAL-004/011; FR-010/011 |
| **FR-014** | **Customer:** Retrieve a persisted list and detail of **own** Bookings with Booking identity, Tutor/Slot/interval and business status; foreign IDs must not disclose Booking data. | Q02/Q30; Theme 1 | M / S1 | VAL-012/036; FR-004/010 |
| **FR-015** | **Tutor:** Retrieve Bookings attached to the Tutor's authorized schedule only; requesting another Tutor's records must not disclose them. | Q02; Theme 1 | M / S1 | VAL-002/012; FR-004/010 |
| **FR-016** | **Application:** Authorized reopened/refresh/restart views must reflect successfully committed Slots/Bookings and correct ownership; a failed transaction must not produce a persisted or reported phantom Booking. | GW §5.1; Theme 1 | M / S1 | VAL-007/014; FR-005/010 |
| **FR-017** | **Application views:** Display `Booked` accurately and, when a Booking's end is past, optionally derive `Past`; never assert `Completed`, attendance or auto-release solely from elapsed time. | Q30 | M / S1 | VAL-013; FR-014/015 |
| **FR-018** | **Application/server:** Return an observable, non-success rejection for forbidden, invalid, stale, conflicting or failed mutations, without leaking protected records or leaving partial state. Specific HTTP status/payload formats remain contract decisions. | Q02/Q05/Q06/Q28; Theme 1 | M / S1, extended S2 | VAL-002/014/030; OD-005/013 |
| **FR-019** | **System:** Support the Tutor offer → Customer browse → committed Booking → authorized retrieval journey through a real UI, application/API and durable database, surviving refresh and application restart. | GW §5.1; D1 §2 | M / S1 | VAL-007/031; engineering contracts outside Issue #9 |

### 5.3 Customer cancellation and rescheduling

| ID | Actor and testable requirement, including safe failure | Source | Priority / sprint | Planned proof; dependency |
|---|---|---|---|---|
| **FR-020** | **Owning Customer:** Cancel their current Booking when the Appointment starts **at least 30 minutes** after the server's authoritative decision; at the exact boundary allow, below it deny; foreign or nonactive Booking cannot be cancelled. | Q07 | M / proposed S2 | VAL-015; FR-004/014 |
| **FR-021** | **Server on successful Customer cancellation:** Change Booking to `Cancelled` and reopen its **same** original Slot atomically; keep it unbookable for any later new request failing the independent Q05 cutoff. | Q08/Q05 | M / proposed S2 | VAL-015/016; FR-020 |
| **FR-022** | **Owning Customer:** Initiate rescheduling of an existing `Booked` Booking; reject nonowners and disallowed Booking state. | Q09 | M / proposed S2 | VAL-017; FR-004/014 |
| **FR-023** | **Server on reschedule:** Require both original Appointment start **and destination Slot start** to be at least 60 minutes away at authoritative decision; reject either too-late side including the just-below-boundary case. | Q10/Q11 | M / proposed S2 | VAL-018; FR-022 |
| **FR-024** | **Owning Customer:** Select a valid destination with a different Tutor if desired; do not restrict rescheduling to the original Tutor, while still enforcing destination occupancy and same-Customer overlap. | Q12/Q28 | M / proposed S2 | VAL-019; FR-023 |
| **FR-025** | **Server on reschedule:** Atomically update Booking assignment, occupy destination, release/reopen original Slot and record history; any validation, conflict or persistence failure leaves all related records at their pre-attempt state. | Q13/Q14 | M / proposed S2 | VAL-020; FR-022..024 |
| **FR-026** | **Server:** Preserve the Booking ID across a successful reschedule and append a successful-change record with former/new Tutor, Slot/interval and timestamp; rejected attempts do not create successful history. | Q15 | M / proposed S2 | VAL-020; FR-025 |
| **FR-027** | **Server:** Permit **at most one successful** reschedule per Booking; a failed attempt leaves the allowance available, while a second successful-change request is rejected. | Q16 | M / proposed S2 | VAL-017/020; FR-025/026 |

### 5.4 Tutor cancellation, Slot withdrawal and notice

| ID | Actor and testable requirement, including safe failure | Source | Priority / sprint | Planned proof; dependency |
|---|---|---|---|---|
| **FR-028** | **Currently assigned Tutor:** Cancel an Active Booking belonging to the Tutor's authorized schedule only when its start is at least 60 minutes away; exact boundary passes and wrong-Tutor/too-late attempts fail. | Q17/Q18 | M / proposed S2 | VAL-021; FR-004/015 |
| **FR-029** | **Tutor/server:** Require a meaningful nonblank reason before accepting Tutor cancellation; reject absent, whitespace-only or semantically empty reason without changing Booking or Slot. Length/format details need approved design. | Q20 | M / proposed S2 | VAL-021; FR-028, OD-014 |
| **FR-030** | **Server on successful Tutor cancellation:** Mark Booking `Cancelled` and **withdraw** its original Slot instead of reopening it; preserve trace/history and ensure no partial outcome. | Q19 | M / proposed S2 | VAL-022; FR-028/029 |
| **FR-031** | **Server:** On successful Tutor cancellation create one private in-app notice for that Booking's owning Customer, including the authorized reason; the reason also appears in that Customer's cancelled Booking details, never in third-party views. | Q21-Q23 | M / proposed S2 | VAL-023/036; FR-028..030 |
| **FR-032** | **Owning Customer:** Retrieve and reread Tutor-cancellation notices after marking them read; absence of automatic time-based expiry must hold, while deletion/retention governance remains undecided. | Q24/Q25 | M / proposed S2 | VAL-024; FR-031, OD-008 |
| **FR-033** | **Server/Tutor:** Forbid direct edit, deletion or withdrawal of a Slot while it carries an Active Booking; require the separate authorized cancellation workflow first. | Q26 | M / proposed S2 | VAL-025; FR-004/028 |
| **FR-034** | **Owning Tutor:** Withdraw an **unoccupied future** currently offered Slot while retaining its history; permit later creation of a distinct new Slot with a new ID that may overlap the withdrawn interval; reject reopening/reactivating the withdrawn historical Slot. | Q27/Q32 | M / proposed S2 | VAL-026/027; FR-005/033 |

### 5.5 Tutor-only reporting

| ID | Actor and testable requirement, including safe failure | Source | Priority / sprint | Planned proof; dependency |
|---|---|---|---|---|
| **FR-035** | **Tutor:** Retrieve an Appointment Summary with **counts and corresponding lists** for Upcoming Booked, Past Booked and Cancelled on the Tutor's authorized schedule, calculated from stored Booking state and server time; in-progress classification remains OD-006. | Q31/Q30 | M / proposed S3 | VAL-028/029; FR-015/017/028 |
| **FR-036** | **Server:** Deny Customers, anonymous callers and unrelated Tutors access to the Tutor-only summary and its linked Booking details; counts/lists must share the same visibility and classification criteria. | Q31/Q02 | M / proposed S3 | VAL-029/036; FR-004/035 |

## 6. Business rules

Each rule below is a normative **business outcome** sourced to a Q decision or an explicitly identified instructor minimum. The `VAL` column gives a planned check. Rule numbers follow **Q01-Q32** deliberately, making omitted stakeholder decisions detectable; BR-033..035 capture additional instructor/security and integrity constraints. These IDs are **new product IDs**, not replacements for the existing `BR-S1-*` IDs.

| ID | Normative rule and boundary | Authority | Verification sprint / anchor |
|---|---|---|---|
| **BR-001** | One Slot reserves one exclusive **one-to-one** Customer/Tutor session; at most one Active Booking may claim it. | Q01 | S1 / VAL-007/010 |
| **BR-002** | Tutor = Staff and may manage or inspect **their own** authorized schedule; Customer = learner and may inspect only own private Booking data. | Q02 | S1 / VAL-002/012 |
| **BR-003** | Every Availability Slot has a duration of **exactly 60 minutes**. | Q03 | S1 / VAL-003/004 |
| **BR-004** | Tutor creates **individual explicit** Slots; no automatic recurrence or bulk Slot generation is authorized. | Q04 | S1 / VAL-003 |
| **BR-005** | For a new Booking, `SlotStart - authoritative server eligibility time >= 60 minutes`; equality is eligible, even if later commit succeeds after the check. A 59:59 remaining interval fails. | Q05; reviewed T_elig interpretation | S1 / VAL-008/009 |
| **BR-006** | Two **currently offered** Slots of the **same Tutor** cannot overlap. Adjacent half-open intervals are permitted; different Tutors may independently offer the same time. | Q06 | S1 / VAL-004/005 |
| **BR-007** | Only the owning Customer may cancel an Active Booking at least **30 minutes** before Appointment start, including equality. | Q07 | proposed S2 / VAL-015 |
| **BR-008** | Successful Customer cancellation reopens the **original** Slot, but a future new Booking still independently requires BR-005. | Q08 | proposed S2 / VAL-016 |
| **BR-009** | Only the Booking-owning Customer may initiate its reschedule. | Q09 | proposed S2 / VAL-017 |
| **BR-010** | Reschedule's **original** Appointment must start at least 60 minutes after the authoritative decision; equality passes. | Q10 | proposed S2 / VAL-018 |
| **BR-011** | Reschedule's **destination** Slot must start at least 60 minutes after the authoritative decision; equality passes. | Q11 | proposed S2 / VAL-018 |
| **BR-012** | A valid Customer reschedule may move to another Tutor; original-Tutor-only restrictions are forbidden. | Q12 | proposed S2 / VAL-019 |
| **BR-013** | Reschedule is **all-or-nothing** across assignment, both Slot states and successful history. Failure leaves the previous Booking intact. | Q13 | proposed S2 / VAL-020 |
| **BR-014** | Successful reschedule reopens the original Slot, subject to independent new-Booking eligibility. | Q14 | proposed S2 / VAL-020/016 |
| **BR-015** | Successful reschedule keeps the **same Booking ID** and records old/new Tutor, Slot/time and change timestamp. | Q15 | proposed S2 / VAL-020 |
| **BR-016** | At most **one successful** reschedule per Booking; failures do **not** use that allowance. | Q16 | proposed S2 / VAL-017/020 |
| **BR-017** | Only the **currently authorized Tutor assigned to the Booking** may cancel it as Tutor. | Q17 | proposed S2 / VAL-021 |
| **BR-018** | Tutor cancellation requires Appointment start at least **60 minutes** after the authoritative decision, equality included. | Q18 | proposed S2 / VAL-021 |
| **BR-019** | Successful Tutor cancellation **withdraws** the original Slot; it must not reopen it. | Q19 | proposed S2 / VAL-022 |
| **BR-020** | Tutor cancellation requires a **meaningful nonblank reason**; an empty/whitespace-only input is invalid. Further textual-validation details require approval. | Q20 | proposed S2 / VAL-021 |
| **BR-021** | Each successful Tutor cancellation creates an in-app notice for the **affected owning Customer only**. | Q21 | proposed S2 / VAL-023 |
| **BR-022** | Tutor-cancellation reason is visible only to the **owning Customer**, not to other Customers or unrelated Tutors in accessible results. | Q22 | proposed S2 / VAL-023/036 |
| **BR-023** | That Customer sees the cancellation reason in both the **in-app notice** and **cancelled Booking detail**. | Q23 | proposed S2 / VAL-023 |
| **BR-024** | Reading a notification does not make it inaccessible; it remains available to reread. | Q24 | proposed S2 / VAL-024 |
| **BR-025** | Notifications do **not** expire automatically with elapsed time. This does not settle user/admin deletion, retention or privacy governance. | Q25 | proposed S2 / VAL-024 |
| **BR-026** | Tutor cannot directly edit, delete or withdraw a Slot with an **Active Booking**; the authorized Booking cancellation must occur first. | Q26 | proposed S2 / VAL-025 |
| **BR-027** | Tutor may withdraw an **own, unoccupied future Slot** and create a **separate new** Slot while preserving withdrawal history. | Q27 | proposed S2 / VAL-026 |
| **BR-028** | One Customer cannot have overlapping **Active Bookings** across any Tutors; **adjacent** appointments do not overlap. | Q28 | S1 / VAL-004/011 |
| **BR-029** | `Asia/Bangkok` (UTC+07:00) is the business timezone; authoritative time comes from the server, not a browser or user-supplied timestamp. | Q29 | S1 / VAL-008/013 |
| **BR-030** | Booking business states are `Booked` and `Cancelled`; `Past` is **derived from time**, not a third state or evidence of `Completed`/attendance. | Q30 | S1 (Booked/Past), S2 (Cancelled) / VAL-013/015 |
| **BR-031** | Only authorized Tutor gets Appointment Summary **counts and lists** for Upcoming Booked, Past Booked and Cancelled. Customer gets no Tutor-only summary. | Q31 | proposed S3 / VAL-028/029 |
| **BR-032** | Historical **withdrawn** Slots do not block a new separate overlapping offer; they are **not reactivated under the same historical Slot ID**. | Q32 | proposed S2 / VAL-027 |
| **BR-033** | Protected actions require server-enforced authenticated role/ownership checks; anonymous, foreign-record and cross-role operations cannot gain private data or mutation rights. | GW §5.2; Theme 1 | S1 and extensions / VAL-001/002/036 |
| **BR-034** | Accepted Booking/Slot mutations commit an internally consistent outcome; rejected validations, contention and persistence failures cannot leave partially claimed Slots, duplicate active reservations or false success. The precise locking/constraint scheme is not selected here. | GW §5.1/Theme 1; Q01/Q06/Q28 outcome | S1 and extensions / VAL-005/010/011/014/020 |
| **BR-035** | Invalid or nonfuture Slot proposals and attempts to book past, occupied or ineligible offers are rejected without changing committed records; rules beyond confirmed time policies cannot be fabricated. | GW Theme 1; Q03/Q05/Q29 | S1 / VAL-004/006/014 |

**Interval rule:** `[startA, endA)` overlaps `[startB, endB)` exactly when `startA < endB && startB < endA`. If A ends at 14:00 and B begins at 14:00, then `startB < endA` is false. Consequently, the appointment intervals are adjacent rather than conflicting. This comparison governs BR-006 and BR-028; other validity and cutoff rules still apply.

**Rule interactions that need separate checks:** A Slot reopened 30 minutes before a session by Customer cancellation is offered again under BR-008, yet BR-005 prevents a new Booking inside its 60-minute cutoff. Tutor cancellation takes the opposite path: BR-019 withdraws the Slot and BR-032 allows a later **separate** overlapping offer. A successful reschedule releases only its original Slot, claims the destination and preserves its Booking identity in **one** transaction; a failed reschedule consumes neither the destination nor the one-success allowance.

## 7. Non-functional requirements

The following targets separate **required outcomes** from **proposed quantification**. Where a metric is unapproved, the measurement describes a candidate acceptance gate, not a claim that the system already meets it. A quality attribute without an invented availability or performance promise can still have a concrete correctness inspection.

| ID | Attribute and requirement / measured target | Source and approval status | Planned check; sprint / approval owner |
|---|---|---|---|
| **NFR-001** | **Authorization:** every enumerated anonymous, forbidden-role, foreign-Customer and foreign-Tutor protected API path must reject or filter without private payload disclosure. Measure zero unauthorized record disclosure in seeded negative cases. | **Required outcome**, GW §5.2/Q02 | VAL-002/036; S1-S3; backend/peer review |
| **NFR-002** | **Credential security:** with locally managed passwords, store adaptive salted hashes, not plaintext; tracked repository content contains no real credentials. Verify using test DB inspection and secret/config review. | **Required**, GW §5.2 | VAL-034; S1; auth contract |
| **NFR-003** | **Durability:** an accepted Slot/Booking and its authorized view must persist after browser refresh and application-process restart against the same data store; no in-memory-only persistence. | **Required**, GW §5.1/D1 §2 | VAL-007/031; S1, regression S2/S3 |
| **NFR-004** | **Concurrent conflict integrity:** all three real-DB races must preserve BR-001/006/028, regardless of interleaving; a 20-attempt same-Slot stress burst and a 10-attempt same-Customer burst are **proposed test sizes**, not approved business capacity limits. | Outcome **required**; run sizes **PROPOSED**, baseline NFR-S1-04/05 | VAL-005/010/011; S1; size via OD-010 |
| **NFR-005** | **Atomic consistency:** accepted cancellation/reschedule/Booking/withdrawal changes all required records together; deliberate persistence failures leave the prior committed state and no false confirmation. | **Required outcome**, Q13/Q19 and Theme 1 integrity | VAL-014/020/022; S1/S2 |
| **NFR-006** | **Time correctness:** cutoff checks use server-authoritative instants; accept exact 60:00 or 30:00 boundaries as applicable, reject just-below; Bangkok calendar/hour remains stable for a non-Bangkok browser. | **Required**, Q05/Q07/Q10/Q11/Q18/Q29 | VAL-008/009/013/015/018/021; S1/S2 |
| **NFR-007** | **Data minimization:** protected Booking, reason, notification and report responses do not expose third-party identity, cancellation reason, credentials or arbitrary private schedule fields. Review response bodies and negative payloads, not UI controls only. | **Required**, Q02/Q21-Q23/Q31, GW §5.2 | VAL-023/029/036; S1-S3 |
| **NFR-008** | **Retry safety:** repeated/uncertain-response requests cannot violate exclusivity, successful reschedule quota or atomic history. Whether retries return the original success response and any token format/retention are open. | Invariant **required**; protocol **OPEN** | VAL-030/020; S1/S2; OD-013 |
| **NFR-009** | **Keyboard usability (PROPOSED):** complete login, availability, Booking and own-detail flows by keyboard with visible focus on primary controls; record manual checklist, browser and failures. | **PROPOSED**, baseline NFR-S1-09, not stakeholder-approved | VAL-033; candidate S1/S3; OD-010, @Tanaboonnnnn/@Chxtamos |
| **NFR-010** | **Local response time (PROPOSED):** p95 availability and own-Booking-detail requests at or below **2.0 s**, each measured over at least **50** warm-up-excluded requests with documented hardware, fixture size and database. | **PROPOSED**, baseline NFR-S1-10, not instructor-approved | VAL-032; candidate S1/S3; OD-010, team review |
| **NFR-011** | **Change traceability:** each implemented requirement must identify source Q/GW/D1, accountable feature/Issue, reviewed contract, planned verification and release evidence; changes to Q rules need recorded stakeholder approval. | **Required process**, D1 Parts A-E / AGENTS.md | VAL-031, document/PR inspection; S1-S3 |
| **NFR-012** | **Reproducibility:** engineering evidence must identify code version, environment/setup, DB/seed preparation, test commands and real pass/fail/skip results; mere presence of tests is not a pass. | **Required process**, GW §5.3, D1 | VAL-031; S1-S3 |
| **NFR-013** | **Deployment readiness:** the selected architecture must support container packaging and durable GCP deployment, with build/tests on relevant PRs and repeatable accepted release from `main` after Lab 5. No cloud success is asserted at D1. | **Required later**, GW §§5.1/5.3; Lab 5 | VAL-035; Lab 5 and later; separate Issues |
| **NFR-014** | **Notice durability:** a Tutor-cancellation notice remains retrievable after being read and is not removed solely by age; additional retention/deletion rights await owner decision. | **Required**, Q24/Q25 | VAL-024; proposed S2, OD-008 |
| **NFR-015** | **Safe diagnostics:** response errors expose no credentials, session tokens, protected reason or internal stack traces; operational logs must avoid secrets and preserve enough non-sensitive context to investigate failed mutations. Exact logging fields/retention are engineering decisions. | Security outcome **required** by GW §5.2; logging structure **PROPOSED** | VAL-034/036; S1-S3; OD-005/008 |
| **NFR-016** | **Reporting correctness:** for every defined Tutor Summary category, count must equal its corresponding accessible row set under the same time/state predicates; no completion is inferred from elapsed time. Treatment of in-progress sessions remains open. | **Required**, Q30/Q31 | VAL-028/029; proposed S3, OD-006/009 |

**Approval rule:** Do not copy `NFR-009` or `NFR-010` into a feature's final acceptance contract as a mandatory threshold until the product decision owner and peer reviewer approve it, including environment and workload. No uptime SLA, password complexity number, request-rate limit, backup frequency, pagination size or retention period has been approved by Q01-Q32.

## 8. Authorization and privacy

Server authorization is authoritative. The role in an authenticated principal, the actual Booking owner and the Tutor assigned to the relevant Slot/Booking determine access. URL parameters, browser state, hidden buttons or a submitted `customerId`/`tutorId` are not an authorization grant.

Legend: **Own** means only records owned/assigned under the stated condition; **Deny** means protected access is forbidden; **N/A** means no product-level action is assigned to that role. Login at the anonymous boundary requires valid credentials, not a public session. S2/S3 actions are **planned**, not present in Sprint 1.

| Operation / protected view | Anonymous | Customer | Tutor (Staff) | Planned sprint |
|---|---|---|---|---|
| Open login / submit valid credentials | Login only | Login | Login | S1 |
| View current authenticated identity | Deny | Own | Own | S1 |
| Logout current session | N/A | Own | Own | S1 |
| Create explicit Slot | Deny | Deny | **Own schedule** | S1 |
| Inspect offered/occupied Tutor schedule | Deny | Deny | **Own schedule** | S1 |
| Discover customer-facing availability | No public policy approved | Authenticated offers, privacy-filtered | N/A as Customer workflow | S1 |
| Create new Booking | Deny | **Own identity**, eligible Slot | Deny under Tutor authority | S1 |
| Retrieve Customer Booking list/detail | Deny | **Owned Bookings only** | No global Customer query | S1 |
| Retrieve Tutor Booking schedule | Deny | Deny | **Currently authorized Tutor schedule only** | S1 |
| Cancel a Customer Booking | Deny | **Owning Customer**, Q07 cutoff | Deny via Customer route | S2 |
| Reschedule Booking | Deny | **Owning Customer**, quota and both cutoffs | Deny | S2 |
| Cancel a Booking as Tutor | Deny | Deny | **Currently assigned Tutor**, cutoff + reason | S2 |
| Direct edit/delete/withdraw occupied Slot | Deny | Deny | **Deny while Active Booking exists** | S2 |
| Withdraw unoccupied future offered Slot | Deny | Deny | **Own Slot** | S2 |
| Read Tutor-cancellation notification | Deny | **Notice addressee only** | Deny | S2 |
| Read Tutor-cancellation reason in notice/detail | Deny | **Owning Customer only** | No read authority inferred from Tutor role | S2 |
| View Appointment Summary counts/lists | Deny | Deny | **Own authorized Tutor summary only** | S3 |
| Read another Customer's or another Tutor's restricted records | Deny | Deny | Deny | All |

### 8.1 Protected response and mutation boundaries

- **Customer availability:** sufficient non-sensitive Tutor label/identifier and Slot start/end to make a selection; do not include another Customer's Booking, contact information, cancellation reason or restricted schedule data. Exact field names, availability visibility and sorting are pending OD-004.
- **Customer's own Booking:** stable Booking ID, relevant Tutor and current appointment interval, business status, plus authorized history and reason only when applicable. Do not expose another learner's Booking through direct IDs, searches, pagination or error responses.
- **Tutor's schedule:** current Tutor's permitted Slot/Booking facts. The precise Customer identity representation shown to a Tutor is an unapproved minimum-field decision; it must be justified and bounded in the API/UI contracts. Reschedule-history visibility for prior Tutors, if any, is unresolved and cannot create global access.
- **Cancellation notice:** only the targeted Customer sees its contents; the reason is present in that Customer's cancelled Booking detail. Read state is separate from deletion or automatic expiry. No consent is implied to broadcast reasons to other Tutors or Customers.
- **Write authorization:** Booking owner comes from the authenticated Customer, Tutor ownership from the actual Slot and currently assigned Booking, and cancellation/reschedule eligibility from server state. Any failed authentication or ownership check must precede protected detail disclosure.
- **Error safety:** choose precise 401/403/404 behavior, conflict codes and error fields in separate feature API contracts; whatever the choice, rejected access must disclose no protected information. Never use a success response for an uncommitted write.

## 9. Logical domain and lifecycle

The following is a **logical requirements model**, not a relational schema, migration design or API DTO. Detailed entity fields, keys, constraints, indexing, locking and storage implementation are assigned to Issue #11 and subsequent Feature SDS.

| Concept | Required logical information and relationships | Invariants / lifecycle |
|---|---|---|
| Authenticated user | Stable identity, effective role Customer or Tutor; session lifecycle | Identity is server-trusted; a principal cannot gain another role through submitted IDs |
| Tutor schedule | Association of one Tutor with their own Slots and associated authorized Bookings | Cross-Tutor reads/writes restricted; current offer list differs from withdrawal history |
| Availability Slot | Stable Slot identity, Tutor owner, scheduled start/end, currently offered or withdrawn historical meaning, occupancy relationship | Exactly 60 minutes; one Tutor per Slot; currently offered same-Tutor Slots cannot overlap; withdrawn ID not reactivated |
| Booking | Stable Booking identity, owning Customer, **current** Slot/Tutor assignment, scheduled interval and `Booked` or `Cancelled` status | At most one Active Booking per Slot; one Customer cannot hold overlapping Active Bookings; identity survives reschedule |
| Successful reschedule history | One record per successful change, including Booking ID, old/new Tutor and Slot/interval, server change timestamp | At most one successful entry per Booking under Q16; a rejected attempt does not produce a successful entry |
| Cancellation reason | Meaningful nonblank reason supplied on Tutor cancellation and associated with its Booking | Owning Customer sees it in notice and cancelled Booking detail; unauthorized callers never see it |
| In-app notification | Owner Customer, related Tutor-cancelled Booking, private message/reason and read-state meaning | Remains accessible when read; no automatic age expiry; deletion/retention rules open |
| Historical withdrawn Slot | Former Slot identity, Tutor, original interval and withdrawn status/history | Not a current offer; does not block new separate overlapping offers; never reactivated under same Slot ID |
| Tutor Appointment Summary | Authorized Tutor scope and derived categories: Upcoming Booked, Past Booked, Cancelled | Counts equal corresponding lists; no global Customer view; in-progress category pending |

### 9.1 Booking state and Slot lifecycle

The only agreed **Booking business states** are `Booked` and `Cancelled` (Q30).

1. **New Booking success:** eligible Slot becomes occupied and a Booking is created in `Booked`. Failure creates no Booking or occupied change.
2. **Customer cancellation:** `Booked → Cancelled` for an authorized owner at the 30-minute cutoff; original Slot becomes a currently offered unoccupied Slot (Q07-Q08).
3. **Customer reschedule:** Booking **remains `Booked`** and retains its ID; the assignment moves atomically to the destination; original Slot reopens and successful history is appended (Q09-Q16).
4. **Tutor cancellation:** `Booked → Cancelled` for the currently assigned authorized Tutor at the 60-minute cutoff, requiring reason; original Slot is **withdrawn**, and the private notification is created (Q17-Q25).
5. **Tutor withdrawal without Booking:** offered unoccupied future Slot becomes historical withdrawn; a **new Slot**, with a distinct ID, may subsequently be offered (Q26-Q27/Q32).
6. **Elapsed time:** past the appointment **end**, the display may derive `Past`; `Booked` remains `Booked`. There is no `Completed`, `Attended`, `No-show`, auto-cancel or implied auto-release transition.

An active Booking is one still in `Booked`, **even if the lesson's end is past**. This protects historical consistency and prevents inappropriate automatic release. State transition details at time boundaries and unsupported repeated cancellation attempts require explicit negative validation. Which cancellation actor performed a `Cancelled` transition and the historical detail available to each role must be represented without assuming an additional business state.

### 9.2 Cardinality and conservation obligations

- One Slot has one owning Tutor and is attached to **at most one Active Booking** at a given time; one Customer may have multiple Bookings only when none of the Active intervals overlap.
- A successful reschedule conserves **one Booking ID** while moving its *current* appointment link. Old/new links remain in history rather than becoming two live Bookings.
- Customer cancellation preserves the Slot as a potentially available offer. Tutor cancellation preserves the Slot **as withdrawn history**. These outcomes are intentionally different.
- Failed cancellation, reschedule, creation or Booking cannot leave part of the change committed, including premature notification creation, wrong successful-reschedule count or incorrect occupancy.
- Reports are projections of the authoritative logical entities; a report count cannot independently redefine Booking state, ownership or elapsed-time semantics.

## 10. Time, conflicts and concurrency

### 10.1 One timezone and explicit inequalities

All user-visible appointment times use `Asia/Bangkok` (UTC+07:00). The server controls the clock used for acceptance checks. Persisted instants and transport representation are engineering choices, but must preserve this business meaning independent of the client's timezone, locale and clock skew.

Let `S` be the relevant appointment or Slot start instant and `T` the authoritative server instant at the applicable guarded decision point. Equality at each confirmed cutoff **passes**, if all other rules pass.

| Action | Confirmed eligibility formula | Example for 15:00 start (Bangkok) | Primary source |
|---|---|---|---|
| **New Booking** | `S - T_elig >= 60 min` | `14:00:00` eligible; `14:00:01` too late | Q05; BR-005 |
| **Customer cancellation** | `S - T >= 30 min` | `14:30:00` eligible; `14:30:01` too late | Q07; BR-007 |
| **Reschedule old Appointment** | `OldStart - T >= 60 min` | Old `15:00`; `14:00:00` eligible | Q10; BR-010 |
| **Reschedule destination** | `NewStart - T >= 60 min` | Destination `15:00`; `14:00:01` too late | Q11; BR-011 |
| **Tutor cancellation** | `S - T >= 60 min` | `14:00:00` eligible; `14:00:01` too late | Q18; BR-018 |
| **Tutor Slot creation** | Start must be valid and in future; **no Q05 new-Booking cutoff imposed** | Future valid start; further scheduling grid/hours/horizon open | Q03/Q04; Theme 1; OD-001..003 |

**New-Booking precision (`T_elig`):** The reviewed Sprint 1 baseline defines a single server-authoritative time sampled **inside the transaction after contention waits and immediately before final guarded validation/write**. An HTTP request for a 15:00 Slot may arrive at 13:59:59 yet wait until `T_elig=14:00:01`; it must be denied. If `T_elig=14:00:00`, a later commit timestamp alone does not invalidate the previously valid guarded check. This is an **engineering interpretation** for review, not permission to weaken Q05 or ignore other checks. The Feature SDS must confirm the actual transaction/time-control design and tests (AC-S1-35, VC/TEST-S1-39).

For **later** cancellation/rescheduling cutoffs, Q07/Q10/Q11/Q18 settle the numerical boundary and server-clock authority through Q29; the exact transactional sampling order, lock behavior and retry handling must still be set in their Feature SDS. Using the same final-guard pattern as `T_elig` is a **proposal** for consistent implementation, not an independently confirmed stakeholder Q decision.

### 10.2 Half-open overlap and Current versus Historical

Two intervals intersect iff `a.start < b.end && b.start < a.end`. Exact adjacency (`a.end = b.start`) is allowed under BR-006 and BR-028. Partial overlap by even one positive-duration instant is prohibited for same-Tutor currently offered Slots and the same Customer's Active Bookings.

A **withdrawn historical** Slot must be excluded from the set of current offers checked against new Slot creation. This does **not** exempt a current occupied offer from same-Tutor overlap rules, and it does not mean an old historical Slot may be reactivated. Different Tutors' offered intervals may coincide; **one Customer** still cannot reserve overlapping intervals across them.

### 10.3 Three mandatory race proofs

| Hazard | Simultaneous operation | Required final committed state | Planned contract/test |
|---|---|---|---|
| **Race A: Tutor current offers** | Same Tutor creates two partially overlapping 60-minute offered Slots | At most one of the conflicting offers remains current; loser has no partial Slot. If different Tutors create same time, both can be valid. | Slot contract, VAL-005; baseline AC-S1-13 / VC-S1-37 |
| **Race B: exclusive Slot** | Two distinct Customers attempt the same eligible Slot | At most one Active Booking occupies that Slot. No second success or orphan occupancy. | Booking contract, VAL-010; baseline AC-S1-25 / VC-S1-25 |
| **Race C: Customer across Tutors** | One Customer simultaneously requests two distinct overlapping offers from different Tutors | At most one conflicting Active Booking commits for that Customer, despite each Slot being individually free. | Booking contract, VAL-011; baseline AC-S1-26 / VC-S1-26 |

For all three, controlled concurrency tests must start requests under actual overlap/interleaving and inspect **committed database state**, not only returned HTTP codes or disabled frontend controls. The System/Feature SDS must choose an isolation/locking/constraint strategy that enforces these outcomes for every write path. No particular SQL lock, ORM, idempotency key or isolation level is approved by this SRS.

### 10.4 Atomic change, stale reads and uncertain responses

- A stale availability view cannot reserve or grandfather an occupied/withdrawn/too-soon Slot. The server checks current state at the final write guard, and a rejected request changes no Booking or Slot relationship.
- A duplicate click, network retry or unknown response after a possible commit must preserve the invariants. Returning an existing success versus a conflict is an **unresolved transport/idempotency decision** (OD-013).
- A failed Customer cancellation leaves `Booked` and occupancy unchanged; a successful cancellation reopens the same Slot. A failed Tutor cancellation must not leave the Slot withdrawn or a false private notice.
- A failed reschedule leaves the original Booking assignment and its Slot occupied, destination unoccupied, no success history and the one-success quota unconsumed. This also holds when destination is taken concurrently.
- Under a lost database write or rollback, no client may be told a reservation/change succeeded unless the corresponding complete state committed. Exact error vocabulary and reconciliation behavior belong to the later design contracts.

## 11. Exception and boundary scenarios

This is a requirements-level outcome matrix. `VAL` cases are **planned**, and actual fixtures, HTTP status codes and test files are owned by later STS/implementation Issues.

| Scenario | Trigger / precondition | Observable required outcome | Governing rules; planned check |
|---|---|---|---|
| Invalid Slot start/duration | Missing, malformed, past or non-sixty-minute proposed offer | No invalid Slot, no changed existing offer | BR-003/035; VAL-003/004 |
| Same Tutor overlap | Existing 13:00-14:00 current offer; proposed 13:30-14:30 | Reject proposed Slot; original preserved | BR-006; VAL-004 |
| Slot adjacency | Existing 13:00-14:00; proposed 14:00-15:00 | Adjacency itself does not reject otherwise-valid offer | BR-006; VAL-004 |
| Cross-Tutor offers | Tutors A/B each create 13:00-14:00 | Both current offers allowed if each independently valid | BR-006; VAL-004 |
| Unauthorized Slot write | Customer or Tutor B targets Tutor A's schedule | No change to Tutor A's offers; no protected disclosure | BR-002/033; VAL-002 |
| Anonymous Booking | Caller lacks session | No Booking or protected data | BR-033; VAL-002 |
| Foreign Customer Booking | Customer B guesses A's Booking ID | No private details or related notification/reason exposed | BR-002/022/033; VAL-002/036 |
| Foreign Tutor schedule | Tutor B guesses Tutor A's schedule/Booking ID | No foreign schedule or private Booking disclosed | BR-002/033; VAL-002 |
| Too-soon new Booking | Slot at 15:00; `T_elig=14:00:01` | Reject without occupation | BR-005; VAL-008 |
| Exact new-Booking boundary | Slot at 15:00; `T_elig=14:00:00` | Lead-time rule passes, subject to all other guards | BR-005; VAL-008 |
| Cutoff crossed while waiting | HTTP arrives 13:59:59; final `T_elig=14:00:01` | Reject, regardless of early HTTP arrival | BR-005/034; VAL-009 |
| Occupied Slot/stale list | Availability was earlier displayed, but now occupied/withdrawn | No duplicate or false Booking; view reconciles | BR-001/034; VAL-006/014 |
| Same Customer across Tutors | Active 13:00-14:00, candidate 13:30-14:30 | Reject overlapping Booking | BR-028; VAL-011 |
| Adjacent Customer appointment | Active ends 14:00; proposed begins 14:00 | Overlap rule permits; independent lead-time applies | BR-028/005; VAL-004/011 |
| Race A | Concurrent same-Tutor overlapping Slot creation | At most one conflicting offer committed | BR-006/034; VAL-005 |
| Race B | Two Customers, one Slot concurrently | At most one Active claim committed | BR-001/034; VAL-010 |
| Race C | One Customer, overlapping Tutor Slots concurrently | No two overlapping Active bookings commit | BR-028/034; VAL-011 |
| Fault during Booking persistence | Failure before transaction completion | No phantom success, partial Booking or inconsistent occupation | BR-034; VAL-014 |
| Customer cancellation at cutoff | At `start - 30:00` versus just after | Equality eligible; just-after denied, no partial state | BR-007; VAL-015 |
| Reopened Slot inside booking cutoff | Customer cancels 30 minutes before start | Original Slot reopened, but new Booking at fewer than 60 minutes rejected | BR-008/005; VAL-016 |
| Reschedule wrong owner / quota | Foreign Customer or already one success | Reject, old Booking and history unchanged | BR-009/016; VAL-017 |
| Reschedule original/destination cutoffs | Old or destination starts at `T + 59:59` | Reject even if other start qualifies; exact `T + 60:00` eligible | BR-010/011; VAL-018 |
| Reschedule across Tutors | Valid new Tutor offered Slot | Accept; same Booking ID, new Tutor/Slot, old Slot reopened | BR-012..015; VAL-019/020 |
| Reschedule failure/rollback | Destination occupied, transaction fault, collision or late boundary | No partial move, lost reservation, false history or consumed quota | BR-013/016; VAL-020 |
| Tutor cancellation cutoff/ownership | Wrong assigned Tutor, `start - 59:59`, or exact 60:00 | Wrong/late denied; exact boundary eligible with valid reason | BR-017/018; VAL-021 |
| Missing Tutor cancellation reason | Empty, whitespace-only or meaninglessly empty reason | No cancellation/withdrawal/notice | BR-020; VAL-021 |
| Tutor cancellation state | Valid cancellation reason and cutoff | Booking Cancelled, original Slot withdrawn **not reopened**, private notice created | BR-019/021; VAL-022/023 |
| Notification privacy/re-read | Wrong Customer reads; owner reads twice | Wrong reader denied; owner sees reason and may reopen read notice | BR-021..025; VAL-023/024 |
| Direct occupied Slot change | Tutor edits/deletes/withdraws own Slot with Active Booking | Deny direct change until authorized Booking cancellation | BR-026; VAL-025 |
| Historical withdrawn overlap | Tutor withdraws unoccupied future 13:00-14:00 then creates new 13:00-14:00 offer | New distinct ID allowed; old history preserved; old ID not reactivated | BR-027/032; VAL-026/027 |
| Summary and protected counts | Tutor requests own categories; Customer or foreign Tutor requests same | Authorized counts equal lists; unauthorized gets no report | BR-030/031; VAL-028/029 |
| Browser outside Bangkok | UTC/other-zone device displays Slot and sends operation | Same intended Bangkok hour and cutoff evaluation; server time wins | BR-029; VAL-013 |
| Booking ended | Now after appointment end; no cancellation | `Past` may appear, `Booked` persists; no Completed/attendance or auto-release | BR-030; VAL-013 |

## 12. Source and requirement traceability

### 12.1 Provenance and audit rules

The tables below are **self-contained Part A coverage evidence**; they are **not** the separate Deliverable 1 Part B feature inventory or `docs/traceability.md` assigned to Issue #10.

- **SRC-Q:** stakeholder discovery decisions Q01-Q32 as recorded in the already reviewed/merged Sprint 1 requirements source; each row below is marked **Confirmed stakeholder baseline**, not independently instructor-approved.
- **SRC-GW-v1:** `group_work_specs_v1.pdf`, issued 6 October 2026, explicitly **Draft for instructor review**. Requirements drawn from it may need delta review against the missing final Master.
- **SRC-D1-v1:** `project_deliverable_1_v1.pdf`, due 8 November 2026; inspected from the supplied project archive.
- **SRC-S1:** `docs/requirements.md` as present on the `sprint1` baseline after merged PR #7; retains the original FR/BR/NFR/AC/VC naming.
- **SRC-AGENT:** repository root `AGENTS.md` merged through PR #20; this governs workflow, not new product behavior.

**Coverage criterion:** every Q decision has a product rule, an appropriate FR or NFR, a planned verification and proposed delivery sprint. An unapproved additional policy is listed in Section 13, not silently inserted into a Q row. At the requirements-writing stage, `VAL` is a test **plan**, not executed validation.

### 12.2 Stakeholder Q01-Q32 decision coverage audit

Every decision in this table has approval state **Confirmed in stakeholder discovery baseline**. The current document, final instructor source and engineering contract have **not** yet received their own approval. Some decisions were confirmed for the **product** but are scheduled in a **proposed** future sprint.

| Q | Confirmed meaning (condensed without changing boundary) | Product FR / BR / applicable NFR | Target verification sprint | Planned evidence |
|---|---|---|---|---|
| **Q01** | Exclusive one-Customer/one-Tutor session | FR-010/012; BR-001; NFR-004 | S1 | VAL-007/010 |
| **Q02** | Tutor = Staff, Customer = learner, schedule/Booking ownership | FR-004/007/014/015; BR-002; NFR-001 | S1 | VAL-002/012 |
| **Q03** | Slot lasts exactly 60 minutes | FR-005/006; BR-003 | S1 | VAL-003/004 |
| **Q04** | Tutor creates Slots individually, without bulk/recurrence | FR-005; BR-004 | S1 | VAL-003 |
| **Q05** | New Booking at least 60 minutes ahead; equality eligible | FR-009/011; BR-005; NFR-006 | S1 | VAL-008/009 |
| **Q06** | Same-Tutor current offered Slot non-overlap, adjacency valid | FR-006; BR-006; NFR-004 | S1 | VAL-004/005 |
| **Q07** | Only owner Customer cancels at least 30 minutes ahead | FR-020; BR-007; NFR-006 | proposed S2 | VAL-015 |
| **Q08** | Customer cancellation reopens original Slot, Q05 still applies | FR-021; BR-008 | proposed S2 | VAL-016 |
| **Q09** | Only owning Customer initiates reschedule | FR-022; BR-009 | proposed S2 | VAL-017 |
| **Q10** | Original appointment at least 60 minutes ahead to reschedule | FR-023; BR-010; NFR-006 | proposed S2 | VAL-018 |
| **Q11** | Destination Slot at least 60 minutes ahead | FR-023; BR-011; NFR-006 | proposed S2 | VAL-018 |
| **Q12** | Cross-Tutor reschedule allowed | FR-024; BR-012 | proposed S2 | VAL-019 |
| **Q13** | Reschedule atomic/all-or-nothing | FR-025; BR-013; NFR-005 | proposed S2 | VAL-020 |
| **Q14** | Reschedule reopens old Slot | FR-025; BR-014 | proposed S2 | VAL-020 |
| **Q15** | Same Booking ID; successful old/new Tutor, Slot/time, timestamp history | FR-026; BR-015 | proposed S2 | VAL-020 |
| **Q16** | One successful reschedule max; failures do not consume quota | FR-027; BR-016; NFR-008 | proposed S2 | VAL-017/020 |
| **Q17** | Only currently assigned authorized Tutor cancels | FR-028; BR-017; NFR-001 | proposed S2 | VAL-021 |
| **Q18** | Tutor cancellation at least 60 minutes ahead | FR-028; BR-018; NFR-006 | proposed S2 | VAL-021 |
| **Q19** | Tutor cancellation withdraws original Slot, does not reopen | FR-030; BR-019; NFR-005 | proposed S2 | VAL-022 |
| **Q20** | Tutor cancellation reason meaningful and nonblank | FR-029; BR-020 | proposed S2 | VAL-021 |
| **Q21** | Tutor cancellation creates in-app notice only for owning Customer | FR-031; BR-021; NFR-007 | proposed S2 | VAL-023 |
| **Q22** | Reason visible only to affected owning Customer | FR-031; BR-022; NFR-007 | proposed S2 | VAL-023/036 |
| **Q23** | Reason in both private notice and cancelled Booking detail | FR-031; BR-023; NFR-007 | proposed S2 | VAL-023 |
| **Q24** | Read notice remains accessible | FR-032; BR-024; NFR-014 | proposed S2 | VAL-024 |
| **Q25** | No automatic time-based notice expiry; other retention open | FR-032; BR-025; NFR-014 | proposed S2 | VAL-024 |
| **Q26** | Active Booking blocks direct Slot edit/delete/withdrawal | FR-033; BR-026 | proposed S2 | VAL-025 |
| **Q27** | Tutor withdraws own unoccupied future Slot, recreates separate Slot; history retained | FR-034; BR-027 | proposed S2 | VAL-026 |
| **Q28** | One Customer's Active Bookings never overlap across Tutors; adjacency allowed | FR-013; BR-028; NFR-004 | S1 | VAL-004/011 |
| **Q29** | Bangkok timezone, server-authoritative clock | FR-011/017; BR-029; NFR-006 | S1 | VAL-008/013 |
| **Q30** | States Booked/Cancelled; Past derived and not Completed | FR-017/035; BR-030; NFR-016 | S1 (Booked/Past), S2 (Cancelled), S3 (report) | VAL-013/015/028 |
| **Q31** | Tutor-only summary with Upcoming Booked/Past Booked/Cancelled counts and lists | FR-035/036; BR-031; NFR-016 | proposed S3 | VAL-028/029 |
| **Q32** | Withdrawn history does not block separate overlap or permit same-ID reactivation | FR-034; BR-032 | proposed S2 | VAL-027 |

**Audit result at drafting:** Q01-Q32 are each accounted for in a distinct row, with an authorized meaning and planned validation. No Q decision is excluded from the whole-product baseline. Formal source approval and code/test completion remain separate gates.

### 12.3 Available instructor requirements to SRS mapping

| Instructor-draft source | Requirement actually stated in examined handout | Whole-product mapping | Earliest planned verification | Source status |
|---|---|---|---|---|
| GW v1 §5.1 | Working UI → application/API → persistent DB, meaningful domain transaction, restart durability | FR-016/019; NFR-003; BR-034 | S1: VAL-007/031 | **Draft; final master not checked** |
| GW v1 §5.2 | Real login, logout, current identity, session lifecycle, two roles | FR-001..004; NFR-002 | S1: VAL-001/034 | **Draft; final master not checked** |
| GW v1 §5.2 / Theme 1 | Customer own Booking only, Tutor authorized schedule, backend role checks | FR-004/007/014/015; BR-002/033; NFR-001/007 | S1: VAL-002/012/036 | **Draft; final master not checked** |
| GW v1 §6 Theme 1 | Staff creates Slot, Customer views/Books/retrieves; reject occupied/past/invalid; competing single-Slot claims | FR-005..016; BR-001/035; NFR-004/005 | S1: VAL-003..014 | **Draft; eligibility not checked** |
| GW v1 §6 Theme 1 | Complete product cancellation/rescheduling, schedule administration, appointment reporting | FR-020..036; BR-007..027/031/032 | proposed S2/S3: VAL-015..029 | **Draft; combined with Q decisions** |
| GW v1 §5.3 | Reviewed GitHub workflow, automated PR build/test and later Docker/GCP delivery | NFR-011/012/013 | S1 contract/review VAL-031; Lab 5 VAL-035 | **Draft; separate engineering Issues** |
| D1 v1 §§3.1-3.4 | Whole-product SRS with FR/BR/NFR, measurable verification and 3-sprint allocation | Document §§0-18; NFR-011/012 | Part A document inspection; later Parts B-D | **Version examined; master cross-check pending** |

No line in the available handouts prescribes a tutoring price, service modality, weekday hours, maximum scheduling horizon, minute increment, performance p95 or automatic attendance state. Adding such a constraint would require an explicit source or approved decision.

### 12.4 Sprint 1 baseline ID crosswalk and consistency

The original `docs/requirements.md` is a **Sprint 1 document** and retains all its IDs. The product-level IDs in this SRS are new identifiers and do not rewrite or renumber the source. The old file's header documents its initial draft stage; GitHub PR #7 is now **merged**, as verified from PR history. The single approved surgical correction in Issue #9 updates its §16.1 AC range to `AC-S1-01..35`; `AC-S1-35` itself already exists in that file and maps to `VC/TEST-S1-39`.

**FR crosswalk:** the meanings of `FR-S1-01..19` correspond **in order** to `FR-001..019`. Specifically:

| Sprint 1 IDs | Whole-product IDs | Requirement group |
|---|---|---|
| FR-S1-01..04 | FR-001..004 | Login, identity, logout, backend authorization |
| FR-S1-05..07 | FR-005..007 | Tutor Slot creation, validity/overlap, own schedule |
| FR-S1-08..09 | FR-008..009 | Customer availability and bookability |
| FR-S1-10..13 | FR-010..013 | Booking, cutoff, exclusive claim, Customer overlap |
| FR-S1-14..17 | FR-014..017 | Private reads, persistence and Booked/Past |
| FR-S1-18..19 | FR-018..019 | Failure handling and full-stack vertical slice |

**BR crosswalk:** the Sprint 1 source sometimes separates one Q rule into several narrower guards. These remain distinct IDs in that document.

| Baseline BR-S1 | Product BR | Baseline BR-S1 | Product BR |
|---|---|---|---|
| 01 | BR-001 | 12 | BR-029 |
| 02 | BR-003 | 13 | BR-005/034 (T_elig interpretation) |
| 03 | BR-004 | 14 | BR-030 |
| 04 | BR-002 | 15 | BR-002 |
| 05 | BR-006 | 16 | BR-002 |
| 06 | BR-006 | 17 | BR-033 |
| 07 | BR-005 | 18 | BR-034 |
| 08 | BR-001 | 19 | BR-001/028/034 |
| 09 | BR-028 | 20 | BR-002/033 |
| 10 | BR-028 | 21 | BR-005/034 |
| 11 | BR-035 | 22 | BR-030 |

**NFR crosswalk:** the first number below is the original Sprint 1 suffix; proposed versus required status must carry forward unchanged.

| Baseline NFR-S1 | Product NFR | Baseline NFR-S1 | Product NFR |
|---|---|---|---|
| 01 | NFR-001/007 | 07 | NFR-012 |
| 02 | NFR-002 | 08 | NFR-007/015 |
| 03 | NFR-003 | 09 | NFR-009 (**PROPOSED**) |
| 04 | NFR-004 (stress size proposed) | 10 | NFR-010 (**PROPOSED**) |
| 05 | NFR-004 (stress size proposed) | 11 | NFR-005 |
| 06 | NFR-006 | 12 | NFR-011 |

**Existing AC and validation anchors (not duplicated as a Part E STS):**

| Existing Sprint 1 evidence anchor | Product verification and meaning |
|---|---|
| AC-S1-01..07; VC/TEST-S1-01..07 | VAL-001/002; login, identity, logout, authorization |
| AC-S1-08..14; VC/TEST-S1-08..14, 37 | VAL-003..005/013; Slot duration, ownership, overlap and Race A |
| AC-S1-15..18; VC/TEST-S1-13/15/22 | VAL-006/013; availability, privacy, stale view |
| AC-S1-19..24; VC/TEST-S1-16..24 | VAL-007/008/011; Booking, lead-time and overlap |
| AC-S1-25; VC/TEST-S1-25 | VAL-010; Race B |
| AC-S1-26; VC/TEST-S1-26 | VAL-011; Race C |
| AC-S1-27..29; VC/TEST-S1-22/27/33/38 | VAL-014/030; rollback, conflict, duplicates |
| AC-S1-30..34; VC/TEST-S1-28..32 | VAL-012/013; owned reads, Tutor visibility and Past |
| **AC-S1-35; VC/TEST-S1-39** | **VAL-009; booking request crossing cutoff while waiting** |
| VC/TEST-S1-34..36 | VAL-031/032/033/034; planned reproducibility, security, UX and performance checks |

All `AC-S1-01..35` and `VC-S1-01..39` / `TEST-S1-01..39` remain owned by the original baseline; references here are cross-references, not redefinitions or claims that test code exists.

## 13. Open decisions and approval gates

This register is the **explicit home for uncertainty**. A proposed choice below is not approved simply because the SRS names it. Existing confirmed Q01-Q32 behavior must remain intact while decisions are obtained. `OD` IDs are SRS decision-register identifiers, not requirements or new stakeholder Q numbers.

| ID | Question and existing evidence | Affected scope / reasonable options | Decision owner and required stage | Status / risk |
|---|---|---|---|---|
| **OD-001** | Which Tutor working days, opening hours, holidays and calendar boundaries apply? Q03 fixes duration, not operating hours; baseline TBD-S1-01 is open. | FR-005/006, BR-035; explicitly approve a restriction or document why none is imposed. | @Tanaboonnnnn proposes; @Chxtamos reviews **before Slot Feature SDS**; stakeholder approval for any new business constraint | **OPEN.** An invented workweek could reject valid requests. |
| **OD-002** | Is there a maximum advance scheduling/booking horizon? Q05 provides only a **minimum** lead time; baseline TBD-S1-02 is open. | FR-005/009/011; choose approved upper bound or explicitly decide none, without assuming 7/14/30 days. | Stakeholder decision documented by team and reviewed **before Slot/Booking contracts** | **OPEN.** Inconsistent form and server validation risk. |
| **OD-003** | What start-minute increments are permitted? Exactly 60-minute duration does not imply starts at :00 or :30; baseline TBD-S1-03. | FR-005/006; approve a grid or leave all otherwise-valid minute instants available as a documented decision. | Stakeholder/team + peer **before Slot SDS/STS** | **OPEN.** Hidden UI grid could alter business scope. |
| **OD-004** | Should Customer availability show only bookable Slots or all offers with unavailable markers? Which Tutor labels, sort/filter/page and sensitive fields? Baseline TBD-S1-04 and PR #7 review. | FR-008/009, FR-014/015, NFR-007. Bookable-only is **proposed**, not approved; either presentation must avoid false availability and private data. | Team API/UI contract, @Chxtamos **before S1 feature implementation** | **OPEN PROPOSAL.** UX/privacy ambiguity. |
| **OD-005** | What are session/token invalidation, expiry, refresh and replay safeguards, safe error schemas and exact transactional/time-control mechanisms? Baseline TBD-S1-05. | FR-001..004/011/018, NFR-001/002/015; evaluate technologies in System/Feature SDS without changing the business outcomes. | Engineering design by @Tanaboonnnnn; peer review **before code** | **OPEN DESIGN.** Security and cutoff implementation risk. |
| **OD-006** | Where does an appointment **in progress** fall in Upcoming Booked versus Past Booked? Q30 says Past is derived; the S1 glossary derives it after **end**. Q31 names only the three summary categories. | FR-035, BR-030/031, NFR-016; options include a separately disclosed in-progress subgroup or a specifically approved treatment, without inventing a third Booking **state**. | Stakeholder clarifies; peer review **before S3 Summary SDS/STS** | **OPEN.** Counts could silently omit or misclassify a current lesson. |
| **OD-007** | May the same withdrawn historical Slot be reactivated? **No**: Q32 explicitly prohibits reactivation. Only whether any special restoration request needs a **new separately approved** workflow remains undecided. | FR-034, BR-032. Normal design uses **new Slot ID**; no override is authorized by current baseline. | Q32 already governs; any proposed exception needs **new stakeholder approval before scope change** | **REACTIVATION PROHIBITED; hypothetical exception UNSPECIFIED.** Do not treat prohibition as an open permission. |
| **OD-008** | How long may private reasons/notifications/history be retained or deleted, and by whom? Q24/Q25 require rereadability and no automatic time expiry, but do not resolve user deletion or formal retention governance. | FR-031/032, NFR-007/014/015; no auto-expiry, pending deletion/export/access policy. | Stakeholder/data owner and security reviewer **before notice design/sign-off** | **OPEN.** Privacy and durability tradeoff. |
| **OD-009** | Which filtering, ordering, pagination, category counting snapshots and historical associations apply to Tutor Summary? Q31 gives categories/counts/lists, not query shape or page size. | FR-035/036, NFR-016, OD-006; approve lists and counts against same filters and visibility. | Team + @Chxtamos **before S3 Summary SDS/STS** | **OPEN DESIGN.** Count/list disagreement. |
| **OD-010** | Are keyboard-only flow and p95 <= 2.0 s acceptable product NFR targets? What machines, fixtures, concurrency sample size and exact workloads are approved? PR #7 keeps thresholds proposed. | NFR-004 run sizes, NFR-009/010 targets; accept, revise or defer explicit criteria with recorded methodology. | @Tanaboonnnnn and @Chxtamos, stakeholder/instructor if required **before affected STS approval** | **OPEN PROPOSAL.** No measured performance/UX result yet. |
| **OD-011** | Is the examined `group_work_specs_v1.pdf` the latest final Master? The available copy states **Draft for instructor review, issued 6 Oct 2026**; D1 references `group_work_specs.docx` as master. Searches in the locally approved repository and connected Drive did not locate a newer authoritative master. | All source-derived GW/Theme 1 entries. Obtain current instructor-issued `group_work_specs.docx` or dated official amendment; compare every Part A/Theme rule, record version/date and differences. | Instructor/TA source; @Tanaboonnnnn verifies and @Chxtamos reviews **before formal SRS/Deliverable sign-off** | **UNVERIFIED; FORMAL SIGN-OFF BLOCKED.** PR may proceed as a labeled draft. |
| **OD-012** | Is Theme 1 officially assigned to this two-student team? GW v1 §6 allocates themes from students' final ID digits; no dated assignment/ID evidence is present in reviewed materials. | Entire tutoring context. Obtain instructor/TA theme confirmation or verifiable eligibility record. | Instructor/TA; @Tanaboonnnnn supplies; @Chxtamos checks **before formal sign-off** | **UNVERIFIED; FORMAL SIGN-OFF BLOCKED.** Do not claim eligibility proved. |
| **OD-013** | What result, idempotency key and replay window should repeated Booking/reschedule/cancel submissions use after network uncertainty? Q invariants constrain outcomes but not response protocol. | FR-018/025/027, NFR-008; choose recoverable reconciliation and duplicate policies with real-DB validation. | Engineering + @Chxtamos **before related Feature SDS/STS** | **OPEN DESIGN.** Duplicate effects and misleading response risk. |
| **OD-014** | What exactly qualifies as a `meaningful` Tutor cancellation reason beyond nonblank? Q20 rules out empty/meaningless text but sets no byte count or prohibited vocabulary. | FR-029, BR-020; propose a reviewable validation policy; do not invent a word/minimum-length requirement as confirmed. | Stakeholder/team review **before S2 Tutor cancellation SDS/STS** | **OPEN DETAIL.** Overly weak or arbitrary rejection risk. |
| **OD-015** | Which historical Booking/reschedule fields may a **previous Tutor** see after cross-Tutor reassignment? Q12/Q15 require history; Q02 restricts protected Tutor scope. | FR-015/024/026, NFR-007; evaluate authorized history without granting foreign schedule lookup. | Stakeholder/team privacy and peer **before S2 reschedule SDS/STS** | **OPEN PRIVACY DESIGN.** History must exist without broadening unrelated Tutor access. |

### 13.1 Source-verification record and required delta procedure

| Item checked | Evidence actually available | Finding | Approval consequence |
|---|---|---|---|
| Group Work Specification | `group_work_specs_v1.pdf` in user-supplied `group_project_spec_files.zip`; 15 pages; title page states "Semester 1/2026; Draft for instructor review; Issued: 6 October 2026" | Contains GW §§5.1-5.3 and Theme 1 §6, including full-stack, authentication, team workflow and appointment example | **Draft verified as draft; final master unverified** |
| Deliverable 1 instructions | `project_deliverable_1_v1.pdf` in same archive; 8 pages; due 8 Nov 2026 at 23:59 | Part A requires whole-product FR/BR/NFR and reviewable assumptions; Parts B-D cover product, E-F Sprint 1 | Applied as available D1 instruction; check against later amendments |
| Current repo baseline | `docs/requirements.md` on remote `sprint1`, merged PR #7; root `AGENTS.md`, merged PR #20 | Stable S1 identifiers and Q01-Q32 applicability, peer review/dispositions and repo rules are available | Source verified for this document, **not** instructor-approved by that fact |
| Final master file | Instructor's referenced `group_work_specs.docx` and dated amendments | Not present in the examined supplied archive, current repo or relevant connected Drive search results | **Cannot compute a final-vs-draft difference**; OD-011 blocks sign-off |
| Formal Theme 1 allocation | Student ID digit/official theme decision or instructor/TA confirmation | Not present in the examined evidence | **Cannot certify eligibility**; OD-012 blocks sign-off |

When the final master becomes available, record **filename, issue date, version, source URL/location, reviewer, comparison date, changed requirements and affected FR/BR/NFR/AC/VAL IDs**. If a clause contradicts Q01-Q32, record the conflict and ask the correct decision owner before amending the baseline. Do not overwrite confirmed stakeholder rules silently.

## 14. Exclusions and future compatibility

The project uses three distinct categories, with different approval consequences:

| Category | Example | Consequence |
|---|---|---|
| **Not approved for this product** | Payments, lesson mode/video link, group tutoring, course catalogs, email/SMS reminders, external calendar, attendance, new admin role | No requirement or implementation follows from the current baseline; stakeholder and instructor scope approval would be needed to add one. |
| **Agreed for product, deferred from Sprint 1** | Customer cancellation/reopening (Q07-Q08), reschedule/history (Q09-Q16), Tutor cancellation/reason/notice/withdrawal (Q17-Q27/Q32), Tutor-only summary (Q31) | Must be covered in the whole-product SRS now, but remains **proposed S2/S3 allocation** with future reviewed contracts and code. |
| **Engineering solution not yet selected** | API paths/schema, transaction lock strategy, session/token design, presentation/filtering, idempotency, logging details, measured UX/performance targets | Must preserve business outcomes; propose and approve in SDS/STS, with no invented stakeholder policy. |

**Forward compatibility from S1:** the Booking model must later support `Cancelled` without inventing `Completed`; reschedule must retain the Booking ID/history and update Tutor association; withdrawn Slots must remain historical without blocking current offers; reasons/notifications need ownership boundaries; Tutor summary must use the same authoritative state and time semantics. These constraints are requirements for future design, not authorization to implement S2 features in S1.

## 15. Verification planning

Each `VAL-xxx` is an **unexecuted requirements-level verification plan**, not an executable STS or a report of passing tests. The test author must later specify fixtures, exact inputs, controlled server clock, synchronized race barriers where relevant, database assertions, expected API/UI behavior, and concrete result/version. Below, `negative` means a forbidden or failed case; `boundary` means exact equality and just below/above as appropriate.

### 15.1 Planned validation catalog

| Anchor | Scope and planned method | Required observable evidence | Linked requirements | Target |
|---|---|---|---|---|
| **VAL-001** | API/UI: valid and invalid Customer/Tutor login, identity query, logout and old-session reuse | Correct own role, bad credentials denied, no usable access after logout | FR-001/002/003; BR-033; NFR-001 | S1 |
| **VAL-002** | API integration: anonymous, forged role, foreign Slot/Booking IDs and wrong Tutor requests | All protected actions denied/filtered, payload contains no foreign private data | FR-004/007/014/015/018; BR-002/033; NFR-001 | S1 and regression |
| **VAL-003** | UI/API/DB: Tutor creates one future offer; invalid duration/automatic recurrence attempt | Exactly one owned 60-minute offer saved; no automatic repeating Slots | FR-005; BR-003/004; NFR-003 | S1 |
| **VAL-004** | Boundary/API/DB: past/invalid, same-Tutor overlap, adjacency, different-Tutor same-time, Customer adjacency | Invalid/overlapping offer denied; adjacency/cross-Tutor allowed when other checks pass | FR-006/013; BR-003/006/028/035 | S1 |
| **VAL-005** | Real-DB synchronized Race A: concurrent same-Tutor overlapping offer creation | At most one conflicting current Slot committed; losing attempt no partial Slot | FR-006; BR-006/034; NFR-004 | S1 |
| **VAL-006** | Availability API/UI: eligible, past, occupied, too-soon and stale offers | No false selectable booking; no private third-party data; server rechecks stale result | FR-008/009; BR-005/035; NFR-007 | S1 |
| **VAL-007** | E2E/API/DB: authorized offer → availability → Booking → reload/restart → own retrieval | Exactly one Booked reservation saved and readable from persistent DB by authorized actors | FR-010/016/019; BR-001; NFR-003 | S1 |
| **VAL-008** | Controlled backend clock: exact 60:00 vs 59:59 cutoff and wrong browser timezone | Exact boundary eligible, below rejected; correct Bangkok scheduling meaning | FR-011; BR-005/029; NFR-006 | S1 |
| **VAL-009** | Controlled transaction waiting at Q05 cutoff, including prior HTTP arrival | Reject when final guarded `T_elig` is too late; no false success or occupied Slot | FR-009/011; BR-005/034; NFR-006 | S1 |
| **VAL-010** | Real-DB synchronized Race B: two Customers, one Slot | At most one committed Active Booking and one occupied Slot | FR-012; BR-001/034; NFR-004 | S1 |
| **VAL-011** | API/DB sequential plus synchronized Race C: same Customer, overlapping Tutors | No overlapping Active Bookings committed; adjacency allowed by overlap rule | FR-013; BR-028/034; NFR-004 | S1 |
| **VAL-012** | API/UI: own Customer list/detail; Tutor schedule; foreign IDs, refresh | Authorized records visible and persisted, foreign data absent | FR-007/014/015; BR-002; NFR-001/007 | S1 |
| **VAL-013** | Time/UI/API: past end, non-Bangkok device and Booking status check | Past display may be derived; status remains Booked; no Completed or time shift | FR-017; BR-029/030; NFR-006 | S1, report regression S3 |
| **VAL-014** | DB fault injection and stale selection/invalid input for Slot or Booking | No partial claim, false confirmation or mutation after rejection | FR-011/016/018; BR-034/035; NFR-005 | S1 |
| **VAL-015** | S2 API/DB: owning/nonowning Customer cancel; exact 30:00 and just below | Valid owner cancels to Cancelled with Slot re-open; invalid leaves original untouched | FR-020/021; BR-007; NFR-006 | proposed S2 |
| **VAL-016** | S2 boundary/DB: newly reopened original Slot inside new-Booking cutoff | Slot exists as offered/unoccupied but new Booking under 60 minutes denied | FR-021; BR-005/008/014 | proposed S2 |
| **VAL-017** | S2 API/DB: foreign Customer reschedule, one previous success, unsuccessful attempt | Foreign/second-success rejected; failed attempt leaves quota available | FR-022/027; BR-009/016; NFR-008 | proposed S2 |
| **VAL-018** | S2 controlled clock: old and destination starts at exactly 60:00 vs just below | Both boundaries enforced independently; no partial move | FR-023; BR-010/011; NFR-006 | proposed S2 |
| **VAL-019** | S2 API/DB: valid cross-Tutor destination | New Tutor assignment allowed, independent conflicts still enforced | FR-024; BR-012/028 | proposed S2 |
| **VAL-020** | S2 real-DB: successful and rejected reschedule, destination collision, forced rollback | Same Booking ID; old/new history on success only; old Slot reopened, destination claimed, failed attempt restores prior state/quota | FR-025/026/027; BR-013..016; NFR-005/008 | proposed S2 |
| **VAL-021** | S2 API: current versus wrong Tutor; exact 60:00, 59:59; blank/meaningless reason | Only valid owner/cutoff/reason permits action; otherwise no state changes | FR-028/029; BR-017/018/020; NFR-006 | proposed S2 |
| **VAL-022** | S2 API/DB: Tutor cancellation with committed Booking/Slot relation | Booking Cancelled; original Slot withdrawn, not reoffered; no partial result on fault | FR-030; BR-019; NFR-005 | proposed S2 |
| **VAL-023** | S2 API/UI: successful Tutor cancellation; owning vs foreign Customer, reason fields | Exactly intended owner gets notice and reason in both notice and Booking detail; no leak | FR-031; BR-021..023; NFR-007 | proposed S2 |
| **VAL-024** | S2 persistence/UI: mark notice read, reenter later, simulate age passage | Same owner can reread; no automatic time expiry; deletion policy remains unresolved | FR-032; BR-024/025; NFR-014 | proposed S2 |
| **VAL-025** | S2 API/DB: attempt direct edit/delete/withdraw with Active Booking | All such direct operations denied without modifying occupied Slot | FR-033; BR-026 | proposed S2 |
| **VAL-026** | S2 API/DB: own unoccupied future withdraw and separate new Slot creation | Old historical record retained; new distinct ID accepted if otherwise valid | FR-034; BR-027 | proposed S2 |
| **VAL-027** | S2 API/DB: new offer overlapping withdrawn history and attempted historical reactivation | New offer not blocked by withdrawn Slot; original ID not reactivated | FR-034; BR-032 | proposed S2 |
| **VAL-028** | S3 API/UI/DB: known Booked-upcoming, Booked-past and Cancelled fixtures | Counts and accessible lists match exact categories and state/time without Completed | FR-035; BR-030/031; NFR-016 | proposed S3 |
| **VAL-029** | S3 API: Customer/anonymous/foreign Tutor summary; in-progress fixture | No foreign summary; in-progress category follows **approved future decision**, not guessed default | FR-035/036; BR-031; NFR-001/016 | proposed S3 |
| **VAL-030** | API/DB: repeated/uncertain Booking or reschedule calls | Invariants/quota/history unchanged by unsafe duplicates; concrete retry response to be specified | FR-018/025/027; BR-001/034; NFR-008 | S1/S2 |
| **VAL-031** | Documentation/release evidence review and reproducible local start | Documented SHA, setup, persistent data checks, actual command outputs, peer-reviewed PR chain | FR-019; NFR-003/011/012 | S1-S3 |
| **VAL-032** | Candidate p95 benchmark over 50+ warm-up-excluded GETs per operation with recorded environment | Record raw data/p95 and compare only after threshold approval; **no execution here** | NFR-010 | proposed S1/S3 |
| **VAL-033** | Candidate manual keyboard walk-through with recorded browser/focus checklist | Record accessibility findings; compare only after target approval | NFR-009 | proposed S1/S3 |
| **VAL-034** | Security review of stored test passwords, secrets/configuration and error/log traces | No plaintext secrets and no protected fields; approved hashing method demonstrated when implemented | NFR-002/015; FR-001 | S1 and regression |
| **VAL-035** | Lab 5+ pipeline/packaging/deploy check, linked release/version | Docker/GCP persistence, required PR build/test gate and repeatable main release with actual outputs | NFR-013 | Lab 5+, outside Issue #9 |
| **VAL-036** | Negative API payload inspection for availability, Booking, notification, summary and error paths | No foreign owner data, cancellation reason or restricted Tutor records in serialized results | FR-004/008/014/015/031/036; BR-022/033; NFR-001/007/015 | S1-S3 |

### 15.2 Coverage and test-readiness boundaries

At the **requirements** stage, VAL-001..036 give a planned validation path for each FR-001..036, BR-001..035 and NFR-001..016. Crosswalk §12.4 preserves the planned Sprint 1 anchors `AC-S1-01..35` and `VC/TEST-S1-01..39`. The true implementation later needs tests that fail for the right reason before code (TDD), seeded role fixtures, a controlled server clock, a real transactional database for the three races, injected rollback failures and exact recorded outcomes. Final Test Specification IDs, test source files and pass/fail counts belong to Parts E/F, not this SRS.

**Validation is not approval:** a structural ID check validates document consistency, a teammate review evaluates the requirements, a formal stakeholder decision authorizes disputed behavior, and an executed test validates implemented behavior. These evidence types must not be substituted for one another.

## 16. Risks, dependencies and change control

| Risk / dependency | Exposure | Control and required evidence | Owner / gate |
|---|---|---|---|
| Final instructor specification and Theme unverified | Wrong scope or unapproved team topic | Locate dated final Master + Theme decision; record exact version and differences; revise via reviewed PR | Instructor/TA, @Tanaboonnnnn; OD-011/012 before formal sign-off |
| New working-hours/horizon/start grid invented in design | Unapproved rejection of valid scheduling | Keep OD-001..003 open, seek specific policy approval, update FR/BR/AC/VAL before implementation | Product decision owner; Slot/Booking contracts |
| Concurrent Slot/Booking collisions | Double offers, double claims, cross-Tutor overlap | Synchronized real-DB Race A/B/C tests and reviewable transaction guarantees | Engineering + @Chxtamos; S1 contracts |
| Cutoff evaluated at client or early request time | Incorrect exact-boundary outcomes | Preserve Q05 and reviewed `T_elig` interpretation, test contention crossing; define S2 mutation decision points | Feature contract reviewers |
| Partial reschedule/cancellation/notification writes | Lost reservation, wrong Slot state or private false notice | Atomic transaction and fault-injection evidence, exact history/quota assertions | S2 Feature SDS/STS |
| Privacy and reschedule history | Other Customer/Tutor sees reason, past association or summary | Role/record matrix plus full response allowlist review and negative API tests; OD-015 | Security/data owner + peer |
| Summary in-progress classification | Incorrect count/list or dropped current session | Decide OD-006 and OD-009 before S3 contract; compare counts to underlying authorized row sets | Stakeholder and peer |
| Unapproved NFR target silently treated as pass gate | Unsupported performance or UX claims | Record approval status and environment/method before adopting; preserve measured results | OD-010; team/stakeholder |
| Feature-order dependency | Later sprints assume unavailable S1 identity/transaction model | S1 auth/Slots/Booking first; S2 cancel/reschedule/notice/withdraw; S3 reports/hardening; revalidate after review | Issue #12 planning, separate implementation Issues |
| Scope or document drift | Q decisions contradicted, undocumented changes enter app | Versioned SRS and explicit change record with source/decision owner, affected IDs, planned tests and peer review | All future PRs |

**Change-control procedure:** A proposal changing Q01-Q32 must identify the decision ID, present its source and impact, obtain explicit stakeholder approval, then revise affected product FR/BR/NFR, open decisions, acceptance/validation mappings and the later design/test contracts in reviewable commits. An instructor-final discrepancy requires a recorded source comparison and decision owner. A formatting or technical design choice must not silently relax a confirmed cutoff, role boundary, one-to-one exclusivity, transaction integrity or notification privacy rule.

## 17. Review checklist and sign-off

These checkboxes are review tasks, **not claims of completion**. Human reviewer should inspect the entire document against the linked evidence.

### 17.1 Reviewer checklist for @Chxtamos

- [ ] Whole-product scope is distinct from the Sprint 1-only source; S2/S3 capabilities are present without inventing implementation.
- [ ] Every Q01-Q32 appears once in §12.2 and the mapped FR/BR describes the same approved decision, with no unsupported extra business policy.
- [ ] All FR-001..036, BR-001..035 and NFR-001..016 have unique meanings, sources, proposed target sprints and usable validation anchors.
- [ ] Theme 1/Deliverable 1 instructor minimum is accurately identified as an **examined draft** where appropriate, not falsely claimed final.
- [ ] Exactly sixty-minute manual offers, Q05 equality, Q07 30-minute equality, Q10/Q11/Q18 60-minute equalities and Bangkok server time agree across catalogs and scenarios.
- [ ] Same-Tutor current offers, exclusive Slot and same-Customer cross-Tutor races are three **separate** committed-DB obligations; adjacency and withdrawn-history exceptions are correct.
- [ ] Customer cancellation reopens old Slot, but Tutor cancellation withdraws old Slot; failed reschedule preserves old Booking and quota; one success preserves Booking ID/history.
- [ ] Privacy matrix denies foreign Customer/Tutor reads, notice/reason leaks and Customer access to the Tutor-only summary.
- [ ] Booked/Cancelled are the only Booking business states; Past is derived; no Completed/attendance assumption appears.
- [ ] Open policies OD-001..015, especially final Master/Theme and proposed NFR performance/UX targets, are not written as approvals.
- [ ] Existing Sprint 1 `FR-S1`, `BR-S1`, `NFR-S1`, `AC-S1` and `VC/TEST-S1` identifiers are not redefined; §16.1 in `requirements.md` includes `AC-S1-35`.
- [ ] Full-document Markdown, relative links, table consistency, ID references, source accuracy, scope and Git file allowlist are checked.
- [ ] No application code, Feature SDS, test implementation or release/deployment claims are part of Issue #9.
- [ ] A real GitHub **Review Request** was issued to @Chxtamos, and their subsequent review is separately recorded before any merge.

### 17.2 Sign-off record

| Review gate | Responsible party | Current evidence and status |
|---|---|---|
| Author's requirements drafting/structural validation | @Tanaboonnnnn | Document submitted as draft for Issue #9; structural/semantic review results belong in PR verification report |
| Independent peer review | @Chxtamos | **PENDING**; no approval recorded in this SRS |
| Material open policy/NFR decisions | Stakeholder/product owner and team | **PENDING** OD-001..006, OD-008..010, OD-013..015 |
| Final instructor Master version and Theme 1 eligibility | Instructor/TA, verified by team | **UNVERIFIED** OD-011/012; formal approval **BLOCKED** |
| Whole-product SRS approval | Authorized decision owner following independent review | **NOT APPROVED** |
| Application implementation, automated tests, release and deployment | Separate engineering Issues | **NOT VERIFIED BY THIS DOCUMENT** |

The SRS can be reviewed and improved through an Issue-linked PR while these external gates are open. Peer approval alone must not be represented as the instructor's final requirements approval. No merge is authorized by this document.

## 18. References

Only materials actually inspected or explicitly provided as the agreed baseline are listed as evidence. Titles and versions are reproduced from sources, without fabricated approval dates or inaccessible references.

| Key | Source and location | Purpose / limitation |
|---|---|---|
| SRC-Q, SRC-S1 | [Sprint 1 Requirements Specification](requirements.md), `docs/requirements.md` on [sprint1](https://github.com/Tanaboonnnnn/CPE334-NutTiew/tree/sprint1); stakeholder decisions Q01-Q32 and numbered Sprint 1 catalog | Verified repository baseline from merged [PR #7](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/7). This is **not** the whole-product SRS or proof of final instructor approval. |
| SRC-GW-v1 | `group_work_specs_v1.pdf`, CPE 334 Group Work Specification, **Draft for instructor review**, issued **6 October 2026**, 15 pages; user-supplied `group_project_spec_files.zip` | Actual available theme/technical/course handout. Its final `group_work_specs.docx` replacement was **not verified**. |
| SRC-D1-v1 | `project_deliverable_1_v1.pdf`, CPE 334 Project Deliverable 1, due 8 November 2026 at 23:59, 8 pages; same supplied archive | Whole-product Part A requirements and downstream Parts B-F boundaries. |
| SRC-AGENT | [Repository AGENTS.md](https://github.com/Tanaboonnnnn/CPE334-NutTiew/blob/sprint1/AGENTS.md), incorporated by [PR #20](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/20) | Repository workflow, scope, verification and no-self-merge obligations, **not new stakeholder rules**. |
| SRC-ISSUE | [Issue #9: D1-01 Part A Whole-product SRS](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/9) | Assigned deliverable, allowed files and acceptance criteria. |
| SRC-REVIEW | [PR #7 review history](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/7) | Peer feedback and final correction request that §16.1 include `AC-S1-35`; independently reviewed S1 baseline. |
| Structural reference only | [SE-Project-God-of-Merchandise-Store](https://github.com/Tanaboonnnnn/SE-Project-God-of-Merchandise-Store) | Repository root listing was accessible, but no SRS file was available to inspect there. **No Store business rule, quotation or claimed SRS content is used**. |

**End of v0.1.0 draft.** This document can support independent engineering review. Formal sign-off remains subject to the final instructor Master/Theme confirmation, resolution of material open decisions and an actual reviewer decision.
