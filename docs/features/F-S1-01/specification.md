# F-S1-01 — Authentication Feature SDS (Part E)

> **Proposed, not approved or implemented.** Issue #13, owner @Chxtamos, independent reviewer @Tanaboonnnnn. Contract revision E-0.1. Obtain peer review/merge of these Part E documents **before** any Feature code. The instructor final Master/Theme and system-design OD-005 remain separate approval gates.

## Authority and scope

Follow [Sprint 1 requirements](../../requirements.md) FR-S1-01..04, AC-S1-01..07, BR-S1-04/16/17/20, NFR-S1-01/02/07/08 and VC-01..07/31/35; [whole-product SRS](../../srs.md) FR-001..004, BR-002/033, VAL-001/002/034/036; [System SDS](../../system-sds.md) SD-09 and section 5; [Feature Inventory](../../features.md); [three-sprint plan](../../sprints/plan.md). Tutor and Staff are one business role. This feature owns **login, current trusted identity, logout, sessions, and reusable server access guards**; Slot/Booking persistence and actual row-level proofs depend on Issues #14–17.

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

### OD-005 concrete decision sheet — proposed by @Chxtamos, awaiting @Tanaboonnnnn review

This sheet replaces vague implementation placeholders with a **reviewable candidate policy**. **None is approved just because it appears here**. Human reviewer @Tanaboonnnnn must accept or request explicit changes to each row on PR #25. Part F remains **BLOCKED** until the reviewed decision is recorded and the Part E PR is merged into `sprint1`. Do not claim instructor business approval: these are technical implementation choices subject to the instructor-final source hierarchy. The detailed, implementable protocols are in [API](api-spec.md) and [persistent data](data-spec.md); the test matrix is in [STS](tests.md).

| Decision | Concrete proposed value/behavior | Approver / gate |
|---|---|---|
| OD-005-A Session TTL | Absolute **28,800 seconds (8 hours)**, measured from persisted `createdAt`, no sliding refresh; strict `expiresAt > DB/server now`, `revokedAt IS NULL` and `User.isActive` for every protected call; cookie Max-Age **<= 28800** | @Tanaboonnnnn review required; acceptance recorded on PR before code |
| OD-005-B Logout | **Current presented Session only**, DB revocation commit **before** 204/clear-cookie, captured-cookie replay 401; another Session B remains usable; DB write fault must not be reported as success | @Tanaboonnnnn review required |
| OD-005-C CSRF and origin | **Deterministic session-bound token proposal:** create a random nonsecret `csrfNonce` (32 bytes) at login and store it in Session; derive `base64url(HMAC-SHA256(AUTH_CSRF_HMAC_KEY, UTF8('NutTiew-CSRF-v1') || 0x00 || UUIDbytes(session.id) || csrfNonce))` and return the MAC on read-only `GET /auth/csrf`. Every repeated GET for one live Session/key yields the same token without DB mutation; two browser tabs and in-flight requests work concurrently. Unsafe methods recompute and constant-time verify; A's token fails for B. No per-GET rotation. Token lifetime equals Session lifetime; logout/expiry revocation invalidates it. GET accepts absent Origin, rejects explicit cross-site Fetch Metadata and cross-origin credentialed CORS. Unsafe requests demand configured Origin or same-origin Referer fallback only when Origin is absent; reject missing both/forged Origin. HMAC key is a managed secret (not stored in Session/source/logs); key rotation needs a reviewed versioned key-ID plus overlap/retirement plan, never silent invalidation | @Tanaboonnnnn must approve HMAC/key management, rotation, headers and reverse-proxy behavior; AUTH-13/17/18/21 |
| OD-005-D Rate limit | **PostgreSQL transactional fixed-window admission counters** (not an optional store): 15-minute bucket keys `account:HMAC-SHA256(rateKey, normalizedEmail)` and `ip:HMAC-SHA256(rateKey, trustedClientIP)` with unique indexed `(kind, keyDigest, windowStart)`. In a short transaction, insert-if-missing, lock both buckets in deterministic order, and **atomically reserve one attempt on both account and IP before any Argon2 work**. Reject when current account count >=5 or IP count >=20; successful logins also spend an account reservation (conservative bound, not five failed-only). No transaction lock is held across Argon2; all competing instances see committed reservations. 429 is nonenumerating and no raw email/IP stored. Fixed windows reset on next aligned boundary, not with an in-place zero reset; DB failure fails closed. See Data contract | @Tanaboonnnnn must approve **changed semantics: 5 total attempts/account** (rather than previous 5 failed-only), exact DB protocol, quotas, HMAC key and trusted proxy; AUTH-20/22 |
| OD-005-E Input bounds | JSON request body **<= 4 KiB**; email **3–254 Unicode code points** after trimming, normalized lowercase and valid email syntax; password **1–128 UTF-8 bytes**, no trimming or Unicode normalization of secret; strict only `email` and `password` keys; malformed/oversized → 400/413 and no DB Session insert. Avoid timing-dependent account enumeration (dummy Argon2 verification for unknown account) | @Tanaboonnnnn approve exact validators, byte counting, dummy hash and error treatment |

**Pre-code acceptance record:** @Chxtamos = proposal owner; @Tanaboonnnnn = independent reviewer/decision approver; evidence is their substantive GitHub review and approved merge of Part E (not an AI-generated assertion). Source baseline remains SD-09, FR-S1-01..04 and OD-005 in System SDS. Status for **A/B/C/D/E = PROPOSED / AWAITING HUMAN DECISION**, as of this contract revision. If browser/CI clients do not provide acceptable Origin/Referer on an unsafe call, **reject** and update the approved policy/tests rather than bypass security in code.

Contract links: [API](api-spec.md), [UI](ui-spec.md), [persistent data](data-spec.md), [STS/tests](tests.md). Human teammate must approve session TTL, CSRF, logout scope, rate limits, response schemas and the documents before coding. Later Part F work starts on a fresh branch from reviewed `sprint1`, first records a failing test where feasible, implements genuine UI→API→PostgreSQL, and publishes real test logs and a separately reviewed code PR. This document has **NOT RUN** status for every app/DB test and does **not** close Issue #13.
