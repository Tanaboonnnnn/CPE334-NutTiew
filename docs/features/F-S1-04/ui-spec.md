# F-S1-04 — Customer Booking Confirmation UI Specification (Part E)

> **Part E UI contract only; no component, route or browser test is implemented.** This flow completes the selection hand-off from [F-S1-03 Availability](../F-S1-03/ui-spec.md); it does not turn selection into a reservation until the server commits.

## 1. Screen and shared design system

Screen: **ยืนยันการจองช่วงเวลาติว** — confirm one selected offer as an authenticated Customer.

Reuse the NutTiew design system shared with Customer Availability and Tutor Dashboard; do not introduce a separate booking palette.

| Token | Booking confirmation use |
|---|---|
| Brand/navigation | Text-only NutTiew wordmark; shared navy `#202B44` |
| Canvas/surface | Light canvas `#F7F8FB`, white surface `#FFFFFF`; no nested cards |
| Text | Dark ink `#172137`; muted text must remain contrast-safe |
| Primary action | Orange `#F47736`, dark-ink label/icon `#172137`, border `#D96123`; never white text on orange |
| Focus | Visible ring `3px solid #AA4519`, `outline-offset: 3px`; never clipped |
| Typography | Noto Sans Thai, Sarabun, system-ui, sans-serif |
| Spacing/corners | Shared 4/8/12/16/24/32px scale and 8px radius |

Keep Tutor label/reference and Bangkok appointment date/time clear. No fake profile, rating, price, payment, contact, testimonial, message panel, decorative emoji or unrelated content.

## 2. Journey and content

1. Require live `/api/v1/auth/me` identity with role `Customer`.
2. Customer selects a Slot in #15. Selection is transient state, **not** a Booking.
3. Confirmation summary shows only Tutor display name if #15's data gate permits it (otherwise opaque Tutor reference), Bangkok date and 24-hour start/end.
4. Primary action: **ยืนยันการจอง**. Send only `slotId`; never send `customerId`, `tutorId`, Booking ID, status, interval or cutoff time.
5. Show confirmed state only after valid 201 or natural-key replay 200.
6. Do not add a private Booking list/detail route; #17 owns protected retrieval.

The UI must not say the Slot is reserved during review or while POST is pending.

## 3. UI states

| State | Trigger | Required behavior |
|---|---|---|
| Session loading | `/auth/me` pending | Hide private selection details; show progress |
| Signed out | `/auth/me` returns 401 | Clear selection/pending state; show Auth |
| Wrong role | Principal is not Customer | Deny flow; do not submit |
| Ready | Customer verified and #15 offer selected | Show summary and one enabled confirm action |
| Submitting | POST in flight | Disable repeated activation; show progress; retain exact `slotId` |
| New success | 201 after COMMIT | Show “จองสำเร็จ”; display returned Booking ID and confirmed time |
| Replay success | 200 same-pair replay | Show same Booking ID and indicate booking already exists; no new local item |
| Conflict | 409 occupied Slot / Customer overlap | No success; explain selected time is unavailable; refresh #15 |
| Not eligible | 422 Q05/past/non-eligible Slot | No success; explain offer can no longer be booked; refresh |
| Unknown outcome | Network loss, timeout or `503 BOOKING_OUTCOME_UNKNOWN` | Do not assert success/failure; preserve same `slotId`; offer **ส่งคำขอเดิมอีกครั้ง** |
| Service unavailable | 503 known no-commit result | Safe error; retain selection for explicit retry |
| Session changed | Logout/account switch/binding mismatch | Immediately clear private summary and pending state; ignore late old-session response |

## 4. Natural-key retry interaction

- Pending intent is current authenticated Customer plus selected `slotId`; no Idempotency-Key is generated or stored.
- After network failure or ambiguous COMMIT, retry the **same POST body**. Do not silently substitute a newly selected Slot.
- While outcome is unknown, do not offer a different Slot as a replacement for the unresolved intent. First retry/reconcile the original request.
- Same-pair existing `Booked` row returns 200 and original Booking ID; never generate a new ID locally.
- A different Slot is a distinct request and must pass all normal eligibility/overlap rules.
- If page closes and in-memory selection is lost, this contract does not invent a client key or server registry. Once #17's protected own-Booking read is integrated, it provides the normal post-refresh recovery view; #16 alone does not claim cross-reload recovery.
- Clearing UI state on logout/account switch is a privacy boundary, not proof that an already-sent request rolled back.

## 5. Accessibility and interaction

- Semantic heading, visible text labels and native buttons for confirm/retry.
- Keyboard operation, logical Tab order and visible unobscured focus.
- Selected/pending/success/error states are communicated in text/programmatic status, not color alone.
- Announce submitting, confirmed, replayed, conflict and unknown outcome with a polite live region.
- Button disabling is usability feedback, never the concurrency guard.
- NFR-S1-09 remains a proposed usability target. This Part E does **not** claim WCAG 2.2 AA, 44px target-size or rendered contrast conformance; record actual evidence in Part F.

## 6. Privacy and acceptance mapping

Never render Customer ID/email/phone, Session/CSRF data, credentials, another Customer's Booking or private Tutor fields. Conflict messages must not reveal who occupies a Slot. Do not store credentials, Session tokens or CSRF tokens in browser storage.

| Criterion | UI obligation |
|---|---|
| AC-S1-19/20/21 | Confirm only from server's committed/eligibility outcome |
| AC-S1-22/23/24 | Safe conflict/adjacency outcome; no third-party disclosure |
| AC-S1-25 and AC-S1-26 | Truthful under concurrent outcomes; disabled button is not race safety |
| AC-S1-27/33 | No phantom success after stale selection or persistence failure |
| AC-S1-28 | No owner/Tutor fields sent from client |
| AC-S1-29 / VC-S1-38 | Same-Slot retry reconciles to original Booking ID |
| AC-S1-35 / VC-S1-39 | Pre-cutoff click cannot override post-wait Q05 rejection |
