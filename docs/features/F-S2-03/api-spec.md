# F-S2-03 — Tutor Cancellation HTTP/API Contract (Part E)

> **Proposed API contract for independent review; not implemented or runtime-tested.** See [Feature SDS](specification.md), [UI](ui-spec.md), [data](data-spec.md), [STS](tests.md), and the accepted [F-S1-05 API](../F-S1-05/api-spec.md).

## 1. Transport and authorization

- Same-origin JSON under `/api/v1`; reuse request ID, `Cache-Control: no-store`, safe error envelope, cookie Session and CSRF middleware.
- Require a live active Session and `requireRole('Tutor')`. Derive the Tutor only from `principal.userId`; never accept a Tutor ID, Customer ID, status or time from the client.
- The HTTP guard is preliminary. The transaction locks the assigned Tutor and owning Customer Users, the Slot, the exact Session and the Booking, and revalidates the Session with `clock_timestamp()`.
- Require `X-CSRF-Token` and `X-NutTiew-Expected-Session-Binding`; apply canonical Origin/Referer rules and reject explicit cross-site requests.

## 2. Endpoint

`POST /api/v1/tutor/bookings/{bookingId}/cancel`

### Request

- Path `bookingId`: valid UUID.
- Body exactly one key: `{ "reason": "<string>" }`; missing/extra keys or wrong type → 400 `INVALID_INPUT`.
- The server trims the reason; empty/whitespace-only → 400 `INVALID_INPUT`.
- **OD-014 remains OPEN.** A **PROPOSED** maximum of 500 Unicode code points is recorded for implementation review only; it is not an approved stakeholder rule.
- Query string must be empty.

```http
POST /api/v1/tutor/bookings/6f1c1d0e-6d0f-4a7e-9f4e-2f0f6a9b1c22/cancel HTTP/1.1
Content-Type: application/json
X-CSRF-Token: <session-bound token>
X-NutTiew-Expected-Session-Binding: <binding from /auth/me>

{ "reason": "Instructor unavailable due to a department meeting." }
```

## 3. Success response

`200 OK` only after COMMIT.

```json
{
  "data": {
    "id": "6f1c1d0e-6d0f-4a7e-9f4e-2f0f6a9b1c22",
    "slotId": "0b6a2f6e-6f0e-4a4a-8d5f-2b1c9e7a3d10",
    "startsAt": "2026-12-01T03:00:00.000Z",
    "endsAt": "2026-12-01T04:00:00.000Z",
    "status": "Cancelled",
    "cancelledAt": "2026-11-30T10:30:00.000Z"
  },
  "meta": { "requestId": "<uuid>" }
}
```

- The response deliberately omits the reason, the Customer reference and any notice identifier; the reason belongs to the owning Customer's private notice/detail.
- The Slot is now `Withdrawn`; it is not returned as an offer.
- The Tutor schedule read remains `Booked`-only in S2, so the cancelled row disappears from it.

## 4. Safe error contract

| Status | Code | Condition |
|---|---|---|
| 400 | `INVALID_INPUT` | Malformed UUID, missing/extra body key, non-string reason, blank/whitespace reason, over-length reason, bad JSON, non-empty query |
| 401 | `UNAUTHENTICATED` | Missing/invalid/revoked/expired Session, inactive/missing User, Session changed during the wait |
| 403 | `FORBIDDEN` | Live Session whose User is not `Tutor` |
| 403 | `ORIGIN_DENIED` / `CSRF_DENIED` / `SESSION_BINDING_MISMATCH` | As in F-S2-01 |
| 404 | `BOOKING_NOT_FOUND` | Booking absent **or** not currently assigned to this Tutor; identical body |
| 409 | `BOOKING_NOT_CANCELLABLE` | Booking is already `Cancelled` or not `Booked` |
| 422 | `CANCELLATION_WINDOW_CLOSED` | `Booking.startsAt - T_elig < 60 minutes` |
| 500 | `INTERNAL_ERROR` | Invariant breach: the referenced Slot is not `Offered`; fail closed, no partial result |
| 503 | `TRANSACTION_RETRY_EXHAUSTED` / `MUTATION_OUTCOME_UNKNOWN` / `SERVICE_UNAVAILABLE` | As in F-S2-01 |

- No error reveals whether a foreign Booking exists, the Customer's identity, the reason, SQL or a stack trace.
- The 500 invariant-breach path is not a business rule and must not be used to mask a guard failure.

## 5. Concurrency and replay semantics

- The Booking row lock plus terminal `Cancelled` status allow one transition; a second cancel returns 409 and creates no second notice.
- Tutor cancel versus Customer cancel: one transition; the notice exists only if the Tutor path committed; the Slot is `Withdrawn` only on the Tutor path.
- Tutor cancel versus reschedule: the Booking/Slot locks serialize; if the reschedule wins, the former Tutor is no longer assigned and gets 404; no notice/withdrawal.
- The Slot guard independently rejects withdrawal of an occupied Slot and same-ID reactivation.
- **OD-013 remains OPEN:** no idempotency key or original-response replay is defined; after an unknown outcome the client must re-read.

## 6. Boundary and review gate

Part E only. No route, handler, guard, migration or test is implemented by Issue #114. Implementation is blocked until the shared S2 Booking guard, the S2 Slot guard, the `Notification` table and the STS are reviewed.
