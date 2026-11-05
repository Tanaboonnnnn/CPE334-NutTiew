# UX Decision — Tutor Calendar Dashboard (2026-11-05)

**Decision owner:** @Tanaboonnnnn (requested in conversation on 2026-11-05).
**Visual direction source:** @Chxtamos's detailed *Tutorix-inspired Calendar Dashboard*
change-request text, reproduced in the owner's accepted task instructions;
the screenshot itself is **not available as a verifiable GitHub artifact**.
**Review status:** owner-selected design direction; **this is a docs-only
Part E amendment proposed for independent peer acceptance and merge before
any new Part F dashboard implementation PR may be accepted**. It does not
retroactively validate work previously started in a mixed docs/code PR.
**Baseline:** original Slot Part E PR #27 and Part F PR #28 (merged into `sprint1`
at `ed451be2ca3e366bdfc1900f4c4697aa7e50b6a0`).

**Two-PR gate for this new visual change:** review and merge the *new*
docs-only UX amendment into `sprint1` first. Only then branch the
Tutor Dashboard implementation from that updated `sprint1` and open a
separate code PR. The earlier combined PR #29 did not satisfy this
sequencing requirement and cannot count as the accepted Part E gate.

## Superseded visual layout, retained domain contract

The previous *Tutor screen* used the approved Auth warm-neutral/pine palette
and a narrow create-form-first full-list layout. Replace **only the Tutor
presentation** with a navy/orange scheduling dashboard: a genuine sidebar,
account details, a 24-hour date timeline with **three day columns at 1280px
and wider**, **two day columns at 621–1060px** (including 768px),
read-only arbitrary-minute 60-minute Slot blocks, an inline create panel,
and a complete all-slots chronological agenda. **At 320/375px and up
to 620px**, replace the timeline with the full accessible agenda.
All navigation is real. No fake Students, Revenue, Messages, Bookings,
notification counts, subjects, learners, reschedule or demo appointments.

**Not superseded:** the F-S1-01 Login/Auth appearance, trusted identity,
session handling, the F-S1-02 API and DB contract, immutable Slot semantics,
the Option A absence of working hours/advance-horizon/grid limitations,
UTC transport/Asia-Bangkok display, cross-midnight precision, full private
own-list, network-uncertainty reconciliation and stale-success protection.

**Owner-selected CTA contrast pairing (Tutor view only):** use orange
`#F47736` with dark text/icons `#172137` (**5.76:1** on orange),
`#D96123` border (**3.48:1** against `#F7F8FB` canvas;
**3.69:1** against white), and a `3px` `#AA4519` keyboard focus
outline offset outward by `3px` (**5.53:1** against canvas,
**5.87:1** against white). Do **not** use white text on orange
(**2.79:1**) or rely on the orange fill alone for component
visibility (**2.62:1** against canvas). Ratios are token calculations
for the design contract, **not evidence of a complete WCAG audit**;
verify rendered styles and states in Part F. This does not recolor
the previously approved Auth/Customer UI.

## Ownership and display boundaries

- Only `GET /api/v1/tutor/slots` (full owner DTO list, no query) and
  `POST /api/v1/tutor/slots`; calendar navigation is in memory and never
  changes server-side selection. The agenda shows **every** returned Slot.
- **Functional account link:** `บัญชีของฉัน` navigates to the in-page
  `#account-details` section, which displays **only the Tutor role and a
  shortened account ID supplied by trusted `/api/v1/auth/me`**. No
  separate profile route, profile-edit capability, email pulled from a
  login form, or additional personal fields are authorized by this scope.
- Calendar day positions use **real minute offsets**, not 15/30/60-minute
  snapping. The hour grid marks time visually but imposes no creation rule.
  Days cover 00:00 through 24:00, with cross-midnight slices appearing on
  their respective dates.
- The **overview total** counts **every persisted Slot in the complete
  authenticated Tutor owner-only GET response across all dates**, even
  outside the current Calendar viewport. It never changes when the
  user navigates days. The Calendar-only **"ช่วงที่แสดง"** metric is a
  separate number: count of distinct own Slots intersecting the
  currently displayed day columns (a cross-midnight Slot counts once
  per viewport, not twice per rendered day fragment).
  Both numbers derive from real returned Slots only **after successful GET**.
  On initial GET failure/retry failure show a retryable error, suppress
  Calendar and Agenda (including false empty claims), and display an
  unknown count (`—`). Empty means confirmed **200 with `data: []`** only.
  The UI must label
  `Offered` as an opened time, **not** as a confirmed Customer Booking.
  Until Issue #16, occupancy is the existing safely derived `Unoccupied`.
- **Owner-selected logout privacy (2026-11-06):** from the instant
  Logout begins, **hide the account identity/status and all private
  Slot cards, Agenda and Calendar** and block protected Slot mutation
  controls. Retain the previous Tutor ID **only in internal non-rendered
  state** for comparison against a later `/api/v1/auth/me` response;
  this hidden state is **not** a claim that the server Session was revoked.
  If Logout is uncertain (503/network/timeout), show an accessible
  retry-logout/check-session path with private content still hidden.
  Restore access **only** after a fresh authenticated `/auth/me` 200
  confirms the **same Tutor ID** and a fresh owner-list GET succeeds;
  204 Logout or `/auth/me` 401 finalizes signed-out state. If a recheck
  fails or confirms another identity, continue to block the old Tutor.
- No new API parameters, endpoints, schema, booking, withdrawal, editing,
  deletion, bulk operation, recurrence, working-hours rule, or role selector.

## Accessibility and acceptance

The redesign targets **[WCAG 2.2 Level AA](https://www.w3.org/TR/WCAG22/)**
across all applicable Level A and AA success criteria, including:
normal text contrast **>=4.5:1**, large text **>=3:1** (SC 1.4.3),
non-text UI controls/necessary state indicators **>=3:1** against
adjacent colors (SC 1.4.11), complete keyboard operation (2.1.1),
visible keyboard focus (2.4.7) not entirely obscured (2.4.11),
target sizes **>=24x24 CSS px or the defined AA exceptions**
(2.5.8), and functional **320 CSS px reflow without two-dimensional
scrolling** except for intrinsic two-dimensional content (1.4.10).
**Project rule:** actionable primary controls meet the stricter
**44x44 CSS px** target. Verify labels, status text,
errors and color-independent meaning; reduced motion must not hide
focus or essential information. This is an acceptance **target, not a
claim of conformance**. Automated samples do not substitute for a
complete human keyboard/contrast/reflow accessibility signoff.
Color is never the sole Slot status indicator. The 24-hour timeline is a *visual
projection*: every Slot remains readable in its accessible agenda row.

**UX-R1:** desktop navy sidebar, white canvas, orange CTA with the
specified dark-ink/border/focus contrast pairing,
real Tutor role/ID and no fictitious navigation or figures.
**UX-R2:** real Slot clock placement at arbitrary minutes (13:17, 13:59);
cross-midnight and all-day (24-hour) access without work-hour restrictions.
**UX-R3:** date navigation locally changes only the calendar; full own-list
agenda remains complete, ordered, and owner-private.
**UX-R4:** at 320/375px render full mobile agenda, at 768px
render a **two-day timeline**, at 1280px render **three days**;
test 620/621px and 1060/1061px breakpoints; verify keyboard labels,
WCAG 2.2 AA text/non-text contrast, visible unobscured focus,
targets and 320px reflow without horizontal overflow.
**UX-R5:** unchanged secure create/CSRF/GET refresh, 409/422/503 recovery
and old-Tutor delayed-200 safety. Specifically, GET 503 then failed retry
must not display empty state, and authorized GET 200 restores genuine
nonempty/empty own-list. **Logout pending/uncertain** immediately hides
private identity and Slots and suspends protected mutations, retaining
the old Tutor ID internally only for safe comparison. It must provide
an actionable retry/check-session path and only re-enable on a fresh
`/api/v1/auth/me` 200 confirming the same Tutor plus a successful fresh
owner-list GET; 204/401 finalizes signed-out without falsely claiming
logout success after 503.
**UX-R6:** evidence must be from actual app, real PostgreSQL and Browser,
not a mock screenshot; include automatic checks and explicitly distinguish
human accessibility verification not performed.

**Approval gate:** the owner has selected this direction. @Chxtamos must
accept and merge **this docs-only Part E amendment first**. No new
implementation PR can claim the pre-code gate is met before that merge.
Human WCAG 2.2 AA/keyboard/contrast/reflow signoff is a separate
**NOT RUN** manual gate, not implied by passing Playwright.
