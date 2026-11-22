# F-S3-01 — Tutor Appointment Summary UI Specification (Part E)

> **Part E UI contract only; no component, route, browser test or screenshot is implemented.** Tutor-only view; never rendered in the Customer workspace.

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

## 3. UI states

| State | Trigger | Required presentation |
|---|---|---|
| Loading | Request in flight | Status message `กำลังโหลดสรุปนัดหมาย...`; no stale data from another Tutor |
| Empty | `pastBookedCount === 0` | Count `0` + plain message `ยังไม่มีนัดหมายที่ผ่านมาแล้ว` |
| Populated | `pastBookedCount > 0` | Count matches exact rendered list length; Bangkok time labelled explicitly |
| Error | `503` / network error | Alert message with retry button; no fabricated `0` count |
| Auth | `401` / `403` / `SESSION_BINDING_MISMATCH` | Clear protected state and invoke `onUnauthorized()` |

## 4. Accessibility and privacy rules

- Never display `Completed`, attendance, Customer email, or Tutor cancellation reasons.
- Never compute `Past` from the browser clock; render the server-classified `pastBooked` list and `meta.evaluatedAt`.
- Keyboard-operable refresh control with visible focus; polite `aria-live` status updates; no colour-only status cues.
