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

1. Call `GET /api/v1/auth/me` with the existing HttpOnly Session cookie. Require role `Customer`; capture the response's `X-NutTiew-Session-Binding` value with the identity.
2. Call `GET /api/v1/auth/csrf` with the same cookie and obtain the stable Session-bound HMAC token. Its current response contains only `csrfToken`; it does **not** return `X-NutTiew-Session-Binding`, so do not claim to compare a binding from this response. Keep the token in memory only. Then call `GET /api/v1/auth/me` again with the same cookie and compare its returned binding and identity with the first `/auth/me` result. If either changed (for example, Session A changed to Session B between the two GETs), discard the token and captured state and restart identity/CSRF bootstrap. This read-only GET may omit `Origin` under the Auth contract, but explicit `Sec-Fetch-Site: cross-site` is rejected. If the cookie changes after this final `/auth/me` check but before POST, the captured expected binding and Session-bound CSRF token remain the final server-side guard: `SESSION_BINDING_MISMATCH` or `CSRF_DENIED` must reject before mutation; clear identity/CSRF state and restart bootstrap.
3. Customer selects a Slot in #15. Selection is transient state, **not** a Booking.
4. Confirmation summary shows only Tutor display name if #15's data gate permits it (otherwise opaque Tutor reference), Bangkok date and 24-hour start/end.
5. Primary action: **ยืนยันการจอง**. Send only `slotId` in JSON, plus `X-CSRF-Token` and the captured `X-NutTiew-Expected-Session-Binding`; apply the existing canonical Origin/Referer and Fetch Metadata rules. Never send `customerId`, `tutorId`, Booking ID, status, interval or cutoff time.
6. Capture the current in-memory auth/session epoch, binding and `slotId` when POST starts. Apply a response only if all still match the current auth context; otherwise discard it without displaying the old Booking ID or details.
7. Show confirmed state only after valid 201 or natural-key replay 200 for the still-current Session.
8. Do not add a private Booking list/detail route; #17 owns protected retrieval.

The Session binding is a non-credential response/request consistency value, not authorization and not a replacement for the HttpOnly cookie or CSRF token.

## 3. UI states

| State | Trigger | Required behavior |
|---|---|---|
| Session loading | `/auth/me` pending | Hide private selection details; show progress |
| CSRF loading | `/auth/csrf` pending for the captured Session binding | Keep confirmation disabled; retain token only in memory |
| CSRF/session mismatch | Binding changes between `/auth/me` and `/auth/csrf` or POST returns `SESSION_BINDING_MISMATCH` | Discard token/selection tied to old binding; refresh identity and CSRF before a new confirmation |
| Signed out | `/auth/me` returns 401 | Clear selection/pending state; show Auth |
| Wrong role | Principal is not Customer | Deny flow; do not submit |
| Ready | Customer verified and #15 offer selected | Show summary and one enabled confirm action |
| Submitting | POST in flight | Disable repeated activation; show progress; retain exact `slotId` |
| New success | 201 after COMMIT | Show “จองสำเร็จ”; display returned Booking ID and confirmed time |
| Replay success | 200 same-pair replay | Show same Booking ID and indicate booking already exists; no new local item |
| Conflict | 409 occupied Slot / non-Offered Slot / Customer overlap | No success; explain selected time is unavailable; refresh #15 |
| Not eligible | 422 Q05 minimum-notice cutoff (59:59 or less) | No success; explain offer can no longer be booked; refresh |
| Unknown outcome | Network loss, timeout or `503 BOOKING_OUTCOME_UNKNOWN` | Do not assert success/failure; preserve same `slotId`; offer **ส่งคำขอเดิมอีกครั้ง** |
| Service unavailable | 503 known no-commit result | Safe error; retain selection for explicit retry |
| Session changed | Logout, login, account switch, or Session A → Session B (including two Sessions for the same User) | Increment auth/session epoch; clear private summary, selected Slot, pending intent, CSRF token and binding; ignore any late response whose captured epoch/binding differs. Never render its Booking ID/details in the new Session. |

## 4. Natural-key retry interaction

- Pending intent is current authenticated Customer plus selected `slotId`; no Idempotency-Key is generated or stored.
- After network failure or ambiguous COMMIT, retry the **same POST body**. Do not silently substitute a newly selected Slot.
- While outcome is unknown, do not offer a different Slot as a replacement for the unresolved intent. First retry/reconcile the original request.
- Same-pair existing `Booked` row returns 200 and original Booking ID; never generate a new ID locally.
- A different Slot is a distinct request and must pass all normal eligibility/overlap rules.
- If page closes and in-memory selection is lost, this contract does not invent a client key or server registry. Once #17's protected own-Booking read is integrated, it provides the normal post-refresh recovery view; #16 alone does not claim cross-reload recovery.
- Clearing UI state on logout/account switch is a privacy boundary, not proof that an already-sent request rolled back. If the old request committed before logout, the commit is not undone; its late response is still discarded after the auth/session epoch changes. If a stale binding from Session A is sent with Session B's cookie, the API rejects it before mutation.

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
| AC-S1-27 / VC/TEST-S1-33 | No phantom success after stale selection or persistence failure |
| AC-S1-28 | No owner/Tutor fields sent from client |
| AC-S1-29 / VC-S1-38 | Same-Slot retry reconciles to original Booking ID |
| AC-S1-35 / VC-S1-39 | Pre-cutoff click cannot override post-wait Q05 rejection |
