# F-S1-01 Part F — Verification ledger (2026-11-04, local Windows)

Source contract: `tests.md` AUTH-01..23. This ledger **does not** replace the STS or reviewer sign-off. Status `PARTIAL` means some assertions passed but the entire AUTH row has not been verified. All checks use local PostgreSQL 17.2 and no Docker.

| STS | Status | Evidence / remaining gap |
|---|---|---|
| AUTH-01 | PARTIAL | Customer browser login; Tutor API login; distinct roles not yet both browser-verified with exact fixtures |
| AUTH-02 | PARTIAL | Unknown/wrong/inactive 401 and no cookie; timing/nonenumeration review pending |
| AUTH-03 | PARTIAL | Forged query/header role ignored by `/me`; domain impersonation checks pending |
| AUTH-04 | PARTIAL | Logout 204, DB replay 401; transaction fault injection pending |
| AUTH-05 | PASS (auth-only) | Independent A/B sessions; A logout leaves B active |
| AUTH-06 | PARTIAL | Inactive, revoked, expired 401; restart persistence not independently verified |
| AUTH-07 | BLOCKED | Domain Slot/Booking routes not implemented in this PR; `/me` anonymous 401 |
| AUTH-08 | BLOCKED | Tutor Slot route belongs to Issue #14 |
| AUTH-09 | BLOCKED | Tutor ownership route belongs to Issues #14/#17 |
| AUTH-10 | BLOCKED | Customer Booking route belongs to Issues #16/#17 |
| AUTH-11 | PARTIAL | Argon2id + SHA-256 token digest implemented; log/secret audit pending |
| AUTH-12 | PARTIAL | Injected session INSERT failure returns 503 with no cookie; DB outage/UPDATE fault still pending |
| AUTH-13 | PARTIAL | Cross-origin/CSRF rejection for auth; unsafe domain routes absent |
| AUTH-14 | PARTIAL | Expiry-at-now and replay checked; boundary and concurrent logout pending |
| AUTH-15 | PARTIAL | 6/6 Edge tests and viewport screenshots; WCAG 2.2 and human sign-off pending |
| AUTH-16 | BLOCKED | Domain owner predicate integration pending Issues #14–17 |
| AUTH-17 | PARTIAL | 10 repeated CSRF GETs, cross-site rejection; restart and DB zero-write snapshot pending |
| AUTH-18 | PARTIAL | Origin/Referer and CSRF rejection; two-tab unsafe race pending |
| AUTH-19 | PARTIAL | 8h absolute DB expiry and no sliding; controlled 28,799/28,800/28,801s and fault pending |
| AUTH-20 | PARTIAL | 3 successes + 5 failures + 429, IP 20, basic bounds; full Unicode byte/codepoint boundary and proxy cases pending |
| AUTH-21 | PARTIAL | v1→v2 CSRF rotation, prior-key overlap, old session logout and missing prior-key 503 tested; production rollout still pending |
| AUTH-22 | PARTIAL | Two real API processes, 40 HTTP all-wrong/all-correct stress passed; deterministic barrier, mixed, crash and DB outage pending |
| AUTH-23 | PARTIAL | Browser current server-derived account reference, refresh/logout; C1/C2/T1/T2 switch/stale-response pending |

### Commands and evidence

- `npm run typecheck`, `npm test` (4/4), `npm run test:db` (15/15), `npm run test:e2e` (6/6), `npm run test:stress` (two-process 40+40 HTTP), `npm run build`.
- Browser images: `evidence/login-320.png`, `login-375.png`, `login-768.png`, `login-1280.png`, `customer-session.png` (all synthetic test data).
- Automated assertions are narrower than the full contract; a Ready-for-Review PR can be opened for reviewer feedback, but the unresolved rows still block full Issue #13 DoD acceptance and merge.
