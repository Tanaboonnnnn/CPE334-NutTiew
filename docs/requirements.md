# CPE334 NutTiew — Sprint 1 Requirements Specification

> **Artifact:** Sprint 1 requirements baseline (requirements-only review)
> **Product:** Tutoring Appointment System — Theme 1: Appointment & Scheduling
> **Version:** 0.1.0 — 3 November 2026
> **Status:** **DRAFT — teammate review required; not merged, signed off, implemented or tested**
> **Repository workflow:** documentation branch → peer-reviewed PR → sprint1 staging → later reviewed release to main
> **Deadline context:** Project Deliverable 1, 8 November 2026, 23:59 Asia/Bangkok
> **Coverage boundary:** requirements for the Sprint 1 *working increment only*. This is **not** the instructor-required whole-product SRS for Parts A–D, nor a Feature SDS, UI/API contract, STS, completed test report or evidence of a release.

## 0. Document control and reading rules

| Attribute | Definition |
|---|---|
| Business baseline | Stakeholder decisions Q01–Q32, discovery closed 3 Nov 2026 |
| Sprint 1 decisions used directly | Q01–Q06, Q28–Q30 and the Tutor ownership/privacy constraints of Q02 |
| Later-sprint decisions used as scope guards only | Q07–Q27 and Q31–Q32; no cancellation, rescheduling, withdrawal or notification feature is implemented by this document |
| Instructor theme | Theme 1 — Appointment and Scheduling System |
| Source priority | Instructor-issued final Master Specification (must be verified) → explicit stakeholder Q01–Q32 decisions → documented approved engineering assumptions; reference repo is *format guidance*, never product authority |
| Primary reader | Partner/reviewer, project instructor/TA, implementers and testers |
| Approval semantics | A checked requirement/validation scenario means **specified or proposed**, never code complete, test passed, formally signed off or ready to merge |
| Implementation status | No implementation or automated test execution is asserted |
| Target branch | sprint1, **only after teammate approves the PR** |

**Source notes.** Requirements are synthesized from the agreed Tutoring Appointment System discovery log Q01–Q32 and the course documents **group_work_specs_v1.pdf** (theme 1, authentication, §§5–8) and **project_deliverable_1_v1.pdf** (Parts A–F). Both are local instructor handouts supplied for this project; the group specification available at drafting time says *Draft for instructor review*. Its latest authoritative master and the group's Theme 1 eligibility still require confirmation. The Campus Store reference repository guides **documentation rigor and structure**, not the tutoring product's business rules.

**Normative language.** "MUST" means an agreed Sprint 1 rule or course minimum; "MUST NOT" means a prohibited outcome; "SHOULD" denotes a proposed design/testing target requiring review; "TBD" means no stakeholder-approved policy exists. A later-sprint decision may constrain future compatibility without creating a Sprint 1 UI action or endpoint.

## 1. Stakeholder problem and product objective

A learner needs to find and reserve a private, one-to-one tutoring session during a Tutor's offered time. Each Tutor is responsible for publishing their own 60-minute appointment slots and checking the reservations made against them. Both roles must see the correct current schedule without exposing another Customer's private Booking or another Tutor's restricted schedule.

The primary failure to prevent is **double-booking**: two Customers reserving the *same exclusive Slot*, or one Customer reserving two different but overlapping lessons (even with different Tutors). Invalid, past, too-soon, or occupied Slots must be rejected, including when requests arrive concurrently. A successful Booking must be persisted and readable after refresh and application restart.

### 1.1 Sprint 1 value proposition

After Sprint 1, a demonstrator must be able to complete this real sequence:

1. An authorized Tutor logs in, creates a *single* future 60-minute Availability Slot for their own schedule, and sees that offer in their schedule.
2. An authorized Customer logs in, finds an eligible open Slot with a Tutor and time, requests a Booking, and receives a success result **only after persistence succeeds**.
3. The Customer retrieves their own persisted Booking (including after reloading); the Tutor retrieves the Booking in their own authorized schedule.
4. Attempting to reserve an occupied Slot, an invalid/past/too-soon Slot, or an overlapping appointment for the same Customer is refused without creating a false or conflicting Booking.
5. Unauthorized or anonymous requests cannot perform protected operations or read another Customer's or Tutor's private records.

**Demonstration constraint:** this is a working UI → application/API → database journey, not a static mockup, a mocked persistence-only demo, or just successful authentication.

### 1.2 Actors

| Actor | Business responsibility | Allowed Sprint 1 outcome | Explicit boundary |
|---|---|---|---|
| **Customer / Learner** | Finds and requests tutoring appointments | Log in/out, inspect eligible offers, create Booking, inspect **own** Bookings | Cannot create or administer Tutor Slots, inspect another Customer's Booking, or read restricted Tutor schedule details |
| **Tutor / Staff** | Offers tutoring time and inspects own reservations | Log in/out, create individual Slots on **own** schedule, inspect own Slots and Booking records | Cannot administer other Tutors' schedules; cannot initiate Customer rescheduling; no cancellation workflow in Sprint 1 |
| **Anonymous visitor** | Unauthenticated visitor | May reach the login interface; visibility of public availability is not assumed | Cannot book, mutate schedules, query private identity, or inspect protected Bookings |
| **Server/application** | Enforces business and security rules | Makes authoritative eligibility/authorization decisions and persists transactions | Must not trust user-supplied role, slot owner, system time or pre-validated booking availability |

Tutor and Staff name the **same business actor** (Q02), not two separately privileged staff classes. Seeded demo accounts may be used under the instructor brief; self-registration and password recovery are not required for this increment. For privacy and concurrency verification, test data should contain at least two distinct Customers and Tutors, without making that fixture count a business policy.

## 2. Scope, out-of-scope and approval gates

### 2.1 In scope: working Sprint 1

| Capability | Included | Course/team basis |
|---|---|---|
| Authentication, logout, current authenticated identity | **Yes** | Instructor §5.2 |
| Customer/Tutor roles, server-side authorization, private data isolation | **Yes** | Instructor §5.2 and Theme 1; Q02 |
| Create one dated 60-minute Slot on Tutor's own schedule | **Yes** | Instructor Theme 1; Q01–Q04 |
| Reject invalid/past Slots and same-Tutor offered-Slot overlaps | **Yes** | Instructor Theme 1; Q03, Q06, Q29, Q32 |
| Browse eligible availability with Tutor and session time | **Yes** | Instructor Theme 1; Q01, Q05 |
| Submit and persist one exclusive Booking | **Yes** | Instructor Theme 1; Q01, Q05 |
| Customer's own Booking list/detail and Tutor's own schedule Bookings | **Yes** | Instructor Theme 1 and privacy requirements; Q02 |
| Occupied Slot prevention under competing requests | **Yes** | Instructor Theme 1 |
| Same-Customer overlapping Active Bookings across Tutors | **Yes** | Additional agreed Q28 |
| Asia/Bangkok display and authoritative cutoff logic | **Yes** | Q05, Q29 |
| Booked / Past semantics without assuming attendance | **Yes** | Q30 |
| Local setup, real persistence, relevant automated/negative/race tests | **Yes, as delivery verification** | Instructor §§5,8 / Deliverable 1 Parts E–F |

### 2.2 Not implemented in Sprint 1

- **Customer Cancellation and reopen (Q07–Q08), Customer Rescheduling (Q09–Q16):** planned for a later increment. No cancellation/reschedule action or business transition is implied now.
- **Tutor Cancellation, mandatory reason, withdrawn Slot, in-app notice (Q17–Q27, Q32):** later increment. Sprint 1 may use lifecycle-compatible identifiers but must not claim those workflows are functional.
- **Tutor Appointment Summary and reporting (Q31):** later increment. Viewing one's schedule Bookings in Sprint 1 is *not* equivalent to a counts-and-categories reporting dashboard.
- **Changing/removing a Slot, bulk/recurring Slot generation, slot reactivation:** no Sprint 1 editing, deletion or withdrawal UI. Q04 rejects automatic recurrence; Q26/Q27/Q32 reserve later behavior.
- **Attendance, No-show and automatic Completed:** not approved by Q30; elapsed time is not a completion confirmation.
- **Payment, messaging, reminders, calendar synchronization, meeting room/link, self-registration, account recovery, exports, advanced filters:** neither agreed nor required by the Sprint 1 example.
- **Production Docker/CI/CD/GCP release:** instructor assigns these through Lab 5; Sprint 1 design must allow them, but do not claim deployed infrastructure at Deliverable 1.

**Course-deliverable caveat:** although **this file** is restricted to Sprint 1 requirements, Deliverable 1 also requires a **whole-product** SRS, feature inventory/traceability, system-level SDS, and three-sprint plan (Parts A–D), followed by versioned Sprint 1 feature contracts (Part E) and tested software (Part F). This file alone does **not** discharge those other obligations. The extra artifacts should be created in separately reviewed work, not smuggled into this requirements-only PR.

### 2.3 Open constraints (do not fill with invented limits)

| ID | Unresolved issue | Present Sprint 1 treatment | Approval gate |
|---|---|---|---|
| **TBD-S1-01** | Tutor working hours, allowed weekdays/holidays and calendar boundaries | Enforce only confirmed future/valid start and 60-minute duration; **no 09:00–17:00 policy** is invented | Review and document before final AC/STS |
| **TBD-S1-02** | Maximum advance scheduling/booking horizon | Do not assert a 7/14/30-day limit unless approved | Review and document before final AC/STS |
| **TBD-S1-03** | Permissible start-minute increments (e.g., hourly-only, quarter-hour) | Do not invent a mandatory minute grid; Q03 specifies **duration**, not start cadence | Review and document before final AC/STS |
| **TBD-S1-04** | Tutor/customer-visible field set, display ordering and result pagination | The required essential appointment identity/time/status is clear; exact personal fields, ordering and pagination remain feature-contract decisions | Review UI/API contracts before feature code |
| **TBD-S1-05** | Error-response schema, API transport, database technology, lock strategy and session mechanism | Engineering design choices; this document specifies outcomes/invariants, not stack or endpoint syntax | System SDS / Feature SDS review |
| **TBD-S1-06** | Exact measurable performance/UX thresholds | Section 7 provides **proposed** NFR targets; not an approved business promise | Team acceptance in planning/contracts |
| **TBD-S1-07** | Instructor's final Master Specification and eligibility to use Theme 1 | Available group brief is a draft; check actual assigned theme/final handout | Before final SRS sign-off and release claim |

None of these open decisions authorizes a later-sprint feature or an unreviewed implementation assumption.

## 3. Business vocabulary and temporal semantics

| Term | Operational meaning in Sprint 1 | Not to be confused with |
|---|---|---|
| **Availability Slot** | An individual, dated, 60-minute offer belonging to exactly one Tutor | A recurring calendar template or a Booking |
| **Offered Slot** | Tutor's current offer, potentially unoccupied or occupied | A withdrawn historical Slot (Q32 later) |
| **Bookable Slot** | Offered, unoccupied and currently eligible for new Booking under all applicable rules | Merely existing in storage; an unoccupied Slot inside Q05 cutoff is not bookable |
| **Booking** | One Customer's reservation of an exclusive Slot for one-to-one tutoring | Slot itself; cancelling Booking later need not erase Slot |
| **Active Booking** | Booking that still holds its exclusive reservation; not cancelled or released | Booking whose lesson is physically underway; an elapsed Booking may still be Active |
| **Booked** | Confirmed reservation state after successful Booking | Completed lesson or verified attendance |
| **Past** | Display classification once the Appointment's **end** has elapsed in Asia/Bangkok | An additional state, automatically Completed or Cancelled |
| **Tutor Schedule** | Tutor's own collection of Slots and associated Bookings | Global private bookings of all Tutors |
| **Appointment** | Scheduled 1:1 tutoring interval (Customer + Tutor + Slot) | Proof tutoring actually took place |
| **Booking time** | Server's authoritative receipt/decision time for enforcing Q05 | Client browser clock or a time in an arbitrary timezone |

**Time intervals:** use half-open intervals **[start, end)** when discussing overlap. Two intervals overlap when **startA < endB and startB < endA**. A Slot ending at 14:00 and the next starting at 14:00 are adjacent, not overlapping. Every Slot's end is exactly 60 minutes after its start (Q03). Appointment dates/times shown to Tutor/Customer use **Asia/Bangkok (UTC+07:00)**, independently of the viewer's browser timezone (Q29).

**Lead time:** at the instant the backend decides a Booking request, **SlotStart − ServerNow ≥ 60 minutes**. Exactly 60:00 passes; 59:59 fails. Do not apply the 60-minute *Booking* lead time automatically to Tutor's Slot-creation request; only valid/future Slot creation is confirmed so far.

**State semantics:** a successful new Booking begins in **Booked**. The product also has a later **Cancelled** state per Q30, but Sprint 1 does not implement cancellation. Crossing a Slot's end-time does not transition Booked to another business state, release an Active Booking, or constitute lesson attendance. A Booking must not be presented as Completed. For possible later cancellation, withdrawn Slots will be historical non-bookable records; their overlap is ignored for new offered Slots (Q32), but withdrawal is **not a Sprint 1 action**.

## 4. Role and permission matrix

Legend: **Allow** = within agreed Sprint 1 capability, subject to ownership/eligibility. **Deny** = forbidden. **Not in S1** = behavior intentionally unimplemented, not an implicit denial of later product requirements.

| Operation / protected resource | Anonymous | Customer | Tutor (Staff) |
|---|:---:|:---:|:---:|
| Log in with valid credentials | Allow | Allow | Allow |
| Query own current identity | Deny | Allow | Allow |
| Log out own authenticated session | — | Allow | Allow |
| Create Availability Slot | Deny | Deny | **Allow: own schedule only** |
| View own Tutor schedule/Slots | Deny | Deny | **Allow: own schedule only** |
| View eligible customer-facing offered Slots | Unspecified public policy; not required | Allow | Not required as Customer flow |
| Reserve an eligible Slot | Deny | **Allow: own Customer identity only** | Deny |
| Retrieve Customer's own Booking detail/list | Deny | **Allow: own** | Not a general cross-Customer search |
| Retrieve Booking(s) on Tutor's own schedule | Deny | Deny | **Allow: own Tutor schedule** |
| Retrieve another Customer's private Booking outside authorized role/schedule | Deny | Deny | Deny |
| Manage another Tutor's schedule | Deny | Deny | Deny |
| Cancel, reschedule, edit or withdraw Slots/Bookings | Not in S1 | Not in S1 | Not in S1 |
| Tutor-only Appointment Summary | Not in S1 | Not in S1 | Not in S1 |

Authorization must be enforced in the **backend** on each protected action. A hidden UI button, disabled form or user-supplied Tutor ID is not proof of authorization.

## 5. Functional requirements (FR) — Sprint 1 only

Functional requirements are observable capabilities. All entries below are **required Sprint 1 behavior** derived from the instructor's minimum example or agreed Q01–Q06/Q28–Q30. IDs remain stable across later Feature SDS and test contracts.

| ID | Normative requirement | Source | Responsible Sprint 1 feature |
|---|---|---|---|
| **FR-S1-01** | The system **MUST** authenticate an existing Customer or Tutor with valid credentials and reject invalid credentials without opening an authenticated session. | Instructor §5.2 | F-S1-01 Identity and access |
| **FR-S1-02** | The system **MUST** return the currently authenticated user's own identity and effective role; anonymous callers **MUST NOT** receive protected identity data. | Instructor §5.2 | F-S1-01 |
| **FR-S1-03** | The system **MUST** provide logout and prevent reuse of a logged-out user's prior authenticated access according to the documented session/token lifecycle. | Instructor §5.2 | F-S1-01 |
| **FR-S1-04** | Protected Booking and Tutor schedule operations **MUST** enforce authentication and the role/record permissions in §4 on the server, not merely in the UI. | Instructor Theme 1; Q02 | F-S1-01; all domain features |
| **FR-S1-05** | An authorized Tutor **MUST** be able to create one explicitly dated, future, 60-minute Availability Slot for their **own** schedule by supplying the proposed start date/time; it **MUST** persist if valid. | Theme 1; Q02–Q04 | F-S1-02 Tutor availability |
| **FR-S1-06** | The system **MUST** reject an invalid/past Slot or a proposed offered Slot that overlaps any current offered Slot of the **same Tutor**, without modifying the existing schedule. | Theme 1; Q03/Q06/Q29 | F-S1-02 |
| **FR-S1-07** | A Tutor **MUST** be able to view the Slots belonging to their own authorized schedule, including whether each offered Slot is still unoccupied or has an Active Booking. | Theme 1; Q02 | F-S1-02; F-S1-05 Staff schedule |
| **FR-S1-08** | An authenticated Customer **MUST** be able to browse currently offered tutoring availability with enough Tutor and start/end-time information to choose a specific Slot; other Customers' private Booking details **MUST NOT** be exposed. | Theme 1; Q01/Q02/Q05 | F-S1-03 Availability discovery |
| **FR-S1-09** | Availability shown as **bookable** **MUST** satisfy current offer, non-occupancy, future time, Q05 lead time and applicable eligibility rules; presentation alone is not an authoritative reservation guarantee. | Theme 1; Q05/Q06 | F-S1-03 |
| **FR-S1-10** | An authenticated Customer **MUST** be able to request a Booking of one selected, eligible, exclusive Slot **for their own identity**, producing a persisted Booking associated with the selected Tutor, Slot and Customer only upon success. | Theme 1; Q01/Q05 | F-S1-04 Booking |
| **FR-S1-11** | The Booking operation **MUST** revalidate all applicable rules **at submission time**, rejecting already occupied, invalid, too-soon and conflicting requests even if the Customer previously saw the Slot as available. | Theme 1; Q05/Q06/Q28 | F-S1-04 |
| **FR-S1-12** | The Booking operation **MUST** prevent two concurrent successful Active Bookings claiming the **same exclusive Slot**, with no second committed claim or false success. | Theme 1 concurrent-booking minimum | F-S1-04 |
| **FR-S1-13** | The Booking operation **MUST** prevent the **same Customer** from committing overlapping Active Bookings, including different Tutors, under sequential or concurrent requests. | Q28 | F-S1-04 |
| **FR-S1-14** | The Customer **MUST** be able to retrieve a list of their own persisted Bookings and open an individual Booking detail displaying Booking identity, relevant Tutor, Slot times and business state. | Theme 1; Q02/Q30 | F-S1-05 Protected retrieval |
| **FR-S1-15** | A Tutor **MUST** be able to inspect Bookings assigned to the Tutor's currently authorized schedule, and **MUST NOT** gain a view of another Tutor's restricted Booking/schedule records. | Theme 1; Q02 | F-S1-05 |
| **FR-S1-16** | The Customer's Booking list/detail and the Tutor's authorized view **MUST** reflect committed, persisted data when reopened/refreshed; responses **MUST NOT** claim a Booking exists until its transaction has committed. | Theme 1; instructor persistence expectation | F-S1-04; F-S1-05 |
| **FR-S1-17** | Booking/schedule views **MUST** distinguish **Booked** from an elapsed-time **Past** display classification; Past **MUST NOT** assert Completed, attendance, auto-cancellation or automatic release of a Slot. | Q30 | F-S1-05 |
| **FR-S1-18** | The system **MUST** communicate a failed validation/conflict/unauthorized operation without displaying a successful Booking or revealing other users' protected information; a failed operation **MUST NOT** cause partial schedule/Booking changes. | Theme 1; Q02/Q05/Q06/Q28 | F-S1-01/02/04/05 |
| **FR-S1-19** | Authentication, schedule, booking and retrieval **MUST** be connected to real persistent application data through the Sprint 1 UI → API/application → database flow rather than a mocked-only stub. | Instructor Deliverable 1 Parts E–F | F-S1-01..05 |

### 5.1 Feature responsibility boundaries

| Feature ID | User-visible vertical slice | FR coverage | Review dependency |
|---|---|---|---|
| **F-S1-01** | Login, current identity, logout and role/record access checks | 01–04, 18–19 | Approved auth/security Feature SDS |
| **F-S1-02** | Tutor publishes own valid Slot and checks its offered/occupied status | 05–07, 18–19 | F-S1-01; Slot contract and eligibility rules |
| **F-S1-03** | Customer discovers eligible, selectable Tutor Slots | 08–09, 18–19 | F-S1-02; availability view contract |
| **F-S1-04** | Customer reserves exactly one eligible Slot with safe conflict handling | 10–13, 16, 18–19 | F-S1-01/02/03; Booking data/transaction contract |
| **F-S1-05** | Customer reads own Bookings; Tutor reads authorized schedule Bookings | 07, 14–17, 19 | F-S1-01/04; authorization/privacy contract |

Feature IDs describe **responsibility** here; the detailed feature UI/API/data/STS contracts are **not** included in this requirements-only document and must be versioned for review **before** implementation.

## 6. Business rules (BR) — enforce on the server

Business rules are invariants or authorization/lifecycle constraints across all screens and write paths. They are not merely button-disable conditions. A rejected attempt must preserve committed state.

| ID | Normative Sprint 1 rule | Decision / instructor source | Related FR |
|---|---|---|---|
| **BR-S1-01** | Exactly **one Customer** and **one Tutor** participate in an Appointment; one Booking occupies one exclusive Slot. Group tutoring is excluded. | Q01 | 08–10 |
| **BR-S1-02** | Every Availability Slot's **duration is 60 minutes**, neither shorter nor longer. | Q03 | 05–06 |
| **BR-S1-03** | The authorized Tutor must explicitly create each dated Slot as a separate offer; Sprint 1 has no automatic recurrence or bulk generation. | Q04 | 05 |
| **BR-S1-04** | A Tutor (Staff) may create/manage offered Slots **only for their own authorized Tutor Schedule**. Customer and another Tutor have no such write right. | Q02 | 04–07 |
| **BR-S1-05** | Two **currently offered** Slots of the **same Tutor** may not overlap, whether either is booked or not. Positive-duration overlap is forbidden; touching boundaries are permitted. | Q06 | 05–07 |
| **BR-S1-06** | Distinct Tutors may offer the same time; the same-Tutor non-overlap rule is not a global restriction on everyone. | Q06 | 05–08 |
| **BR-S1-07** | A new Booking is eligible only when the selected offered Slot is unoccupied, valid and begins **at least 60 minutes** after the authoritative server decision time. Exactly 60:00 is eligible; anything less is not. | Q05 | 08–11 |
| **BR-S1-08** | A single exclusive Slot may have **at most one Active Booking** at a time, including across concurrent requests. | Q01; Theme 1 minimum | 10–12 |
| **BR-S1-09** | One Customer may not hold **overlapping Active Bookings** with any Tutors, including appointments with different Tutor owners. | Q28 | 10–13 |
| **BR-S1-10** | Two Bookings for one Customer with **adjacent** [start, end) intervals do not overlap; adjacency alone is not a reason to reject. | Q28 | 10–13 |
| **BR-S1-11** | A Slot with a start in the past (or one not in the future) is invalid for new offering/booking. Attempted creation/booking with invalid date/time must be rejected. No additional working-hour/horizon/minute-grid rule is silently assumed. | Theme 1 invalid/past; Q29; TBD-01/02 | 05–06, 11 |
| **BR-S1-12** | Slot time, Appointment time, displayed calendar day, and cutoff comparisons share **Asia/Bangkok (UTC+07:00)** business semantics. The user's device timezone does not change the intended tutoring hour. | Q29 | 05–11, 14–17 |
| **BR-S1-13** | Booking eligibility and authorization must be **rechecked at commit time** rather than relying on a stale availability list or client-side validation. | Theme 1 conflict minimum; Q05/Q06/Q28 | 09–13 |
| **BR-S1-14** | A successful Sprint 1 new Booking begins with business status **Booked**. After its scheduled end, **Past** is a derived display label only; it does not mean Completed or attended and does not automatically change business status. | Q30 | 10, 14, 17 |
| **BR-S1-15** | A Customer may read only their **own** private Booking details/list; another Customer's Booking must not be disclosed through IDs, list filters or direct URLs. | Q02; Theme 1 access | 04, 14 |
| **BR-S1-16** | A Tutor may inspect only Bookings attached to the Tutor's **authorized schedule**, and cannot use arbitrary Tutor/schedule identifiers to inspect another Tutor's protected records. | Q02; Theme 1 access | 04, 07, 15 |
| **BR-S1-17** | Anonymous booking and private-record access are forbidden; Customers cannot perform Tutor Slot-management operations; Tutors cannot book as Customers via Staff-only authority. | Theme 1; instructor §5.2 | 01–04, 18 |
| **BR-S1-18** | Failing booking validations, losing concurrent claims, write failure or denied authorization must **not commit a partial Booking**, claim another Slot or falsely report a successful reservation. | Theme 1 conflict; integrity implication | 10–13, 16, 18 |
| **BR-S1-19** | Under competing submissions for the **same Slot**, no more than one claimant succeeds. Under competing submissions for **overlapping Slots by the same Customer**, no more than one overlapping outcome may remain committed. | Theme 1 minimum; Q28 extension | 12–13 |
| **BR-S1-20** | The application's authoritative session identity determines Customer/Tutor ownership; role and owner fields submitted by clients cannot grant permission or create a Booking under someone else's identity. | Instructor authentication/access; Q02 | 04, 10–16 |
| **BR-S1-21** | Booked, offered and occupied descriptions must be consistent with persisted server data. Displaying a previously offered Slot does not create a reservation or override revalidation. | Q01/Q05/Q06; domain integrity | 07–09, 16–18 |
| **BR-S1-22** | Neither an elapsed appointment nor a UI navigation event is evidence of tutoring completion. No background transition to Completed or automatic occupancy release is authorized by Sprint 1. | Q30 | 14, 17 |

### 6.1 Invariants and collision examples

**I-S1-01 — Exclusive Slot:** for any Slot S, the number of simultaneously committed **Active Bookings** assigned to S is at most one. Sequential repeated requests and truly concurrent Customer requests must satisfy the same invariant.

**I-S1-02 — Tutor's current offers:** for one Tutor, there cannot exist two *concurrently offered* Slots with intersecting intervals. This is independent of whether each Slot currently has a Booking. Different Tutors may offer identical periods. Withdrawn history does not count as a current offered Slot **if introduced in later sprints** (Q32).

**I-S1-03 — Customer's active schedule:** for one Customer, no two committed **Active Bookings** may have positive-duration overlap, even when the Slots' Tutors differ. Two appointments 13:00–14:00 and 14:00–15:00 are permitted by this overlap rule (other eligibility rules must still pass).

**I-S1-04 — Eligibility before commitment:** an apparently free Slot is not bookable if its start is fewer than 60 minutes away at authoritative processing time. A stale UI availability result cannot override this; an attempt may be declined after the user selected it.

**I-S1-05 — Atomic outcome:** every accepted booking has one persisted Booking and occupied Slot; a rejected booking changes none of the affected Booking/Slot occupancy relationships. Which DB constraint, lock or isolation strategy realizes this outcome belongs in the System/Feature SDS, not in the stakeholder requirement.

**Examples for review:**

| Situation | Expected rule outcome | Primary IDs |
|---|---|---|
| Tutor A offers 13:00–14:00, then attempts 13:30–14:30 | Reject second current offer | BR-05 |
| Tutor A offers 13:00–14:00, then 14:00–15:00 | Allow if valid otherwise | BR-05 |
| Tutors A and B both offer 13:00–14:00 | Allowed; different Tutor schedules | BR-06 |
| Customer X holds Tutor A 13:00–14:00; wants Tutor B 13:30–14:30 | Reject as same-Customer overlapping Active Booking | BR-09 |
| Customer X holds 13:00–14:00; wants 14:00–15:00 | Overlap rule allows; Q05 and others still apply | BR-10 |
| Two Customers simultaneously claim Tutor A's same exclusive Slot | At most one committed Booking | BR-08/19 |
| Customer X submits simultaneously for two distinct overlapping Tutors' Slots | No two overlapping bookings may both commit | BR-09/19 |
| Slot 15:00, request at 14:00:00 Bangkok time | Exactly 60 minutes — eligible if otherwise valid | BR-07/12 |
| Slot 15:00, request at 14:00:01 Bangkok time | 59m59s — reject | BR-07/12 |
| Booked lesson 13:00–14:00; now 15:00 | May display Past; status still Booked, not Completed | BR-14/22 |

## 7. Non-functional requirements (NFR) and acceptance targets

NFRs describe quality constraints and *how they will be verified*. Course-mandated security, persistence, access control and reproducibility are requirements. Where a numeric threshold or test-run size was **not** set by the stakeholder/instructor, it is labeled a **proposed engineering acceptance target**, subject to team review before a feature contract is frozen. The proposal is not an additional Q33 decision.

| ID | Target / verifiable method | Status | S1 feature/owner |
|---|---|---|---|
| **NFR-S1-01** | **Access isolation:** every identified unauthenticated, forbidden-role, foreign-Customer and foreign-Tutor API case must be denied **without protected payload disclosure**. Verify with automated API integration tests and distinct seeded users. | Instructor-required outcome | F-S1-01/02/04/05 |
| **NFR-S1-02** | **Credential protection:** if app-managed passwords are used, store salted/adaptively hashed representations rather than plaintext; no real secret/password in tracked files. Verify with test DB inspection and Git secret/config review. | Instructor-required outcome | F-S1-01 |
| **NFR-S1-03** | **Persistent correctness:** after a successful Slot and Booking creation, authorized views must return the same committed records following page refresh and app process restart against the same persistent DB. Verify via API/DB and selected UI tests. | Instructor-required outcome | F-S1-02/04/05 |
| **NFR-S1-04** | **Exclusive-booking race safety:** in a **proposed** burst of 20 simultaneous competing attempts to book one exclusive Slot, committed success count must be ≤1 and no partial records appear. Use a real transaction-capable test DB, not mocks only. | Business outcome required; run size proposed | F-S1-04 |
| **NFR-S1-05** | **Same-Customer race safety:** in a **proposed** test of 10 simultaneous attempts by the same Customer to book distinct overlapping eligible Slots, no two overlapping Active Bookings can coexist. | Q28 outcome required; run size proposed | F-S1-04 |
| **NFR-S1-06** | **Time-boundary correctness:** verify accepted and denied Q05 cases at **exactly 60:00** and immediately below, with authoritative server time, including when the browser's timezone differs. Test Tutor invalid/past Slot validation. | Q05/Q29 required; method proposed | F-S1-02/03/04 |
| **NFR-S1-07** | **Reproducible verification:** document setup/configuration, seed users, migration/data setup, commands to run app/build/tests, exact source SHA and pass/fail/skip counts. Do not claim success absent executed evidence. | Instructor-required evidence | Cross-cutting |
| **NFR-S1-08** | **No secret leakage:** credentials, tokens, internal stack traces and another person's protected Booking details must not appear in user-visible error responses; review tested error cases, logs and public client artifacts. | Security outcome required; inspection proposed | Cross-cutting |
| **NFR-S1-09** | **Usability (proposal):** a user can complete login, availability navigation, booking and viewing results with a keyboard and visible focus indication on primary controls; verify with a recorded manual checklist. | Proposed threshold; approval required | F-S1-01/03/04/05 |
| **NFR-S1-10** | **Responsiveness (proposal):** p95 for local seeded GET availability and authorized Booking detail ≤2.0 seconds, measured over at least 50 requests each after warm-up; record machine, database and methodology. | Proposed threshold; approval required | F-S1-03/05 |
| **NFR-S1-11** | **Failure consistency:** an injected persistence failure during Slot/Booking creation must leave no false confirmed result or inconsistent occupied state; verify with DB integration/fault-injection tests and inspect data afterward. | Integrity outcome required; method proposed | F-S1-02/04 |
| **NFR-S1-12** | **Traceable change and review:** document stable FR/BR/NFR IDs, source decisions, planned scenarios and reviewed PR links before corresponding feature implementation; submitted evidence identifies the accepted commit. | Instructor workflow requirement | Cross-cutting |

**Do not confuse:** "planned to test" with "test passed"; "test passed" with "peer-reviewed/accepted"; or "current draft" with "complete Deliverable 1". No results are asserted in this file.

## 8. Sprint 1 user journeys and exception flows

### J-S1-01 — Tutor publishes a valid Slot

**Preconditions:** Tutor is authenticated; the Tutor has an authorized schedule; proposed start is in the future and no current offered Slot of the same Tutor overlaps it. Exact hours/day/horizon/minute-grid policies remain TBD.

1. Tutor opens their own schedule and requests creation of one Slot at the chosen Bangkok date/start.
2. Backend identifies the Tutor from the session, constructs/checks a 60-minute interval, and validates time and no same-Tutor offered overlap.
3. On success, persist exactly one offered Slot attached to that Tutor and return a recognizable successful result.
4. Tutor reopens the schedule and sees the persisted Slot and occupancy information.

**Postcondition:** a new current offered Slot exists for that Tutor and is not occupied by a Booking. **Failure:** invalid/overlapping time or unauthorized actor yields no new Slot and does not alter previously offered Slots.

### J-S1-02 — Customer discovers and books an exclusive lesson

**Preconditions:** Customer is authenticated; an unoccupied offered Slot is eligible; Customer has no overlapping Active Booking for the intended interval.

1. Customer views eligible Tutor offers with Bangkok start/end.
2. Customer selects a Tutor's Slot and requests a Booking under their authenticated identity.
3. Server rechecks the exact Slot, Q05 lead time, occupancy, Customer overlap and permission against current persistent state.
4. On success, the app returns the persisted Booking reference and state **Booked**.
5. Customer opens their own Booking list/detail; Tutor opens their own schedule and sees its newly booked interval.

**Postcondition:** one Booked record exists, associated with exactly that Customer/Tutor/Slot. **Failure:** all persisted state is unchanged for that attempt and the user receives an appropriate non-sensitive failure indication.

### J-S1-03 — Competing Customers claim the same Slot

**Preconditions:** one offered, eligible exclusive Slot; Customer A and B authenticated independently.

1. A and B submit Booking attempts for the same Slot nearly simultaneously.
2. Backend transaction/conflict controls arbitrate the claim against current state.
3. At most one request commits a Booked result; the other receives a conflict/denied outcome without a second committed Booking.
4. Authoritative views show one occupied Slot and one owning Customer; no duplicate active ownership.

**Pass condition:** final database state satisfies I-S1-01, independent of interleaving or UI timing.

### J-S1-04 — One Customer attempts overlapping Tutors

**Preconditions:** Tutor A and B have separate eligible offers 13:00–14:00 and 13:30–14:30; Customer C is authenticated.

1. C books the first offer successfully.
2. C requests the second offer.
3. Backend detects the overlap using the Customer's **committed Active Bookings** and denies the second.
4. Under concurrent attempts, both may not commit if their intervals overlap.

**Pass condition:** final database state satisfies I-S1-03 and a denied attempt does not occupy its target Slot for C.

### J-S1-05 — Authorized and unauthorized Booking reads

**Preconditions:** Customer A has a Booking with Tutor T; Customer B and Tutor U exist.

1. A requests their own list/detail and sees correct persisted information.
2. B tries A's known Booking identifier; private content is not disclosed.
3. T inspects authorized schedule bookings and sees the Booking.
4. Tutor U tries T's protected schedule/Booking through crafted parameters; access is denied or the record is not disclosed.
5. Anonymous requests to protected resources reveal no private content.

**Pass condition:** no hidden UI assumption is required; backend access checks determine every result.

## 9. Proposed validation scenarios and planned test anchors

These are **requirements-level validation examples**, not an executed Software Test Specification. IDs are intentionally stable for future Feature SDS, AC, test cases and release evidence. Each row describes a concrete precondition, action and expected outcome; the implementation/test author later supplies exact endpoint shapes, fixture steps and measured results.

### 9.1 Authentication, role and identity

| Validation ID / future test anchor | Given → When | Required outcome | Requirements |
|---|---|---|---|
| **VC-S1-01 / TEST-S1-01** | Existing Customer and Tutor demo credentials → each logs in | Correct own identity/role; no cross-role grant | FR-01/02, BR-20 |
| **VC-S1-02 / TEST-S1-02** | Invalid password → login attempt | Authentication refused; no valid session/identity exposed | FR-01, NFR-01 |
| **VC-S1-03 / TEST-S1-03** | Logged-in user → current identity query | Authenticated user's own ID and role, not arbitrary submitted identity | FR-02, BR-20 |
| **VC-S1-04 / TEST-S1-04** | Logged-in user → logout → reuse prior access | Protected access rejected according to chosen session lifecycle | FR-03, NFR-01 |
| **VC-S1-05 / TEST-S1-05** | Anonymous caller → private Booking / create Slot / book | All protected actions denied without protected data | FR-04, BR-17, NFR-01 |
| **VC-S1-06 / TEST-S1-06** | Customer → attempts Tutor-only create action | Rejected by backend, even when request is crafted manually | FR-04/05, BR-04/17 |
| **VC-S1-07 / TEST-S1-07** | Tutor A → attempts to create/view private schedule of Tutor B | Access rejected or B's records absent; A's own schedule unaffected | FR-04/05/07, BR-04/16 |

### 9.2 Tutor availability

| Validation ID / future test anchor | Given → When | Required outcome | Requirements |
|---|---|---|---|
| **VC-S1-08 / TEST-S1-08** | Authorized Tutor; future date → create one Slot | Exactly one offered 60-minute Slot persisted under that Tutor | FR-05, BR-02/03/04 |
| **VC-S1-09 / TEST-S1-09** | Tutor's offered Slot 13:00–14:00 → create 13:30–14:30 | Reject overlap; old Slot unchanged, no duplicate offer | FR-06, BR-05 |
| **VC-S1-10 / TEST-S1-10** | Tutor's offered Slot 13:00–14:00 → create 14:00–15:00 | Overlap rule permits adjacency; other validity checks remain | FR-06, BR-05 |
| **VC-S1-11 / TEST-S1-11** | Tutor A offers 13:00–14:00 → Tutor B creates same time | Allowed as distinct Tutor offer if valid | BR-06 |
| **VC-S1-12 / TEST-S1-12** | Proposed Slot starts in the past/invalid → Tutor submits | Reject with no stored Slot or collateral mutation | FR-06, BR-11 |
| **VC-S1-13 / TEST-S1-13** | Time shown by browser in another timezone → create/check Bangkok Slot | Tutor and Customer see same intended Bangkok appointment time | BR-12, NFR-06 |
| **VC-S1-14 / TEST-S1-14** | Tutor owns offered Slot → opens schedule after refresh | Exact Slot and correct offered/occupied state still visible | FR-07/16, NFR-03 |

### 9.3 Availability and booking validation

| Validation ID / future test anchor | Given → When | Required outcome | Requirements |
|---|---|---|---|
| **VC-S1-15 / TEST-S1-15** | Customer logged in; eligible future offered Slot → browse | Tutor and time identifiable; no other Customer's private details exposed | FR-08/09, NFR-01 |
| **VC-S1-16 / TEST-S1-16** | Eligible unoccupied Slot → Customer requests Booking | One persisted Booking, state Booked, own Customer and selected Tutor/Slot | FR-10, BR-01/07/08 |
| **VC-S1-17 / TEST-S1-17** | Slot at 15:00, authoritative request at 14:00:00 | Exactly 60-minute Q05 lead time **passes** if otherwise valid | FR-11, BR-07 |
| **VC-S1-18 / TEST-S1-18** | Slot at 15:00, authoritative request at 14:00:01 | Q05 lead time **fails**; no Booking/occupation | FR-11, BR-07 |
| **VC-S1-19 / TEST-S1-19** | Offered Slot already occupied → another Customer books it | Reject; previous Booking preserved and only one active claim remains | FR-11/12, BR-08 |
| **VC-S1-20 / TEST-S1-20** | Customer holds 13:00–14:00 Tutor A → books 13:30–14:30 Tutor B | Reject cross-Tutor Customer overlap with no second Booking | FR-13, BR-09 |
| **VC-S1-21 / TEST-S1-21** | Customer holds 13:00–14:00 → requests 14:00–15:00 | Customer-overlap check permits adjacent interval, subject to lead time | FR-13, BR-10 |
| **VC-S1-22 / TEST-S1-22** | Selected Slot was eligible at browse but is taken/too soon by submission | Backend rejects stale selection; no false success | FR-09/11, BR-13/21 |
| **VC-S1-23 / TEST-S1-23** | Invalid/missing/past Slot or unauthorized actor → booking attempt | Reject without claimed Slot or private data disclosure | FR-11/18, BR-11/17/18 |
| **VC-S1-24 / TEST-S1-24** | Customer alters client-supplied user/Tutor ownership IDs | Persist Booking only for authenticated Customer and actual Slot Tutor, or reject | FR-04/10, BR-20 |

### 9.4 Concurrency, data integrity, and protected reads

| Validation ID / future test anchor | Given → When | Required outcome | Requirements |
|---|---|---|---|
| **VC-S1-25 / TEST-S1-25** | Two distinct Customers submit concurrently for same eligible exclusive Slot | **At most one** committed Active Booking; other gets non-success; DB invariant holds | FR-12, BR-08/19, NFR-04 |
| **VC-S1-26 / TEST-S1-26** | One Customer submits concurrently for distinct overlapping eligible Slots of two Tutors | **No two overlapping** Active Bookings commit; no partial losing claim | FR-13, BR-09/19, NFR-05 |
| **VC-S1-27 / TEST-S1-27** | Persistence failure injected before Booking transaction finishes | No false success, no committed Booking or partial occupied Slot | FR-16/18, BR-18, NFR-11 |
| **VC-S1-28 / TEST-S1-28** | Customer creates successful Booking → refresh/restart app with same DB | Own Booking and identity/time/state retrievable unchanged | FR-14/16, NFR-03 |
| **VC-S1-29 / TEST-S1-29** | Customer B knows Customer A's Booking ID → tries detail/list | Private Booking content not revealed | FR-04/14, BR-15, NFR-01 |
| **VC-S1-30 / TEST-S1-30** | Tutor A → inspect own schedule with Booking | Correct assigned Booking visible without exposing another Tutor's protected records | FR-15, BR-16 |
| **VC-S1-31 / TEST-S1-31** | Tutor B knows Tutor A's schedule/Booking identifiers → read attempt | Access denied/filtered; Tutor A records remain private | FR-04/15, BR-16, NFR-01 |
| **VC-S1-32 / TEST-S1-32** | Booking interval fully elapsed, no cancellation → open Booking | Business state remains Booked; may show Past; never Completed or assumed attended | FR-17, BR-14/22 |
| **VC-S1-33 / TEST-S1-33** | User submits failed/invalid request → reopen respective views | No new phantom Booking, no changed Slot occupancy from failed attempt | FR-18, BR-18/21 |
| **VC-S1-34 / TEST-S1-34** | Real app boot and seed setup → complete J-S1-01 then J-S1-02 through UI and DB | Full verified workflow, repeatable commands and actual test results recorded later | FR-19, NFR-03/07 |
| **VC-S1-35 / TEST-S1-35** | Test invalid access and inspect tracked env/config | No plaintext stored passwords/secrets and no private-data leaks | NFR-01/02/08 |
| **VC-S1-36 / TEST-S1-36** | Benchmark local availability/details and keyboard-only walk-through | Record measurements/checklist; compare with **proposed**, not approved, UX/performance targets | NFR-09/10 |

**Verification scope note:** TEST-S1-01..36 are **planned labels**, not existing test files, completed Part E STS or recorded pass results. In particular VC-S1-25 (same Slot race) and VC-S1-26 (same Customer, different overlapping Slots) are distinct and must not be conflated.

## 10. Requirements traceability (within this requirements-only artifact)

The matrices below link requirements to their proposed delivery owner and validation scenario so another reviewer can detect uncovered rules. They are **Sprint 1 slices** of the eventual whole-product Feature Inventory/Traceability (Deliverable 1 Part B), not its replacement.

### 10.1 Functional requirements → feature → planned verification

| Requirement | Owner feature(s) | Planned verification anchor |
|---|---|---|
| FR-S1-01 | F-S1-01 | VC-01, VC-02 |
| FR-S1-02 | F-S1-01 | VC-01, VC-03, VC-05 |
| FR-S1-03 | F-S1-01 | VC-04 |
| FR-S1-04 | F-S1-01..05 | VC-05–07, VC-24, VC-29, VC-31 |
| FR-S1-05 | F-S1-02 | VC-08, VC-11 |
| FR-S1-06 | F-S1-02 | VC-09, VC-10, VC-12 |
| FR-S1-07 | F-S1-02/05 | VC-14, VC-30 |
| FR-S1-08 | F-S1-03 | VC-15 |
| FR-S1-09 | F-S1-03 | VC-15, VC-22 |
| FR-S1-10 | F-S1-04 | VC-16, VC-24 |
| FR-S1-11 | F-S1-04 | VC-17–19, VC-22–23 |
| FR-S1-12 | F-S1-04 | VC-19, VC-25 |
| FR-S1-13 | F-S1-04 | VC-20–21, VC-26 |
| FR-S1-14 | F-S1-05 | VC-28–29 |
| FR-S1-15 | F-S1-05 | VC-30–31 |
| FR-S1-16 | F-S1-04/05 | VC-14, VC-27–28 |
| FR-S1-17 | F-S1-05 | VC-32 |
| FR-S1-18 | F-S1-01/02/04/05 | VC-05–07, VC-23, VC-27, VC-33 |
| FR-S1-19 | F-S1-01..05 | VC-34 |

### 10.2 Business rule → primary verification and source

| BR | Source | Planned verification |
|---|---|---|
| BR-S1-01 | Q01 | VC-15/16/25 |
| BR-S1-02 | Q03 | VC-08 |
| BR-S1-03 | Q04 | VC-08; scope review |
| BR-S1-04 | Q02 | VC-06/07/08 |
| BR-S1-05 | Q06 | VC-09/10 |
| BR-S1-06 | Q06 | VC-11 |
| BR-S1-07 | Q05 | VC-17/18/22 |
| BR-S1-08 | Q01; instructor | VC-19/25 |
| BR-S1-09 | Q28 | VC-20/26 |
| BR-S1-10 | Q28 | VC-21 |
| BR-S1-11 | Instructor invalid/past | VC-12/23 |
| BR-S1-12 | Q29 | VC-13/17/18/32 |
| BR-S1-13 | Instructor; Q05/Q28 | VC-22/25/26 |
| BR-S1-14 | Q30 | VC-16/32 |
| BR-S1-15 | Q02 | VC-28/29 |
| BR-S1-16 | Q02 | VC-07/30/31 |
| BR-S1-17 | Instructor access | VC-05/06/23 |
| BR-S1-18 | Instructor conflict/integrity | VC-23/27/33 |
| BR-S1-19 | Instructor; Q28 | VC-25/26 |
| BR-S1-20 | Instructor; Q02 | VC-01/03/24 |
| BR-S1-21 | Q01/Q05/Q06 | VC-15/22/33 |
| BR-S1-22 | Q30 | VC-32 |

### 10.3 NFR → planned verification (not executed)

| NFR | Responsible owner | Planned verification |
|---|---|---|
| NFR-S1-01 | F-S1-01/02/04/05 | VC-02/05–07/23/29/31/35 |
| NFR-S1-02 | F-S1-01 | VC-35; password storage inspection |
| NFR-S1-03 | F-S1-02/04/05 | VC-14/28/34 |
| NFR-S1-04 | F-S1-04 | VC-25, DB concurrency evidence |
| NFR-S1-05 | F-S1-04 | VC-26, DB concurrency evidence |
| NFR-S1-06 | F-S1-02/03/04 | VC-13/17/18 |
| NFR-S1-07 | Cross-cutting | VC-34; reproducibility evidence |
| NFR-S1-08 | Cross-cutting | VC-05/23/35; tracked-file inspection |
| NFR-S1-09 | F-S1-01/03/04/05 | VC-36, manual keyboard checklist |
| NFR-S1-10 | F-S1-03/05 | VC-36, measured p95 report |
| NFR-S1-11 | F-S1-02/04 | VC-27, fault injection/DB assertion |
| NFR-S1-12 | Cross-cutting | Review of feature-contract and PR trace |

**Coverage expectations:** every FR-S1-01..19, BR-S1-01..22 and NFR-S1-01..12 has a proposed owner and test/review anchor. Actual source-file/test IDs, pass/fail evidence and approved dependency details belong in future Part E/F artifacts.

## 11. Error, boundary and privacy review matrix

| Area | Positive case | Required negative or boundary case | Observable safe-state guarantee |
|---|---|---|---|
| Identity | Valid Customer/Tutor login | Wrong password; anonymous private call; logout reuse | No anonymous private access |
| Tutor ownership | Tutor A creates/views A schedule | Customer creates A Slot; Tutor B requests A private schedule | No unauthorized mutation or protected disclosure |
| Slot duration | Explicit 60-minute date/time | Invalid duration/time, incomplete/invalid start | No malformed Slot persisted |
| Tutor overlaps | Adjacent offers by same Tutor | Two offered Slots overlap by one second or more | Old offered Slot unchanged |
| Different Tutors | Same time offered by A and B | Global same-time prohibition would incorrectly reject | Distinct Tutor offers remain possible |
| Available browsing | Current eligible open Slots | Occupied, past, inside Q05 cutoff, stale selection | Never promise reservation from cached view |
| Booking lead-time | Start minus now exactly 60:00 | 59:59 (or less), measured at backend | No too-late Booking |
| Occupied Slot | First valid Customer claims | Other Customer tries same Slot | One Active Booking maximum |
| Customer overlaps | Adjacent bookings across Tutors | Partially/fully overlapping across Tutors | One Customer cannot attend overlapping bookings |
| Same Slot concurrency | One winner under parallel requests | Two near-simultaneous submissions | At most one committed Booking |
| Same Customer concurrency | No two overlapping bookings | Requests concurrently for separate Tutor Slots | Final Customer schedule remains non-overlapping |
| Record privacy | Owner views own Booking | Another Customer guesses direct Booking URL/ID | Protected details not disclosed |
| Tutor schedule privacy | Current Tutor views owned schedule | Another Tutor guesses Tutor/schedule ID | Protected schedule not disclosed |
| Persistence | Successful Booking after reload | Process restart; DB fault before commit | No false success or phantom occupied Slot |
| Status semantics | Booked displayed accurately | Past automatically labelled Completed | No attendance claim |
| Timezone | Bangkok calendar time consistent | Browser timezone differs, server near cutoff | Same date/time meaning and boundary result |

**Response-code and UI messages are not invented here.** The future API/UI contracts must define observable conflict/validation/auth responses, including how to handle an uncertain network response after a possible commit, without creating a duplicate Booking. This document requires **consistent committed results**, but does not prescribe an unapproved idempotency token format or retry policy.

## 12. Review gates, later compatibility and change control

### 12.1 Before approving this requirements PR

- [ ] Reviewer confirms Theme 1 assignment and any changes in the authoritative group Master Specification; the available source is a draft.
- [ ] Reviewer confirms FR-S1-01..19 and BR-S1-01..22 reflect the agreed Q01–Q06, Q28–Q30 scope, without silently importing Sprint 2 features.
- [ ] Reviewer verifies both race conditions are represented separately: **one Slot/two Customers** and **one Customer/two overlapping Tutors**.
- [ ] Reviewer verifies ownership matrices, server-side auth, time-zone and exact 60-minute boundary semantics.
- [ ] TBD-S1-01..07 are visible; any required new business assumption is documented and approved rather than guessed.
- [ ] Proposed NFR numeric thresholds are explicitly accepted, revised or left open before Feature SDS/STS signoff.
- [ ] The PR changes **only this requirements document**, not app code, CONTEXT, internal logs, Issue bodies or Sprint 1 staging.

### 12.2 After requirements review — NOT performed by this PR

1. Create/approve the **whole-product** SRS, Feature Inventory/Traceability, System-Level SDS and three-sprint allocation for Deliverable 1 Parts A–D. The sprint-limited current document cannot replace those.
2. Prepare **before code** each Sprint 1 feature's versioned Feature SDS, **specification.md**, applicable **ui-spec.md**, **api-spec.md** (not api-space.md unless the team intentionally adopts that filename), acceptance criteria, **tests.md / STS**, and DoD, based on approved requirements. These are *later artifacts*, not empty files to create now.
3. Only after corresponding contracts are reviewed, implement features through separate Issue-linked feature branches, run actual tests, and submit PRs **into sprint1** for teammate review. Do not push feature implementation directly to sprint1 or main.
4. Integrate/review the Sprint 1 release from staging into **main** only after required checks and peer approval; prepare real evidence for Deliverable 1 Part F.

### 12.3 Compatibility with Q07–Q27 and Q31–Q32 (not Sprint 1 deliverables)

- Later Customer cancellation (Q07–Q08), Customer rescheduling (Q09–Q16), Tutor cancellation/withdrawal/reason (Q17–Q20, Q26–Q27, Q32), in-app notification (Q21–Q25), and Tutor Appointment Summary (Q31) remain confirmed **future** business scope but have no Sprint 1 implemented actions.
- Q30's Booked/Cancelled statuses and time-derived Past must not be contradicted by an arbitrary completed state. Sprint 1 creates Booked reservations; later cancellation will introduce Cancelled transitions under the recorded cutoffs.
- A future withdrawn historical Slot must not block a **distinct new** overlapping offer (Q32), and an occupied Slot cannot be edited/withdrawn directly (Q26). No such edit/withdraw UI or endpoint is part of Sprint 1.
- Later Tutor Summary must show upcoming/past/cancelled counts and corresponding lists for the **authorized Tutor** (Q31); a Sprint 1 schedule list does not fulfill this requirement.
- Do not infer policy for unapproved reactivation, Slot minute grid, booking horizon, notification deletion, in-progress summary attribution, attendance or no-show tracking.

### 12.4 Approval/evidence record

| Gate | Status at this draft | Evidence needed to change status |
|---|---|---|
| Discovery choices Q01–Q32 | **Recorded** | Stakeholder wording review if disputed |
| Sprint 1 requirements document | **Draft; review requested** | Teammate review and approved PR |
| Source Master + theme verification | **Pending** | Final instructor/TA source confirmation |
| Sprint 1 NFR proposals + TBD resolution | **Pending** | Reviewed assumptions/acceptance targets |
| Whole-product Parts A–D | **Not provided by this file** | Separate, approved engineering documents |
| Sprint 1 feature contracts Part E | **Not provided by this file** | Prior, versioned approved contracts |
| Sprint 1 implementation/tests Part F | **Not performed by this file** | Actual commit, test and integration evidence |

**Change policy:** any edit changing agreed Q01–Q32 semantics requires an explicit decision log/change record and a reviewable requirements revision. Changes to technical API, persistence or performance targets must retain FR/BR/NFR traceability and cannot silently alter the stakeholder's business boundaries.

---

+## 13. Feature-level acceptance criteria (requirements stage; not executed)

The AC-S1 identifiers below provide a **reviewable behavioral acceptance proposal** for each Sprint 1 feature. They do **not** replace Part E Feature SDS/STS; endpoint schemas, detailed fixture setup and actual test reports belong there. All outcomes are to be enforced by the backend, not only through presentation.

### F-S1-01 — Login, identity and authorization

| AC | Given | When | Then (observable pass condition) | Validation |
|---|---|---|---|---|
| **AC-S1-01** | Existing valid Customer credentials | Customer logs in | Authenticated principal is Customer; user sees correct own identity/role | VC-01/03 |
| **AC-S1-02** | Existing valid Tutor credentials | Tutor logs in | Authenticated principal is Tutor; own-schedule operations are available | VC-01/03 |
| **AC-S1-03** | Invalid password or unknown credentials | Login attempted | Access denied; no protected identity/session returned | VC-02 |
| **AC-S1-04** | Authenticated user | Logout then reuse old access | Protected action rejected according to documented session lifecycle | VC-04 |
| **AC-S1-05** | Unauthenticated browser or caller | Request create Slot, Booking or private record | No operation granted and no private payload disclosed | VC-05 |
| **AC-S1-06** | Authenticated Customer | Forge Tutor Slot request | Backend denies request; Tutor schedule unchanged | VC-06 |
| **AC-S1-07** | Tutor A and B have different schedules | Tutor A guesses B schedule identifier | No protected records or writes under B's identity | VC-07/31 |

### F-S1-02 — Tutor Slot publishing

| AC | Given | When | Then (observable pass condition) | Validation |
|---|---|---|---|---|
| **AC-S1-08** | Own authorized Tutor schedule; valid future Bangkok start | Create one Slot | Exactly one 60-minute offered Slot is persisted and available on schedule refresh | VC-08/14 |
| **AC-S1-09** | Same Tutor offers 13:00–14:00 | Create 13:30–14:30 | New Slot rejected, existing Slot unchanged | VC-09 |
| **AC-S1-10** | Same Tutor offers 13:00–14:00 | Create 14:00–15:00 | Adjacent Slot allowed by non-overlap rule, subject to independent validity | VC-10 |
| **AC-S1-11** | Tutor A offers 13:00–14:00 | Tutor B offers 13:00–14:00 | Different Tutor offer permitted | VC-11 |
| **AC-S1-12** | Invalid or past date/start | Attempt Slot creation | No invalid Slot persisted, no collateral mutation | VC-12 |
| **AC-S1-13** | Same Tutor proposes two overlapping Slot writes concurrently | Both requests contend | Database never contains two overlapping currently offered Slots for that Tutor | VC-37 |
| **AC-S1-14** | Browser timezone is not Bangkok | Tutor/Customer open same Slot | Same intended Bangkok appointment date and hour displayed | VC-13 |

Slot creation is not subject to the Customer new-Booking cutoff Q05 unless explicitly approved later. Allowed weekdays, hours, maximum look-ahead and start-minute grid remain TBD, not invented validation.

### F-S1-03 — Availability browsing

| AC | Given | When | Then (observable pass condition) | Validation |
|---|---|---|---|---|
| **AC-S1-15** | Customer logged in; eligible offered Slot exists | Open availability | Selectable Tutor and Bangkok appointment times shown without private other-Customer details | VC-15 |
| **AC-S1-16** | Offered Slot occupied or inside Q05 cutoff | Open availability | Slot is not falsely represented as bookable; hiding vs unavailable marking is a UI-contract choice | VC-15/22 |
| **AC-S1-17** | Displayed offer becomes ineligible before submission | Request stale Booking | Backend rechecks and rejects; UI does not report a successful Booking | VC-22 |
| **AC-S1-18** | Device locale is another timezone | Browse Tutor offers | Bangkok time meaning does not drift with device timezone | VC-13/15 |

### F-S1-04 — Exclusive Booking and conflict safety

| AC | Given | When | Then (observable pass condition) | Validation |
|---|---|---|---|---|
| **AC-S1-19** | Eligible unoccupied Slot, Customer logged in without overlapping Booking | Submit Booking | One Booked record is committed with correct Customer, Tutor and Slot identifiers | VC-16 |
| **AC-S1-20** | Slot begins 15:00; server eligibility time is exactly 14:00:00 | Submit Booking | Exact 60-minute cutoff accepted if all other checks pass | VC-17 |
| **AC-S1-21** | Slot begins 15:00; server eligibility time is 14:00:01 | Submit Booking | Less-than-60-minute cutoff rejected, no Booking or occupation | VC-18 |
| **AC-S1-22** | Customer A owns active Booking on Slot X | Customer B attempts same Slot X | Second request rejected, first Booking preserved | VC-19 |
| **AC-S1-23** | Customer holds Tutor A 13:00–14:00 | Book Tutor B 13:30–14:30 | Reject overlapping appointment even across Tutors | VC-20 |
| **AC-S1-24** | Customer holds an interval ending 14:00 | Request other Tutor 14:00–15:00 | Adjacency itself not blocked; other checks still apply | VC-21 |
| **AC-S1-25** | Two Customers simultaneously request one eligible Slot | Concurrent transaction outcomes | At most one committed Active Booking; no false second success | VC-25 |
| **AC-S1-26** | Same Customer concurrently requests distinct overlapping Tutor Slots | Concurrent transaction outcomes | No two overlapping Active Bookings committed for Customer | VC-26 |
| **AC-S1-27** | Previously eligible Slot becomes invalid/occupied or persistence fails | Customer submits | No phantom success, partial Booking or inconsistent occupied state | VC-22/27/33 |
| **AC-S1-28** | Customer alters request body to impersonate other identity/Tutor | Submit Booking | Owner derived from trusted session; Tutor from actual Slot, not supplied roles | VC-24 |
| **AC-S1-29** | Customer repeats request while first outcome might be unknown | Retry/double-click | Exclusivity and Customer-overlap invariants hold; exact retry response remains contract TBD | VC-38 |

AC-S1-29 does **not** invent an Idempotency-Key format, retention window or guaranteed replay response. The future Feature SDS must define safe retries and verify any chosen strategy using real transactions.

### F-S1-05 — Private Booking and authorized Tutor schedule reads

| AC | Given | When | Then (observable pass condition) | Validation |
|---|---|---|---|---|
| **AC-S1-30** | Customer already has a committed Booking | Reopen own list/detail after refresh | Correct Booking identity, Tutor, Bangkok interval and Booked status | VC-28 |
| **AC-S1-31** | Customer A has Booking; Customer B knows its ID | B requests Booking detail | No protected Booking information disclosed | VC-29 |
| **AC-S1-32** | Tutor owns current Booking schedule | Tutor opens schedule Bookings | Authorized Booking visible on own schedule only | VC-30 |
| **AC-S1-33** | Tutor B knows Tutor A schedule ID | B attempts protected read | No protected foreign Tutor Booking disclosed | VC-31 |
| **AC-S1-34** | Booked 13:00–14:00 appointment now ended | Open Booking after 14:00 | Booking still Booked; may show Past; no Completed/attendance assertion | VC-32 |

### Additional verification cases discovered during review

| Validation ID | Given → When | Required outcome | Owner |
|---|---|---|---|
| **VC-S1-37 / TEST-S1-37** | Two requests concurrently create overlapping future offered Slots for same Tutor | At most one overlapping offer commits; no partial side effects | F-S1-02; Q06 |
| **VC-S1-38 / TEST-S1-38** | Customer duplicates Booking submission while first outcome is in flight or unknown | At most one Active Booking for a Slot; Customer overlap invariant preserved, response semantics defined later | F-S1-04; Q01/Q28 |

**Coverage by feature:** F-S1-01 AC-01..07; F-S1-02 AC-08..14; F-S1-03 AC-15..18; F-S1-04 AC-19..29; F-S1-05 AC-30..34. Every AC has a planned VC, but **none has a test pass** in this requirements-only PR. The implementation's STS must define fixtures, API/UI steps, DB assertions, controlled time, race synchronization and result recording.

## 14. Logical data requirements, privacy and consistency

This section identifies mandatory **information and invariants** but does not select database tables, migrations, ORM or transport contract.

| Business concept | Information the feature must preserve | Why it matters |
|---|---|---|
| **Authenticated principal** | Stable User ID and effective Customer/Tutor role | Trusted identity and server authorization |
| **Tutor schedule** | Identity of owning Tutor and currently offered Slots | Own-schedule authorization and Q06 |
| **Availability Slot** | Unique Slot identity, Tutor owner, start/end in Bangkok business time, current offer/occupancy meaning | 60-minute duration, overlap, eligibility and reuse in Booking |
| **Booking** | Unique Booking identity, actual Customer owner, selected Slot and Tutor, Booked state, associated appointment interval | Customer and Tutor retrieval, exclusivity, privacy and Q28 |
| **Availability result** | Tutor and Slot identity, start/end, time of evaluation/eligibility indication | Selection without leaking other Customers' details |
| **Action result** | Non-sensitive success or rejection; committed Booking identity only on successful write | Prevent misleading responses and private-data leakage |

**Data minimization:** no price, payment, lesson location, video link, attendance, student phone number, subject category or special registration workflow is made mandatory by Q01–Q32 for Sprint 1. Any identity/account fields required by the chosen authentication architecture must be justified in the System SDS rather than attributed to the stakeholder.

**Logical guarantees:**

1. Slot ownership belongs to one Tutor and cannot be reassigned by a Customer-supplied ID.
2. Every successful Booking belongs to its authenticated Customer and the selected Tutor's actual Slot.
3. A current offered Slot of Tutor A may not overlap another current offered Slot of Tutor A. Tutor B's identical time remains legitimate.
4. A Slot has at most one Active Booking; a Customer has no overlapping Active Bookings. Both remain true under concurrent writes.
5. Successful Booking and occupied state agree after commit. Failed writes do not leave partial changes.
6. Reopening a list/detail reads committed persistent data; display state is not authoritative history by itself.
7. Booked does not become Completed simply because the appointed interval ended; no S1 cancellation or withdrawal changes status.
8. Tutor's schedule read authority does not grant global Customer-data search authority; an owner-only Customer endpoint does not leak a foreign record by ID.
9. A future Cancelled Booking and withdrawn Slot must be representable without inventing their Sprint 1 actions.
10. Technical decisions for exact API errors, stale-UI treatment, retry success reconciliation and isolation mechanisms are **open engineering contracts**; do not claim a specific HTTP code or DB locking scheme here.

## 15. Decision-to-Sprint 1 applicability audit (Q01–Q32)

This table is a guard against both missing a stakeholder policy and accidentally implementing later-sprint functionality in Sprint 1. The condensed decision is sourced from the confirmed discovery choices, not inferred from the Campus Store example.

| Decision | Confirmed policy (condensed) | Sprint 1 applicability |
|---|---|---|
| Q01 | 1:1 Customer–Tutor exclusive session | **Required**: FR-08/10, BR-01/08 |
| Q02 | Tutor is Staff; owns only their authorized schedule | **Required**: FR-04/05/07/15, BR-04/15/16 |
| Q03 | Fixed 60-minute Slot | **Required**: BR-02, FR-05 |
| Q04 | Manual individual Slot offers, no recurrence | **Required**: BR-03, FR-05 |
| Q05 | New Booking at least 60 minutes before start, boundary included | **Required**: BR-07, FR-11 |
| Q06 | Same-Tutor current offered Slot overlap prohibited, adjacency allowed | **Required**: BR-05/06, FR-06 |
| Q07 | Customer cancellation allowed at least 30 minutes ahead | Later sprint; no Cancel action |
| Q08 | Customer cancellation reopens original Slot | Later sprint; no reopen action |
| Q09 | Only owning Customer may initiate rescheduling | Later sprint; no reschedule action |
| Q10 | Original appointment reschedule cutoff at least 60 minutes | Later sprint |
| Q11 | Reschedule destination at least 60 minutes ahead | Later sprint |
| Q12 | Reschedule may change Tutors | Later sprint; preserve future model flexibility |
| Q13 | Reschedule all-or-nothing | Later sprint; separate from S1 Booking atomicity |
| Q14 | Successful reschedule reopens old Slot | Later sprint |
| Q15 | Reschedule preserves Booking ID/history | Later sprint |
| Q16 | At most one successful reschedule | Later sprint |
| Q17 | Current authorized Tutor may cancel own Booking | Later sprint |
| Q18 | Tutor cancellation cutoff at least 60 minutes | Later sprint |
| Q19 | Tutor cancellation withdraws old Slot and retains history | Later sprint |
| Q20 | Tutor cancellation reason nonblank mandatory | Later sprint |
| Q21 | Successful Tutor cancellation creates private In-App notice | Later sprint |
| Q22 | Tutor cancellation reason visible to owning Customer only | Later sprint |
| Q23 | Reason appears in notice and cancelled Booking detail | Later sprint |
| Q24 | Read In-App notice remains revisitable | Later sprint |
| Q25 | In-App notice has no time-based automatic expiry | Later sprint; other deletion policy open |
| Q26 | Tutor cannot directly edit/delete Slot with Active Booking | Later workflow; no S1 edit/delete UI |
| Q27 | Unoccupied future Slot: withdraw then create new distinct Slot | Later workflow; no S1 withdrawal |
| Q28 | Customer cannot hold overlapping Active Bookings across Tutors | **Required**: BR-09/10/19, FR-13 |
| Q29 | Single Asia/Bangkok business time zone | **Required**: BR-12 across S1 times |
| Q30 | Booked/Cancelled status; Past is derived and not Completed | **Required**: Booked/Past behavior; Cancelled workflow later |
| Q31 | Tutor-only Appointment Summary (counts and lists) | Later sprint; S1 schedule view is not that report |
| Q32 | Withdrawn Slot history excluded from current-offer overlap | Later workflow; no S1 withdrawal/reactivation action |

**Source priority:** instructor minimum (login, permissions, valid Slots, persistent Booking, competing same-Slot claim); stakeholder Q01–Q32 where relevant; separate approved engineering decisions for transport/storage/design. Neither the example repo nor a convenient implementation preference can overwrite the stakeholder rules.

## 16. Peer reviewer checklist and stop/go gates

| Reviewer check | Evidence in this file | What must block approval |
|---|---|---|
| Tutor can create owned 60-minute Slot | §§1,4–6,8,13 | Role escalation, uncontrolled Slot lengths |
| No same-Tutor offered overlap | §§3,6,9,13 | Adjacent falsely blocked; concurrent overlapping writes both committed |
| Customer sees valid bookable offers | §§2,5,9,13 | Past/occupied/too-soon Slots shown as guaranteed bookable |
| One Slot cannot be claimed twice | §§5–6,8–9,13 | Race only tested at UI level, invariant unprotected |
| One Customer cannot book overlapping Tutors | §§5–6,8–9,13 | No cross-Tutor overlap enforcement on commit |
| Cutoff exactly 60 minutes | §§3,6,9,13 | Boundary rejected or less-than-60 accepted |
| Customer/Tutor private reads | §§4–6,9,13–14 | Other Customer's or Tutor's restricted data exposed |
| Past is not Completed | §§3,5–6,9,13,15 | Status silently updated by clock |
| No invented policies | §§2.3,7,12,14–15 | Working hours, horizon, minute grid, response schema assumed without approval |
| No Sprint 2/3 functionality smuggled into S1 | §§2,12,15 | Cancellation, rescheduling, notification or summary required to ship now |

### 16.1 Documentation Issue / PR Definition of Done

- [ ] The file is versioned **only on a documentation branch** with PR base **sprint1**, not committed directly into main/sprint1.
- [ ] Scope is **Sprint 1 requirements only**; the whole-product deliverables and future-sprint work are separately and accurately identified.
- [ ] FR-S1-01..19, BR-S1-01..22, NFR-S1-01..12 and AC-S1-01..34 are present with owners/traceability.
- [ ] Each agreed direct decision Q01–Q06/Q28–Q30 maps to required behavior; Q07–Q27/Q31–Q32 remain explicit future-scope constraints.
- [ ] Negative, boundary, privacy and both booking concurrency cases are separately inspectable.
- [ ] **Two different race types** are covered: competing Customers for the same Slot; one Customer for distinct overlapping Tutors' Slots.
- [ ] Q05 exact 60-minute boundary, Q29 Bangkok time, Q30 Past ≠ Completed and Q02 ownership remain internally consistent.
- [ ] All TBDs and merely proposed NFR targets remain visibly unapproved until resolved.
- [ ] Reviewer checks actual instructor master/Theme 1 assignment or records a blocker; no false source-verification claim.
- [ ] Teammate **@Chxtamos** submits substantive PR review, noting findings and approval/change request reasons.
- [ ] Issue and PR link to one another; Kanban shows Sprint 1 / PR Review until approval.
- [ ] No application code, feature SDS, test implementation, release commit or fabricated pass results are included.

### 16.2 Review-stage gates (no unearned completion)

| Gate | Condition | Current status |
|---|---|---|
| Requirements coverage | Comprehensive Sprint 1 document + traceable Q/FR/BR/NFR/AC/VC | Draft; pending peer review |
| Instructor source | Verify final Master Specification and Theme 1 assignment | Open |
| Material TBDs | Resolve/approve Sprint 1 working-hours/horizon/minute-grid and proposed NFR targets before corresponding contracts | Open |
| Part E contracts | Feature SDS, data/API/UI specs, test steps/STS and DoD authored and reviewed **before code** | Not done here |
| Sprint 1 implementation | Real tested UI/API/DB, safety, concurrent-booking and role cases | Not done here |
| Release | Reviewed integration, passed tests and valid evidence on main | Not done here |

**Never merge merely because Markdown is long or structurally valid.** The reviewer must verify business semantics, non-invented policies, scope and traceability, and respond to any blocking changes before merging.

---

**End of Sprint 1 requirements-only baseline.** Software contracts, code and real test results are separate gates.
