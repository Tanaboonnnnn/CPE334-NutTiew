# F-S3-01 — Tutor Appointment Summary UI Specification (Part E)

> **D2 Past Booked implemented (`#145` / PR `#156`); Final multi-category UI (`#146` / `#147`) remains planned and gated on explicit `OD-006` disposition and human peer review.** Tutor-only view; never rendered in the Customer workspace.

## 1. Screen and shared design system

Section: **สรุปนัดหมายผู้สอน (Appointment Summary)** inside the authenticated `TutorDashboardShell` (`apps/web/src/tutor-slots.tsx`).

Reuse the NutTiew Tutor Dashboard card, KPI tile, agenda list, focus ring, error banner, and `aria-live` styling. Do not add a charting library or client-side persistence.

## 2. Journey and content (D2 Past Booked increment)

1. Authenticated Tutor opens the Tutor Dashboard; the summary section fetches `GET /api/v1/tutor/summary` (validating `X-NutTiew-Session-Binding` and `401`/`403` auth errors).
2. The summary displays:
   - The **Past Booked** count (`นัดหมายที่ผ่านมาแล้ว (Past Booked): N รายการ`) derived directly from `data.pastBookedCount`.
   - The snapshot timestamp (`ประเมิน ณ ... น. (Asia/Bangkok)`) from `meta.evaluatedAt`.
   - The matching list of Past Booked appointments, each showing `customerRef` (`CUST-xxxxxxxx`), Bangkok date & interval (`Asia/Bangkok`), status badge `สิ้นสุดแล้ว (Past)` (**never** `Completed` or `เสร็จสมบูรณ์`), and Booking ID.
   - An explicit note that **Upcoming Booked** and **Cancelled** summary categories are scheduled for Final completion (until implemented for 30 Nov / Final).
3. A **รีเฟรชสรุป** button reloads `GET /api/v1/tutor/summary` with request-scoped `AbortController`/version guards.

## 3. Final UI contract (mandatory by 30 Nov / Final 13 Dec; `inProgressBooked` Option 1 PROPOSED — gated on `OD-006` & human peer review)

When Upcoming Booked, In-Progress Booked (per approved `OD-006` Option 1), and Cancelled are enabled for Final (after explicit stakeholder/authorized product-owner `OD-006` disposition, Part E review, and `sprint3` merge), the same **สรุปนัดหมายผู้สอน** section renders all categories from one `GET /api/v1/tutor/summary` response (`meta.evaluatedAt`):

1. **Summary count strip (all driven strictly from server counts, matching exact rendered list lengths):**
   - **นัดหมายที่กำลังจะมาถึง (Upcoming Booked):** `data.upcomingBookedCount` รายการ
   - **กำลังดำเนินการอยู่ (In-Progress Booked — PROPOSED `OD-006` Option 1 in PR `#157`, gated on `OD-006` disposition & actual human peer review):** `data.inProgressBookedCount` รายการ
   - **นัดหมายที่ผ่านมาแล้ว (Past Booked):** `data.pastBookedCount` รายการ
   - **นัดหมายที่ยกเลิกแล้ว (Cancelled):** `data.cancelledCount` รายการ
2. **Matching category lists:**
   - **Upcoming Booked:** `customerRef`, `Asia/Bangkok` date/interval, status badge `มีนัดหมาย (Booked)`, Booking ID. Empty state: `ยังไม่มีนัดหมายที่กำลังจะมาถึง`.
   - **In-Progress Booked (`OD-006` Option 1):** `customerRef`, `Asia/Bangkok` date/interval, status badge `มีนัดหมาย (Booked)` (**never** `Past` or `Completed`), Booking ID. Empty state: `ยังไม่มีนัดหมายที่กำลังดำเนินการอยู่` (when `inProgressBookedCount === 0`, count `0` matches empty list).
   - **Past Booked:** `customerRef`, `Asia/Bangkok` date/interval, status badge `สิ้นสุดแล้ว (Past)`, Booking ID. Empty state: `ยังไม่มีนัดหมายที่ผ่านมาแล้ว`.
   - **Cancelled:** `customerRef`, `Asia/Bangkok` original date/interval, status badge `ยกเลิกแล้ว (Cancelled)`, cancellation actor label (`ผู้เรียนยกเลิก` / `ผู้สอนยกเลิก`), `cancelledAt` in `Asia/Bangkok`, Booking ID. **Never** displays `tutorCancellationReason` (`BR-022`/`NFR-007`). Empty state: `ยังไม่มีนัดหมายที่ถูกยกเลิก`.
3. **Refresh, timezone, and accessibility:**
   - One **รีเฟรชสรุป** control refreshes all categories atomically from one `GET /api/v1/tutor/summary` snapshot (`AbortController`/version guard).
   - Every timestamp explicitly displays `Asia/Bangkok`; full keyboard navigation with visible focus; polite `aria-live` status updates; no colour-only status indicators.

## 4. UI states (D2 and Final)

| State | Trigger | Required presentation |
|---|---|---|
| Loading | Request in flight | Status message `กำลังโหลดสรุปนัดหมาย...`; no stale data from another Tutor |
| Empty (per category) | Category count `=== 0` | Count `0` + category-specific plain Thai empty message |
| Populated | Category count `> 0` | Displayed count matches exact rendered list length; Bangkok time labelled explicitly |
| Error | `503` / network error | Alert message with retry button; no fabricated `0` counts |
| Auth | `401` / `403` / `SESSION_BINDING_MISMATCH` | Clear protected state and invoke `onUnauthorized()` |

## 5. Accessibility and privacy rules

- Never display `Completed`, attendance, Customer email, or Tutor cancellation reasons.
- Never compute `Upcoming`, `In-Progress`, or `Past` from the browser clock; render the server-classified lists and `meta.evaluatedAt`.
- Keyboard-operable refresh control with visible focus; polite `aria-live` status updates; no colour-only status cues.
