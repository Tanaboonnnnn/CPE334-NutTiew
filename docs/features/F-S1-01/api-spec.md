# F-S1-01 — Authentication API Contract (Part E)

> **Proposed E-0.1, not implemented or approved.** Review with [Feature SDS](specification.md), [UI](ui-spec.md), [data](data-spec.md) and [STS](tests.md). Same-origin `/api/v1` follows System SDS §6. Endpoint shape, throttling and CSRF are OD-005 engineering decisions requiring peer approval **before code**.

## Shared transport and payload

- JSON UTF-8, strict allowlisted inputs, bounded body/email/password sizes; response `Cache-Control: no-store`; browser credentials sent via same-origin cookie automatically. No role or owner parameters accepted as authority.
- Success identity allowlist: `{ "user": { "id": "<UUID>", "role": "Customer" | "Tutor" } }`; never expose password hash, session ID, digest, token or other Customer/Tutor data. Email is excluded pending explicit approved UI need.
- Error envelope: `{ "error": { "code": "CODE", "message": "Generic safe description" }, "requestId": "<opaque id>" }`. No SQL errors, stack traces, raw credentials, account enumeration or private IDs.

| Method / path | Request / session check | Success | Proposed errors / privacy |
|---|---|---|---|
| `POST /api/v1/auth/login` | `{ "email": string, "password": string }` only; check same-origin `Origin`, active User and Argon2id hash | 200 identity DTO; `Set-Cookie` only after PostgreSQL Session insert commits | 400 `INVALID_INPUT`; uniform 401 `LOGIN_FAILED` for wrong, unknown and inactive; 403 `ORIGIN_DENIED`; approved 429 throttling; safe 503 on DB failure; no auth cookie on failure |
| `GET /api/v1/auth/me` | Live session cookie; read-only | 200 identity DTO derived from persisted User/Session | 401 `UNAUTHENTICATED` on missing, expired, revoked or inactive; no private payload |
| `GET /api/v1/auth/csrf` | Live cookie plus same-origin request; token never stored in browser localStorage | 200 `{ "csrfToken": "<opaque per-session value>" }` and `no-store` | 401 if no session; 403 for invalid cross-origin; lifetime/representation **OD-005** |
| `POST /api/v1/auth/logout` | Live cookie, allowed Origin and valid `X-CSRF-Token`; no other request fields | 204 empty body after **transactional current-session revocation commit**, expire presented cookie | 401 if session invalid; 403 `CSRF_DENIED` if invalid/missing Origin/CSRF; 503 DB failure **without falsely clearing live session or reporting success** |

## Cookie, authorization and replay contract

Production cookie is `nuttiew_session` with `HttpOnly; Secure; SameSite=Lax; Path=/`, no Domain; max age cannot exceed approved Session expiry. **Proposed 8-hour TTL is not yet approved (OD-005).** Only localhost HTTP may set `Secure=false` with distinct `nuttiew_session_dev`; never do so for remote HTTP. The server generates 32 bytes with a CSPRNG and stores only its SHA-256 digest (not the raw cookie) in DB. Every protected request checks active User plus unexpired, nonrevoked Session against server time. Logout must be **replay resistant**: manually restoring old cookie still returns 401; other independent sessions stay live.

Unsafe requests require the reviewed Origin/CSRF policy. Login uses Origin validation to prevent login CSRF, and session-authenticated logout obtains a token with `GET /api/v1/auth/csrf`, sends `X-CSRF-Token` in memory and rejects missing/mismatch before write. **CSRF issuance/verification and missing-Origin behavior remain explicit OD-005 gates**. CORS must not allow cross-site credentialed mutation.

## Future dependent domain endpoint rules (not implemented here)

Issue #14/17 Tutor routes require `requireSession` → `requireRole('Tutor')` → owner-filtered query (`Slot.tutorId`/associated Booking's Slot Tutor ID equals principal). Issue #16/17 Customer routes require `Customer` and `Booking.customerId === principal.id`, with foreign and missing resource IDs both 404. On wrong role return 403; missing session return 401. Reject forged `role`, `tutorId`, `customerId`, `userId` or arbitrary principal headers at every path. This contract does **not** create those Slot/Booking endpoints.

**Verification status:** endpoint implementations, persistence and API tests **NOT RUN**. Corresponding scenarios are specified in [STS](tests.md).
