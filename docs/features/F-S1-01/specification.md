# F-S1-01 — Authentication Feature SDS (Part E)

> **Part E contract; not implemented or runtime-tested.** Issue #13, owner @Chxtamos, reviewer @Tanaboonnnnn. Decision approval from PR #25 Conversation #6624817784: **OD-005-A/B/C/E and Auth UI direction APPROVED; OD-005-D APPROVED (PR #25 reviewer comment #6625521193)** reviewed and accepted in PR #25 comment #6625521193. Peer review/merge of the updated Part E PR into `sprint1` remains mandatory **before** any Part F code. Instructor-final Master/Theme gates remain separate.

## Authority and scope

Follow [Sprint 1 requirements](../../requirements.md) FR-S1-01..04, AC-S1-01..07, BR-S1-04/16/17/20, NFR-S1-01/02/07/08 and VC-01..07/31/35; [whole-product SRS](../../srs.md) FR-001..004, BR-002/033, VAL-001/002/034/036; [System SDS](../../system-sds.md) SD-09 and section 5; [Feature Inventory](../../features.md); [three-sprint plan](../../sprints/plan.md). Tutor and Staff are one business role. This feature owns **login, current trusted identity, logout, sessions, and reusable server access guards**; Slot/Booking persistence and actual row-level proofs depend on Issues #14–17.

## Proposed architecture and decisions (OD-005)

Single-origin React/Vite client and Express/TypeScript backend with durable PostgreSQL User and Session records (Prisma adapter/SQL migration details to verify before code). Credentials are Argon2id salted hashes. Valid login obtains 32 random CSPRNG bytes; the opaque cookie contains the raw token while the database stores **only** a unique SHA-256 token digest. Set cookie **after** Session insert commit. Client role, claimed owner IDs, headers or query parameters never grant authority.

| Topic | Proposed Part F behavior | Review decision |
|---|---|---|
| Cookie | `nuttiew_session`; `HttpOnly; Secure; SameSite=Lax; Path=/`; no Domain; localhost HTTP only uses `nuttiew_session_dev` with Secure=false | Production HTTPS, proxy setup, allowed origins |
| Lifetime | **Eight-hour absolute** lifetime from DB creation; no rolling renewal; check `expiresAt > serverNow`, `revokedAt IS NULL`, active User and role on every request | **OD-005-A APPROVED as decision; implementation/tests NOT RUN** (PR #25 comment #6624817784) |
| Login | Existing Customer/Tutor accounts only, normalized unique email, generic error for unknown/wrong/inactive, no new cookie on failure; separate logins create independent sessions | Hash cost, rate limiting, input bounds, seed policy |
| Logout | CSRF-protected POST; atomically revoke **presented session only**; send 204 and expire cookie **after DB commit**; replay old cookie denied; independent other session stays valid | **OD-005-B APPROVED as decision; implementation/tests NOT RUN** |
| CSRF | Approved Session-bound HMAC token with same-origin Origin/Referer rules and read-only token bootstrap; no cross-origin credentialed CORS; matched on unsafe requests | **OD-005-C APPROVED as decision; implementation/tests NOT RUN** |
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

### OD-005 decision sheet — A/B/C/D/E approved decisions; Part F tests tracked separately

The explicit human decision is recorded in PR #25 Conversation comment **#6624817784**: **OD-005-A/B/C/E and Auth UI direction APPROVED**, **OD-005-D APPROVED (PR #25 reviewer comment #6625521193)**. The updated in-flight reservation tradeoff was expressly approved by @Tanaboonnnnn in PR #25 comment #6625521193. **Approval of an engineering decision is not proof of a passing implementation**; Part F remains **BLOCKED** until the revised Part E is independently reviewed and merged into `sprint1`. Instructor-final Master/Theme gates remain separate. Detailed protocols: [API](api-spec.md), [Data](data-spec.md), [STS](tests.md).

| Decision | Concrete proposed value/behavior | Approver / gate |
|---|---|---|
| OD-005-A Session TTL | Absolute **28,800 seconds (8 hours)**, measured from persisted `createdAt`, no sliding refresh; strict `expiresAt > DB/server now`, `revokedAt IS NULL` and `User.isActive` for every protected call; cookie Max-Age **<= 28800** | **APPROVED decision** by @Tanaboonnnnn, comment #6624817784; Part F tests NOT RUN |
| OD-005-B Logout | **Current presented Session only**, DB revocation commit **before** 204/clear-cookie, captured-cookie replay 401; another Session B remains usable; DB write fault must not be reported as success | **APPROVED decision** by @Tanaboonnnnn, comment #6624817784; Part F tests NOT RUN |
| OD-005-C CSRF and origin | **Session-bound HMAC CSRF (approved in PR Conversation comment 6624817784):** create and persist a nonsecret 32-byte `csrfNonce` once at login; derive a stable MAC from managed server HMAC key + Session ID + nonce using the canonical expression **outside this GFM table** in [API](api-spec.md)/[Data](data-spec.md). Repeated read-only `GET /auth/csrf` returns the same MAC without DB mutations; multiple tabs work. Unsafe methods constant-time verify against the live Session, and A's token fails for B; logout/expiry revokes it. No per-GET rotation. Same-origin Origin/Referer fallback and cross-site safeguards remain as documented; managed versioned keys require secure overlap and retirement | **APPROVED by @Tanaboonnnnn in PR Conversation comment 6624817784**; implement/test in Part F, AUTH-13/17/18/21 |
| OD-005-D Rate limit | **Reviewer-requested revision, APPROVED design in PR #25 reviewer comment #6625521193:** 15-minute PostgreSQL-backed HMAC-keyed account and trusted-IP buckets. Per account allow **5 failed credential attempts/15min** (successful logins do not increase failure count); per trusted IP allow **20 total login attempts/15min** (success and failure both counted). Before Argon2, reserve one IP attempt and one **account in-flight permit** atomically under row locks, but do **not** increment account failure count until the credential result is known. On failed credential validation commit one account failure and release its permit; on successful validation release the permit **without incrementing failures**. Enforce the account failure quota against **failed + in-flight reservations** so simultaneous attempts across instances cannot bypass five. Do not hold DB row locks during Argon2. A rejected attempt returns generic 429 and never creates a Session. Fixed UTC 15-minute windows, managed HMAC key, trusted proxy allowlist, fail-closed DB errors and nonenumerating responses remain required. See Data contract for transaction boundaries, window rollover and crash-recovery policy | @Tanaboonnnnn requested **5 failed-only/account + 20 total/IP** in PR #25 Conversation comment 6624817784; **OD-005-D APPROVED (PR #25 reviewer comment #6625521193)**, revised atomic permit protocol and all-valid saturation tradeoff need explicit human approval; AUTH-20/22 |
| OD-005-E Input bounds | JSON request body **<= 4 KiB**; email **3–254 Unicode code points** after trimming, normalized lowercase and valid email syntax; password **1–128 UTF-8 bytes**, no trimming or Unicode normalization of secret; strict only `email` and `password` keys; malformed/oversized → 400/413 and no DB Session insert. Avoid timing-dependent account enumeration (dummy Argon2 verification for unknown account) | **APPROVED decision** by @Tanaboonnnnn, comment #6624817784; Part F tests NOT RUN |

**Pre-code acceptance record (PR #25 Conversation comment 6624817784, 4 Nov 2026):** @Chxtamos = proposal owner; @Tanaboonnnnn confirmed **OD-005-A (8h absolute TTL), B (current-session logout), C (HMAC CSRF/Origin), E (input bounds) and Auth UI direction APPROVED** in that comment, and **OD-005-D APPROVED (PR #25 reviewer comment #6625521193)** (failed-only account threshold, total trusted-IP threshold). This document reflects those stated decisions, not an implementation/test pass. **Revised OD-005-D permit protocol remains a proposal until @Tanaboonnnnn explicitly accepts it and the updated Part E PR is reviewed/merged into `sprint1`.** Do not start Part F before that gate. Source baseline remains SD-09, FR-S1-01..04 and OD-005. If browser/CI clients lack acceptable Origin/Referer for unsafe requests, reject rather than bypass security.

Contract links: [API](api-spec.md), [UI](ui-spec.md), [persistent data](data-spec.md), [STS/tests](tests.md). Human teammate must approve session TTL, CSRF, logout scope, rate limits, response schemas and the documents before coding. Later Part F work starts on a fresh branch from reviewed `sprint1`, first records a failing test where feasible, implements genuine UI→API→PostgreSQL, and publishes real test logs and a separately reviewed code PR. This document has **NOT RUN** status for every app/DB test and does **not** close Issue #13.

> **Approval-state update (2026-11-04):** @Tanaboonnnnn expressly approved OD-005-D, including the temporary sixth-correct-login 429 tradeoff, in [PR #25 comment #6625521193](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/25#issuecomment-6625521193), with follow-up review confirmation in PR #25 review #5765005104. The approved Part E contract was merged into sprint1. This corrects historical pending-status text only; implementation and the AUTH-01..23 tests are independently tracked in [Part F verification ledger](verification-ledger.md).
