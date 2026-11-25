# F-S2-04 — Private Tutor-Cancellation Notice HTTP/API Contract (Part E)

> **Proposed API contract for independent review; not implemented or runtime-tested.** See [Feature SDS](specification.md), [UI](ui-spec.md), [data](data-spec.md), [STS](tests.md), and the accepted [F-S1-05 API](../F-S1-05/api-spec.md).

## 1. Transport and authorization

- Same-origin JSON under `/api/v1`; reuse request ID, `Cache-Control: no-store`, safe error envelope, cookie Session and CSRF middleware.
- All three endpoints require a live active Session and `requireRole('Customer')`. The recipient is always `principal.userId`; no client recipient/owner parameter exists.
- Read endpoints (`GET`) use the normal Session guard. The mark-read `POST` also requires `X-CSRF-Token` **and** `X-NutTiew-Expected-Session-Binding` from the existing authenticated `/auth/me` flow, and applies the canonical Origin/Referer rules. A missing/mismatched binding is rejected before mutation, consistent with other Sprint 2 POSTs.
- Responses never include another Customer's identity, a Tutor's private data beyond `tutorRef`, credentials, Session/CSRF data, SQL or a stack trace.

## 2. Endpoints

### 2.1 List own notices

`GET /api/v1/customer/notifications`

- Empty query string only.
- Returns all own `TutorCancelled` notices, newest `createdAt` first, then `id` for stability. No pagination, filtering or time-expiry predicate in S2.

```json
{
  "data": [
    {
      "id": "a1b2c3d4-1111-4222-8333-444455556666",
      "kind": "TutorCancelled",
      "createdAt": "2026-11-30T10:30:00.000Z",
      "readAt": null,
      "reason": "Instructor unavailable due to a department meeting.",
      "booking": {
        "id": "6f1c1d0e-6d0f-4a7e-9f4e-2f0f6a9b1c22",
        "slotId": "0b6a2f6e-6f0e-4a4a-8d5f-2b1c9e7a3d10",
        "tutorRef": "TUTOR-2c9d1a44",
        "startsAt": "2026-12-01T03:00:00.000Z",
        "endsAt": "2026-12-01T04:00:00.000Z",
        "status": "Cancelled",
        "cancelledAt": "2026-11-30T10:30:00.000Z"
      }
    }
  ],
  "meta": { "requestId": "<uuid>" }
}
```

### 2.2 Retrieve one own notice

`GET /api/v1/customer/notifications/{notificationId}`

- Same DTO as one list item.
- Foreign or unknown notice → 404 `NOTIFICATION_NOT_FOUND` with an identical body.

### 2.3 Mark one own notice read

`POST /api/v1/customer/notifications/{notificationId}/read`

- Empty JSON body `{}`; any key → 400 `INVALID_INPUT`.
- Idempotent: if `readAt` is already set, return 200 with the original value; otherwise set `readAt = clock_timestamp()` and return 200.
- The notice content, reason and Booking association never change.

```json
{
  "data": {
    "id": "a1b2c3d4-1111-4222-8333-444455556666",
    "kind": "TutorCancelled",
    "createdAt": "2026-11-30T10:30:00.000Z",
    "readAt": "2026-11-30T11:00:00.000Z",
    "reason": "Instructor unavailable due to a department meeting.",
    "booking": {
      "id": "6f1c1d0e-6d0f-4a7e-9f4e-2f0f6a9b1c22",
      "slotId": "0b6a2f6e-6f0e-4a4a-8d5f-2b1c9e7a3d10",
      "tutorRef": "TUTOR-2c9d1a44",
      "startsAt": "2026-12-01T03:00:00.000Z",
      "endsAt": "2026-12-01T04:00:00.000Z",
      "status": "Cancelled",
      "cancelledAt": "2026-11-30T10:30:00.000Z"
    }
  },
  "meta": { "requestId": "<uuid>" }
}
```

## 3. Safe error contract

| Status | Code | Condition |
|---|---|---|
| 400 | `INVALID_INPUT` | Malformed UUID, non-empty query, non-empty body on read-marking, bad JSON, oversized body |
| 401 | `UNAUTHENTICATED` | Missing/invalid/revoked/expired Session or inactive/missing User |
| 403 | `FORBIDDEN` | Live Session whose User is not `Customer` |
| 403 | `ORIGIN_DENIED` / `CSRF_DENIED` / `SESSION_BINDING_MISMATCH` | On the read-marking POST, as in F-S2-01 |
| 404 | `NOTIFICATION_NOT_FOUND` | Notice absent **or** addressed to another Customer; identical body |
| 503 | `SERVICE_UNAVAILABLE` | DB unavailable; no partial state |

- A missing Booking or reason cannot be silently replaced with fabricated content; the request fails closed.
- No response includes another Customer's notice, a Tutor's identity beyond `tutorRef`, credentials, SQL or a stack trace.

## 4. Durability and concurrency semantics

- No automatic expiry: the queries have no `createdAt`/`readAt` cutoff.
- No delete/archive endpoint is provided; OD-008 remains open.
- Concurrent mark-read calls: `COALESCE("readAt", clock_timestamp())` yields one persisted timestamp; all callers return that value.
- A notice is created only by a committed Tutor cancellation (F-S2-03); Customer cancellation and reschedule create none.
- The same reason is available in the owner's cancelled Booking detail through the shared Sprint 2 DTO extension.

## 5. Boundary and review gate

Part E only. No route, handler, table, migration or test is implemented by Issue #114. Implementation is blocked until the F-S2-03 `Notification` migration, the notice guard and the STS are reviewed.
