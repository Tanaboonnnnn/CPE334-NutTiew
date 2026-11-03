# CPE334 NutTiew — Tutoring Appointment System Requirements

**Baseline:** Stakeholder discovery Q1–Q32 (2026-11-03)  
**Status:** Discovery recorded; **SRS and sprint plan not yet formally approved**  
**Context:** CPE334 Theme 1 — Appointment & Scheduling / one-to-one tutoring  
**Business time zone:** Asia/Bangkok (UTC+07:00)  
**Delivery:** whole-product SRS/SDS/three-sprint plan; Sprint 1 working slice required for Deliverable 1 (8 Nov 2026, 23:59 ICT).

> This file records *agreed stakeholder decisions* and instructor-mandated scope. It is **not** a substitute for a numbered FR/BR/NFR SRS, feature SDS, API/UI specification, AC, STS, DoD, test evidence, or stakeholder sign-off. All proposed sprint labels are subject to the actual three-sprint planning/review.

## Actors and booking fundamentals (proposed Sprint 1)

| ID | Confirmed requirement |
|---|---|
| Q01 | One Customer books one exclusive 1:1 tutoring appointment with one Tutor. No group tutoring. |
| Q02 | Tutor is the Staff role and can manage/view only their authorized schedule; Customer is the learner. |
| Q03 | Every offered Availability Slot lasts exactly 60 minutes. |
| Q04 | Tutors create explicitly dated Slots one at a time; no recurring or bulk automatic creation. |
| Q05 | A new Customer Booking must be made at least 60 minutes before Slot start (exact boundary allowed). |
| Q06 | Currently offered Slots of the **same Tutor** must not overlap; adjacent Slots are allowed. Different Tutors may offer the same times. Withdrawn historical Slots are excluded (Q32). |
| Q28 | A Customer cannot hold overlapping **Active Bookings**, even with different Tutors; adjacent appointments are allowed. Prevent concurrent requests from violating this rule. |
| Q29 | Appointment times, displayed Slots, and all cutoff interpretations use Asia/Bangkok (UTC+07:00) as the business time zone. Database timestamp representation remains an engineering decision. |
| Q30 | Booking business statuses are **Booked** and **Cancelled**. A Booked appointment that has elapsed may be shown as **Past**, but Past is a derived time classification, **not** Completed or proof of attendance. |

**Sprint 1 acceptance baseline from instructor:** authentication/login and authorization for Customer and Staff; Tutor offers a valid future Slot and views authorized schedule bookings; Customer browses availability, books an eligible Slot and retrieves their own Booking; reject invalid/past Slots, occupied exclusive Slots, booking too close to start, customer-to-customer privacy violations, unauthorized Staff actions and competing claims of one exclusive Slot. Verify real UI → API → persistent database and negative/concurrent tests. Q28 additionally prevents same-Customer overlaps across Tutors.

## Customer cancellation and rescheduling (proposed Sprint 2)

| ID | Confirmed requirement |
|---|---|
| Q07 | The owning Customer may cancel their Booking at least 30 minutes before Appointment start (boundary allowed). |
| Q08 | After successful Customer cancellation, automatically reopen the original Slot; Q05 still governs subsequent bookings. |
| Q09 | Only the Customer who owns a Booking may initiate its rescheduling; a Tutor cannot reschedule it. |
| Q10 | Rescheduling requires at least 60 minutes before the **original** Appointment start (boundary allowed). |
| Q11 | The destination Slot must start at least 60 minutes from the rescheduling request (boundary allowed). |
| Q12 | Rescheduling may choose a different Tutor or the same Tutor, subject to all eligibility/conflict/authorization rules. |
| Q13 | Rescheduling is atomic/all-or-nothing: conflict or failure leaves original Booking and Slot occupancy unchanged. |
| Q14 | After successful rescheduling, automatically reopen the vacated original Slot; Q05 applies to later bookings. |
| Q15 | Retain the same Booking ID on reschedule and record successful previous/new Tutor, Slot and time plus change timestamp; failed attempts do not add successful history. |
| Q16 | Permit at most **one successful** reschedule per Booking. Rejected/rolled-back attempts do not consume the quota. |

## Tutor cancellation, private notices and Slot withdrawal (proposed Sprint 2)

| ID | Confirmed requirement |
|---|---|
| Q17 | Only the Tutor responsible for the Booking on their currently authorized schedule may cancel it. This does not grant Tutor rescheduling rights. |
| Q18 | Tutor-initiated cancellation requires at least 60 minutes before Appointment start (boundary allowed). |
| Q19 | Successful Tutor cancellation **withdraws** the original Slot from being newly booked, preserving history; unlike Customer cancellation/reschedule, it does not reopen automatically. |
| Q20 | Tutor cancellation requires a meaningful nonblank/non-whitespace cancellation reason. |
| Q21 | Successful Tutor cancellation creates an **in-app** Cancellation Notification for the Booking's owning Customer only. Failed attempts do not generate a successful-cancellation notice. No email/SMS required. |
| Q22 | The owning Customer can read the Tutor Cancellation Reason; other Customers and anonymous visitors cannot. |
| Q23 | Show the Tutor Cancellation Reason both in the Customer's in-app Notification and their cancelled Booking Details. |
| Q24 | The Customer can reopen/read that in-app notice again after first viewing; reading does not remove it. |
| Q25 | The notice has **no automatic time-based expiry**. Separate deletion/retention and privacy rules have not been settled. |
| Q26 | Tutor cannot directly edit/delete/withdraw a Slot with an Active Booking; use authorized Tutor cancellation (Q17–Q20), which closes the Slot (Q19). |
| Q27 | To change an **unoccupied future** Slot, Tutor withdraws their own Slot and creates a **distinct** new one according to Q04, rather than editing its date/time; keep withdrawal history. |
| Q32 | Withdrawn historical Slots from Q19/Q27 do **not** block a new, separate overlapping Slot. Currently offered same-Tutor Slots must still not overlap (Q06). Historical Slot reactivation and permanent deletion are **not** granted. |

## Appointment summary (proposed Sprint 3)

| ID | Confirmed requirement |
|---|---|
| Q31 | Tutor sees a summary only for their authorized schedule: **counts and related appointment lists** for Upcoming Booked, Past Booked and Cancelled. Customers keep access to their own Booking details, but no Customer summary dashboard was agreed. Past is **not** Completed (Q30); do not double-count Cancelled as Past Booked. |

## Instructor-required whole-product deliverables

- Whole-product **SRS**, with numbered and testable FR/BR/NFR, actors, scope/exclusions, security and documented open items.
- **Feature Inventory + Traceability** from requirements to features, target sprint and verification.
- **System-Level SDS**, including architecture, data model, UI/API, role/permission matrix, security and deployment plan.
- **Three-Sprint Plan** with scope/dependencies.
- Before each Sprint 1 feature implementation, version its **Feature SDS / specification.md**, applicable **ui-spec.md**, **api-spec.md** (if API-facing), Acceptance Criteria, **tests.md** / STS, and DoD. File organization and naming may be adapted consistently to the instructor's templates; **do not create empty contracts and call them complete**.
- Sprint 1 tested implementation, verifiable setup and demo, GitHub Issues, feature branches, peer-reviewed PRs, negative/security/concurrency test evidence and final submission.

## Open items — NOT approved requirements

**Sprint 1-sensitive:** Tutor working-hour boundaries and allowed days; maximum scheduling/booking horizon; allowed Slot start-minute grid. Do not invent these policies in AC/STS; obtain reviewed assumptions or stakeholder approval.

**Later/design-dependent:** reactivating withdrawn historical Slots; how in-progress Booked appointments appear in reporting; summary attribution after cross-Tutor rescheduling; history access and general retention; in-app notification latency/read status/deletion; Tutor reason length/format; filtering/sorting/report periods; UI layout and teaching location; time storage/API and concurrency implementation choices.

**Out of agreed scope absent change approval:** No-show/attendance certification or automatic Completed status, payments, reminders, SMS/email, third-party integrations, detailed analytics, group tutoring.

**Approval gates:** confirm final instructor-issued Master Specification and team Theme 1 assignment; review/approve SRS and scope/TBD handling; allocate approved Sprint 1 contracts and tests before coding. The current document is a decision record, not a signed-off full SRS.
