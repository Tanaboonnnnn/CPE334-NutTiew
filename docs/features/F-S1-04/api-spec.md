# F-S1-04 — Customer Booking HTTP/API Contract (Part E)

> **Proposed API contract for independent review; not implemented or runtime-tested.** See [Feature SDS](specification.md), [UI](ui-spec.md), [data](data-spec.md), [transaction protocol](transaction-spec.md), [STS](tests.md), and the accepted [Auth API contract](../F-S1-01/api-spec.md).

## 1. Transport and authorization

- Same-origin JSON under existing Express `/api/v1`; reuse live-session middleware, request ID, safe error envelope and `Cache-Control: no-store`.
- Require live active Session and `requireRole('Customer')`. Derive `customerId` only from `principal.userId`; derive actual Tutor/interval from PostgreSQL.
- Unsafe POST reuses canonical Origin/Referer, `Sec-Fetch-Site` and Session-bound `X-CSRF-Token` from F-S1-01. Do not create a second CSRF implementation.
- JSON UTF-8; maximum body 4 KiB; strict key allowlist; no query parameters.
- Client must not submit `customerId`, `tutorId`, role, Booking ID, status, `startsAt`, `endsAt`, duration or `T_elig`.
- No `Idempotency-Key` is required or interpreted. Replay uses authenticated `(customerId, slotId)`.
- Browser sends existing HttpOnly Session cookie automatically; tokens are never in JSON.

## 2. Endpoint

| Method/path | Request | Success | Enforcement |
|---|---|---|---|
| `POST /api/v1/customer/bookings` | Exactly `{"slotId":"<UUID>"}`; no query parameters | 201 new committed Booking; 200 same-pair replay | Customer Session/role, Origin/CSRF, User → Slot locks, SERIALIZABLE, shared #33 guard and constraints |

No GET/detail/list route is defined here. Protected Booking reads belong to #17; Customer Availability remains #15.

### Request

```http
POST /api/v1/customer/bookings
Origin: http://localhost:5173
Content-Type: application/json
Cookie: nuttiew_session_dev=<opaque>
X-CSRF-Token: <session-bound>

{"slotId":"c62bfb8b-2530-4a7c-979c-a9a6d16be0df"}
```

`slotId` must be a valid UUID. Unknown JSON keys, missing/null `slotId`, malformed JSON, oversized body or query parameters return 400 `INVALID_INPUT` (or existing shared 413 body-limit response). No owner or appointment interval is accepted from caller.

## 3. Success response

### New Booking — 201 Created, only after COMMIT acknowledgement

```json
{
  "data": {
    "id": "9b4d0c3f-0d4f-4c3a-a18d-8b4c9a6d52e1",
    "slotId": "c62bfb8b-2530-4a7c-979c-a9a6d16be0df",
    "startsAt": "2026-11-08T06:00:00.000Z",
    "endsAt": "2026-11-08T07:00:00.000Z",
    "status": "Booked"
  },
  "meta": {"requestId":"opaque-request-id"}
}
```

### Natural-key replay — 200 OK, original Booking ID

Same DTO and same `id` as previously committed Booking; no new INSERT or Booking ID.

```json
{
  "data": {
    "id": "9b4d0c3f-0d4f-4c3a-a18d-8b4c9a6d52e1",
    "slotId": "c62bfb8b-2530-4a7c-979c-a9a6d16be0df",
    "startsAt": "2026-11-08T06:00:00.000Z",
    "endsAt": "2026-11-08T07:00:00.000Z",
    "status": "Booked"
  },
  "meta": {"requestId":"new-request-id"}
}
```

Exact DTO allowlist: Booking `id`, `slotId`, UTC `startsAt`, UTC `endsAt`, business `status` and opaque request ID. Exclude `customerId`, `tutorId`, profiles, Session/CSRF fields, SQL metadata and arbitrary ORM columns. Tutor derives through Slot; #17 owns richer protected reads.

All success/error responses set `Cache-Control: no-store`. Timestamps are UTC RFC 3339 with exactly three fractional digits and `Z`; UI formats them as Asia/Bangkok.

## 4. Safe error contract

| Condition | HTTP / code | Required state |
|---|---|---|
| Missing, expired, revoked or inactive Session | 401 `UNAUTHENTICATED` | No mutation/private data |
| Authenticated non-Customer | 403 `FORBIDDEN` | No mutation |
| Invalid/missing/extra request field, malformed UUID/JSON, oversized body, query parameter | 400 `INVALID_INPUT` (or shared 413) | No mutation |
| Missing Slot | 404 `SLOT_NOT_FOUND` | No Booking/private information |
| Slot occupied by another Customer or no longer Offered | 409 `SLOT_UNAVAILABLE` | Existing row preserved; no owner disclosure |
| Customer has a different overlapping Active Booking | 409 `CUSTOMER_OVERLAP` | No conflicting row |
| Q05 fails at DB `T_elig` (59:59 or less) | 422 `BOOKING_NOT_ELIGIBLE` | No Booking/occupancy |
| Invalid Origin or Session-bound CSRF | 403 `ORIGIN_DENIED` / `CSRF_DENIED` | No mutation |
| Serialization/deadlock retry budget exhausted | 503 `TRANSACTION_RETRY_EXHAUSTED` | All attempts rolled back |
| DB unavailable before mutation / known rollback | 503 `SERVICE_UNAVAILABLE` | No false success |
| COMMIT acknowledgement lost / outcome unknown | 503 `BOOKING_OUTCOME_UNKNOWN` if possible; otherwise network failure | Do not claim rollback/success; retry same POST/`slotId` |
| Unexpected internal failure | 500 `INTERNAL_ERROR` | No raw SQL/stack/secrets |

#33 Part F must publish the precise SQLSTATE/constraint identifier for its non-Offered/Q05 INSERT rejection; #16 maps that stable result without exposing raw DB errors. BDF-D11's `0A000` is reserved for forbidden UPDATE/DELETE/TRUNCATE, not Q05.

For `23505`/`23P01`, rollback then perform one fresh exact-pair read: if committed `Booked` row belongs to this authenticated Customer and selected Slot, return 200 with original ID; otherwise return 409. Do not spin on a genuine conflict.

## 5. Boundary and review gate

Only this POST is introduced. No Booking GET/list/detail, cancellation, reschedule, deletion or Slot mutation route is added. Peer review endpoint path, request allowlist, 201/200 replay semantics, safe errors, Session/CSRF reuse, DTO privacy, timestamp format and #33 trigger error-code dependency. All API cases remain PLANNED / NOT RUN in Part E.
