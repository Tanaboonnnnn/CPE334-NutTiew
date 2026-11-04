# F-S1-02 — Slot HTTP Contract (Part E)

> **REVISED PROPOSED CONTRACT / NOT IMPLEMENTED / independent peer review required.** Issue #14. Cross-references: [Feature SDS](specification.md), [UI](ui-spec.md), [Data](data-spec.md), [STS](tests.md), [Auth Contract](../F-S1-01/api-spec.md). Engineering choices below require @Chxtamos review; they are **not** instructor-approved endpoint signatures.

## Transport, authorization and ownership

Use the existing same-origin Express `/api/v1` JSON stack, DB-backed `requireSession`, `requireRole('Tutor')`, `getPrincipal(req)`, safe error envelope, per-request requestId and Cache-Control:no-store from PR #26. All Slot writes derive `tutorId` from trusted `principal.userId`; never accept client owner/role/lifecycle/end/duration. Restrict own-list SQL by `tutorId=principal.userId`.

Unsafe POST requires **canonical Origin/Referer and Sec-Fetch-Site checks plus current Session-bound X-CSRF-Token** obtained from `GET /api/v1/auth/csrf`. Do not duplicate an inconsistent CSRF implementation; small reusable guard may be extracted from Auth while retaining old Auth behavior/tests. Browser cookies remain HttpOnly.

Request timestamps require RFC3339 explicit offset or Z; do **not** interpret timezone-free date strings using browser device zone. **Minute-level protocol:** seconds **must be 00**, fractional seconds may be absent or **1–3 zero digits** (`.0`, `.00`, `.000`); reject any nonzero seconds/fractions without rounding, and reject malformed calendar dates, offsets and missing seconds. This is a **technical precision boundary**, not a business minute grid: 13:00, 13:17 and 13:59 are all valid proposed starts if future. DB stores UTC instants and API returns ISO UTC `Z` with `.000`; UI displays Asia/Bangkok.

**Positive/negative wire examples (proposed):**

| Submitted timestamp (illustrative future date) | Decision / normalized instant |
|---|---|
| `2026-11-06T13:00:00+07:00` or `2026-11-06T13:00:00.000+07:00` | Accept; `2026-11-06T06:00:00.000Z` |
| `2026-11-06T13:17:00+07:00` | Accept; `2026-11-06T06:17:00.000Z` (no top-of-hour grid) |
| `2026-11-06T13:00:30+07:00` | Reject 400 INVALID_INPUT; no silent floor/round |
| `2026-11-06T13:00:00.500+07:00` | Reject 400 INVALID_INPUT; no silent floor/round |
| `2026-11-06T13:00+07:00`, `2026-02-30T13:00:00+07:00`, timezone-free string | Reject 400 INVALID_INPUT |

The examples describe **precision**, not approval for those dates to be within Tutor working hours. All accepted timestamps must additionally pass the **strictly-future DB-time test**.

## Proposed endpoints

| Method/path | Request | Success | Enforcement |
|---|---|---|---|
| `POST /api/v1/tutor/slots` | Exactly `{"startsAt":"2026-11-06T06:00:00.000Z"}`; no query parameters | 201 committed Slot DTO | Session, Tutor, Origin, CSRF, future at DB decision, exactly 60m, native exclusion |
| `GET /api/v1/tutor/slots` | **No** query parameters, including `tutorId` | 200 own-only array (empty `[]` valid), ordered `startsAt ASC,id ASC` | Session, Tutor, SQL `WHERE "tutorId"=principal.userId` |

**OD-004 design decision proposed for approval:** **No `GET /api/v1/tutor/slots/:id`** in Sprint 1; no list filter, date range, pagination, cursor or query-based owner selector. An unknown query parameter on POST or GET (notably `?tutorId=T2`) returns **400 INVALID_INPUT** with no data. Unregistered detail paths do not retrieve a foreign/missing Slot and return 404 (no detail endpoint exists); their response body is not a defined Slot-detail DTO. The full own-list is a **Sprint 1 minimum**, not an unlimited scalability/retention guarantee; introduction of pagination or detail access requires a separately reviewed interface revision. Customer browse/read functionality is owned by #15, and protected Booking reads by #17.

### Example request

```http
POST /api/v1/tutor/slots
Origin: http://localhost:5173
Content-Type: application/json
Cookie: nuttiew_session_dev=<opaque>
X-CSRF-Token: <session-bound>

{"startsAt":"2026-11-06T06:00:00.000Z"}
```

This is 13:00 Bangkok, ending 14:00 Bangkok, for illustration only.

### Example response after confirmed COMMIT

```json
{
  "data": {
    "id": "c62bfb8b-2530-4a7c-979c-a9a6d16be0df",
    "startsAt": "2026-11-06T06:00:00.000Z",
    "endsAt": "2026-11-06T07:00:00.000Z",
    "lifecycle": "Offered",
    "occupancy": "Unoccupied"
  },
  "meta": {"requestId":"opaque-request-id"}
}
```

The **entire allowed Slot DTO** is exactly `id` (UUID), `startsAt` and `endsAt` (UTC ISO `.000Z`), `lifecycle` (currently `Offered`), and `occupancy` (`Unoccupied` or `Occupied`). No `tutorId`, User email, Customer ID, Booking payload or extra database columns are serialized. The Tutor identity is already trusted from `/api/v1/auth/me`. Own-list returns `{"data":[<same-safe-slot-DTO>],"meta":{"requestId":"..."}}`, or `{"data":[],"meta":{"requestId":"..."}}` when empty. Sort ascending `startsAt` then UUID `id`, no pagination/filter. `occupancy` is **derived**, not a mutable `Slot.isBooked` column: until #16 Booking exists each new offer is `Unoccupied`; after #16 it must be recomputed from committed active `Booked` rows and can be `Occupied` without changing `lifecycle`. Offered publication is distinct from Customer-bookable eligibility (#15). This field set/order is frozen **as a review proposal**, not peer-approved yet.

## Proposed safe errors

| Condition | Status / code | Required DB outcome |
|---|---|---|
| No valid Session | 401 UNAUTHENTICATED | No mutation/private data |
| Customer tries Tutor routes | 403 FORBIDDEN | No mutation |
| Client tries owner/role/endsAt/unknown extra POST keys | 400 INVALID_INPUT | No mutation |
| Any GET/POST query parameter, including forged `?tutorId=T2` | 400 INVALID_INPUT | No foreign response or mutation |
| Malformed/offsetless/missing start, nonzero seconds/fraction, invalid calendar/offset | 400 INVALID_INPUT | No mutation and no rounding |
| Valid but nonfuture start at post-lock DB clock | 422 SLOT_INVALID_TIME | No mutation |
| Overlap of currently Offered same-Tutor Slots | 409 SLOT_OVERLAP | Prior Slot unchanged |
| `GET /api/v1/tutor/slots/:id` (not a Sprint 1 route) | 404 (unregistered route) | No Slot-detail lookup or foreign ownership side channel |
| Missing/wrong CSRF or Origin | 403 CSRF_DENIED / ORIGIN_DENIED | No mutation |
| DB retry exhausted / unavailable | 503 SERVICE_UNAVAILABLE | No false 201; uncertain responses reconciled via own GET |
| Unexpected internal failure | 500 INTERNAL_ERROR | No raw SQL/stack/secrets |

Errors use the existing envelope `{"error":{"code":"...","message":"..."},"requestId":"..."}`; proposed SLOT-specific codes require peer sign-off. A genuine exclusion SQLSTATE 23P01 is conflict, not infinite retry; 40001/40P01 may trigger bounded **whole-transaction** retry. Never claim exactly-once HTTP delivery without approved idempotency policy.

## Review gate

Peer-review the **two-route-only** choice, minute-precision/no-rounding examples, exact allowlist and ascending order, explicit **no pagination/filter** policy, strict query rejection, trusted Tutor ownership, CSRF/Origin reuse and status mapping. Test anonymous, wrong-role, forged GET owner query, late own-list response after logout/account switch, stale cookies, overlap/race and no unsafe successful response. All tests [planned](tests.md), **not executed** in Part E.
