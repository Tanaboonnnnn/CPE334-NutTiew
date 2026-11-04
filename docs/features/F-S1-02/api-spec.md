# F-S1-02 — Slot HTTP Contract (Part E)

> **PROPOSED / NOT IMPLEMENTED / human review required.** Issue #14. Cross-references: [Feature SDS](specification.md), [UI](ui-spec.md), [Data](data-spec.md), [STS](tests.md), [Auth Contract](../F-S1-01/api-spec.md). Proposed interface choices, **not** instructor-approved endpoint signatures.

## Transport, authorization and ownership

Use the existing same-origin Express `/api/v1` JSON stack, DB-backed `requireSession`, `requireRole('Tutor')`, `getPrincipal(req)`, safe error envelope, per-request requestId and Cache-Control:no-store from PR #26. All Slot writes derive `tutorId` from trusted `principal.userId`; never accept client owner/role/lifecycle/end/duration. Restrict own-list SQL by `tutorId=principal.userId`.

Unsafe POST requires **canonical Origin/Referer and Sec-Fetch-Site checks plus current Session-bound X-CSRF-Token** obtained from `GET /api/v1/auth/csrf`. Do not duplicate an inconsistent CSRF implementation; small reusable guard may be extracted from Auth while retaining old Auth behavior/tests. Browser cookies remain HttpOnly.

Request timestamps require RFC3339 explicit offset or Z; do **not** interpret timezone-free date strings using browser device zone. DB stores UTC instants and API returns ISO UTC Z; UI displays Asia/Bangkok.

## Proposed endpoints

| Method/path | Request | Success | Enforcement |
|---|---|---|---|
| `POST /api/v1/tutor/slots` | Exactly `{"startsAt":"2026-11-06T06:00:00.000Z"}` | 201 committed Slot DTO | Session, Tutor, Origin, CSRF, future at DB decision, exactly 60m, native exclusion |
| `GET /api/v1/tutor/slots` | No tutorId from client | 200 owner-only ordered rows | Session, Tutor, `WHERE tutorId=principal.userId` |
| `GET /api/v1/tutor/slots/:id` *(optional)* | UUID | 200 owned row or safe 404 | DB predicate combines slotId and principal.userId |

Detail endpoint is optional unless explicitly approved in peer review. Ordering `startsAt,id` is a proposal; decide pagination/filter policy as part of OD-004, without invented mandatory list limits.

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

Owner list returns `{"data":[<same-safe-slot-DTO>],"meta":{"requestId":"..."}}`; no Customer identity or Booking private data. `occupancy` is **derived**, not a mutable `Slot.isBooked` column; until #16 Booking exists new offers are unoccupied. After #16 it must derive from committed Booked rows, not unconditionally claim free. Offered publication is distinct from Customer-bookable eligibility (#15).

## Proposed safe errors

| Condition | Status / code | Required DB outcome |
|---|---|---|
| No valid Session | 401 UNAUTHENTICATED | No mutation/private data |
| Customer tries Tutor routes | 403 FORBIDDEN | No mutation |
| Client tries owner/role/endsAt/unknown extra keys | 400 INVALID_INPUT | No mutation |
| Malformed/offsetless/missing start | 400 INVALID_INPUT | No mutation |
| Valid but nonfuture start at post-lock DB clock | 422 SLOT_INVALID_TIME | No mutation |
| Overlap of currently Offered same-Tutor Slots | 409 SLOT_OVERLAP | Prior Slot unchanged |
| Foreign or missing owned-detail id | 404 NOT_FOUND | Indistinguishable response |
| Missing/wrong CSRF or Origin | 403 CSRF_DENIED / ORIGIN_DENIED | No mutation |
| DB retry exhausted / unavailable | 503 SERVICE_UNAVAILABLE | No false 201; uncertain responses reconciled via own GET |
| Unexpected internal failure | 500 INTERNAL_ERROR | No raw SQL/stack/secrets |

Errors use the existing envelope `{"error":{"code":"...","message":"..."},"requestId":"..."}`; proposed SLOT-specific codes require peer sign-off. A genuine exclusion SQLSTATE 23P01 is conflict, not infinite retry; 40001/40P01 may trigger bounded **whole-transaction** retry. Never claim exactly-once HTTP delivery without approved idempotency policy.

## Review gate

Approve the paths (including whether detail exists), timestamp precision, field allowlist/ordering, no arbitrary Tutor ownership from requests, CSRF/Origin reuse and status mapping. Test anonymous, wrong-role, foreign owner, forged fields, stale cookies, overlap/race and no unsafe successful response. All tests [planned](tests.md), **not executed** in Part E.
