# F-S1-02 — Tutor Availability UI Specification (Part E)

> **PROPOSED / NOT IMPLEMENTED OR BROWSER-TESTED.** Issue #14, @Tanaboonnnnn owner, @Chxtamos reviewer. See [SDS](specification.md), [HTTP](api-spec.md), [Data](data-spec.md), [STS](tests.md), [Auth UI direction](../F-S1-01/ui-spec.md).

## Screen and navigation

"My Availability / ตารางเวลาติวของฉัน" is an authenticated Tutor-only view. Use the current `GET /api/v1/auth/me` trusted DB-derived role and session identity; do not invent a role selector. Reuse approved NutTiew look from Auth Part E: warm neutral background `#F6F4EF`, graphite text `#262B28`, restrained pine accent `#285C4B`, Thai/English readable typography, visible focus and minimal functional layout. Keep the Tutor screen separate from existing Auth-only `apps/web/src/main.tsx`; avoid unrelated Auth redesign.

**Minimum surface:** a create form, a derived 60-minute end preview, and a chronological list of current Tutor's persisted Slots. No drag-and-drop week calendar, bulk/recurring generation, delete/edit/withdraw or Customer Booking UI in #14. A list is sufficient if it meets accepted flows.

## Form controls

| Control | Visible behavior | Validation / authority |
|---|---|---|
| Role/account display | Latest server-issued Tutor identity; authorized route | Display is not backend authorization |
| Bangkok calendar date | Labeled `YYYY-MM-DD` selection | No invented permitted weekdays or 7/14/30-day horizon (OD-001/002) |
| Start time | Labeled `HH:mm`, Bangkok civil time | No forced `:00`, `:15` or `:30` grid (OD-003); seconds precision decision requires peer review |
| End time | Read-only start + exactly 60m, including cross-midnight day rollover | Client cannot submit arbitrary duration/end |
| Create Slot | Visible pending state; prevent accidental double-click | Database remains authoritative for concurrent writes |
| Schedule rows | Bangkok date/time, lifecycle Offered, safe derived occupancy | No other Customer names/emails; Offered does not imply bookable under Q05 |
| Error feedback | Keep user input and show actionable safe error | Never show false success after 409/422/503 |

**Timezone rule:** combine Bangkok civil date and HH:mm explicitly with `Asia/Bangkok` or a verified `+07:00` offset and convert to UTC ISO before POST. **Do not** rely on `new Date('YYYY-MM-DDTHH:mm')` device-local parsing. Format returned UTC ISO with `Intl.DateTimeFormat({timeZone:'Asia/Bangkok'})` or tested equivalent. Test a non-Bangkok browser timezone and a cross-midnight one-hour Slot.

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
| Logout or account switch | Clear old identity and Slot data; ignore stale requests from prior Session |

The current Auth UI has request-generation guards for stale `/me` responses. The new Tutor view must use equivalent lifecycle cancellation/generation checks so a late GET never republishes private information after Logout.

## Accessibility / responsive acceptance

- 320/375px: usable single-column form/list; 768/1280px: readable restrained page width; no horizontal overflow.
- Labeled date/time inputs, `aria-invalid` and associated `aria-describedby` messages, accessible alert/status updates and keyboard order.
- At least 44x44px interactive targets, visible `:focus-visible` and adequate contrast checked rather than assumed. No color-only conflict message.
- Avoid faux calendars/testimonials, generic hero pages, unnecessary visual ornament or decorative random UI.
- Part F evidence: real screenshots at 320/375/768/1280, manual keyboard/contrast check with reviewer/date/SHA, UTC vs Bangkok browser test, create/error/empty/refresh/restart flows.

## Review decisions

Peer reviewer must approve form precision without silently imposing minute-grid/working-hours restrictions (OD-001..003), own-list ordering/pagination and minimal DTO (OD-004), session failure recovery and shared Auth visual design. No UI or automated test result is claimed by this document.
