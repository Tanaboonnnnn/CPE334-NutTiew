# F-S1-03 — Customer Availability HTTP/API Contract (Part E)

> **Part E docs-only contract; not implemented/runtime-tested.** Peer-review decisions are recorded in [Feature SDS §5](specification.md#5-peer-review-decision-record). See [UI](ui-spec.md), [Data](data-spec.md), [STS](tests.md), [Auth API](../F-S1-01/api-spec.md), [Tutor Slot API](../F-S1-02/api-spec.md).

## 1. Transport and authorization

- Same-origin /api/v1 JSON stack. This GET has no request body.
- Use the existing HttpOnly Session cookie, requireSession and requireRole(Customer).
- Principal comes only from getPrincipal(req) and persisted live Session/User. Never accept customerId, tutorId, role, owner, status, time or eligibility from query/header/body as authority.
- Anonymous: 401 UNAUTHENTICATED. Authenticated Tutor: 403 FORBIDDEN.
- Read-only GET: no CSRF token or unsafe-method Origin check. Preserve same-origin cookie behavior and no credentialed cross-origin CORS.
- Set Cache-Control: no-store. Return the same server-derived X-NutTiew-Session-Binding header as /api/v1/auth/me and Tutor own-Slot GET so UI rejects late data from a different Session, including another Session for the same User.
- Reuse existing request ID and error envelope; do not fork Auth/session logic.

## 2. Endpoint

| Method/path | Query | Success | Enforcement |
|---|---|---|---|
| GET /api/v1/customer/availability | No query parameters (confirmed OD-AV-03) | 200 safe projection; `data: []` is a valid confirmed-empty result and still includes `meta.evaluatedAt` | Live Session, Customer role, Customer-specific read-time eligibility, allowlist, no-store |

Unknown query parameters (customerId, tutorId, from, to, page, cursor, limit or anything else) return 400 INVALID_INPUT under confirmed OD-AV-03. Any future filter/pagination requires a reviewed contract amendment; do not infer a maximum horizon/date window.

### Success response — Customer-specific bookable-only

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

Values are illustrative. Before the response is written, `data[].startsAt`, `data[].endsAt` and `meta.evaluatedAt` must all be normalized to UTC with exactly three fractional-second digits (`YYYY-MM-DDTHH:mm:ss.sssZ`). The data projection uses explicit UTC conversion/formatting (`AT TIME ZONE 'UTC'` followed by `to_char`) before constructing JSON; raw PostgreSQL `timestamptz` values must never be serialized into JSON using the connection's session `TimeZone`. The API sends those normalized strings unchanged. `evaluatedAt` is database `T_view`. Every row is bookable for the authenticated Customer at that evaluation instant only; it is not a reservation or guarantee that a later Booking succeeds. `tutorRef` is the current identity fallback because no Tutor display-name field is approved in the base schema.

An empty successful response has the same envelope and metadata, with `data: []` and a non-null RFC 3339 UTC `meta.evaluatedAt` normalized by the same explicit UTC formatting rule. The endpoint sets `Cache-Control: no-store` for populated and empty 200 responses (and for errors). The timestamp comes from the same database statement/read evaluation as the offer list; it is not omitted or generated from the application/browser clock when there are no offers. Populated and empty responses must be byte-for-byte stable in timestamp representation when the PostgreSQL connection `TimeZone` changes between `UTC` and `Asia/Bangkok` for the same persisted instants.

~~~json
{
  "data": [],
  "meta": {
    "requestId": "opaque-request-id",
    "evaluatedAt": "2026-11-08T04:30:00.000Z"
  }
}
~~~

### Exact response allowlist

| Field | Type | Meaning |
|---|---|---|
| data | array | Eligible offers under the confirmed unfiltered S1 list |
| data[].slotId | UUID string | Persisted Slot ID; identifier for later Booking selection |
| data[].tutorRef | UUID string | Opaque Tutor reference derived from Slot.tutorId |
| data[].tutorDisplayName | Not currently returned; conditional optional string only after OD-AV-02 data approval | Explicit Tutor-provided public display name; never derived from email. Until approval, this property is absent and the UI uses `tutorRef`. |
| data[].startsAt | RFC 3339 UTC string ending Z | Persisted Slot start |
| data[].endsAt | RFC 3339 UTC string ending Z | Persisted Slot end |
| meta.requestId | opaque string | Existing request correlation ID |
| meta.evaluatedAt | RFC 3339 UTC string ending Z | Database read-evaluation instant T_view |

Never serialize Prisma/SQL rows wholesale. Exclude customerId, Customer name/email/phone, Booking ID/status/reason, Tutor email/phone, unapproved Tutor profile/name fields, password hash, Session ID/token/CSRF, other DB columns, SQL errors and stack traces. Bookable-only response needs no bookable boolean. The only possible later addition is the specifically approved `tutorDisplayName` field after its data gate and migration are accepted.

OD-AV-01 is confirmed as Customer-specific bookable-only. Any later change to show unavailable offers requires a new reviewed contract amendment; it must never disclose whether unavailability is due to another Customer's Booking or the Q05 cutoff.

## 3. Ordering and read semantics

Confirmed Sprint 1 order: `startsAt ASC`, `tutorRef ASC`, `slotId ASC`. No client-selected order, filters or pagination. OD-AV-03 is a technical list constraint only; OD-002 (maximum advance horizon) remains OPEN. The absence of filters/pagination is not an approved unlimited-horizon policy or a guarantee for unlimited data volume.

Confirmed OD-AV-01/04: sample one PostgreSQL `T_view` for the read. Under Customer-specific bookable-only, a row must be lifecycle Offered, have no active Booked row for its Slot ID, satisfy startsAt - T_view >= 60 minutes, and have no overlapping Active Booking owned by `principal.userId`. The owner is derived from the live Session; it is never accepted from a query parameter, header or body. For the Customer-overlap check, only `status = Booked` rows with `customerId = principal.userId` participate, using persisted Booking interval fields and the half-open predicate `booking.startsAt < slot.endsAt AND slot.startsAt < booking.endsAt`. Cancelled rows do not conflict and adjacent intervals are allowed. This predicate checks existence only and never returns Booking details. Exactly 60:00 is included; 59:59 is excluded. Never use browser time or HTTP arrival time. T_view is not #16 T_elig; #16 repeats the authoritative checks after contention waits.

## 4. Safe errors

| Condition | Status/code | Behavior |
|---|---|---|
| Missing/expired/revoked Session | 401 UNAUTHENTICATED | No offer data |
| Authenticated wrong role | 403 FORBIDDEN | No offer data |
| Unknown/malformed query | 400 INVALID_INPUT | No query-dependent data |
| PostgreSQL unavailable/transient read failure | 503 SERVICE_UNAVAILABLE | Sanitized error; no empty-list fallback |
| Unexpected internal failure | 500 INTERNAL_ERROR | Sanitized; no SQL/stack details |

Error envelope follows the existing API: `{ error: { code, message }, requestId }`. Keep `Cache-Control: no-store` on every success and error response, including 401/403/400/500/503. A failed request is not equivalent to 200 with `data: []`.

## 5. Endpoint boundary

No POST, Booking mutation, reservation hold, Booking confirmation or idempotency key in #15. Do not reuse Tutor own-schedule route. No owner selector, filter, detail route or private Booking read. Selection carries only slotId to #16; #16 owns transactional recheck and Booking outcomes.

## 6. Implementation dependency and verification status

The current sprint1 schema has no Booking model. The Slot-occupancy and Customer-overlap `NOT EXISTS` predicates against active Booked rows are **logical contracts**, not executable against the current schema. Do not ship as “all Slots are unoccupied” or add `Slot.isBooked`. The selected route is a separately scoped shared Booking data-foundation Issue/PR (route B); its Issue/PR and accepted schema SHA are not yet created/recorded. Keep Part F blocked until that foundation is reviewed, merged and its exact SHA is recorded as described in [Feature SDS §2](specification.md).

### Conditional Tutor display-name data gate (OD-AV-02)

- Candidate source: a public display name explicitly supplied and maintained by the Tutor; never infer it from `User.email` or login identity.
- Candidate field: nullable `User.tutorDisplayName` (`String?` / PostgreSQL `TEXT`), used only for Tutor accounts. The current schema has no such field.
- Data owner: the Tutor; customer-facing publication requires explicit Tutor opt-in and recorded product/stakeholder approval. @Chxtamos owns this contract; @Tanaboonnnnn peer-reviews it. The actual approving stakeholder and consent rule must be recorded before migration.
- Migration: a separate reviewed forward-only migration only after approval; no default and no email backfill. Existing rows remain `NULL`; seed only clearly test-only synthetic values in isolated fixtures.
- Current response: omit `tutorDisplayName`; return `tutorRef`. Only after approval may the exact allowlist add the nullable display-name field. Never add email, phone or unrestricted profile data.
- Planned privacy test: AVA-18 verifies no name is inferred from email, no unapproved field appears, and—after approval only—the approved field is the sole additional Tutor identity property.

This document defines the Part E endpoint contract only. No route, query, API test, browser test or performance result is claimed to exist or pass.
