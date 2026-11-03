# F-S1-01 — Authentication Feature SDS (Part E)

> **Proposed, not approved or implemented.** Issue #13, owner @Chxtamos, independent reviewer @Tanaboonnnnn. Contract revision E-0.1. Obtain peer review/merge of these Part E documents **before** any Feature code. The instructor final Master/Theme and system-design OD-005 remain separate approval gates.

## Authority and scope

Follow [Sprint 1 requirements](../../requirements.md) **FR-S1-01**, **FR-S1-02**, **FR-S1-03**, **FR-S1-04**, AC-S1-01..07, BR-S1-04/16/17/20, NFR-S1-01/02/07/08 and VC-01..07/31/35; [whole-product SRS](../../srs.md) FR-001..004, BR-002/033, VAL-001/002/034/036; [System SDS](../../system-sds.md) SD-09 and section 5; [Feature Inventory](../../features.md); [three-sprint plan](../../sprints/plan.md). Tutor and Staff are one business role. This feature owns **login, current trusted identity, logout, sessions, and reusable server access guards**; Slot/Booking persistence and actual row-level proofs depend on Issues #14–17.

## Proposed architecture and decisions (OD-005)

Single-origin React/Vite client and Express/TypeScript backend with durable PostgreSQL User and Session records (Prisma adapter/SQL migration details to verify before code). Credentials are Argon2id salted hashes. Valid login obtains 32 random CSPRNG bytes; the opaque cookie contains the raw token while the database stores **only** a unique SHA-256 token digest. Set cookie **after** Session insert commit. Client role, claimed owner IDs, headers or query parameters never grant authority.

| Topic | Proposed Part F behavior | Review decision |
|---|---|---|
| Cookie | `nuttiew_session`; `HttpOnly; Secure; SameSite=Lax; Path=/`; no Domain; localhost HTTP only uses `nuttiew_session_dev` with Secure=false | Production HTTPS, proxy setup, allowed origins |
| Lifetime | **Eight-hour absolute** lifetime from DB creation; no rolling renewal; check `expiresAt > serverNow`, `revokedAt IS NULL`, active User and role on every request | **OD-005: not yet approved** |
| Login | Existing Customer/Tutor accounts only, normalized unique email, generic error for unknown/wrong/inactive, no new cookie on failure; separate logins create independent sessions | Hash cost, rate limiting, input bounds, seed policy |
| Logout | CSRF-protected POST; atomically revoke **presented session only**; send 204 and expire cookie **after DB commit**; replay old cookie denied; independent other session stays valid | **OD-005: current-session-only scope** |
| CSRF | Same-origin Origin check on login and unsafe methods plus separate per-session CSRF token returned to authorized UI (never as cookie), matched on unsafe requests | **OD-005: token format, persistence, missing Origin behavior** |
| Error/privacy | Uniform invalid-login result; no email enumeration, raw secrets, stack/SQL error, foreign resource details; no session token in JSON/localStorage/logs | Exact status/code response schema in API contract |
| Future | Password reset, role switching, rotation/revoke-all administration and S2/S3 operations not implemented | Separate approved feature contract |

If Session insert or logout revocation fails, **do not claim success**. An expired/revoked token is never implicitly refreshed. Each protected request loads a live Session and active User from persistent DB; after restart the same valid cookie continues until actual expiry. Session identity must derive from the database, not the client.

## Server-side permission boundary

| Action | Anonymous | Customer | Tutor | Record-level predicate |
|---|---|---|---|---|
| Login | Credential exchange | Allowed | Allowed | Valid existing active account |
| Own identity/logout | 401 | Own session | Own session | Valid unexpired/unrevoked Session joined to active User |
| Tutor Slot create/read | 401 | 403 | Own schedule only | Create `tutorId` from principal; read SQL where `Slot.tutorId = principal.id` |
| Customer Booking create/read | 401 | Own only | 403/general reads denied | `customerId = principal.id` from session, not request |
| Tutor Booking/schedule read | 401 | 403 | Own only | Derive Tutor from persisted Slot and filter by principal |
| Foreign record | 401 | No protected data | No protected data | Privacy-safe 404 for foreign/missing ID |

`requireSession`, `requireRole`, `requireOwnedResource` and owner-filtered DB queries are interface intentions; their actual domain integrations require Issues #14–17. Hidden buttons, forged `role`, `customerId` or `tutorId` cannot replace backend checks. Avoid existence leaks via foreign-record responses.

## Part E → Part F gate

Contract links: [API](api-spec.md), [UI](ui-spec.md), [persistent data](data-spec.md), [STS/tests](tests.md). Human teammate must approve session TTL, CSRF, logout scope, rate limits, response schemas and the documents before coding. Later Part F work starts on a fresh branch from reviewed `sprint1`, first records a failing test where feasible, implements genuine UI→API→PostgreSQL, and publishes real test logs and a separately reviewed code PR. This document has **NOT RUN** status for every app/DB test and does **not** close Issue #13.
