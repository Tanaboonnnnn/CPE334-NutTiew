# F-S2-04 — Private Tutor-Cancellation Notice UI Specification (Part E)

> **Part E UI contract only; no component, route, browser test or screenshot is implemented.** The notice is private to the owning Customer and is never rendered in a Tutor or third-party view.

## 1. Screen and shared design system

Screens: **การแจ้งเตือน** (notification list) and **รายละเอียดการแจ้งเตือน** (notice detail) for an authenticated Customer.

Reuse the NutTiew Customer design system: same list rows, focus ring, error banner and `aria-live` region. Do not introduce a separate notification framework or client-side persistence of notice content.

## 2. Journey and content

1. Customer opens the notification list from the main Customer navigation.
2. Each row shows: an unread indicator when `readAt=null`, the affected Booking's Tutor reference and Bangkok interval, `createdAt`, and a short preview of the cancellation reason.
3. Customer opens a row; the detail shows the full reason, the cancelled Booking summary and the cancellation time.
4. Opening or activating **Mark as read** calls `POST /api/v1/customer/notifications/{id}/read`.
5. The notice remains in the list after reading and can be reopened; no "expired" or "deleted" state exists.
6. The same reason is visible in the owning Customer's cancelled Booking detail.

## 3. UI states

| State | Trigger | Required presentation |
|---|---|---|
| Loading | List/detail request | Skeleton or busy state; no stale content from another Customer |
| Empty | No notices | Plain explanation that Tutor-cancellation notices will appear here |
| Unread | `readAt=null` | Visible unread indicator that is not colour-only |
| Read | `readAt` set | Same content, indicator removed; notice remains |
| Marking read | POST in flight | Control disabled/`aria-busy`; no optimistic content change |
| Read success | 200 | Indicator removed; content unchanged; reread still possible |
| Not found / foreign | 404 | Generic "Notice not found"; clear any previously shown notice |
| Auth | 401 / 403 | Sign-in or access denied; clear private state |
| Error | 503 | Safe retry message; do not delete or hide the notice |

## 4. Copy and interaction rules

- Never show another Customer's notice, Booking, Tutor identity or reason.
- Do not compute an expiry date or hide old notices.
- Do not add a delete/archive action; OD-008 is open.
- The unread count, if shown, is derived from the returned list and is not an authority.
- A failed mark-read must not remove the notice or the reason.
- The UI must not display raw error codes, SQL or stack traces.

## 5. Accessibility and interaction

- List rows are links/buttons with accessible names including the Bangkok date/time and unread state.
- The unread indicator has text or an `aria-label`, not colour alone.
- Detail view has a clear heading and reading order; the reason is selectable text.
- Status changes use a polite `aria-live` region.
- Full keyboard operation with visible focus; dialog-free flow so no focus trap is required.
- Bangkok time is labelled explicitly.

## 6. Privacy and acceptance mapping

| Concern | UI rule | Acceptance |
|---|---|---|
| Recipient | Only own notices are requested and rendered | AC-S2-04-01, AC-S2-04-03 |
| Reason | Shown only with an owner-scoped notice/detail | AC-S2-04-05 |
| Durability | Read notices remain visible and reopenable | AC-S2-04-02, AC-S2-04-04 |
| Idempotence | Repeated mark-read leaves the same content | AC-S2-04-06 |
| No creation claim | No notice appears for a Customer cancel or reschedule | AC-S2-04-07 |
| Privacy | No third-party identity, credential or raw diagnostics | AC-S2-04-09 |

## 7. Part E boundary

UI contract only. No component, route, browser test, screenshot or accessibility audit is included. Implementation must be verified against a real API and persistent PostgreSQL in the later feature Issue.
