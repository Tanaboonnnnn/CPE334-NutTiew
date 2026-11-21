# F-S2-05 — Tutor Slot Withdrawal HTTP/API Contract (Part E)

> **Proposed API contract for independent review; not implemented or runtime-tested.** See [Feature SDS](specification.md), [UI](ui-spec.md), [data](data-spec.md), [STS](tests.md), and the accepted [F-S1-02 API](../F-S1-02/api-spec.md).

## 1. Transport and authorization

- Same-origin JSON under `/api/v1`; reuse request ID, `Cache-Control: no-store`, safe error envelope, cookie Session and CSRF middleware.
- Require a live active Session and `requireRole('Tutor')`. Derive the Tutor only from `principal.userId`; the request contains no owner, lifecycle or time.
- The HTTP guard is preliminary. The transaction locks the Tutor User, the Slot, the exact Session, and revalidates Session liveness with `clock_timestamp()`.
- Require `X-CSRF-Token` and `X-NutTiew-Expected-Session-Binding`; apply canonical Origin/Referer rules and reject explicit cross-site requests.

## 2. Endpoint

`POST /api/v1/tutor/slots/{slotId}/withdraw`

### Request

- Path `slotId`: valid UUID.
- Body must be an empty JSON object `{}`; any key → 400 `INVALID_INPUT`.
- Query string must be empty.

```http
POST /api/v1/tutor/slots/0b6a2f6e-6f0e-4a4a-8d5f-2b1c9e7a3d10/withdraw HTTP/1.1
Content-Type: application/json
X-CSRF-Token: <session-bound token>
X-NutTiew-Expected-Session-Binding: <binding from /auth/me>

{}
```

## 3. Success response

`200 OK` only after COMMIT.

```json
{
  "data": {
    "id": "0b6a2f6e-6f0e-4a4a-8d5f-2b1c9e7a3d10",
    "startsAt": "2026-12-05T03:00:00.000Z",
    "endsAt": "2026-12-05T04:00:00.000Z",
    "lifecycle": "Withdrawn",
    "withdrawnAt": "2026-11-30T11:15:00.000Z",
    "occupancy": "Unoccupied"
  },
  "meta": { "requestId": "<uuid>" }
}
```

- The historical row is retained; it is not deleted.
- The Slot no longer appears in Customer availability.
- A later distinct Slot with a new ID may overlap this interval.

## 4. Safe error contract

| Status | Code | Condition |
|---|---|---|
| 400 | `INVALID_INPUT` | Malformed UUID, non-empty body/query, bad JSON, oversized body |
| 401 | `UNAUTHENTICATED` | Missing/invalid/revoked/expired Session, inactive/missing User, Session changed during the wait |
| 403 | `FORBIDDEN` | Live Session whose User is not `Tutor` |
| 403 | `ORIGIN_DENIED` / `CSRF_DENIED` / `SESSION_BINDING_MISMATCH` | As in F-S2-01 |
| 404 | `SLOT_NOT_FOUND` | Slot absent **or** owned by another Tutor; identical body |
| 409 | `SLOT_OCCUPIED` | A `Booked` Booking currently references the Slot |
| 409 | `SLOT_ALREADY_WITHDRAWN` | Slot is already `Withdrawn`; no reactivation |
| 422 | `SLOT_NOT_WITHDRAWABLE` | `Slot.startsAt <= T_elig` |
| 503 | `TRANSACTION_RETRY_EXHAUSTED` / `MUTATION_OUTCOME_UNKNOWN` / `SERVICE_UNAVAILABLE` | As in F-S2-01 |

- No error reveals whether a foreign Slot exists, a Customer identity, a Booking detail, SQL or a stack trace.
- A `P0B03`/`P0B04` guard rejection maps to the corresponding 409, never to success.

## 5. Concurrency and replay semantics

- The Slot row lock serializes withdrawal against new Booking, reschedule and Tutor cancellation.
- Withdrawal versus new Booking: final state is `(Offered + one Booked)` or `(Withdrawn + zero Booked)`; never `Withdrawn + Booked`.
- Withdrawal versus Tutor cancellation **when the Slot starts occupied**: if withdrawal checks first it returns `409 SLOT_OCCUPIED`; if a valid Tutor cancellation commits first, withdrawal returns `409 SLOT_ALREADY_WITHDRAWN`. Independent withdrawal cannot succeed while the Booking is active. A successful Tutor cancellation atomically writes `Cancelled + Withdrawn + one notice`.
- A second withdrawal returns 409; no same-ID reactivation.
- **OD-013 remains OPEN:** no idempotency key or original-response replay is defined; after an unknown outcome the client must re-read.

## 6. Read-path DTO extension

The existing `GET /api/v1/tutor/slots` must extend `SlotDto` for Sprint 2:

| Field | S1 | S2 |
|---|---|---|
| `lifecycle` | `'Offered'` | `'Offered' \| 'Withdrawn'` |
| `withdrawnAt` | absent | ISO string or `null` |
| `occupancy` | `'Occupied' \| 'Unoccupied'` | unchanged |

This is a Sprint 2 change to accepted Sprint 1 output and must be regression-tested. Historical withdrawn rows remain in the Tutor's own list.

## 7. Boundary and review gate

Part E only. No route, handler, guard, migration or test is implemented by Issue #114. Implementation is blocked until the shared `slot_guard_s2()` migration and the STS are reviewed.
