# F-S1-01 — Authentication Software Test Specification (Part E)

> **Proposed E-0.1 / all cases NOT RUN.** Review alongside [SDS](specification.md), [API](api-spec.md), [UI](ui-spec.md) and [Data](data-spec.md) before implementing Feature code. Issue #13 requires separately reviewed Part E and Part F PRs; planning tests cannot satisfy the implementation DoD.

## Proposed harness and recorded evidence

Part F uses real PostgreSQL with applied migrations, generated non-committed test-only secrets, two independent Customers C1/C2 and two Tutors T1/T2, inactive User, expired/revoked Sessions and sessions A/B. API tests with Supertest/Vitest, selected real-browser Playwright/UI, DB row inspections and selected service/unit checks. Tool and package versions must be confirmed during implementation; the repo currently has **no app, installed test suite, migration, or test DB proven running**.

For each real run preserve exact command, source SHA, environment/Node/PostgreSQL/migration identity, sanitized request/result logs, PASS/FAIL/SKIP counts, expected vs observed DB Session rows and response fields. A mock-only authorization unit test **does not prove** UI→API→persistent DB. Domain rows and endpoints in Issues #14–17 are a **later shared integration gate**, never silently counted PASS at Part E stage.

## Planned tests (no results claimed)

| ID | Trace identifiers | Setup and action | Expected API, database and UI result | Execution stage |
|---|---|---|---|---|
| AUTH-01 | FR-S1-01, FR-001, AC-S1-01/02, VC-01, VAL-001 | Login C1 and T1 using correct pre-provisioned credentials | 200 own trusted role; distinct HttpOnly cookies; two committed Session digest rows and active User join | Part F API/DB |
| AUTH-02 | FR-S1-01, AC-S1-03, VC-02, VAL-001 | Unknown email, wrong password, inactive user | Same generic 401 response; no authenticated cookie or new Session; no user enumeration | Part F API/DB |
| AUTH-03 | FR-S1-02, FR-002, VC-03, VAL-001/002 | Valid C1/T1 cookie, then forged role/userId headers/query/body | GET /auth/me returns only DB-derived own id/role; no hash, token, foreign identity | Part F API/DB |
| AUTH-04 | FR-S1-03, AC-S1-04, VC-04, VAL-001/002 | Save cookie A, get valid CSRF and Origin, logout, replay saved A | DB revokedAt committed; 204 only after commit; replay A denied 401 and no protected fields | Part F API/DB |
| AUTH-05 | FR-S1-03, VC-04, VAL-002 | Login twice A/B, logout A, request with B | A denied, B still valid, ordinary logout did not revoke B | Part F API/DB; OD-005 |
| AUTH-06 | FR-S1-02/03, VC-04/05, VAL-002 | Expired/revoked session or inactive User; restart app with persistent DB | Every stale credential denied; live B continues until expiry across restart | Part F API/DB |
| AUTH-07 | FR-S1-04, AC-S1-05, VC-05, VAL-002/036 | Anonymous calls current-user and protected Slot/Booking routes | 401 with no private payload or mutation; domain route checks run only after Issues #14–17 | Auth now / domain later |
| AUTH-08 | FR-S1-04, BR-S1-17/20, AC-S1-06, VC-06, VAL-002/036 | C1 forges Tutor Slot create or role=Tutor | Backend 403, no Slot row committed; UI hiding Tutor control insufficient | Cross-feature #14 |
| AUTH-09 | FR-S1-04, BR-S1-16/20, AC-S1-07, VC-07/31, VAL-002/036 | Tutor T1 guesses Tutor T2 schedule/Booking IDs | Privacy-safe denial/404, no T2 payload or mutation | Cross-feature #14/#17 |
| AUTH-10 | FR-S1-04, NFR-S1-01, VC-31/35, VAL-002/036 | Customer C1 requests C2 Booking ID/list | 404 foreign/missing indistinguishable, no private Booking fields | Cross-feature #16/#17 |
| AUTH-11 | NFR-S1-02/08, VC-35, VAL-034 | Inspect real User, Session and logs/tracked config | Argon2id salted hash, SHA-256 digest only, no plaintext passwords/bearer tokens or tracked secrets | Part F API/DB + Git |
| AUTH-12 | OD-005, FR-S1-03, VAL-002 | Inject Session INSERT fault at login or revocation UPDATE fault at logout | No success/session cookie before insert commit; no false 204/cookie clear if revoke fails; DB remains source of truth | Part F DB failure |
| AUTH-13 | OD-005, VAL-002/036 | Cross-origin login, missing/wrong CSRF/Origin on logout; later unsafe domain routes | 403 before mutation, no foreign fields, no new Session | Part F auth / domain later |
| AUTH-14 | OD-005, VC-04, VAL-002 | At expiresAt boundary, repeat logout, concurrent replay of old A | Exactly-at-expiry denied; revoked A never regains access | Part F DB/clock |
| AUTH-15 | AC-S1-01..04, NFR-S1-09 proposed | Actual browser C1/T1 login, reload, failed login, logout, keyboard tab/focus | Correct role navigation, accessible feedback, no stale identity; correlate with real API/DB evidence | Part F UI |
| AUTH-16 | BR-S1-20, FR-S1-04, VAL-036 | Test auth guard and owner predicates with client-supplied impersonation fields | Ignore client claims; service checks authenticated principal and owner-filtered DB predicates | Part F auth + domain later |

## Negative-response/privacy assertions

For each 401/403/404/429/503 failure inspect status and sanitized error envelope; assert no `passwordHash`, session or CSRF token, SQL/stack details, foreign identity or Booking data. A Set-Cookie **clearing** an invalid token is not a new authenticated cookie. Verify failed writes leave no new Session, Slot or Booking row. 403 wrong-role and privacy-safe 404 missing/foreign-row are distinct.

## Independent review / go-no-go checklist

- [ ] @Tanaboonnnnn reviews full Part E, including 8h absolute TTL, current-session-only logout, Origin and CSRF token bootstrap, rate limit, API status/error mapping and data schema under OD-005. Author may not self-approve.
- [ ] Trace AC-S1-01..07, FR-S1-01..04, BR-S1-04/16/17/20, NFR-S1-01/02/07/08 and VAL-001/002/034/036 to named cases above, noting cross-feature tests are NOT RUN until domain routes exist.
- [ ] Reviewed Part E PR is merged into `sprint1` before F-S1-01 implementation begins. If source/OD-005 or review is missing, **BLOCK Part F**; do not assume an approval.
- [ ] On separate Part F branch from latest `sprint1`, write failing tests first, implement real UI/API/PostgreSQL, run actual tests, publish source SHA/results and open independent feature-code PR for human review. **Issue #13 remains open until implementation and review/merge evidence exist.**
