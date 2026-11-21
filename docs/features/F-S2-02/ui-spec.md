# F-S2-02 — Customer Reschedule UI Specification (Part E)

> **Part E UI contract only; no component, route, browser test or screenshot is implemented.** The destination picker reuses the F-S1-03 availability projection; selection is not a reservation until the server commits the move.

## 1. Screen and shared design system

Screens: **เลื่อนนัด** (reschedule entry and confirmation) inside the Customer Booking detail flow.

Reuse the NutTiew design system used by Customer Availability and Customer Bookings: same time-list rows, focus ring, error banner, `aria-live` region and Bangkok-time formatting. Do not introduce a separate calendar or a client-side availability cache that outlives the server response.

## 2. Journey and content

1. Customer opens an own `Booked` Booking with `displayStatus='Booked'` and no recorded successful reschedule.
2. The Booking detail shows a **Change time** action. A Booking that already used its one reschedule shows no action and a plain explanation.
3. Customer opens the destination picker; it lists current eligible offers from the server, including other Tutors, with `TUTOR-xxxxxxxx`, date and time in Asia/Bangkok.
4. Customer selects one destination and confirms. The confirmation shows the current appointment and the destination side by side, the 60-minute rule for both sides, and the one-success rule.
5. The request is `POST /api/v1/customer/bookings/{id}/reschedule` with `{ "slotId": "<destination>" }`.
6. On success, the Booking detail re-renders with the same Booking ID and the new time/Tutor; the original Slot returns to availability on the next read; the destination disappears from availability.
7. On failure, the original Booking and destination list are re-read; no local move is shown.

## 3. UI states

| State | Trigger | Required presentation |
|---|---|---|
| No action | Booking is `Cancelled`, `Past`, already rescheduled, or the original is `< 60:00` away | Explain why no change is possible; no enabled control |
| Picker idle | Action opened | Server-provided offers only; loading and empty states |
| Selected | One destination chosen | Confirm button enabled; summary shows both intervals |
| Pending | Confirm sent | Controls disabled, `aria-busy="true"`, no optimistic move, one request |
| Success | 200 with same ID | Show new time/Tutor; announce success; refresh availability |
| Window closed | 422 `RESCHEDULE_WINDOW_CLOSED` | Explain that the original or destination is less than 60 minutes away; keep the original Booking |
| Quota used | 409 `RESCHEDULE_ALREADY_USED` | Explain the one-reschedule limit; remove the action after a re-read |
| Destination unavailable | 409 `SLOT_UNAVAILABLE` | Remove that destination from the list; keep the original Booking |
| Customer overlap | 409 `CUSTOMER_OVERLAP` | Explain the conflict with another own Booking; do not reveal the other Booking |
| Not applicable | 409 `RESCHEDULE_NOT_APPLICABLE` | Explain that the destination must differ from the current appointment |
| Not found | 404 `BOOKING_NOT_FOUND` | Generic message; no existence disclosure |
| Auth | 401 / 403 | Sign-in or access denied; clear private state |
| Unknown outcome | Network loss or 503 `MUTATION_OUTCOME_UNKNOWN` | Lock change/cancel actions for that Booking until an authenticated re-read |

## 4. Copy and interaction rules

- The picker must not filter by original Tutor; cross-Tutor offers are shown.
- The UI must not compute eligibility from the browser clock; it renders server `startsAt`/`endsAt` and server errors.
- Do not claim the original Slot is bookable until availability is re-read.
- Do not show a success state before the response; do not retry automatically.
- The one-reschedule limit is stated before confirmation, not only after rejection.

## 5. Accessibility and interaction

- Destination rows are a list of radio options or buttons with accessible names including Bangkok date/time and Tutor reference.
- The confirmation dialog has `role="dialog"`, `aria-modal="true"`, trapped focus, `Esc` when not pending, and focus restoration.
- Status and error messages use a polite `aria-live` region; errors are linked with `aria-describedby`.
- Full keyboard operation with visible focus; no colour-only selection cue.
- Time is labelled Asia/Bangkok so a non-Bangkok browser cannot misread it.

## 6. Privacy and acceptance mapping

| Concern | UI rule | Acceptance |
|---|---|---|
| Ownership | Only own Booking; no owner ID sent | AC-S2-02-04 |
| Cross-Tutor | Destination list is not restricted to the original Tutor | AC-S2-02-02 |
| Cutoffs | Server decides; UI shows the rule and the outcome | AC-S2-02-03 |
| Quota | One success; action hidden after history | AC-S2-02-05 |
| Original Slot | No claim of bookability before re-read | AC-S2-02-01 |
| Previous Tutor | No history or previous-Tutor view is shown | AC-S2-02-10, OD-015 |
| Unknown outcome | No optimistic move; re-read first | AC-S2-02-07 |

## 7. Part E boundary

UI contract only. No component, route, browser test, screenshot or accessibility audit is included. Implementation must be verified against a real API and persistent PostgreSQL in the later feature Issue.
