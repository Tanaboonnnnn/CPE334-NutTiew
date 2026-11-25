# F-S2-03 — Tutor Cancellation UI Specification (Part E)

> **Part E UI contract only; no component, route, browser test or screenshot is implemented.** This flow extends the F-S1-05 Tutor schedule; it does not let the UI decide assignment or cutoff.

## 1. Screen and shared design system

Screen: **ยกเลิกนัด (ผู้สอน)** — cancel one currently assigned Active Booking as an authenticated Tutor.

Reuse the NutTiew Tutor Dashboard/schedule design system: same schedule rows, focus ring, error banner and `aria-live` region. Do not introduce a new modal library or a separate status colour scheme.

## 2. Journey and content

1. Tutor opens their authorized schedule. A `Booked` appointment at least 60 minutes away shows a **Cancel appointment** action; a `Past` or already `Cancelled` row does not.
2. The action opens a dialog with the appointment summary (Bangkok date/time, `CUST-xxxxxxxx` reference), the 60-minute rule, and a required reason field.
3. The dialog explains that the Slot will be withdrawn, not offered to another Customer, and that the Customer will receive a private notice with the reason.
4. Tutor enters a reason and confirms. The request is `POST /api/v1/tutor/bookings/{id}/cancel` with `{ "reason": "<text>" }`.
5. On success, the row is removed from the Active schedule (or shown as Cancelled history if the read contract includes it) and the Slot is no longer offered.
6. On failure, the row and reason field remain; no local withdrawal or notice is shown.

## 3. UI states

| State | Trigger | Required presentation |
|---|---|---|
| No action | Row is `Past`, `Cancelled`, or `< 60:00` away | Explain why cancellation is unavailable; no enabled control |
| Dialog idle | Action opened | Summary, rule, reason field, Confirm/Cancel |
| Invalid reason | Empty/whitespace-only on submit or 400 | Inline error linked to the field; no request if client-side empty |
| Pending | Confirm sent | Controls disabled, `aria-busy="true"`, no optimistic removal, one request |
| Success | 200 | Close dialog; remove from Active schedule; announce success; no reason echoed in the schedule |
| Window closed | 422 `CANCELLATION_WINDOW_CLOSED` | Explain the 60-minute rule; row unchanged; remove action after a re-read |
| Already cancelled | 409 `BOOKING_NOT_CANCELLABLE` | Explain the Booking is no longer active; re-read |
| Not found / foreign | 404 `BOOKING_NOT_FOUND` | Generic message; no existence disclosure |
| Auth | 401 / 403 | Sign-in or access denied; clear private state |
| Unknown outcome | Network loss or 503 `MUTATION_OUTCOME_UNKNOWN` | Lock actions for that Booking until an authenticated re-read |

## 4. Copy and interaction rules

- The reason is required; the UI must not submit an empty string and must not trim to a nonempty string on the server's behalf.
- The reason is **not** displayed back in the Tutor schedule; it belongs to the Customer's private notice/detail.
- Use the authenticated schedule response evaluatedAt for the UI eligibility hint, not the browser clock. The mutation uses the post-lock DB clock. Show the reviewed OD-014 reason guidance while the server remains authoritative.
- The confirmation must not claim the Slot will be reopened.
- No automatic retry after an unknown outcome.

## 5. Accessibility and interaction

- Dialog has `role="dialog"`, `aria-modal="true"`, an accessible name/description, trapped focus, `Esc` when not pending, and focus restoration.
- The reason field has a visible label, `aria-required="true"`, and an associated error message.
- Status changes use a polite `aria-live` region.
- Full keyboard operation with visible focus; no colour-only status cue.
- Bangkok time is labelled explicitly.

## 6. Privacy and acceptance mapping

| Concern | UI rule | Acceptance |
|---|---|---|
| Assignment | Only the Tutor's authorized schedule rows | AC-S2-03-03 |
| Cutoff | Server decides at `T_elig` | AC-S2-03-02 |
| Reason | Required, not echoed in the schedule | AC-S2-03-04, AC-S2-03-10 |
| Slot outcome | No claim that the Slot is reopened | AC-S2-03-01, AC-S2-03-08 |
| Notice | Success implies a private Customer notice exists | AC-S2-03-01 |
| Unknown outcome | No optimistic removal; re-read first | AC-S2-03-06 |

## 7. Part E boundary

UI contract only. No component, route, browser test, screenshot or accessibility audit is included. Implementation must be verified against a real API and persistent PostgreSQL in the later feature Issue.
