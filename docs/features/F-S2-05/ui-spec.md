# F-S2-05 — Tutor Slot Withdrawal UI Specification (Part E)

> **Part E UI contract only; no component, route, browser test or screenshot is implemented.** This flow extends the F-S1-02 Tutor Slot list; it does not let the UI decide occupancy or the future-time rule.

## 1. Screen and shared design system

Screen: **ตารางสอนของฉัน** — Tutor's own Slot list with a **Withdraw** action.

Reuse the NutTiew Tutor Dashboard design system: same Slot rows, focus ring, error banner and `aria-live` region. Do not introduce a new modal library or a separate lifecycle colour scheme.

## 2. Journey and content

1. Tutor opens their own Slot list.
2. A future `Offered` Slot with `occupancy='Unoccupied'` shows a **Withdraw** action. An occupied Slot shows the action disabled with an explanation that the Booking must be cancelled first. A `Withdrawn` Slot shows a historical state and no action.
3. The action opens a confirmation dialog with the Bangkok interval, a statement that the Slot will no longer be offered, that its history is retained, and that it cannot be reactivated under the same ID.
4. Tutor confirms; the request is `POST /api/v1/tutor/slots/{slotId}/withdraw` with `{}`.
5. On success, the row re-renders as `Withdrawn` with its `withdrawnAt`; it disappears from Customer availability.
6. On failure, the row remains unchanged.

## 3. UI states

| State | Trigger | Required presentation |
|---|---|---|
| Withdrawable | `Offered`, future, unoccupied | Enabled Withdraw action |
| Occupied | `Offered`, `occupancy='Occupied'` | Disabled action with "Cancel the Booking first" explanation |
| Past | start at/before now | No action; historical row |
| Withdrawn | `lifecycle='Withdrawn'` | Historical badge, `withdrawnAt`, no action |
| Confirming | Action opened | Dialog with interval, retention and irreversibility copy |
| Pending | Confirm sent | Controls disabled, `aria-busy="true"`, no optimistic lifecycle change |
| Success | 200 | Row becomes `Withdrawn`; announce success; no offer shown to Customers |
| Occupied conflict | 409 `SLOT_OCCUPIED` | Explain the Active Booking; re-read the row |
| Not withdrawable | 422 `SLOT_NOT_WITHDRAWABLE` | Explain the future-time rule; re-read |
| Already withdrawn | 409 `SLOT_ALREADY_WITHDRAWN` | Show the historical state; no reactivation control |
| Not found / foreign | 404 `SLOT_NOT_FOUND` | Generic message; no existence disclosure |
| Auth | 401 / 403 | Sign-in or access denied; clear private state |
| Unknown outcome | Network loss or 503 `MUTATION_OUTCOME_UNKNOWN` | Lock actions for that Slot until an authenticated re-read |

## 4. Copy and interaction rules

- Do not compute the future rule from the browser clock.
- Do not offer an "undo" or "reactivate" action.
- Do not claim the Slot was deleted; it is withdrawn and retained as history.
- The UI must not show a Customer or Booking identity in the Slot list.
- No automatic retry after an unknown outcome.

## 5. Accessibility and interaction

- Dialog has `role="dialog"`, `aria-modal="true"`, accessible name/description, trapped focus, `Esc` when not pending, and focus restoration.
- Status changes use a polite `aria-live` region.
- The historical badge has text, not colour alone.
- Full keyboard operation with visible focus.
- Bangkok time is labelled explicitly.

## 6. Privacy and acceptance mapping

| Concern | UI rule | Acceptance |
|---|---|---|
| Ownership | Only the Tutor's own Slots | AC-S2-05-02 |
| Occupancy | Occupied Slots are not withdrawable | AC-S2-05-03 |
| Future rule | Server decides; UI explains | AC-S2-05-04 |
| History | Withdrawn rows remain visible, no reactivation | AC-S2-05-05, AC-S2-05-06 |
| Races | Re-read after conflict; no optimistic state | AC-S2-05-07, AC-S2-05-08 |
| Privacy | No Customer/Booking identity in the list | AC-S2-05-09 |

## 7. Part E boundary

UI contract only. No component, route, browser test, screenshot or accessibility audit is included. Implementation must be verified against a real API and persistent PostgreSQL in the later feature Issue.
