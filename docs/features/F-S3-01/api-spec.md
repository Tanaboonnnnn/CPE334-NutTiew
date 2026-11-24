# F-S3-01 — Tutor Appointment Summary HTTP/API Contract (Part E)

> **D2 Past Booked implemented (`#145` / PR `#156`); Final extension (`#146` / `#147`) remains planned and gated on `OD-006` disposition and human peer review.** See [Feature SDS](specification.md), [UI](ui-spec.md), [data](data-spec.md), [STS](tests.md), and [readiness-gate](readiness-gate.md#od-006--in-progress-booking-classification).

## 1. Transport and authorization

- Same-origin JSON under `/api/v1`; reuse `requestId`, `Cache-Control: no-store`, `X-NutTiew-Session-Binding`, safe error envelope, and cookie Session middleware.
- Requires a live active Session and `requireRole('Tutor')`. The Tutor identity is derived strictly from `principal.userId`; no client `tutorId`, date, or status parameter is accepted.
- Read-only `GET`; no CSRF header required (consistent with `GET /api/v1/tutor/bookings` and `GET /api/v1/tutor/slots`).

## 2. Endpoint

`GET /api/v1/tutor/summary`

- Query string must be empty; any query parameter → `400 INVALID_INPUT`.

### 2.1 D2 increment response (`200 OK`)

For the Deliverable 2 increment, the endpoint evaluates and returns the **Past Booked** count and matching list under one authoritative PostgreSQL `evaluatedAt` snapshot. For both D2 and Final, serialize `meta.evaluatedAt` as UTC ISO 8601 with exactly six fractional digits (`YYYY-MM-DDTHH:mm:ss.ffffffZ`), following the [data contract](data-spec.md). Preserve the exact SQL snapshot; do not round or truncate to milliseconds. This precision rule is for `meta.evaluatedAt`, not the booking DTO timestamps.

```json
{
  "data": {
    "pastBookedCount": 1,
    "pastBooked": [
      {
        "id": "6f1c1d0e-6d0f-4a7e-9f4e-2f0f6a9b1c22",
        "slotId": "0b6a2f6e-6f0e-4a4a-8d5f-2b1c9e7a3d10",
        "customerRef": "CUST-4a8e19c0",
        "startsAt": "2026-11-10T03:00:00.000Z",
        "endsAt": "2026-11-10T04:00:00.000Z",
        "status": "Booked",
        "displayStatus": "Past",
        "createdAt": "2026-11-09T08:00:00.000Z"
      }
    ]
  },
  "meta": {
    "requestId": "<uuid>",
    "evaluatedAt": "2026-11-22T11:00:00.000123Z"
  }
}
```

### 2.2 Full Final response extension (mandatory by 30 Nov / Final 13 Dec; `inProgressBooked` Option 1 PROPOSED — gated on `OD-006`)

When Upcoming Booked and Cancelled are implemented for Final (gated on explicit `OD-006` stakeholder/authorized product-owner disposition, Part E contract sync, actual human peer review, and `sprint3` merge before `#146` code), `data` extends additively under the **same** single-statement `meta.evaluatedAt` snapshot without breaking D2 consumers. Under **proposed `OD-006` Option 1**, the three `Booked` intervals are mutually disjoint and cover every `status = 'Booked'` row with zero new persisted state (`count === list.length` for every category):

- `upcomingBookedCount: number`, `upcomingBooked: TutorSummaryBookingDto[]` (`status: 'Booked'`, `displayStatus: 'Booked'`, `startsAt > evaluatedAt`, ordered `startsAt ASC, id ASC`)
- `inProgressBookedCount: number`, `inProgressBooked: TutorSummaryBookingDto[]` (`status: 'Booked'`, `displayStatus: 'Booked'`, `startsAt <= evaluatedAt AND endsAt > evaluatedAt`, ordered `startsAt ASC, id ASC`; **PROPOSED `OD-006` Option 1 in PR `#157` — gated on explicit `OD-006` disposition and actual human peer review before `#146` code**)
- `pastBookedCount: number`, `pastBooked: TutorSummaryBookingDto[]` (`status: 'Booked'`, `displayStatus: 'Past'`, `endsAt <= evaluatedAt`, ordered `endsAt DESC, id DESC`)
- `cancelledCount: number`, `cancelled: TutorSummaryCancelledDto[]` (`status: 'Cancelled'`, `displayStatus: 'Cancelled'`, ordered `cancelledAt DESC, id DESC`)

#### Exact DTO allowlists

**`TutorSummaryBookingDto`** (exact 8 keys — no `customerId`, no email, no cancellation reason):
```ts
type TutorSummaryBookingDto = {
  id: string;
  slotId: string;
  customerRef: string; // 'CUST-' + customerId.slice(0, 8)
  startsAt: string;    // UTC ISO-8601
  endsAt: string;      // UTC ISO-8601
  status: 'Booked';
  displayStatus: 'Booked' | 'Past';
  createdAt: string;   // UTC ISO-8601
};
```

**`TutorSummaryCancelledDto`** (exact 10 keys — explicitly omits `tutorCancellationReason` to preserve `BR-022`/`NFR-007`):
```ts
type TutorSummaryCancelledDto = {
  id: string;
  slotId: string;
  customerRef: string;               // 'CUST-' + customerId.slice(0, 8)
  startsAt: string;                  // UTC ISO-8601
  endsAt: string;                    // UTC ISO-8601
  status: 'Cancelled';
  displayStatus: 'Cancelled';
  cancellationActor: 'Customer' | 'Tutor';
  cancelledAt: string;               // UTC ISO-8601
  createdAt: string;                 // UTC ISO-8601
};
```

## 3. Safe error contract

| Status | Code | Condition |
|---|---|---|
| 400 | `INVALID_INPUT` | Non-empty query string |
| 401 | `UNAUTHENTICATED` | Missing/invalid/revoked/expired Session or inactive User |
| 403 | `FORBIDDEN` | Live Session whose User role is not `Tutor` (e.g., `Customer`) |
| 503 | `SERVICE_UNAVAILABLE` | Database unavailable; no partial or fabricated counts |

- Never exposes Customer email, cancellation reason, password hashes, Session/CSRF tokens, foreign Tutor records, SQL, or stack traces.
