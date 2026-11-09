# F-S1-05 — Protected Booking Retrieval API Specification (Part E)

> **Documentation contract only; not implemented yet.**
> Issue [#17](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/17). This document defines the HTTP endpoints, authorization rules, request/response allowlists, and error mapping for Customer-private Booking retrieval and authorized Tutor schedule inspection.

---

## 1. Authentication and Global Security Protocols

All endpoints specified in this document reuse the shared authentication, session validation, and privacy mechanisms established in `F-S1-01` and `F-S1-02`:

1. **Session Cookie:** Requires HttpOnly session cookie (`nuttiew_session` in production, `nuttiew_session_dev` in local/test). Unauthenticated requests immediately fail with `401 UNAUTHENTICATED`.
2. **Role Enforcement:** Server guards enforce role boundaries before executing business logic:
   - Customer endpoints enforce `requireRole('Customer')`.
   - Tutor endpoints enforce `requireRole('Tutor')`.
   - Any cross-role query returns `403 FORBIDDEN`.
3. **Session Binding Header:** Every successful `200 OK` response returns the `X-NutTiew-Session-Binding` header computed as `SHA-256("nuttiew-ui-binding:v1\0" + userId + "\0" + sessionId)`.
4. **Cache Control:** Every response includes `Cache-Control: no-store` to prevent private Booking records from caching on intermediary proxies or browser caches.
5. **No Query Parameters:** In Sprint 1, no filtering, sorting, or pagination query parameters are supported. If `Object.keys(req.query).length > 0`, the endpoint rejects the request with `400 INVALID_INPUT`.

---

## 2. Customer Endpoints

### 2.1 List Own Bookings
Retrieves all Bookings owned by the currently authenticated Customer.

- **Method / Path:** `GET /api/v1/customer/bookings`
- **Authorization:** Authenticated Customer only (`role = Customer`).
- **Query Parameters:** None permitted. Any query string produces `400 INVALID_INPUT`.
- **Ordering:** Deterministic ascending order: `startsAt ASC, id ASC`.

#### Success Response (`200 OK`)
```json
{
  "data": [
    {
      "id": "e4f8d53b-013d-4c57-891a-7b3c2e1f4001",
      "slotId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "tutorId": "f7a8b9c0-d1e2-3a4b-5c6d-7e8f9a0b1c2d",
      "tutorRef": "TUTOR-f7a8b9c0",
      "startsAt": "2026-11-10T09:00:00.000Z",
      "endsAt": "2026-11-10T10:00:00.000Z",
      "status": "Booked",
      "displayStatus": "Booked",
      "createdAt": "2026-11-09T08:30:00.000Z"
    },
    {
      "id": "b3c2e1f4-013d-4c57-891a-e4f8d53b0002",
      "slotId": "9c0d1e2f-3a4b-5c6d-a1b2-c3d4e5f67a8b",
      "tutorId": "5c6d7e8f-9a0b-1c2d-f7a8-b9c0d1e23a4b",
      "tutorRef": "TUTOR-5c6d7e8f",
      "startsAt": "2026-11-08T03:00:00.000Z",
      "endsAt": "2026-11-08T04:00:00.000Z",
      "status": "Booked",
      "displayStatus": "Past",
      "createdAt": "2026-11-07T14:15:00.000Z"
    }
  ],
  "meta": {
    "requestId": "9c5a1e2f-3b4c-5d6e-7f8a-9b0c1d2e3f4a",
    "evaluatedAt": "2026-11-09T11:30:00.000Z"
  }
}
```

---

### 2.2 Retrieve Booking Detail
Retrieves full details for a single specific Booking owned by the authenticated Customer.

- **Method / Path:** `GET /api/v1/customer/bookings/:id`
- **Authorization:** Authenticated Customer only (`role = Customer`).
- **Path Parameter:**
  - `id` (string, required): A standard 36-character UUID format.
- **Privacy Refusal Invariant:**
  - If the requested `:id` does not exist in the database, OR if it exists but belongs to a different Customer, the server returns **`404 BOOKING_NOT_FOUND`**.
  - The server **MUST NOT** return `403 FORBIDDEN` for another user's valid Booking ID, as returning `403` leaks the existence of that record to an unauthorized prober.

#### Success Response (`200 OK`)
```json
{
  "data": {
    "id": "e4f8d53b-013d-4c57-891a-7b3c2e1f4001",
    "slotId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
    "tutorId": "f7a8b9c0-d1e2-3a4b-5c6d-7e8f9a0b1c2d",
    "tutorRef": "TUTOR-f7a8b9c0",
    "startsAt": "2026-11-10T09:00:00.000Z",
    "endsAt": "2026-11-10T10:00:00.000Z",
    "status": "Booked",
    "displayStatus": "Booked",
    "createdAt": "2026-11-09T08:30:00.000Z",
    "updatedAt": "2026-11-09T08:30:00.000Z"
  },
  "meta": {
    "requestId": "8a7b6c5d-4e3f-2a1b-0c9d-8e7f6a5b4c3d",
    "evaluatedAt": "2026-11-09T11:30:00.000Z"
  }
}
```

---

## 3. Tutor Endpoints

### 3.1 List Tutor Own Slots (Updated with Dynamic Occupancy)
Fulfills `FR-S1-07`: A Tutor must be able to view their own Slots including whether each is `Unoccupied` or `Occupied`.

- **Method / Path:** `GET /api/v1/tutor/slots`
- **Authorization:** Authenticated Tutor only (`role = Tutor`).
- **Query Parameters:** None permitted (`Object.keys(req.query).length === 0`).
- **Behavior Update:** In `apps/api/src/slots.ts`, `occupancy` is derived via left-join or subquery against active `Booking` records (`status = 'Booked' AND currentSlotId = Slot.id`). If an active booking exists, `occupancy: 'Occupied'`; otherwise `occupancy: 'Unoccupied'`.

#### Success Response (`200 OK`)
```json
{
  "data": [
    {
      "id": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "startsAt": "2026-11-10T09:00:00.000Z",
      "endsAt": "2026-11-10T10:00:00.000Z",
      "lifecycle": "Offered",
      "occupancy": "Occupied"
    },
    {
      "id": "f6e5d4c3-b2a1-0f9e-8d7c-6b5a4f3e2d1c",
      "startsAt": "2026-11-10T11:00:00.000Z",
      "endsAt": "2026-11-10T12:00:00.000Z",
      "lifecycle": "Offered",
      "occupancy": "Unoccupied"
    }
  ],
  "meta": {
    "requestId": "7e6d5c4b-3a2f-1e0d-9c8b-7a6f5e4d3c2b"
  }
}
```

---

### 3.2 List Tutor Schedule Bookings
Fulfills `FR-S1-15` & `AC-S1-32`: An authorized Tutor inspects Bookings on their own schedule.

- **Method / Path:** `GET /api/v1/tutor/bookings`
- **Authorization:** Authenticated Tutor only (`role = Tutor`).
- **Query Parameters:** None permitted. Any query parameters produce `400 INVALID_INPUT`.
- **Query Predicate:** Filters strictly by `Slot.tutorId = principal.userId` and `Booking.status = 'Booked'`.
- **Privacy Guarantee:** Excludes other Tutors' bookings. Masks/abstracts Customer personal data to an opaque reference (`customerRef: "CUST-" + customerId.slice(0, 8)`); never returns password hashes, session cookies, or foreign contact details.

#### Success Response (`200 OK`)
```json
{
  "data": [
    {
      "id": "e4f8d53b-013d-4c57-891a-7b3c2e1f4001",
      "slotId": "a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d",
      "tutorId": "f7a8b9c0-d1e2-3a4b-5c6d-7e8f9a0b1c2d",
      "customerRef": "CUST-e4f8d53b",
      "startsAt": "2026-11-10T09:00:00.000Z",
      "endsAt": "2026-11-10T10:00:00.000Z",
      "status": "Booked",
      "displayStatus": "Booked",
      "createdAt": "2026-11-09T08:30:00.000Z"
    }
  ],
  "meta": {
    "requestId": "1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d",
    "evaluatedAt": "2026-11-09T11:30:00.000Z"
  }
}
```

---

## 4. Status and Display Classification (`Q30`, `FR-S1-17`, `BR-S1-22`)

The API explicitly returns two separate status fields to cleanly distinguish database business status from time-derived display status:

| Field | Possible Values | Semantics |
|---|---|---|
| `status` | `'Booked'` (or `'Cancelled'` in future sprints) | Authoritative database status persisted in the `Booking.status` column. |
| `displayStatus` | `'Booked'` \| `'Past'` | Time-derived presentation status computed relative to `evaluatedAt` (`meta.evaluatedAt`). If `endsAt <= evaluatedAt`, `displayStatus` is `'Past'`; otherwise `'Booked'`. |

**Rule:** `displayStatus = 'Past'` is an informative presentation label. It **never** causes the row in PostgreSQL to be marked as `Completed`, nor does it release the Slot from occupancy.

---

## 5. Structured Error Responses

All error responses adhere to the standard error envelope `{ error: { code, message }, requestId }`:

| HTTP Status | Error Code | Trigger Condition |
|---|---|---|
| `400 Bad Request` | `INVALID_INPUT` | Unrecognized query parameters, malformed `:id` (non-UUID), or invalid payload. |
| `401 Unauthorized` | `UNAUTHENTICATED` | Missing, expired, revoked, or invalid session cookie. |
| `403 Forbidden` | `FORBIDDEN` | Authenticated user lacks required role (e.g. Tutor requesting Customer endpoint, or Customer requesting Tutor endpoint). |
| `404 Not Found` | `BOOKING_NOT_FOUND` | Booking ID does not exist, or exists but belongs to a different Customer. |
| `503 Service Unavailable` | `SERVICE_UNAVAILABLE` | Database connection failure or transient pool exhaustion. |

```json
{
  "error": {
    "code": "BOOKING_NOT_FOUND",
    "message": "Booking not found"
  },
  "requestId": "3d4e5f6a-7b8c-9d0e-1f2a-3b4c5d6e7f8a"
}
```
