# F-S2-01 — Customer Cancellation HTTP/API Contract (Part E)

> **Proposed API contract for independent review; not implemented or runtime-tested.** See [Feature SDS](specification.md), [UI](ui-spec.md), [data](data-spec.md), [STS](tests.md), and the accepted [F-S1-04 API](../F-S1-04/api-spec.md) / [F-S1-05 API](../F-S1-05/api-spec.md) conventions.

## 1. Transport and authorization

- Same-origin JSON under the existing Express `/api/v1`; reuse the request ID, `Cache-Control: no-store`, safe error envelope and cookie/Session middleware.
- Require a live active Session and `requireRole('Customer')`. Derive the owner only from `principal.userId`; never accept `customerId`, `status`, `startsAt`, `endsAt` or a reason from the client.
- The HTTP guard is preliminary. The mutation transaction locks the owner Customer and the current Slot's Tutor Users, then the Slot, then the exact `principal.sessionId`, then the Booking, and revalidates the Session with `revokedAt IS NULL AND expiresAt > clock_timestamp()`.
- Reuse the Auth CSRF scheme: `GET /api/v1/auth/csrf`, then require `X-CSRF-Token` on this POST. Require `X-NutTiew-Expected-Session-Binding` from `GET /api/v1/auth/me`; mismatch returns 403 `SESSION_BINDING_MISMATCH` before mutation.
- Apply the canonical Origin/Referer rules and reject `Sec-Fetch-Site: cross-site`; no credentialed cross-origin CORS.

## 2. Endpoint

`POST /api/v1/customer/bookings/{bookingId}/cancel`

### Request

- Path `bookingId`: UUID v4-shaped string accepted by `isValidUuid`; malformed → 400 `INVALID_INPUT`.
- Query string must be empty.
- Body must be an empty JSON object `{}`; any key is rejected with 400 `INVALID_INPUT`.
- Required headers: `X-CSRF-Token`, `X-NutTiew-Expected-Session-Binding`, valid same-origin `Origin`/`Referer`.

```http
POST /api/v1/customer/bookings/6f1c1d0e-6d0f-4a7e-9f4e-2f0f6a9b1c22/cancel HTTP/1.1
Content-Type: application/json
X-CSRF-Token: <session-bound token>
X-NutTiew-Expected-Session-Binding: <binding from /auth/me>

{}
```

## 3. Success response

`200 OK` only after PostgreSQL acknowledges COMMIT.

```json
{
  "data": {
    "id": "6f1c1d0e-6d0f-4a7e-9f4e-2f0f6a9b1c22",
    "slotId": "0b6a2f6e-6f0e-4a4a-8d5f-2b1c9e7a3d10",
    "tutorId": "2c9d1a44-3f7e-4a2b-9c1d-8e5f0a6b7c31",
    "tutorRef": "TUTOR-2c9d1a44",
    "startsAt": "2026-12-01T03:00:00.000Z",
    "endsAt": "2026-12-01T04:00:00.000Z",
    "status": "Cancelled",
    "displayStatus": "Cancelled",
    "cancellationActor": "Customer",
    "cancelledAt": "2026-11-30T10:15:00.000Z",
    "cancellationReason": null,
    "createdAt": "2026-11-20T08:00:00.000Z",
    "updatedAt": "2026-11-30T10:15:00.000Z"
  },
  "meta": { "requestId": "<uuid>" }
}
```

- Timestamps are UTC `Z` strings formatted by PostgreSQL, as in F-S1-05; the UI renders Asia/Bangkok.
- `status` and `displayStatus` are both `Cancelled`; a Cancelled Booking is never `Past`.
- `cancellationActor` is `Customer`; `cancellationReason` is always `null` on this path.
- The original Slot is **not** returned here; a separate availability read reflects the reopened offer.

## 4. Safe error contract

| Status | Code | Condition |
|---|---|---|
| 400 | `INVALID_INPUT` | Malformed UUID, non-empty body/query, bad JSON, oversized body |
| 401 | `UNAUTHENTICATED` | Missing/invalid/revoked/expired Session, inactive or missing User, Session changed during the wait |
| 403 | `FORBIDDEN` | Live Session whose User is not `Customer` |
| 403 | `ORIGIN_DENIED` | Explicit cross-site request or non-canonical Origin/Referer |
| 403 | `CSRF_DENIED` | Missing/mismatched session-bound CSRF token |
| 403 | `SESSION_BINDING_MISMATCH` | Missing/mismatched expected binding header |
| 404 | `BOOKING_NOT_FOUND` | Booking absent **or** owned by another Customer; identical body |
| 409 | `BOOKING_NOT_CANCELLABLE` | Booking is already `Cancelled` (terminal) or not `Booked` |
| 422 | `CANCELLATION_WINDOW_CLOSED` | `Booking.startsAt - T_elig < 30 minutes` |
| 503 | `TRANSACTION_RETRY_EXHAUSTED` | Three retryable aborts without a decision |
| 503 | `MUTATION_OUTCOME_UNKNOWN` | COMMIT acknowledgement lost; state may or may not be committed |
| 503 | `SERVICE_UNAVAILABLE` | Connection/DB unavailable before a decision |

- `CANCELLATION_WINDOW_CLOSED`, `BOOKING_NOT_CANCELLABLE` and `MUTATION_OUTCOME_UNKNOWN` must be added to the `messages` map at implementation; the response shape stays `{ error: { code, message }, requestId }`.
- No error reveals whether a foreign Booking exists, another Customer's identity, the Tutor's private data, SQL text or a stack trace.

## 5. Concurrency and replay semantics

- Exactly one `Booked → Cancelled` transition may commit. A concurrent second cancel re-reads `Cancelled` and returns 409, never a second effect.
- While the original Booking is still `Booked`, a contender **cannot** book that Slot. If the contender obtains the Slot lock before the cancellation commits, it receives `409 SLOT_UNAVAILABLE`; the owner may subsequently cancel, leaving **no** new Booking. If cancellation commits first, the contender may book only if the independent Q05 60-minute cutoff and all other new-Booking checks pass. The final state may therefore be `(original Cancelled + one new Booked)`, `(original Cancelled + no new Booked)`, or `(original Booked + no new Booked)` if the cancellation itself is rejected. Never accept two active `Booked` rows.
- **OD-013 remains OPEN:** this contract does not define an idempotency key, replay window or "return the original 200 on retry" protocol. After an unknown outcome the client must perform an authenticated re-read of the Booking.
- The server must not convert a genuine `23505`/`23P01` into a success. Such a conflict on this path is an invariant breach and fails closed.

## 6. Boundary and review gate

This is a Part E contract. No route, handler, DTO change, migration or test is implemented by Issue #114. Implementation is blocked until the S2 Booking guard migration is separately reviewed and the STS cases are approved.
