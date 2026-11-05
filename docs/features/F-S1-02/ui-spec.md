# F-S1-02 — Tutor Availability UI Specification (Part E)

> **2026-11-05 proposed visual-contract amendment (pending peer review):**
> The feature owner selected the @Chxtamos Tutorix-inspired **NutTiew Tutor
> Calendar Dashboard** as the new Tutor presentation. See
> [dated UX decision](ui-decision-2026-11-05.md). The older approved
> form+list content below remains a *historical Part E baseline*; its
> Auth palette and prohibition on calendar presentation are **proposed
> to be superseded for the Tutor view only**. The HTTP/DB/security/UTC/
> ownership/business-rule contract is **not** being superseded. Do not
> label this amendment peer-approved until review actually occurs.

> **Review sequencing:** this is a new **docs-only Part E proposal**;
> it must receive peer approval and merge into `sprint1` before the
> separate Tutor Dashboard Part F implementation PR. Original Part E
> PR #27 / Part F PR #28 remain historical, previously merged baselines.
> A combined docs-and-code PR is not a substitute for this gate.

## Amendment: Tutor Calendar Dashboard candidate

- Desktop uses a navy `#202B44` sidebar, a bright canvas `#F7F8FB`,
  white surfaces, orange `#F47736` call-to-action with the **explicit
  contrast-safe foreground/border/focus pairing below**, and
  deliberate dark text/focus. These tokens are **scoped to the Tutor
  dashboard**; existing Auth Login/Customer palette remains unchanged.
- **Required CTA pairing (WCAG 2.2 AA design target, not human signoff):**
  button fill `#F47736`, **dark-ink label/icon `#172137`** (measured
  **5.76:1** against the orange fill), and a **1 CSS px solid border
  `#D96123`** to distinguish the component from adjacent surfaces
  (**3.48:1** against canvas `#F7F8FB`; **3.69:1** against white).
  The keyboard focus indicator is **3 CSS px solid `#AA4519` with
  `outline-offset: 3px`** outside the button/border, contrasting
  **5.53:1** with the canvas or **5.87:1** with white. These values
  are calculated from the specified sRGB tokens; Part F must verify
  computed browser colors, focus visibility, hover/disabled/error
  states and adjacent backgrounds. **Do not use white text on
  `#F47736` (only 2.79:1), or the unbordered orange fill as the
  only visible control boundary** (2.62:1 against canvas, 2.79:1
  against white). This pairing does not by itself certify WCAG AA.
- Sidebar contains only functional **ตารางเวลาของฉัน**, **บัญชีของฉัน**
  and **ออกจากระบบ**. Account data and role come from trusted `/auth/me`.
  Do **not** construct fake Students, Revenue, Messages, Bookings,
  notifications, learner names, courses or rescheduling.
- **บัญชีของฉัน** links to the in-page `#account-details` section,
  not a new route or editable profile. That section displays exactly
  **Tutor** role and a shortened account ID derived from trusted
  `GET /api/v1/auth/me` `user.id` and `user.role`; it must not surface
  unverified login-form email or invented profile fields. Hide the
  section while Logout is pending or uncertain, along with all other
  identifying UI.
- Header: **ตารางเวลาติวของฉัน**, role/account reference, `Asia/Bangkok`
  and `+ เพิ่มช่วงเวลาติว` that takes the user to the inline form.
- Calendar: accessible **24-hour** local timeline, **3 days at
  widths >1060px** (including desktop 1280px), **2 days at 621–1060px**
  (including tablet 768px). At **320/375px and all widths <=620px**,
  the complete Agenda replaces the timeline. Responsive breakpoint
  checks must include 620/621 and 1060/1061px. Slot cards use genuine
  Offered records and computed minute-exact offsets (no snapping), including 13:17, 13:59,
  and a 23:30→00:30 date crossing. Hour marks are presentation ticks.
  Previous/Next/Today/day picker only change local view state and never
  append filters to `GET /api/v1/tutor/slots`.
- Mobile 320/375: no horizontal overflow; use a complete **agenda/list
  fallback** instead of a squeezed timeline. The **รายการ Slot ทั้งหมด**
  agenda is **available after successful authenticated GET 200** and
  preserves `startsAt ASC, id ASC` for all returned private Slots,
  including dates outside the current calendar. Hide the Agenda on
  initial load/GET error, Logout pending/uncertain or account switch;
  do not silently paginate, crop or hide other times when authorized.
- **Counts must not be conflated:** the summary **ช่วงเวลาที่เปิดไว้ทั้งหมด**
  is the total number of Slots from the **full unfiltered own-list GET
  across all dates**, unaffected by Prev/Next/Today/day selection.
  **ช่วงที่แสดง** counts distinct committed own Slots that intersect
  the displayed Calendar viewport only; a Slot spanning midnight is
  counted once per viewport even if rendered in two day columns.
  Both metrics are **unknown `—` until a successful GET 200**, and
  must never falsely show zero during GET/Retry failures.
- The create form retains native labeled Bangkok date and any-minute
  time, derived read-only +60-minute end, POST security, real loading,
  conflict (409), invalid (400/422), and uncertain 503/network states.
  After success or ambiguous write, reconcile with owner-only GET.
  The old T1 authenticated 200 must never reappear after T2 login.
- **Read-side state machine:** until the authenticated own-list GET
  returns 200, the schedule is **unknown**, not empty. Initial load
  shows progress, initial GET 503/network failure or retry 503 shows
  an accessible error with a working **โหลดอีกครั้ง** control, **hides**
  the empty/full Agenda and Calendar, and shows unknown `—` instead of
  an unverified zero summary. Only a confirmed 200 + `data: []`
  may show **ยังไม่มีช่วงเวลาติวที่เปิดไว้** and total zero;
  a confirmed 200 with rows restores all committed own Slots. These
  rules apply to both initial load and later refresh failures and must
  prevent stale old-Tutor data from reappearing.
- **Auth/logout guard inherited from F-S1-01 and owner decision
  2026-11-06:** starting **synchronously on Logout click**, unmount or
  hide the Tutor account reference, signed-in status, private Slot
  cards, Calendar and Agenda. Immediately block protected actions
  (including the create form, header CTA and any pending CSRF-to-POST
  flow), invalidate stale UI request generations and prevent any **new**
  Slot POST after Logout begins. Any POST sent *before* Logout may
  already have committed; do not claim a server rollback from UI alone.
  Retain the prior Tutor ID **only in internal non-rendered state**.
  **UI hidden does not equal Session revoked**: only confirmed Logout
  HTTP 204 or a fresh `/api/v1/auth/me` 401 finalizes signed-out status.
  If Logout returns network/503/timeout uncertainty, private data
  stays hidden and protected actions stay blocked; show an accessible
  **ลองออกจากระบบอีกครั้ง / ตรวจสอบเซสชัน** recovery path.
  A fresh `/api/v1/auth/me` HTTP 200 with **exactly the same Tutor ID
  and Tutor role** permits a *new* authenticated own-list GET; restore
  the Dashboard and protected interactions **only after that GET
  succeeds**. A 401 clears internal identity, a different identity
  cannot unlock prior Tutor data, and recheck 503/network keeps the
  Dashboard hidden/blocked. Old T1 authorized HTTP 200 responses
  must never repaint private content after Logout or account switch.
- **For state consistency:** `suspended/uncertain` is a third
  presentation state distinct from both `authenticated/visible` and
  `confirmed signed-out`. Do not display authenticated identity while
  suspended; do not falsely claim Logout succeeded after an unknown
  response. The earlier Part E state table below is historical and
  the amended logout rows directly below supersede its old generic
  "Logout or account switch" wording for the new Tutor Dashboard.
- Required new test IDs: **UX-R1…UX-R6** from the
  [dated decision](ui-decision-2026-11-05.md). Add screenshots from
  *real DB-backed browser sessions* at 320, 375, 768 and 1280, and
  keyboard/contrast evidence. The new design targets **WCAG 2.2
  Level AA** (all applicable A/AA criteria), measured at **4.5:1
  normal text / 3:1 large text**, **3:1 non-text components and
  required visual states**, visible/unobscured keyboard focus,
  AA **24x24 CSS px minimum target or normative exceptions** with a
  stricter project **44x44px primary-control** target, and usable
  320 CSS px reflow without unexpected two-axis scrolling. Record
  automated samples separately from complete manual assessment.
  For read-side failure and logout guard tests, use
  **UX-R5-GET-01/02** and **UX-R5-LOGOUT-01/02** in
  [STS](tests.md). **Human WCAG 2.2 AA signoff remains NOT RUN
  until a person performs it**.

> **PROPOSED DASHBOARD UX AMENDMENT / NO NEW IMPLEMENTATION IN THIS DOCS-ONLY PR.** The existing Slot API, DB and Auth implementation from merged PR #28 already exists. The new dashboard/logout acceptance cases in this amendment are *planned*, not executed or accepted by this documentation alone. Issue #14, @Tanaboonnnnn owner, @Chxtamos reviewer. See [SDS and owner decision](specification.md), [HTTP](api-spec.md), [Data](data-spec.md), [STS](tests.md), [Auth UI direction](../F-S1-01/ui-spec.md).

## Screen and navigation

"My Availability / ตารางเวลาติวของฉัน" is an authenticated Tutor-only view. Use the current `GET /api/v1/auth/me` trusted DB-derived role and session identity; do not invent a role selector. Reuse approved NutTiew look from Auth Part E: warm neutral background `#F6F4EF`, graphite text `#262B28`, restrained pine accent `#285C4B`, Thai/English readable typography, visible focus and minimal functional layout. Keep the Tutor screen separate from existing Auth-only `apps/web/src/main.tsx`; avoid unrelated Auth redesign.

**Minimum surface:** a create form, a derived 60-minute end preview, and a chronological **full own-list** of current Tutor's persisted Slots ordered `startsAt ASC,id ASC`. The Sprint 1 UI calls **only POST /api/v1/tutor/slots and GET /api/v1/tutor/slots**. No detail view/`:id` route, filters, pagination, date-range selector, drag-and-drop week calendar, bulk/recurring generation, delete/edit/withdraw or Customer Booking UI in #14. A list is sufficient if it meets accepted flows; this does not establish a future unlimited-scale guarantee.

## Form controls

| Control | Visible behavior | Validation / authority |
|---|---|---|
| Role/account display | Latest server-issued Tutor identity; authorized route | Display is not backend authorization |
| Bangkok calendar date | Labeled `YYYY-MM-DD` selection | **Owner chose Sprint 1 Option A**: no extra workdays, holidays or max advance horizon (OD-001/002); still strictly future |
| Start time | Labeled `HH:mm`, Bangkok civil time, **any minute** such as 13:17 | No top-of-hour/quarter-hour grid (OD-003). UI has minute precision only; API seconds/fraction must be **zero**, not silently rounded |
| End time | Read-only start + exactly 60m, including cross-midnight day rollover | Client cannot submit arbitrary duration/end |
| Create Slot | Visible pending state; prevent accidental double-click | Database remains authoritative for concurrent writes |
| Schedule rows | Bangkok date/time, lifecycle `Offered`, safe derived `occupancy` | No other Customer names/emails; exactly the HTTP DTO allowlist. Offered does not imply Customer-bookable under Q05 |
| Error feedback | Keep user input and show actionable safe error | Never show false success after 409/422/503 |

**Timezone and precision contract:** combine Bangkok civil date and `HH:mm` explicitly with `Asia/Bangkok` or a verified `+07:00` offset; construct a valid RFC3339 timestamp with seconds `:00`, optional fractional `.000`, and explicit offset; convert to UTC `.000Z` before POST. **Do not** rely on `new Date('YYYY-MM-DDTHH:mm')` device-local parsing. Format returned UTC with `Intl.DateTimeFormat` and `timeZone:'Asia/Bangkok'` or a tested equivalent. 13:00:00 and 13:00:00.000 are accepted, **13:00:30 and 13:00:00.500 rejected without rounding** by API even when sent outside this form. Any HH:mm minute (13:00, 13:17, 13:59) is allowed if otherwise future/valid. Test UTC/Tokyo and cross-midnight 23:30→00:30 Bangkok.

## Observable UI states

| State | Behavior |
|---|---|
| Auth pending | Do not show private schedule until `/auth/me` confirms Tutor |
| Loading | Display status, not fake appointments |
| Empty (authenticated own-list GET 200 with `data: []` only) | Show "ยังไม่มีช่วงเวลาติวที่เปิดไว้" and usable creation form; never infer empty from a failed/unknown GET |
| Editing | Show selected Bangkok start and derived end |
| Creating | Clear pending indicator, one request in flight; no phantom success |
| 201 Created | Show committed confirmation and refresh own-list from server |
| 409 Overlap | "ช่วงเวลานี้ทับกับเวลาที่เปิดไว้แล้ว"; retain fields, focus error |
| 400/422 Invalid | Field-linked invalid/past message, no Slot added |
| 401/403 | Clear private list, signed-out or access denied; no unauthorized data |
| 403 CSRF/Origin | No success; recover session/CSRF where allowed |
| POST 503/network timeout | Indeterminate write outcome: show uncertainty, refresh own-list before a duplicate submit; GET 503 is a separate read-side unknown state, not empty |
| Logout starts (new Tutor dashboard amendment) | Immediately hide old account ID, signed-in status, Calendar and Agenda; block Create and any new protected POST synchronously, invalidate old requests; retain prior Tutor ID internally only for recheck, do **not** assert signed-out yet |
| Logout response 503/network/timeout | Keep all private surfaces hidden and protected actions blocked; announce outcome unknown and expose retry Logout / check Session, not fake Logout success |
| Fresh same-Tutor `/auth/me` 200 after uncertain Logout | Re-read complete authenticated own-list GET; restore Tutor identity, Calendar, Agenda and actions **only after successful owner GET**. Failed own-list GET retains privacy/blocked state |
| Fresh `/auth/me` 401 or confirmed Logout HTTP 204 | Finalize signed-out, clear internal identity and private data, prevent stale T1 responses |
| Different account or failed `/auth/me` recheck | Never unlock the previous Tutor; clear or retain only hidden internal comparison state as appropriate, all private surfaces hidden and protected writes blocked |
| Account switch without Logout | Invalidate previous owner generation, immediately hide old identity and Slots and use only the newly verified account's authenticated own-list |

The current Auth UI has request-generation guards for stale `/me` responses. The new Tutor view must use equivalent lifecycle cancellation/generation checks. **Required privacy scenario:** T1 GET starts but its response is held; the user logs out or switches to T2; then release the old T1 success response. The UI must **never re-display T1 Slots** in T2's/current signed-out view; authenticated owner-list GET for T2 must include only T2 rows. This is a planned deterministic E2E negative, **not** a passed test.

## Accessibility / responsive acceptance

- 320/375px: usable single-column form/list; 768/1280px: readable restrained page width; no horizontal overflow.
- Labeled date/time inputs, `aria-invalid` and associated `aria-describedby` messages, accessible alert/status updates and keyboard order.
- At least 44x44px interactive targets, visible `:focus-visible` and adequate contrast checked rather than assumed. No color-only conflict message.
- Avoid faux calendars/testimonials, generic hero pages, unnecessary visual ornament or decorative random UI.
- Part F evidence: real screenshots at 320/375/768/1280, manual keyboard/contrast check with reviewer/date/SHA, UTC vs Bangkok browser test, create/error/empty/refresh/restart flows.

## Review decisions

**Decision state:** owner @Tanaboonnnnn selected Option A on 2026-11-04 for **Sprint 1 scope only**: no additional workday/hour, advance horizon or start-minute grid constraint; not a 24/7 stakeholder claim. The minute-level input/transport precision is an independent engineering validation proposal. Peer reviewer @Chxtamos must accept/reject that policy scope and the **no-detail, no-filter, no-pagination own-list**/DTO/ordering contract, session failure recovery and shared Auth visual design. No UI or automated test result is claimed by this document.
