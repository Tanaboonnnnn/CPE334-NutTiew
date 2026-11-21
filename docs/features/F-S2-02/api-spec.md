# F-S2-02 — Customer Reschedule HTTP/API Contract (Part E)

> **Proposed API contract for independent review; not implemented or runtime-tested.** See [Feature SDS](specification.md), [UI](ui-spec.md), [data](data-spec.md), [STS](tests.md), and the accepted [F-S1-04](../F-S1-04/api-spec.md) / [F-S1-05](../F-S1-05/api-spec.md) conventions.

## 1. Transport and authorization

- Same-origin JSON under `/api/v1`; reuse request ID, `Cache-Control: no-store`, safe error envelope, cookie Session and CSRF middleware.
- Require a live active Session and `requireRole('Customer')`. Derive the owner only from `principal.userId`; the only client field is the destination `slotId`.
- The HTTP guard is preliminary. The mutation transaction locks Users, both Slots, the exact Session and the Booking, and revalidates Session liveness with `clock_timestamp()`.
- Require `X-CSRF-Token` and `X-NutTiew-Expected-Session-Binding`; apply canonical Origin/Referer rules and reject explicit cross-site requests.

## 2. Endpoint

`POST /api/v1/customer/bookings/{bookingId}/reschedule`

### Request

- Path `bookingId`: valid UUID.
- Body exactly one key: `{ "slotId": "<uuid>" }`; unknown/extra keys, wrong types, missing key or malformed UUID → 400 `INVALID_INPUT`.
- Query string must be empty.
- The destination must differ from the Booking's current Slot; equality → 409 `RESCHEDULE_NOT_APPLICABLE`.

```http
POST /api/v1/customer/bookings/6f1c1d0e-6d0f-4a7e-9f4e-2f0f6a9b1c22/reschedule HTTP/1.1
Content-Type: application/json
X-CSRF-Token: <session-bound token>
X-NutTiew-Expected-Session-Binding: <binding from /auth/me>

{ "slotId": "8d2b7c11-3a4e-4f6b-9a1c-5e7d0b2f4a63" }
```

## 3. Success response

`200 OK` only after COMMIT. The Booking ID is unchanged.

```json
{
  "data": {
    "id": "6f1c1d0e-6d0f-4a7e-9f4e-2f0f6a9b1c22",
    "slotId": "8d2b7c11-3a4e-4f6b-9a1c-5e7d0b2f4a63",
    "tutorId": "77a1c9d2-4b3e-4f5a-8c6d-1e2f3a4b5c6d",
    "tutorRef": "TUTOR-77a1c9d2",
    "startsAt": "2026-12-03T02:00:00.000Z",
    "endsAt": "2026-12-03T03:00:00.000Z",
    "status": "Booked",
    "displayStatus": "Booked",
    "cancellationActor": null,
    "cancelledAt": null,
    "cancellationReason": null,
    "createdAt": "2026-11-20T08:00:00.000Z",
    "updatedAt": "2026-11-30T10:20:00.000Z"
  },
  "meta": { "requestId": "<uuid>" }
}
```

- `slotId`, `startsAt`, `endsAt`, `tutorId` and `tutorRef` reflect the destination.
- The response does not include a history object or the previous Tutor; those are not approved for exposure in S2 (OD-015).
- No separate 201 is used: the resource already existed.

## 4. Safe error contract

| Status | Code | Condition |
|---|---|---|
| 400 | `INVALID_INPUT` | Malformed UUID, missing/extra body key, bad JSON, non-empty query, oversized body |
| 401 | `UNAUTHENTICATED` | Missing/invalid/revoked/expired Session, inactive/missing User, Session changed during the wait |
| 403 | `FORBIDDEN` | Live Session whose User is not `Customer` |
| 403 | `ORIGIN_DENIED` / `CSRF_DENIED` / `SESSION_BINDING_MISMATCH` | As in F-S2-01 |
| 404 | `BOOKING_NOT_FOUND` | Booking absent **or** owned by another Customer; identical body |
| 404 | `SLOT_NOT_FOUND` | Destination UUID does not exist |
| 409 | `RESCHEDULE_ALREADY_USED` | A successful history row already exists for this Booking |
| 409 | `RESCHEDULE_NOT_APPLICABLE` | Destination equals the current Slot, or the Booking is not `Booked` |
| 409 | `SLOT_UNAVAILABLE` | Destination is `Withdrawn`, occupied, or its Tutor is inactive/not a Tutor |
| 409 | `CUSTOMER_OVERLAP` | Destination overlaps another `Booked` Booking of the same Customer |
| 422 | `RESCHEDULE_WINDOW_CLOSED` | Original or destination start is `< 60 minutes` from `T_elig` |
| 503 | `TRANSACTION_RETRY_EXHAUSTED` / `MUTATION_OUTCOME_UNKNOWN` / `SERVICE_UNAVAILABLE` | As in F-S2-01 |

- The 422 body does not reveal which side failed.
- No error reveals another Customer's identity, a previous Tutor, SQL or a stack trace.

## 5. Concurrency and replay semantics

- Same-Booking concurrent reschedules: the Booking row lock plus `UNIQUE(RescheduleHistory.bookingId)` allow at most one success; the loser returns 409.
- Reschedule-versus-new-Booking on the destination: the shared destination Slot lock decides; the loser gets 409 `SLOT_UNAVAILABLE`.
- Reschedule-versus-Tutor-cancel: exactly one operation commits; if Tutor cancel wins, the reschedule sees `Cancelled`/no longer assigned and fails without history; if reschedule wins, the former Tutor is no longer assigned and cannot cancel the moved Booking.
- A `23505`/`23P01` is a business conflict, not permission to retry into success.
- **OD-013 remains OPEN:** after an unknown outcome the client must re-read the Booking; this contract does not define an idempotency key or original-response replay.

## 6. Boundary and review gate

Part E only. No route, handler, `RescheduleHistory` model, migration or test is implemented by Issue #114. Implementation is blocked until the shared S2 guard/`RescheduleHistory` migration and the STS are reviewed.
