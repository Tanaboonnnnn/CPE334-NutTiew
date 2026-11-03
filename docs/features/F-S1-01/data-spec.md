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

**CSRF candidate (OD-005-C pending review):** a 32-byte CSPRNG random token associated with each Session; persist only SHA-256 digest and compare against submitted `X-CSRF-Token` in constant time before unsafe mutation. Expose raw CSRF token **only** via live-session `GET /auth/csrf` with `no-store`, never in cookie, analytics or logs. This read-only GET does **not** mandate Origin; reject explicit `Sec-Fetch-Site: cross-site`, return no credentialed CORS. Login/logout/unsafe writes require an exact canonical Origin or, **only when Origin absent**, a matching same-origin Referer (reject missing both or explicit cross-site metadata); logout must also match current Session CSRF digest. Approval of session schema extension, token lifetime, canonical-origin deployment/proxy and header fallback remains a Part E human review gate.

**Proposed login-attempt data (OD-005-D/E pending review):** shared durable counters keyed by a privacy-protective hash of normalized account identifier and separately trusted client IP, 15-minute expiry; **5 failed/account/15 min** and **20 attempts/trusted-IP/15 min** with nonenumerating 429. Decide whether implementation uses a dedicated indexed counter relation or approved shared managed store before code; **in-process-only maps are not an accepted multi-instance protection**. Login JSON max 4 KiB, email 3–254 code points after trim/normalize, password 1–128 UTF-8 bytes unchanged; unknown account dummy Argon2 verification strategy must be reviewed.

**Demo seed plan:** generate two independent Customer and two Tutor accounts, each password supplied from a local ignored test-only secret or generated at bootstrap then hashed; record only safe account identifiers and role. Seed inactive/expired/revoked Session cases for STS. Never commit password examples, seed known production passwords, .env, token, private key or database dump. No unreviewed administrator, registration, password-change or bulk-revocation features. Slot/Booking data and migrations belong to Issues #14–17 and are only cross-feature authorization dependencies.
