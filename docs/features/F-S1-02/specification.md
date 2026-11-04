# F-S1-02 — Tutor Slot Feature SDS (Part E)

> **PROPOSED / NOT IMPLEMENTED / NOT TESTED.** Issue #14, owner @Tanaboonnnnn, reviewer @Chxtamos. Based on merged `sprint1` SHA `6fd3931` (PR #25/#26). This is a Part E contract requiring independent peer approval and merge **before** Part F.

## Sources and traceability

Authority: [Sprint 1 requirements](../../requirements.md) Q02/Q03/Q04/Q06/Q29, FR-S1-04..07/18/19, BR-S1-02..06/11/12/17/18/20/21, AC-S1-08..14, VC/TEST-S1-08..14/37; [SRS](../../srs.md) FR-004..007, BR-002/003/004/006/029/033/034/035 and OD-001..005/011/012; [System SDS](../../system-sds.md) §§3.3/4/7.2; [Feature Inventory](../../features.md); [Traceability](../../traceability.md); [Auth Part E](../F-S1-01/specification.md) and merged PR #26; [AGENTS](../../../AGENTS.md).

The Tutor (=Staff) owns their schedule. A Slot is one explicitly dated 60-minute `Offered` interval; Tutor Schedule is an owner-filtered read projection, **not** another mutable table. Publication state does not imply unoccupied after Booking exists.

## Scope

In Part F, an authenticated active Tutor creates exactly one valid **future** 60-minute Slot for **their own** identity and reads persisted own Slots on refresh/restart. Reject malformed/past requests, wrong role/owner, conflicting same-Tutor offers and simultaneous overlapping creates. Adjacent same-Tutor Slots and identical hours from distinct Tutors are permitted. Use Asia/Bangkok business time.

**Out of scope:** Customer availability #15, Booking and Q05 60-minute new-Booking cutoff #16, protected Booking views #17, release #18, bulk/recurring slots, edit/delete/withdraw, cancellation, notifications, summary and payments. Future `Withdrawn` compatibility is not permission to implement Sprint 2.

## Invariants and user journey

1. Tutor logs in using existing Auth, opens My Availability and sees only own committed Slots.
2. Tutor chooses Bangkok date/start; UI derives end = start + 60m. Client sends a timestamp with UTC offset; server ignores any client role or owner.
3. API checks DB-backed Session/Tutor role, Origin and HMAC CSRF. Transaction locks User principal and rechecks active Tutor and future time **after contention** using DB clock; inserts `Offered` Slot under `principal.userId`.
4. PostgreSQL CHECK enforces exactly 60m; conditional GiST EXCLUDE prevents two currently `Offered` Slots of the same Tutor overlapping. COMMIT before 201.
5. Rejected mutation rolls back and does not change existing Slot rows. GET returns owner-filtered durable data.

Use half-open intervals `[start,end)`: overlap iff `a.start < b.end AND b.start < a.end`. 13:00–14:00 + 13:30–14:30 conflict; 13:00–14:00 + 14:00–15:00 allowed. Two Tutors can each offer 13:00–14:00.

**SLOT-I1:** exactly 60m and immutable identity/owner/interval. **I2:** no overlapping currently Offered Slots per Tutor, even under Race A. **I3:** active Tutor-only identity from Session. **I4:** strictly future by authoritative post-lock DB time; no Q05 Booking cutoff on Slot creation. **I5:** no partial writes/false success; restart durability. **I6:** UTC storage and Bangkok display. **I7:** historical Withdrawn IDs never reactivated (S2 compatibility).

## AC and verification (all planned, not executed)

| AC | Expected | Test |
|---|---|---|
| AC-S1-08 | One future owned 60m Slot persisted/read on refresh | VC-S1-08/14 |
| AC-S1-09 | Same-Tutor positive overlap rejected | VC-S1-09 |
| AC-S1-10 | Same-Tutor adjacency accepted | VC-S1-10 |
| AC-S1-11 | Different Tutors same hour accepted | VC-S1-11 |
| AC-S1-12 | Invalid/past input rejected without mutation | VC-S1-12 |
| AC-S1-13 | Race A: never two overlapping committed Offered rows | VC-S1-37 |
| AC-S1-14 | Browser timezone cannot change Bangkok appointment | VC-S1-13 |

Related product validations: VAL-002/003/004/005/012/013/031/036. Cross-feature Auth cases AUTH-07/08/09/16 become testable via real Slot routes in Part F.

## Open decisions — mandatory review

- **OD-001:** days/hours/holidays OPEN. Propose no extra restriction beyond confirmed future time, **not** an approved 24/7 service.
- **OD-002:** maximum horizon OPEN. Never invent 7/14/30-day cap.
- **OD-003:** start-minute grid OPEN. Never force `:00` or 15/30-minute steps by UI defaults.
- **OD-004:** own-list response allowlist, ordering, pagination and occupancy representation require peer sign-off. Proposed id, start/end, lifecycle and derived occupancy only.
- **OD-005:** proposed Serializable + Tutor User lock + DB exclusion, bounded transient retries, shared Auth CSRF/Origin and error schema; feature-specific review required.
- **OD-011/012:** final instructor Master and formal Theme 1 eligibility remain unverified; no invented sign-off.

## Definition of Done / two-PR gate

**Part E:** five cross-linked versioned docs ([UI](ui-spec.md), [HTTP](api-spec.md), [data](data-spec.md), [STS](tests.md), this SDS) with decisions and Race A proof plan. Human @Chxtamos review + approved documentation PR merged into `sprint1` before feature code.

**Part F:** separate feature branch from latest `sprint1`; TDD RED→GREEN, real UI→Express→PostgreSQL, native constraint/transaction, negative auth/privacy, synchronized Race A, restart and fault tests, actual command/result/SHA evidence and peer-reviewed code PR into `sprint1`. No fabricated PASS and no direct main/sprint1 pushes. `sprint1→main` release belongs to #18.
