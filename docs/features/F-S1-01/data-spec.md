# F-S1-01 — Persistent Identity/Session Data Contract (Part E)

> **Proposed E-0.1 — no migration created or executed.** Based on [System SDS](../../system-sds.md) §3/5 and [Feature SDS](specification.md). PostgreSQL/Prisma versions, seed process, CSRF storage and session TTL need peer-review sign-off before code.

| Field | Data / constraints | Security and semantics |
|---|---|---|
| `User.id` | UUID PK | Trust server-generated principal identity |
| `User.email` | normalized unique text, canonicalization reviewed before implementation | Private credential identifier; not returned by minimal current-user DTO |
| `User.passwordHash` | nonnull Argon2id encoded hash with distinct random salt | Never plaintext, reversible, in API JSON or logs |
| `User.role` | enum `Customer` / `Tutor` (Tutor = Staff) | Authoritative DB role, not client form/header/body |
| `User.isActive` | boolean, active for auth | Any inactive user denied on next protected request |
| `User.createdAt/updatedAt` | persisted timestamptz | Not part of minimal identity response |
| `Session.id` | UUID PK | Internal, not exposed as bearer cookie |
| `Session.userId` | indexed FK → User.id | Authorization joins actual principal |
| `Session.tokenDigest` | unique 32-byte SHA-256 digest from 256-bit random token | Raw token lives only in HttpOnly cookie, never persisted |
| `Session.createdAt/expiresAt` | server timestamptz, expiresAt > createdAt; 8h candidate | Server clock, absolute TTL, no hidden sliding renewal; OD-005 gate |
| `Session.revokedAt` | nullable timestamptz | Logout transaction revokes presented Session only; no reuse after commit |

**Atomic lifecycle:** create Session row and commit **before** sending authenticated cookie; on logout mark current row revoked and commit **before** responding 204 or expiring cookie. On failed DB write report sanitized failure and preserve actual session state. Expired/revoked/inactive rows fail identity checks after app restart; cleaning expired rows does not restore access.

**CSRF candidate:** per-session random token generated server-side, bound to Session with DB-stored hash, returned only to same-origin authenticated `GET /auth/csrf` with `no-store`, checked with Origin before unsafe operations. Entropy/lifetime, absent-Origin policy and storage/verification are **OD-005 unresolved until peer review**.

**Demo seed plan:** generate two independent Customer and two Tutor accounts, each password supplied from a local ignored test-only secret or generated at bootstrap then hashed; record only safe account identifiers and role. Seed inactive/expired/revoked Session cases for STS. Never commit password examples, seed known production passwords, .env, token, private key or database dump. No unreviewed administrator, registration, password-change or bulk-revocation features. Slot/Booking data and migrations belong to Issues #14–17 and are only cross-feature authorization dependencies.
