# NutTiew — F-S1-01 Authentication (Issue #13 Part F)

Implementation PR against `sprint1`, based on the approved Part E contracts in `docs/features/F-S1-01/`. This is a **review candidate**, not a claim that every AUTH-01..23 acceptance case is complete.

## Stack and local setup

- Node.js 24, npm workspaces, TypeScript, Express 5, React 19/Vite, PostgreSQL **17 locally on Windows**, Prisma 7 schema/migrations, `pg` transactions for atomic auth/rate limits, Argon2id password verification.
- No Docker required or used. Do not commit `.env`, secrets or real user credentials.
- Copy `.env.example` to `.env`, set distinct random 32+ byte hex `AUTH_CSRF_HMAC_KEY` / `AUTH_RATE_KEY`, `DATABASE_URL` pointing to a **dedicated PostgreSQL database/user**, `AUTH_CANONICAL_ORIGIN=http://localhost:5173` and `PORT=3001`. In production, deploy behind HTTPS, set `NODE_ENV=production` and configure trusted proxy addresses only when necessary.
- `npm install`, `npm run db:generate`, `npm run db:migrate`, `npm run test:db`, `npm test`, `npm run typecheck`, `npm run build`.
- To seed **only an explicitly designated test account**, set `SEED_EMAIL`, `SEED_PASSWORD` (>=12 bytes), `SEED_ROLE=Customer` or `Tutor` in your shell and run `npm run db:seed`. Never commit test passwords. Seed is idempotent and does not overwrite existing accounts.
- Run API `npm run dev -w @nuttiew/api` and web `npm run dev -w @nuttiew/web` in separate terminals. Web Vite proxies `/api` to the local API.

## Scope implemented

- `POST /api/v1/auth/login`: strict email/password JSON only, 4 KiB limit, canonical same-origin Origin or Referer, generic invalid-login response, Argon2id verification with dummy hash for unknown email, random 256-bit cookie digest persisted only after session commit.
- `GET /api/v1/auth/me`: active user and non-revoked/unexpired 8h absolute session, minimal `{user:{id,role}}` DTO.
- `GET /api/v1/auth/csrf`: deterministic HMAC bound to Session UUID + stored nonce, no DB mutation; `POST /api/v1/auth/logout`: current-session revocation with constant-time CSRF check and same-origin guard.
- PostgreSQL fixed 15-minute windows, HMAC-keyed account and trusted-IP buckets. **5 failed/account** (success does not increase failure count); **20 total admitted/trusted-IP**. Atomic `failed+inFlight < 5` admission; `AuthAttemptReservation` + at-most-once settlement + 60s lease cleanup. Five concurrent correct-password verifications can temporarily deny a sixth correct login with 429; manual retry after settlement is allowed if IP quota remains.
- React Thai Login/Session/Logout page, accessible field labels and own account UUID suffix; no client-side role authorization bypass.

## Current verification evidence — HEAD `f38a5aa` (2026-11-04)

**Independent reviewer run:** @Tanaboonnnnn verified [PR #26 review #5769910107](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/26#pullrequestreview-5769910107) against **`f38a5aa1295dbea2bd1042eba29589fb74db07d6`** using Windows Node 24, isolated PostgreSQL **18.3**, with `npm ci`, `npm run db:generate`, `npm run db:migrate`, `npm run typecheck`, `npm run build` **PASS**; `npm test` **11/11**, `npm run test:db` **29/29**, `npm run test:e2e` **10/10** real Microsoft Edge, `npm run test:stress` **PASS** (two independent API OS processes, 40 concurrent login attempts **per each** all-wrong, all-correct, and mixed scenario), and `git diff --check` **PASS**. Reviewer observed all-wrong 5×401/35×429; all-correct 5×200/35×429; mixed 3×200/2×401/35×429. At completion `inFlight=0` and committed Session counts match HTTP 200 results. These are **reviewer-run local checks, not GitHub Actions CI**.

**Author-run reference on the same HEAD:** Windows Node 24.14.0 / npm 11.9.0 / PostgreSQL **17.2**, without Docker: typecheck/build PASS; 11/11 unit, 29/29 DB, 10/10 Edge, 2-process stress for all three scenarios PASS. See [Verification ledger](verification-ledger.md) for per-STS evidence and caveats. Separate ad hoc reviewer connection-refusal probe on a non-listening DB TCP port returned sanitized 503 on login/authenticated `/me`/logout with no false cookie update. This **does not** establish full DB crash/failover recovery.

**Coverage provided:** Four-account C1/C2/T1/T2 identity/reload/logout Edge matrix; trusted IPv6 canonicalization/20-IP quota; CSRF key rotation and concurrent reads; Argon2 verification hold/release barrier (two in-process Express instances, same real DB), sixth correct HTTP 429 then manual retry 200; multi-process mixed credentials; true child-process exit with pending reservation/late settlement rejection; PostgreSQL 8h expiry predicate probes at 28,799/28,800/28,801 seconds. These results are for the above HEAD. Scope stays limited to Issue #13.

**Unresolved, not implied PASS:** AUTH-23 same-mounted React-instance stale-200 ordering (the current held-200 test spans browser navigation); AUTH-18 two-browser-tab unsafe/logout race; AUTH-19 HTTP endpoint boundary using controlled authoritative DB clock (SQL predicate only verified so far); AUTH-15 human reviewer/date/SHA WCAG visual sign-off; full production DB crash/failover. Domain Slot/Booking routes in AUTH-07/08/09/10 and domain AUTH-16 remain **BLOCKED on Issues #14–17**, not feature work for Issue #13. Track new patches under their own commit/evidence; do not extrapolate prior pass counts.

### Historical evidence (earlier commit; superseded for current HEAD)

The initial **`99b634f`-era** Windows PostgreSQL 17.2 checks were unit **8/8**, DB **20/20**, Edge **7/7**, and two-process all-wrong/all-correct stress PASS. References to Argon2 barrier, mixed load, and crash-recovery tests as **NOT RUN** apply to that old SHA only. Subsequent SHA `f38a5aa` introduced and verified these specific scenarios; their remaining limits are documented above. Synthetic screenshot artifacts from the earlier browser run are in `evidence/`; they are *not* a human WCAG sign-off.

## Reviewer gate

Reviewer: **@Tanaboonnnnn**. Please review code, auth security, Postgres transaction semantics, rate-limit availability tradeoff, evidence and missing tests. PR may be marked Ready for Review while unresolved gaps remain explicit; do not self-merge; Issue #13 remains open until acceptance and full DoD evidence. No Kanban changes performed.
**Reviewer feedback patch:** PR #26 review #5767022017 P1/P2 changes include trusted-chain IP handling, reusable DB role/ownership middleware, atomic lease reconciliation, sanitized error envelopes, input ARIA/focus and timeout. Reviewer-run environment PostgreSQL 18.3 is distinct from author Windows PostgreSQL 17.2. This does not constitute CI or human approval; see [verification ledger](verification-ledger.md).
