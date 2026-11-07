# F-S1-04 — Customer Booking HTTP/API Contract (Part E)

> **Proposed API contract for independent review; not implemented or runtime-tested.** See [Feature SDS](specification.md), [UI](ui-spec.md), [data](data-spec.md), [transaction protocol](transaction-spec.md), [STS](tests.md), and the accepted [Auth API contract](../F-S1-01/api-spec.md).

## 1. Transport and authorization

- Same-origin JSON under existing Express `/api/v1`; reuse live-session middleware, request ID, safe error envelope and `Cache-Control: no-store`.
- Require a live active Session and `requireRole('Customer')`. Derive `customerId` only from `principal.userId`; derive actual Tutor/interval from PostgreSQL.
- The HTTP `requireSession`/role check is preliminary, not sufficient for reconciliation: the SERIALIZABLE mutation locks/revalidates Customer and Tutor Users, then the exact `principal.sessionId` after all User/Slot waits. If a recognized `23505`/`23P01` causes ROLLBACK, fresh READ COMMITTED reconciliation must lock/revalidate the current User (`isActive` and `role='Customer'`) first, then the exact Session (`userId`, `revokedAt`, DB-clock `expiresAt`), before any Booking read/200 or business 409. Missing/inactive User → 401; active non-Customer → 403; invalid Session → 401; see [transaction contract](transaction-spec.md).
- Reuse Auth OD-005-C without a new CSRF scheme: obtain the stable token from `GET /api/v1/auth/csrf` using the same HttpOnly cookie; require `X-CSRF-Token` on POST. The CSRF token is valid only for the Session that issued it.
- Require `X-NutTiew-Expected-Session-Binding`, captured from `X-NutTiew-Session-Binding` on `GET /api/v1/auth/me`. It must match the current `sessionBinding(userId, sessionId)`; missing or mismatched binding returns 403 `SESSION_BINDING_MISMATCH` before mutation. This is a consistency guard, not an authentication credential.
- Unsafe POST applies the Auth canonical Origin/Referer rules and rejects explicit `Sec-Fetch-Site: cross-site`; no credentialed cross-origin CORS. The read-only `GET /api/v1/auth/csrf` may omit Origin but rejects explicit cross-site Fetch Metadata, as defined by Auth #13.
- JSON UTF-8; maximum body 4 KiB; strict key allowlist; no query parameters.
- Client must not submit `customerId`, `tutorId`, role, Booking ID, status, `startsAt`, `endsAt`, duration or `T_elig`.
- No `Idempotency-Key` is required or interpreted. Replay uses authenticated `(customerId, slotId)`.
- Browser sends the existing HttpOnly Session cookie automatically; CSRF token is held in memory only, never in JSON or persistent browser storage.

## 2. Endpoint

| Method/path | Request | Success | Enforcement |
|---|---|---|---|
| `POST /api/v1/customer/bookings` | Exactly `{"slotId":"<UUID>"}`; `X-CSRF-Token` and `X-NutTiew-Expected-Session-Binding` headers; no query parameters | 201 new committed Booking; 200 same-pair replay | Customer Session/role, Origin/CSRF/binding, User → Slot → Session locks, SERIALIZABLE, shared #33 guard and constraints |

No GET/detail/list route is defined here. Protected Booking reads belong to #17; Customer Availability remains #15.

### Request

```http
POST /api/v1/customer/bookings
Origin: http://localhost:5173
Content-Type: application/json
Cookie: nuttiew_session_dev=<opaque>
X-CSRF-Token: <session-bound>
X-NutTiew-Expected-Session-Binding: <value-from-auth-me>

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

All success/error responses set `Cache-Control: no-store`. Timestamps are UTC RFC 3339 with exactly three fractional digits and `Z`; UI formats them as Asia/Bangkok. The authenticated response must not include Session/CSRF values or owner IDs. The client applies a result only if its captured auth/session epoch and binding still match; a late response is ignored after logout or Session/account switch.

## 4. Safe error contract

| Condition | HTTP / code | Required state |
|---|---|---|
| Missing, expired, revoked Session, or missing/inactive User (including during post-ROLLBACK revalidation) | 401 `UNAUTHENTICATED` | No mutation/private data/Booking DTO |
| Authenticated active User whose current role is not Customer (including during post-ROLLBACK revalidation) | 403 `FORBIDDEN` | No mutation/private data/Booking DTO |
| Invalid/missing/extra request field, malformed UUID/JSON, oversized body, query parameter | 400 `INVALID_INPUT` (or shared 413) | No mutation |
| Missing Slot | 404 `SLOT_NOT_FOUND` | No Booking/private information |
| Slot occupied by another Customer or Slot lifecycle is not `Offered` | 409 `SLOT_UNAVAILABLE` | Existing row preserved; no owner disclosure |
| Customer has a different overlapping Active Booking | 409 `CUSTOMER_OVERLAP` | No conflicting row |
| Q05 fails at DB `T_elig` (59:59 or less) | 422 `BOOKING_NOT_ELIGIBLE` | No Booking/occupancy |
| Invalid/foreign Origin, explicit `Sec-Fetch-Site: cross-site`, missing/wrong/old-Session CSRF | 403 `ORIGIN_DENIED` / `CSRF_DENIED` | No mutation |
| Missing or mismatched `X-NutTiew-Expected-Session-Binding` | 403 `SESSION_BINDING_MISMATCH` | No mutation; refresh identity and CSRF bootstrap |
| Serialization/deadlock retry budget exhausted | 503 `TRANSACTION_RETRY_EXHAUSTED` | All attempts rolled back |
| DB unavailable before mutation, during known rollback handling or during fresh Session reconciliation | 503 `SERVICE_UNAVAILABLE` | No false success; never skip live-Session validation |
| COMMIT acknowledgement lost / outcome unknown | 503 `BOOKING_OUTCOME_UNKNOWN` if possible; otherwise network failure | Do not claim rollback/success; retry same POST/`slotId` |
| Unexpected internal failure | 500 `INTERNAL_ERROR` | No raw SQL/stack/secrets |

#33 Part F must emit these stable trigger diagnostics so #16 can map by cause without guessing or exposing raw DB errors:

| #33 Part F INSERT guard cause | Required PostgreSQL diagnostic | #16 HTTP mapping |
|---|---|---|
| Slot lifecycle is not `Offered` | Custom SQLSTATE `P0B01`; constraint diagnostic `booking_slot_not_offered` | 409 `SLOT_UNAVAILABLE` |
| Q05 minimum-notice check fails at `T_elig` | Custom SQLSTATE `P0B02`; constraint diagnostic `booking_q05_min_notice` | 422 `BOOKING_NOT_ELIGIBLE` |

The SQLSTATEs are stable application-facing trigger contracts (valid five-character custom codes); the diagnostic constraint names are stable identifiers, not raw exception text. #33 owns their implementation. Unknown/unmapped trigger errors fail closed as 500 `INTERNAL_ERROR` and are never guessed to be Q05. BDF-D11's `0A000` remains reserved for forbidden UPDATE/DELETE/TRUNCATE, not INSERT eligibility.

Only these structured SQLSTATE/constraint pairs may enter the unique/exclusion reconciliation path; inspect driver metadata (`code` and `constraint`/`constraint_name`), never parse error text:

| Exact PostgreSQL tuple | Meaning / mapping when no same-pair replay exists |
|---|---|
| `23505 / booking_one_active_per_slot` | 409 `SLOT_UNAVAILABLE` |
| `23P01 / booked_customer_no_overlap` | 409 `CUSTOMER_OVERLAP` |

Any missing, unknown or mismatched tuple (including another `23505`, such as a Booking primary-key violation) rolls back and fails closed as 500 `INTERNAL_ERROR`; it must not enter reconciliation, return 200 or be guessed to be a business conflict. These exact identifiers are owned by #33 Part F and must match its canonical schema. 

For a recognized tuple only, ROLLBACK and discard the failed SERIALIZABLE snapshot. On a fresh connection, begin a separate `READ COMMITTED` reconciliation transaction. First lock the current `User` row for `principal.userId` with `FOR UPDATE` and revalidate its latest committed state: missing/inactive → 401 `UNAUTHENTICATED`; active but current role is not Customer → 403 `FORBIDDEN`. Do not read Session or Booking data on either failure. Then lock the exact `Session` row for `principal.sessionId` and `principal.userId` with `FOR UPDATE`, and check `revokedAt IS NULL AND expiresAt > clock_timestamp()`; missing, mismatched, revoked or expired Session → 401 `UNAUTHENTICATED`. Only an active Customer with a live Session may perform one exact-pair `Booked` read: a committed same-pair row with matching interval returns 200 and its original ID; otherwise return the safe 409 mapped from the allowlisted original tuple above. The reconciliation transaction takes no Slot or Booking row locks and performs no mutation. If User/Session DB validation is unavailable, return 503 and fail closed. Do not spin on a genuine conflict.

## 5. Boundary and review gate

Only this POST is introduced. No Booking GET/list/detail, cancellation, reschedule, deletion or Slot mutation route is added. Peer review endpoint path, request allowlist, 201/200 replay semantics, cause-specific 409/422 mapping, allowlisted SQLSTATE/constraint reconciliation, in-transaction and post-ROLLBACK User/Session revalidation, Auth CSRF/session-binding reuse, DTO privacy, timestamp format and exact #33 trigger diagnostic dependency. All API cases remain PLANNED / NOT RUN in Part E.
