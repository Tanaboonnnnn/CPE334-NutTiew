# F-S1-01 — Login, Current Identity and Logout UI (Part E)

> Proposed E-0.1. This is a UX **contract**, not implemented UI or test evidence. See [SDS](specification.md), [API](api-spec.md), [STS](tests.md). Role navigation does not authorize an API request.

| UI state | Action | Observable expected behavior | Trusted server interaction |
|---|---|---|---|
| Signed out | Open app | Labeled email/password form, no protected data or role selector; login is permitted | `GET /api/v1/auth/me` missing cookie → 401; show login |
| Pending | Submit credentials | Disable duplicate submit while pending, visible status, do not print password | `POST /auth/login` (same origin) |
| Customer success | Valid Customer login | Query current identity; show Customer role and Customer navigation only | `GET /auth/me` derives role from DB Session/User, **not UI** |
| Tutor success | Valid Tutor login | Query current identity; show Tutor navigation (own schedule downstream) | Same server-trusted principal; domain authorization remains backend |
| Bad credentials | Unknown/wrong/inactive account | Generic identical error, no account enumeration, no protected data | 401 `LOGIN_FAILED` |
| Bad form | Blank/invalid inputs | Keyboard-accessible field errors; server revalidates | 400 `INVALID_INPUT` |
| Reload | Active/expired Session | Loading until current-user response; active survives refresh; revoked/expired loses identity | `GET /auth/me` then authorized or signed out |
| Logout | Authenticated principal clicks logout | Obtain in-memory CSRF token, post logout; clear UI identity after **confirmed 204 only**. On network/DB error show uncertainty and retry rather than falsely claim revocation | `GET /auth/csrf` → `POST /auth/logout` |
| Forged navigation | Customer attempts Tutor URL or Tutor A accesses Tutor B ID | UI access-denied state with no private data; backend still applies 403/404 | Role and DB owner checks in later Issues #14–17 |

## Interaction and security requirements

Use native `<label>` elements for email/password, `autocomplete=email` and `current-password`, visible focus and keyboard Tab/Enter flow, live status/error announcement, no user-selectable role, no credential or raw session storage in URLs, localStorage, analytics or logs. Because the cookie is HttpOnly, JavaScript never reads bearer secret; CSRF value is memory-only and cleared after sign-out. Avoid showing cached protected identity after 401 or after a stale request finishes late. If logout commit fails, do not present successful sign-out based solely on clearing frontend state.

## Future UI evidence (Part F only)

Record real browser/API/DB verification of Customer and Tutor login, wrong password, trusted role on refresh, logout and replay denial, keyboard navigation and forged access attempts. Screenshots of a hidden Tutor button are **not** a backend permission test. Actual screenshots, Playwright results and integration evidence are **NOT RUN** at this Part E phase.
