# F-S1-03 — Customer Availability Discovery Feature SDS (Part E)

> **Part E documentation contract only.** Issue #15; provisional owner @Chxtamos; independent peer reviewer @Tanaboonnnnn. Decision states below reflect the peer-review decision record in PR #32 comment [#6683929084](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/32#issuecomment-6683929084). These are engineering/design decisions, not new stakeholder business rules. This change does not implement UI/API code, add a migration, execute tests or close the issue.

## 1. Authority and scope

Sources: [Sprint 1 requirements](../../requirements.md) (FR-S1-08/09/13/18, AC-S1-15..18, BR-S1-06/07/09/10/11/12/15/17/20/21, NFR-S1-01/07/08/09/10/12, Q28), [SRS](../../srs.md), [System SDS](../../system-sds.md), [Feature Inventory](../../features.md), [Traceability](../../traceability.md), [AGENTS.md](../../../AGENTS.md), accepted [Auth contract](../F-S1-01/specification.md) and [Tutor Slot contract](../F-S1-02/specification.md).

**Outcome:** an authenticated Customer discovers a real eligible Tutor Slot, identifies the Tutor using an approved public display name when its data gate is cleared (otherwise an opaque Tutor reference), sees Bangkok start/end time, and selects that offer without seeing another Customer's private Booking data.

**In scope:** Customer-only read access to current Offered Slots; Customer-specific bookability projection; safe Tutor/Slot references; a conditional Tutor public-display-name data gate; UTC API and Asia/Bangkok UI time; privacy allowlist; loading/empty/error/retry/session-change states; planned API, DB, browser, timezone and privacy tests.

**Out of scope:** Booking create/confirm/history/detail (#16/#17); Tutor Slot management/dashboard (#14); public/anonymous discovery; any unapproved Tutor profile/name/email/phone or Customer identity; subject, rating, price, location, messaging, payments, notifications, cancellation/reschedule, recurring Slots; new Tutor hours, weekdays, holidays, maximum horizon or start-minute grid; any mutable Slot.isBooked flag or Booking schema owned by #15.

Part E is documentation only. Part F must be a separate code-only branch/PR after this contract is peer-accepted.

## 2. Dependencies and verified repository facts

Issue #13 Auth and Issue #14 Tutor Slots/Dashboard are closed. PR #31 is merged into sprint1. This branch is based on sprint1 SHA 551a9469e3d3a7e8e3ae004a382862c4f3e87e0e.

**Selected sequencing route — B: a separately scoped shared data foundation.** At this base, `apps/api/prisma/schema.prisma` contains User, Session, AuthAttemptBucket, AuthAttemptReservation and Slot, but no Booking model/table. `apps/api/src/slots.ts` currently projects Tutor own-list occupancy as Unoccupied because #16 has not introduced Booking; that projection is not a Customer-availability occupancy source.

The team selected a separate Issue/PR for the shared Booking data foundation, with schema, migration, ownership and sequencing reviewed before either feature relies on it. The minimum persisted fields needed by this contract are `id`, `customerId`, `currentSlotId`, `startsAt`, `endsAt` and `status` (`Booked`/`Cancelled`); `currentSlotId` is the occupancy relation and the persisted Booking interval is the Customer-overlap source. Booking mutation remains owned by #16 and must not move into #15.

**Foundation tracking (not yet created):** proposed implementation owner @Chxtamos; peer reviewer @Tanaboonnnnn; dependency links #15 and #16; exact foundation Issue/PR URL and reviewed migration/schema SHA are **TBD** until that separate work is created and accepted. This PR does not create the Issue/PR or approve a migration. Until the shared foundation is reviewed, merged and its exact SHA recorded against the Part F branch, occupancy-dependent Part F work is a hard **STOP GATE**. Do not invent `Slot.isBooked`, assume all Slots are unoccupied, or create a partial Booking schema under #15.

## 3. Actors and journey

| Actor | Result |
|---|---|
| Anonymous | 401; no offer data |
| Authenticated Customer | 200 safe availability projection |
| Authenticated Tutor | 403; no Customer availability payload |
| Server | Derives Customer identity from live Session; derives eligibility from persisted Slot/Booking and database time |

1. Customer opens the availability screen.
2. UI verifies GET /api/v1/auth/me and requires trusted role Customer.
3. UI calls the Customer availability GET with the same-origin HttpOnly Session cookie.
4. Server enforces Session and Customer role, reads eligible offers and serializes only the approved allowlist.
5. UI displays an approved Tutor public display name only after the separate data-approval gate; otherwise it displays the opaque Tutor reference. It also displays Bangkok start/end. Selecting a Slot changes transient UI state only; it is not a Booking or reservation.
6. Later #16 receives only the selected Slot ID and independently rechecks offer state, occupancy, Q05 and all Booking rules in its authoritative transaction. A prior availability response is never a lock, lease or guarantee.

## 4. Eligibility and time

For one read, `T_view` is one database-authoritative instant sampled for the availability query. Under the confirmed Customer-specific bookable-only policy, include a Slot only when:

1. lifecycle is Offered;
2. no active Booking with status Booked references that Slot;
3. startsAt - T_view is at least 60 minutes (60:00 included; 59:59 excluded);
4. no Active Booking owned by the authenticated Customer overlaps this Slot, even when the existing Booking belongs to a different Tutor; and
5. the persisted Slot interval and Tutor ownership remain valid under the accepted Slot contract.

**Customer-specific overlap predicate (BR-S1-09/10, Q28):** derive the owner only from `principal.userId` supplied by the live Session. Exclude a candidate Slot when an existing Booking has `customerId = principal.userId`, `status = Booked`, and its persisted interval overlaps the candidate using half-open intervals: `booking.startsAt < slot.endsAt AND slot.startsAt < booking.endsAt`. A Cancelled Booking does not conflict; exact adjacency is allowed. This is an eligibility predicate only: the query may test existence but must not return or disclose any matching Booking or Customer data. The same Customer's overlapping Booking on another Tutor must make the candidate unavailable to that Customer; another Customer's Booking must not affect this Customer's overlap predicate.

T_view is an indicative read timestamp, **not** #16's transactional T_elig. Booking T_elig must be sampled by the authoritative Booking transaction after relevant contention waits, immediately before the guarded write. The availability UI must never imply a displayed Slot is reserved or guaranteed to remain bookable.

PostgreSQL stores TIMESTAMPTZ; API returns RFC 3339 UTC instants ending Z; UI formats explicitly with Asia/Bangkok regardless of device timezone. Never use browser time or a client timestamp for eligibility. OD-002 (maximum advance horizon) remains OPEN: this contract does not choose an upper bound and does not claim an approved unlimited horizon. Resolve OD-002 before Part F; do not silently add a horizon, hours, weekday, holiday or minute-grid policy.

A Slot can become occupied or cross Q05 after T_view. If #16 later rejects a stale selection, UI shows non-success and refreshes; #15 does not create a fake Booking endpoint.

## 5. Proposed decisions — peer review required

| ID | Proposed contract | Status |
|---|---|---|
| OD-AV-01 Display | **Bookable-only for the authenticated Customer**: return/display only offers that pass Slot occupancy, Q05 and that Customer's BR-S1-09/10 overlap checks. This follows the proposed default in requirements.md §14.2; it is not stakeholder approval. Alternative: show future Offered Slots with a generic unavailable state. | Owner confirmation and peer acceptance required. |
| OD-AV-02 Tutor identity | Opaque Tutor UUID reference only; no name, email, phone, profile or Booking identity. UI may compact the label but must avoid collisions in the visible result set. | Proposed; peer review required. |
| OD-AV-03 List | Full unfiltered result set; no query filters/pagination in this S1 proposal; stable order startsAt ASC, tutorRef ASC, slotId ASC. | Proposed technical choice, not a scale guarantee. OD-002 remains OPEN; this list proposal does not approve an unlimited advance horizon. |
| OD-AV-04 Clock | One database T_view per read; include evaluatedAt in response metadata. | Proposed; does not replace T_elig. |
| OD-AV-05 Occupancy | Derive from active Booked rows through #16 Booking relation; never store a duplicate occupancy flag on Slot. | Required invariant; blocked by missing schema. |
| OD-AV-06 Error/privacy | Existing /api/v1 envelope, no-store, explicit empty/error distinction, safe retry, session binding. | Proposed alignment with Auth/Slot APIs. |
| OD-AV-07 Performance | NFR-S1-10 p95 ≤2.0s is a proposal only. | Not a gate unless approved with workload and method. |
| OD-AV-08 Visual | Reuse calm NutTiew Auth visual language for Customer page; Tutor navy/orange remains scoped to Tutor Dashboard. | Proposed; peer review required. |

## 6. Acceptance and traceability

| Source | F-S1-03 outcome | Planned STS |
|---|---|---|
| FR-S1-08 / AC-S1-15 | Customer identifies a specific Tutor and Slot start/end without private third-party data | AVA-01, AVA-05 |
| FR-S1-09 / AC-S1-16 | Anything shown as bookable is current, unoccupied, outside Q05 cutoff and does not overlap this Customer's Active Bookings | AVA-02, AVA-03, AVA-15 |
| AC-S1-17 | Stale offer is revalidated by #16; no false Booking success | AVA-11 |
| AC-S1-18 / BR-S1-12 | Bangkok time meaning is independent of device locale | AVA-04 |
| BR-S1-06/07/08/09/10/11/15/17/20/21 | Distinct Tutor offers, Slot occupancy, Q05/future-time eligibility, Customer-specific non-overlap, role and privacy | AVA-02/03/05/06/07/15 |
| FR-S1-18 | Failed/unauthorized reads communicate non-success without private disclosure or false availability | AVA-05/06/10 |
| NFR-S1-01/08 | Deny anonymous/wrong role; no secret or private Booking leakage | AVA-05/06/12 |
| NFR-S1-07/12 | Reproducible evidence, stable IDs and reviewed PR | Part F ledger/PR |
| NFR-S1-09/10 | Proposed keyboard/p95 targets only | AVA-13/14 if approved |

Whole-product trace anchors: FR-008/009, NFR-007/009/010, VAL-006/009/033/036, VC-S1-13/TEST-S1-13, VC-S1-15/TEST-S1-15, VC-S1-22/TEST-S1-22 and VC-S1-36/TEST-S1-36. These are planned links, not test results.

## 7. Definition of Done

### Part E
- [ ] Five cross-linked documents exist: Feature SDS, UI spec, API spec, data spec and STS.
- [ ] FR-S1-08/09 and AC-S1-15..18 map to explicit rules, response fields, UI states and tests.
- [ ] Display policy, Tutor reference, list behavior, T_view, timezone and errors are explicitly accepted/rejected by peer review; proposals are not mislabeled as stakeholder approval.
- [ ] Response allowlist excludes Customer identity/Booking data, credentials, Session fields and unrestricted Tutor fields.
- [ ] #15/#16 Booking-schema sequencing gap is resolved or retained as a hard Part F stop gate; no fake occupancy flag is added.
- [ ] Markdown links/structure and git diff --check pass.
- [ ] PR contains only the five F-S1-03 Markdown files, targets sprint1, links #15 and requests @Tanaboonnnnn.
- [ ] PR stays open for independent human review; no self-approval or self-merge.

### Part F — separate implementation PR
- [ ] Start from updated sprint1 after Part E acceptance and Booking-schema gate resolution.
- [ ] Implement Customer-only UI → Express API → PostgreSQL read projection from real Slot and Booking rows.
- [ ] Verify occupied exclusion, Q05 boundary, exact allowlist, Bangkok rendering, auth/role denial, empty/error/retry and session-change privacy.
- [ ] Record real commands/results, DB/migration, source SHA and hosted CI.
- [ ] Open separate code-only PR into sprint1 and obtain peer review.

**Verification boundary:** this Part E change is documentation only. No build, API test, migration, Booking query, browser E2E, performance benchmark or accessibility audit is claimed as run or passed.
