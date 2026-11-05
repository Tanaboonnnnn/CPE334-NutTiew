# F-S1-02 — Tutor Slot Feature SDS (Part E)

> **UX-only amendment proposed 2026-11-05 (owner-directed, peer acceptance
> pending):** Replace only the Tutor screen's former narrow form/list
> presentation with a NutTiew navy/orange 24-hour client-side calendar plus
> complete private chronological agenda. See [dated UX decision](ui-decision-2026-11-05.md),
> [new UI contract](ui-spec.md), and [UX-R1…UX-R6 STS](tests.md).
> **Unchanged:** Auth/Customer visual design, Tutor role/owner/session/CSRF,
> exactly 60-minute future Offered Slot semantics, PostgreSQL race protection,
> strict POST + full-list GET contract, DTO fields, Asia/Bangkok timestamps,
> Option A no hour/day/horizon/grid constraints, safe uncertain-write
> reconciliation, and denial of cross-Tutor private data. Calendar day
> navigation is a pure read-only **client-side projection**, never a business
> rule or a new GET filter. This amendment has **not** yet received
> independent peer approval; the baseline Part E history below is preserved.

> **Mandatory sequential amendment gate (new UI direction):** this
> specification/UX decision/STS update is **Part E only**. Obtain
> @Chxtamos peer acceptance and merge this docs-only amendment into
> `sprint1` before opening a separate Part F Dashboard code PR from the
> updated base. This preserves the original Issue #14 two-PR rule.
> **Additional UX-R5 obligations:** initial/retry GET 503 must not
> assert an empty schedule; unknown count remains unknown until 200.
> Network/503 uncertain logout must block protected Slot mutations until
> same-account `/auth/me` 200 confirms the live Session, or 401 clears
> identity. See [UI contract](ui-spec.md) and
> [UX-R5-GET / UX-R5-LOGOUT STS](tests.md). No backend/API/DB changes.

> **REVISED PART E / AWAITING INDEPENDENT PEER APPROVAL / NOT IMPLEMENTED OR TESTED.** Issue #14, owner @Tanaboonnnnn, reviewer @Chxtamos. Based on merged `sprint1` SHA `6fd3931` (PR #25/#26). Review feedback: [PR #27](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/27). This is a design contract, not Part F acceptance; peer review and merge precede feature code.

## Sources and traceability

Authority: [Sprint 1 requirements](../../requirements.md) Q02/Q03/Q04/Q06/Q29, FR-S1-04..07/18/19, BR-S1-02..06/11/12/17/18/20/21, AC-S1-08..14, VC/TEST-S1-08..14/37; [SRS](../../srs.md) FR-004..007, BR-002/003/004/006/029/033/034/035 and OD-001..005/011/012; [System SDS](../../system-sds.md) §§3.3/4/7.2; [Feature Inventory](../../features.md); [Traceability](../../traceability.md); [Auth Part E](../F-S1-01/specification.md) and merged PR #26; [AGENTS](../../../AGENTS.md).

The Tutor (=Staff) owns their schedule. A Slot is one explicitly dated 60-minute `Offered` interval; Tutor Schedule is an owner-filtered read projection, **not** another mutable table. Publication state does not imply unoccupied after Booking exists.

## Scope

In Part F, an authenticated active Tutor creates exactly one valid **future** 60-minute Slot for **their own** identity and reads persisted own Slots on refresh/restart. The Sprint 1 API surface is **POST /api/v1/tutor/slots** and **GET /api/v1/tutor/slots** only: no individual-detail GET, pagination or filters. Any query parameter, including `?tutorId=other`, is rejected, not used to choose an owner. Reads use authenticated `principal.userId`, ordered by `startsAt,id` ascending, with the fixed safe DTO in [HTTP contract](api-spec.md). Reject malformed/past requests, wrong role/owner, conflicting same-Tutor offers and simultaneous overlapping creates. Adjacent same-Tutor Slots and identical hours from distinct Tutors are permitted. Use Asia/Bangkok business time.

**Out of scope:** Customer availability #15, Booking and Q05 60-minute new-Booking cutoff #16, protected Booking views #17, release #18, bulk/recurring slots, edit/delete/withdraw, cancellation, notifications, summary and payments. Future `Withdrawn` compatibility is not permission to implement Sprint 2.

## Invariants and user journey

1. Tutor logs in using existing Auth, opens My Availability and sees only own committed Slots.
2. Tutor chooses Bangkok calendar date and **any minute** (`HH:mm`, e.g. 13:17); UI derives end = start + 60m. API accepts strict RFC3339 instants with explicit offset/Z and **zero seconds + zero fractional seconds only** (optional 1–3 all-zero fractional digits). Reject nonzero seconds/fractions without rounding; this transport precision does **not** add an hourly/quarter-hour start grid. Server ignores any client role or owner.
3. API checks DB-backed Session/Tutor role, Origin and HMAC CSRF. Transaction locks User principal and rechecks active Tutor and future time **after contention** using DB clock; inserts `Offered` Slot under `principal.userId`.
4. PostgreSQL CHECK enforces exactly 60m; conditional GiST EXCLUDE prevents two currently `Offered` Slots of the same Tutor overlapping. A versioned **database trigger** rejects normal SQL UPDATE/DELETE/TRUNCATE in Sprint 1 and direct INSERT into non-`Offered` lifecycle. COMMIT before 201.
5. Rejected mutation rolls back and does not change existing Slot rows. GET returns owner-filtered durable data.

Use half-open intervals `[start,end)`: overlap iff `a.start < b.end AND b.start < a.end`. 13:00–14:00 + 13:30–14:30 conflict; 13:00–14:00 + 14:00–15:00 allowed. Two Tutors can each offer 13:00–14:00.

**SLOT-I1:** exactly 60m and immutable identity/owner/interval, enforced against ordinary direct SQL by the Sprint 1 trigger (all UPDATE/DELETE/TRUNCATE rejected). **I2:** no overlapping currently Offered Slots per Tutor, even under Race A. **I3:** active Tutor-only identity from Session. **I4:** strictly future by authoritative post-lock DB time; no Q05 Booking cutoff on Slot creation. **I5:** no partial writes/false success; restart durability. **I6:** UTC storage and Bangkok display. **I7:** no Withdrawn insertion/transition in Sprint 1; later approved Sprint 2 transition is one-way `Offered -> Withdrawn`, never `Withdrawn -> Offered` on an old ID, with separately verified migration and tests. Privileged DDL/superuser tampering is outside the ordinary DML invariant and must be controlled by DB privileges.

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

## Decision record — scope owner direction and outstanding approvals

**Recorded 2026-11-04 (Asia/Bangkok).** The Issue #14 requester/owner explicitly selected **Option A** for the **Sprint 1 implementation scope** in the project conversation. This is **owner direction**, not independent stakeholder/instructor approval and not proof of 24/7 Tutor availability. Peer reviewer @Chxtamos must explicitly accept/reject this scoped no-extra-restriction decision in GitHub; stakeholder policy remains unresolved until a separate approval or requirements revision.

| Decision | Sprint 1 include/exclude decision from owner | Approval status / future change gate |
|---|---|---|
| **OD-001 / TBD-S1-01** working days/hours/holidays | **EXCLUDE** any extra hours, weekday or holiday restriction; include strictly future, valid 60m Slot rule only. | Owner chose A 2026-11-04; **peer review pending**; no 24/7 stakeholder promise. New restriction requires reviewed Q/FR/BR/AC/VC update. |
| **OD-002 / TBD-S1-02** maximum advance horizon | **EXCLUDE** a new 7/14/30-day or other business maximum; include only confirmed future-time check. | Owner chose A 2026-11-04; **peer review pending**; stakeholder maximum policy still unresolved. |
| **OD-003 / TBD-S1-03** start-minute grid | **EXCLUDE** :00-only, quarter-hour and any other start grid; **include** every `HH:mm` minute as valid if the Slot otherwise meets rules. | Owner chose A 2026-11-04; **peer review pending**; minute-level **transport precision** (zero seconds/fractions) is a separate, proposed engineering validation, not a business grid. |
| **OD-004 / TBD-S1-04** Tutor read interface | **PROPOSE** POST+own-list GET only, no detail GET or list filtering/pagination in Sprint 1; reject all query params, order `startsAt ASC,id ASC`, allowlist `id,startsAt,endsAt,lifecycle,occupancy`, empty array allowed. | Proposed engineering contract **pending @Chxtamos review**; Customer discovery #15 has separate interface. |
| **OD-005 / TBD-S1-05** transaction/error/security | **PROPOSE** `SERIALIZABLE` + Tutor User lock, DB CHECK/GiST + Sprint 1 immutability/lifecycle trigger, bounded transient retries, shared Auth CSRF/Origin and error envelope. | Proposed engineering contract **pending @Chxtamos review**; actual migrations and race tests are Part F only. |
| **OD-011/012** final Master/Theme 1 | No additional claim. | Final instructor/TA specification and formal theme assignment **unverified**; must not be treated as sign-off. |

**Changes after this decision:** additions to working hours, horizon or minute grid need a dated stakeholder/team rule, updated requirement IDs and fresh peer review; neither a form default nor an API validator may silently introduce them.

## Definition of Done / two-PR gate

**Part E:** five cross-linked versioned docs ([UI](ui-spec.md), [HTTP](api-spec.md), [data](data-spec.md), [STS](tests.md), this SDS) with decisions and Race A proof plan. Human @Chxtamos review + approved documentation PR merged into `sprint1` before feature code.

**Part F:** separate feature branch from latest `sprint1`; TDD RED→GREEN, real UI→Express→PostgreSQL, native constraint/transaction, negative auth/privacy, synchronized Race A, restart and fault tests, actual command/result/SHA evidence and peer-reviewed code PR into `sprint1`. No fabricated PASS and no direct main/sprint1 pushes. `sprint1→main` release belongs to #18.
