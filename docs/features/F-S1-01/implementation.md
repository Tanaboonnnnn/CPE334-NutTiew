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

## Evidence (local Windows PostgreSQL 17.2)

- `npm run db:generate` — PASS; `npm run db:migrate` — PASS on dedicated local `nuttiew` DB.
- `npm run typecheck` — PASS; `npm run build` — PASS; `npm test` — **4/4 unit tests PASS**.
- `npm run test:db` — **13/13 PostgreSQL integration tests PASS**, including login/me/CSRF/logout, five failed account attempts, five simultaneous permits and temporary 429, successful settlement/retry, 20 total IP attempts, 4 KiB rejection and cross-Session CSRF denial.
- `npm run test:e2e` — **6/6 real Microsoft Edge browser tests PASS** at 320/375/768/1280px, session reload/logout, error and password toggle; synthetic-account screenshots in `evidence/`. These are automated checks, **not human visual sign-off** or full WCAG 2.2 audit.
- `npm run test:stress` — **PASS** on **two independent running API processes**, 40 simultaneous HTTP logins per scenario against shared PostgreSQL: all wrong => 5×401 + 35×429, account failed=5/inFlight=0/sessions=0; all correct => 5×200 + 35×429, account failed=0/inFlight=0/sessions=5. This does not implement the deterministic Argon2 hold/release barrier or mixed-credential scenario.
- **NOT RUN / still required before DoD:** complete AUTH-01..23 matrix; cross-feature owner/role guards in Issues #14–17; browser WCAG/manual review and screenshot reviewer sign-off; deterministic all-valid Argon2 barrier and manual HTTP retry; forced process crash recovery; key rotation/old-key overlap; production HTTPS/proxy behavior; injected DB outage and failure rollback; CI and deployment. Do not interpret partial tests as full contract acceptance.

## Reviewer gate

Reviewer: **@Tanaboonnnnn**. Please review code, auth security, Postgres transaction semantics, rate-limit availability tradeoff, evidence and missing tests. Do not self-merge; Issue #13 remains open until acceptance and full DoD evidence. No Kanban changes performed.