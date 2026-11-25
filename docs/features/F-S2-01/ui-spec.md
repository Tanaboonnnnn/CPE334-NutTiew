# F-S2-01 — Customer Cancellation UI Specification (Part E)

> **Part E UI contract only; no component, route, browser test or screenshot is implemented.** This flow extends the F-S1-05 Customer Booking list/detail; it does not turn a displayed status into a client-side decision.

## 1. Screen and shared design system

Screen: **ยกเลิกการจอง** — cancel one own `Booked` Booking as an authenticated Customer.

Reuse the NutTiew design system already used by Customer Bookings and Customer Availability: same typography, spacing, focus ring, error banner and `aria-live` region. Do not introduce a new palette, modal library or client state store.

The entry point is a **Cancel** action on an own Booking whose `status='Booked'` and whose `displayStatus` is `Booked` (not `Past`). A `Cancelled` or `Past` Booking shows no Cancel action.

## 2. Journey and content

1. Customer selects **Cancel** on a Booking row or detail.
2. A confirmation dialog shows: Tutor reference (`TUTOR-xxxxxxxx`), start/end in Asia/Bangkok, the 30-minute rule in plain language, and an explicit statement that cancellation cannot be undone.
3. The dialog does **not** ask for a reason and does not send one.
4. Customer confirms; the request is `POST /api/v1/customer/bookings/{id}/cancel` with an empty JSON body.
5. On success, the dialog closes and the Booking list/detail re-renders from the returned DTO with `status='Cancelled'`. The original Slot becomes unoccupied and stays `Offered`; it **reappears in Customer availability only if** the current server-side availability filters and independent 90-minute new-Booking cutoff permit it. Otherwise it remains absent from eligible offers despite being unoccupied.
6. On a cutoff/conflict/authorization error, the dialog stays open with a safe message and the Booking remains unchanged.

## 3. UI states

| State | Trigger | Required presentation |
|---|---|---|
| Idle | Booking is `Booked`, not `Past` | Cancel action visible and keyboard reachable |
| Confirming | Customer activates Cancel | Dialog with summary, irreversible warning, Cancel/Confirm buttons; focus moves to the dialog heading |
| Pending | Confirm sent | Both buttons disabled, `aria-busy="true"`, no optimistic status change, one request only |
| Success | 200 with `Cancelled` | Dialog closes; list/detail shows `Cancelled`; no success toast that implies a refund |
| Cutoff closed | 422 `CANCELLATION_WINDOW_CLOSED` | Inline message that the 30-minute window has closed; Booking unchanged; Cancel action removed after a re-read |
| Already cancelled | 409 `BOOKING_NOT_CANCELLABLE` | Message that the Booking is no longer active; re-read the list/detail |
| Not found / foreign | 404 `BOOKING_NOT_FOUND` | Generic "Booking not found" message; do not reveal whether it exists |
| Unauthenticated / forbidden | 401 / 403 | Return to sign-in or show access denied; no Booking data retained |
| Unknown outcome | Network loss or 503 `MUTATION_OUTCOME_UNKNOWN` | Show "outcome not confirmed"; lock the Cancel and Reschedule actions for that Booking until an authenticated re-read completes |

The UI must never treat a disabled button, a spinner or a local timestamp as the 30-minute authority. Only the server response decides.

## 4. Copy and error mapping

- Cutoff: "Cannot cancel — this appointment starts in less than 30 minutes."
- Already cancelled: "This Booking is already cancelled."
- Unknown: "We could not confirm the cancellation. Reopen the Booking to check its current status."
- No message may include a raw error code, SQL text, another Customer's identity or a Tutor's private data.

## 5. Accessibility and interaction

- Dialog has `role="dialog"`, `aria-modal="true"`, an accessible name and description; focus is trapped and restored to the invoking Cancel button on close.
- `Esc` closes only when not pending; confirm is reachable by keyboard.
- Status changes are announced through a polite `aria-live` region.
- Error text is associated with the dialog via `aria-describedby`.
- Touch target and visible focus follow the shared design system; no colour-only status cue.
- Bangkok time is labelled explicitly so a non-Bangkok browser cannot misread the cutoff.

## 6. Privacy and acceptance mapping

| Concern | UI rule | Acceptance |
|---|---|---|
| Ownership | Only own Bookings are rendered; the client never sends an owner ID | AC-S2-01-03 |
| Cutoff | Server decides at `T_elig`; UI only renders the outcome | AC-S2-01-02, AC-S2-01-07 |
| Irreversibility | Confirmation states the Booking cannot be restored | AC-S2-01-01 |
| Reopened Slot | No claim that the Slot is bookable; availability re-read decides | AC-S2-01-04 |
| Unknown outcome | No optimistic removal; re-read before any further action | AC-S2-01-06 |
| Privacy | No third-party identity or reason shown | AC-S2-01-08 |

## 7. Part E boundary

This document defines UI behaviour only. It does not implement a component, route, browser test, screenshot or accessibility audit. The implemented UI must be verified against a real API and persistent PostgreSQL in the later feature Issue.
