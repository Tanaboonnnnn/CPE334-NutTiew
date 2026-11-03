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
| `Session.csrfNonce` | 32-byte random BYTEA, generated once at login, not exposed; **not a CSRF token or digest** | Nonsecret per-session HMAC input; repeated GET derives stable token without DB write |
| `Session.csrfKeyVersion` | short key-identifier of managed HMAC key version | At login snapshot current key version; old version can be verified until all dependent Sessions expire, then retire; no secret stored in DB |

**Atomic lifecycle:** create Session row and commit **before** sending authenticated cookie; on logout mark current row revoked and commit **before** responding 204 or expiring cookie. On failed DB write report sanitized failure and preserve actual session state. Expired/revoked/inactive rows fail identity checks after app restart; cleaning expired rows does not restore access.

**CSRF candidate (OD-005-C pending human review; stable, reproducible, read-only GET):** At successful login generate a **32-byte CSPRNG nonce** and persist it as `Session.csrfNonce` (32 bytes, **nonsecret**, never included in API responses), plus `Session.csrfKeyVersion` for the current managed key. Maintain separate **256-bit minimum `AUTH_CSRF_HMAC_KEY`** in deployment secret manager, not source/DB/client. For live Session S derive `T = base64url(HMAC-SHA256(key[S.csrfKeyVersion], UTF8("NutTiew-CSRF-v1") || 0x00 || UUIDbytes(S.id) || S.csrfNonce))`. The server **does not store `T` or its hash**. Each authorized `GET /auth/csrf` recomputes and returns exactly the same T while Session/key version remain unchanged; zero database mutation and no per-GET rotation, so two tabs and requests already in flight retain valid tokens. Unsafe cookie-authenticated POST recomputes T from the currently presented live Session and constant-time verifies the decoded 32-byte MAC against the supplied `X-CSRF-Token` (strict base64url syntax/length); tokens from Session A are invalid for B. Expiry, logout revocation and inactive User invalidate T because Session authorization fails first. `GET /auth/csrf` may omit Origin and rejects explicit cross-site Fetch Metadata; browser must enforce no-store, no cross-origin credentialed CORS, no token in logs/storage. Unsafe requests require exact canonical Origin or same-origin Referer fallback only when Origin absent. **Key rotation:** new Sessions use the new key ID; keep old key securely available to validators for at most one 8h Session TTL after the last Session with old ID was minted, then retire. Unknown/missing key version fails closed; key exposure requires incident revocation/rotation plan, not a silent deploy.

**PostgreSQL limiter schema, OD-005-D (proposal pending human sign-off):** use a scalar PostgreSQL `BYTEA` with an explicit **32-octet CHECK**, **not `BYTEA[32]`** (which denotes an array and does not enforce digest length). Proposed DDL for `AuthAttemptBucket`:

```sql
CREATE TABLE "AuthAttemptBucket" (
  "kind" TEXT NOT NULL CHECK ("kind" IN ('account', 'ip')),
  "keyDigest" BYTEA NOT NULL CHECK (octet_length("keyDigest") = 32),
  "windowStart" TIMESTAMPTZ NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0 CHECK ("attempts" >= 0),
  "updatedAt" TIMESTAMPTZ NOT NULL,
  PRIMARY KEY ("kind", "keyDigest", "windowStart")
);
CREATE INDEX "AuthAttemptBucket_windowStart_idx"
  ON "AuthAttemptBucket" ("windowStart");
```

The `kind` column is **TEXT with an explicit CHECK** (not pseudo-SQL `ENUM account/ip`); any equivalent Prisma migration must retain the PostgreSQL CHECK constraints and exact composite PK. This table definition is **a reviewable proposal, not a migration executed in Part E**. Use HMAC-SHA256 with a **separate secret `AUTH_RATE_KEY`** (32+ random bytes managed in Secret Manager) over domain-separated UTF-8 `account:<canonicalEmail>` or `ip:<trustedCanonicalIP>`; do not persist enumerable raw/hash-only email or client IP. The server derives trusted client IP from directly observed socket / **explicitly allowlisted ingress proxy**, never arbitrary client-provided `X-Forwarded-For`; deployment review must approve the proxy chain.

**Atomic admission algorithm:** align `windowStart` to UTC floor(now/900s)*900s (fixed 15-minute windows). **Before Argon2 and session issuance**, inside a short DB transaction insert both account and IP rows with `ON CONFLICT DO NOTHING`, acquire each row using `SELECT ... FOR UPDATE` in a consistent **(kind, keyDigest) byte order** to avoid deadlocks, check account `attempts < 5` and IP `attempts < 20`, increment **both in the same transaction**, commit before processing credentials. A rejected attempt returns the same safe **429 `RATE_LIMITED`** regardless of account existence, and does **not increment** when either quota is already exhausted; DB fault returns sanitized 503 and does not proceed (fail closed). All attempts (including success, unknown and inactive) consume reservations: **five total requests/account/15min**, intentionally stricter than the earlier five *failed* only; this tradeoff is **an explicit reviewer decision gate** (availability/denial-of-service risk of guessed known-email lockout). Never hold bucket row locks during password hashing; concurrent instances serialize on the short reservation transaction, ensuring exact quota rather than read-then-write races. Counters reset naturally by next fixed-window key (no in-place reset); expired buckets may be deleted after >30 min by a separately managed cleanup, never before the window ends. Fixed-window boundary bursts may allow 5 near end + 5 at next start and are **not** a sliding-window guarantee; acceptance needs explicit reviewer sign-off. IP and account buckets are both charged once for every admitted attempt.

**Bounds (OD-005-E):** JSON body <=4 KiB, email 3–254 Unicode code points after trim/lowercase and syntax validation, password 1–128 UTF-8 bytes without normalization, no unknown keys. Reject malformed/oversized input before authentication and never create a Session. Dummy Argon2 verification for unknown account avoids obvious quick-return enumeration; transport normalization and limits must be human-approved.

**Demo seed plan:** generate two independent Customer and two Tutor accounts, each password supplied from a local ignored test-only secret or generated at bootstrap then hashed; record only safe account identifiers and role. Seed inactive/expired/revoked Session cases for STS. Never commit password examples, seed known production passwords, .env, token, private key or database dump. No unreviewed administrator, registration, password-change or bulk-revocation features. Slot/Booking data and migrations belong to Issues #14–17 and are only cross-feature authorization dependencies.
