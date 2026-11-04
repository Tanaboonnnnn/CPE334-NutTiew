# F-S1-02 — Tutor Availability UI Specification (Part E)

> **REVISED PROPOSED PART E / NOT IMPLEMENTED OR BROWSER-TESTED.** Issue #14, @Tanaboonnnnn owner, @Chxtamos reviewer. See [SDS and owner decision](specification.md), [HTTP](api-spec.md), [Data](data-spec.md), [STS](tests.md), [Auth UI direction](../F-S1-01/ui-spec.md).

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
| Empty | Show "ยังไม่มีช่วงเวลาติวที่เปิดไว้" and usable creation form |
| Editing | Show selected Bangkok start and derived end |
| Creating | Clear pending indicator, one request in flight; no phantom success |
| 201 Created | Show committed confirmation and refresh own-list from server |
| 409 Overlap | "ช่วงเวลานี้ทับกับเวลาที่เปิดไว้แล้ว"; retain fields, focus error |
| 400/422 Invalid | Field-linked invalid/past message, no Slot added |
| 401/403 | Clear private list, signed-out or access denied; no unauthorized data |
| 403 CSRF/Origin | No success; recover session/CSRF where allowed |
| 503/network timeout | Indeterminate outcome: show uncertainty, refresh own-list before a duplicate submit |
| Logout or account switch | Immediately clear old identity and Slot data, invalidate request generation/abort old fetches, and ignore stale GET responses from prior Session |

The current Auth UI has request-generation guards for stale `/me` responses. The new Tutor view must use equivalent lifecycle cancellation/generation checks. **Required privacy scenario:** T1 GET starts but its response is held; the user logs out or switches to T2; then release the old T1 success response. The UI must **never re-display T1 Slots** in T2's/current signed-out view; authenticated owner-list GET for T2 must include only T2 rows. This is a planned deterministic E2E negative, **not** a passed test.

## Accessibility / responsive acceptance

- 320/375px: usable single-column form/list; 768/1280px: readable restrained page width; no horizontal overflow.
- Labeled date/time inputs, `aria-invalid` and associated `aria-describedby` messages, accessible alert/status updates and keyboard order.
- At least 44x44px interactive targets, visible `:focus-visible` and adequate contrast checked rather than assumed. No color-only conflict message.
- Avoid faux calendars/testimonials, generic hero pages, unnecessary visual ornament or decorative random UI.
- Part F evidence: real screenshots at 320/375/768/1280, manual keyboard/contrast check with reviewer/date/SHA, UTC vs Bangkok browser test, create/error/empty/refresh/restart flows.

## Review decisions

**Decision state:** owner @Tanaboonnnnn selected Option A on 2026-11-04 for **Sprint 1 scope only**: no additional workday/hour, advance horizon or start-minute grid constraint; not a 24/7 stakeholder claim. The minute-level input/transport precision is an independent engineering validation proposal. Peer reviewer @Chxtamos must accept/reject that policy scope and the **no-detail, no-filter, no-pagination own-list**/DTO/ordering contract, session failure recovery and shared Auth visual design. No UI or automated test result is claimed by this document.
