# F-S1-03 — Customer Availability HTTP/API Contract (Part E)

> **Proposed docs-only contract; not implemented/runtime-tested.** See [Feature SDS](specification.md), [UI](ui-spec.md), [Data](data-spec.md), [STS](tests.md), [Auth API](../F-S1-01/api-spec.md), [Tutor Slot API](../F-S1-02/api-spec.md).

## 1. Transport and authorization

- Same-origin /api/v1 JSON stack. This GET has no request body.
- Use the existing HttpOnly Session cookie, requireSession and requireRole(Customer).
- Principal comes only from getPrincipal(req) and persisted live Session/User. Never accept customerId, tutorId, role, owner, status, time or eligibility from query/header/body as authority.
- Anonymous: 401 UNAUTHENTICATED. Authenticated Tutor: 403 FORBIDDEN.
- Read-only GET: no CSRF token or unsafe-method Origin check. Preserve same-origin cookie behavior and no credentialed cross-origin CORS.
- Set Cache-Control: no-store. Return the same server-derived X-NutTiew-Session-Binding header as /api/v1/auth/me and Tutor own-Slot GET so UI rejects late data from a different Session, including another Session for the same User.
- Reuse existing request ID and error envelope; do not fork Auth/session logic.

## 2. Proposed endpoint

| Method/path | Query | Success | Enforcement |
|---|---|---|---|
| GET /api/v1/customer/availability | No query parameters in this S1 proposal | 200 safe projection; data: [] is a valid confirmed-empty result | Live Session, Customer role, read-time eligibility, allowlist, no-store |

Unknown query parameters (customerId, tutorId, from, to, page, cursor, limit or anything else) return 400 INVALID_INPUT under this no-filter/no-pagination proposal. Any future filter/pagination requires a reviewed contract amendment; do not infer a maximum horizon/date window.

### Proposed success response — bookable-only

~~~json
{
  "data": [
    {
      "slotId": "c62bfb8b-2530-4a7c-979c-a9a6d16be0df",
      "tutorRef": "4a6f3e1b-58f0-4d6e-9e4c-1c2a5b6d7e8f",
      "startsAt": "2026-11-08T06:00:00.000Z",
      "endsAt": "2026-11-08T07:00:00.000Z"
    }
  ],
  "meta": {
    "requestId": "opaque-request-id",
    "evaluatedAt": "2026-11-08T04:30:00.000Z"
  }
}
~~~

Values are illustrative. evaluatedAt is database T_view. Every row is bookable at that evaluation instant only; it is not a reservation or guarantee that a later Booking succeeds.

### Exact response allowlist

| Field | Type | Meaning |
|---|---|---|
| data | array | Eligible offers under the proposed unfiltered S1 list |
| data[].slotId | UUID string | Persisted Slot ID; identifier for later Booking selection |
| data[].tutorRef | UUID string | Opaque Tutor reference derived from Slot.tutorId |
| data[].startsAt | RFC 3339 UTC string ending Z | Persisted Slot start |
| data[].endsAt | RFC 3339 UTC string ending Z | Persisted Slot end |
| meta.requestId | opaque string | Existing request correlation ID |
| meta.evaluatedAt | RFC 3339 UTC string ending Z | Database read-evaluation instant T_view |

Never serialize Prisma/SQL rows wholesale. Exclude customerId, Customer name/email/phone, Booking ID/status/reason, Tutor email/phone, password hash, Session ID/token/CSRF, other DB columns, SQL errors and stack traces. Bookable-only response needs no bookable boolean.

If peer review rejects bookable-only and accepts unavailable entries, revise before implementation: add explicit boolean bookable and a generic unavailable label only; never disclose whether unavailability is due to another Customer's Booking or Q05 cutoff.

## 3. Ordering and read semantics

Proposed order: startsAt ASC, tutorRef ASC, slotId ASC. No client-selected order. This draft returns the eligible list without filters or pagination; OD-002 (maximum advance horizon) remains OPEN. The absence of a cap in this draft is not an approved unlimited-horizon policy. Resolve OD-002 and revise the query contract before Part F; this is not a guarantee for unlimited data volume.

Sample T_view once using the database clock. Under bookable-only, a row must be lifecycle Offered, have no active Booked row for its Slot ID, and satisfy startsAt - T_view >= 60 minutes. Exactly 60:00 is included; 59:59 is excluded. Never use browser time or HTTP arrival time. T_view is not #16 T_elig; #16 repeats the authoritative check after contention waits.

## 4. Safe errors

| Condition | Status/code | Behavior |
|---|---|---|
| Missing/expired/revoked Session | 401 UNAUTHENTICATED | No offer data |
| Authenticated wrong role | 403 FORBIDDEN | No offer data |
| Unknown/malformed query | 400 INVALID_INPUT | No query-dependent data |
| PostgreSQL unavailable/transient read failure | 503 SERVICE_UNAVAILABLE | Sanitized error; no empty-list fallback |
| Unexpected internal failure | 500 INTERNAL_ERROR | Sanitized; no SQL/stack details |

Error envelope follows the existing API: { error: { code, message }, requestId }. Keep no-store on errors. A failed request is not equivalent to 200 with data: [].

## 5. Endpoint boundary

No POST, Booking mutation, reservation hold, Booking confirmation or idempotency key in #15. Do not reuse Tutor own-schedule route. No owner selector, filter, detail route or private Booking read. Selection carries only slotId to #16; #16 owns transactional recheck and Booking outcomes.

## 6. Implementation dependency and verification status

The current sprint1 schema has no Booking model. The NOT EXISTS predicate against active Booked rows is a **logical contract**, not executable against the current schema. Do not ship as “all Slots are unoccupied” or add Slot.isBooked. Resolve the shared Booking schema/#16 sequencing gate in [Feature SDS §2](specification.md) before Part F claims occupied-Slot correctness.

This document defines a proposed endpoint only. No route, query, API test, browser test or performance result is claimed to exist or pass.
