# F-S1-01 — Login, Current Identity and Logout UI (Part E)

> Proposed E-0.1. This is a UX **contract**, not implemented UI or test evidence. See [SDS](specification.md), [API](api-spec.md), [STS](tests.md). Role navigation does not authorize an API request.

| UI state | Action | Observable expected behavior | Trusted server interaction |
|---|---|---|---|
| Signed out | Open app | Labeled email/password form, no protected data or role selector; login is permitted | `GET /api/v1/auth/me` missing cookie → 401; show login |
| Pending | Submit credentials | Disable duplicate submit while pending, visible status, do not print password | `POST /auth/login` (same origin) |
| Customer success | Valid Customer login | Show server-issued **own account reference plus effective Customer role**, not just generic “Customer”. Proposal: “บัญชี: …a1b2c3d4 · Customer”, where suffix is last 8 hex characters of authenticated UUID (short label, not unique security identifier) | `GET /auth/me` derives `id` and `role` from DB Session/User, never client input or stale state |
| Tutor success | Valid Tutor login | Show **own account reference plus Tutor role** and own schedule navigation. After switching account, no previous C1/T1 identity persists | Same trusted `/auth/me` response, domain authorization still enforced by API |
| Bad credentials | Unknown/wrong/inactive account | Generic identical error, no account enumeration, no protected data | 401 `LOGIN_FAILED` |
| Bad form | Blank/invalid inputs | Keyboard-accessible field errors; server revalidates | 400 `INVALID_INPUT` |
| Reload | Active/expired Session | Loading until current-user response; active survives refresh; revoked/expired loses identity | `GET /auth/me` then authorized or signed out |
| Logout | Authenticated principal clicks logout | Obtain in-memory CSRF token, post logout; clear UI identity after **confirmed 204 only**. On network/DB error show uncertainty and retry rather than falsely claim revocation | `GET /auth/csrf` → `POST /auth/logout` |
| Forged navigation | Customer attempts Tutor URL or Tutor A accesses Tutor B ID | UI access-denied state with no private data; backend still applies 403/404 | Role and DB owner checks in later Issues #14–17 |

## Interaction and security requirements

Use native `<label>` elements for email/password, `autocomplete=email` and `current-password`, visible focus and keyboard Tab/Enter flow, live status/error announcement, no user-selectable role, no credential or raw session storage in URLs, localStorage, analytics or logs. Because the cookie is HttpOnly, JavaScript never reads bearer secret; CSRF value is memory-only and cleared after sign-out. Avoid showing cached protected identity after 401 or after a stale request finishes late. If logout commit fails, do not present successful sign-out based solely on clearing frontend state.

## Future UI evidence (Part F only)

Record real browser/API/DB verification of Customer and Tutor login, wrong password, trusted role on refresh, logout and replay denial, keyboard navigation and forged access attempts. Screenshots of a hidden Tutor button are **not** a backend permission test. Actual screenshots, Playwright results and integration evidence are **NOT RUN** at this Part E phase.

## Auth-only visual direction — proposed, pending human design approval

The proposed visual direction is a **calm tutoring/scheduling utility**, not a landing or marketing page. @Chxtamos proposes this for **F-S1-01 only**; @Tanaboonnnnn must review/accept the direction before Part F UI implementation. These visual decisions are team proposals, not new instructor business rules.

| Element | Desktop | Mobile and acceptance |
|---|---|---|
| Anatomy | Small text-only NutTiew wordmark, concise sign-in heading, subdued helper, left-aligned visible email/password labels and inputs, one prominent primary action, quiet real help text only | Keep same order; no role picker, imaginary schedules, testimonials, hero or extra CTAs |
| Layout | Warm neutral page, readable **400–440px maximum** form column with content left-aligned, centered within available canvas; **no nested cards** | At 320/375px use 16px horizontal gutters and full remaining width; at 768/1280px preserve readable column, no horizontal overflow |
| Spacing and corners | 4/8/12/16/24/32px spacing scale; 8px label gap, 16px field gap, 24–32px section separation, 8px radius | Input/button internal padding 12–16px; target size **at least 44 by 44 CSS px**; avoid clipping or overlapping text |
| Typography | Thai/English legible stack: Noto Sans Thai, Sarabun, system-ui, sans-serif; heading 24px/1.3 weight 600; body 16px/1.5; labels 14–16px/1.5 | Input font >=16px; keep bilingual text readable without truncation and clear focus/navigation order |
| Semantic colors | **--auth-bg #F6F4EF** warm neutral, **--auth-surface #FFFFFF**, **--auth-text #262B28** graphite, **--auth-muted #4F5853**, **--auth-accent #285C4B** single muted pine green, **--auth-border #77877B** visible input boundary, **--auth-focus #285C4B**, **--auth-error #9C2B2B** (error status only) | Verify actual text/background pairs **>=4.5:1 normal text**, functional input border against white AND warm canvas **>=3:1 non-text contrast** (WCAG 2.2 SC 1.4.11); >=2px focus indicator; white-on-accent primary action; never convey errors by color alone |

**Anti-template gate:** do not use generic purple/blue gradients, glassmorphism, glow/blur floating blobs, gratuitous 3D stock mascots, decorative emoji, card-in-card layouts, fictional schedules/testimonials, or generic landing hero/CTA sections. Ordinary accessible icons and focus states are allowed when functional. Do not redesign Booking/Tutor pages in Issue #13.

## Auth form accessibility and failure recovery — concrete acceptance rules

- Inputs must be **type=email and type=password**, with visible associated labels and **autocomplete=email/current-password**; permit paste and password-manager autofill. A show/hide-password control is a type=button control with accessible name reflecting current action, aria-pressed state, retained input value and focus; it must never accidentally submit.
- Field-specific errors must appear adjacent to fields, linked with **aria-describedby** and **aria-invalid**. For failed client validation, move focus to the first invalid input. For failed server submit, focus the short role=alert summary and announce it to a screen reader. Generic login copy must **not** distinguish unknown vs inactive account vs wrong password (e.g. “อีเมลหรือรหัสผ่านไม่ถูกต้อง”).
- All visible interactive controls, including submit, show/hide and logout, must have **>=44 x 44px** usable targets. Confirm visible **focus-visible**, keyboard Tab/Enter navigation, touch usability and no role picker. UI navigation never substitutes backend ownership checks.
- Loading and duplicate submit: show a visible pending state and disable repeat submit only during active request; after failure/timeout, return to an actionable retry state. Do not leave an indefinite spinner. Do not show an authenticated screen from a client-selected role.
- Reload, expiry and stale responses: on refresh hide protected content until a fresh /auth/me 200; on 401, clear in-memory identity and CSRF and render signed-out. Use request generation IDs or abort/ignore-stale logic so a late successful login/me response cannot restore identity after logout, 401 or a newer auth transition.
- Uncertain logout: when network/503 fails, do not claim revocation; stop protected interactions and display a short retry/check-session message. Only confirmed logout 204 or fresh /auth/me 401 can finalize the signed-out state. Discard late old-identity responses. No password/session token in console, URL or browser storage.
- **AC-S1-01/02 visible own identity:** after trusted 200 `/auth/me`, render a **server-derived short UUID account reference (last 8 hex digits, explicitly labeled “บัญชี”) plus effective role**, not simply a Customer/Tutor role tag shared by all accounts. A shortened UUID is only a privacy-preserving visual hint and may collide; never use it for authorization or claim global uniqueness. The backend continues to use the full ID. The proposed UI must check that seeded C1/C2 and T1/T2 test accounts yield distinguishable visible references; if not, increase displayed UUID length after review, not add email/displayName without privacy approval. Clear both reference and role during reload, 401, logout and session switch, then render only from the latest `/auth/me` response. This non-PII display policy needs teammate approval before Part F.
