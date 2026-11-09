# F-S1-05 — Protected Booking Retrieval UI Specification (Part E)

> **Documentation contract only; not implemented yet.**
> Issue [#17](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/17). This document defines the user interface specifications, layout states, responsive behavior, accessibility guidelines, and timezone presentation for Customer Booking retrieval and Tutor schedule inspection.

---

## 1. Design System and Visual Tokens

All UI components for F-S1-05 share the established NutTiew design system, visual palette, and typography tokens from `F-S1-01`, `F-S1-02`, and `F-S1-03`:

| Token | CSS Variable / Value | Purpose |
|---|---|---|
| **Canvas Background** | `--color-canvas: #f8fafc` | Main screen background |
| **Surface Card** | `--color-surface: #ffffff` | Card container background |
| **Border Color** | `--color-border: #e2e8f0` | Dividers and card borders |
| **Primary Text** | `--color-text: #0f172a` | Headers, titles, primary labels |
| **Secondary Text** | `--color-text-muted: #64748b` | Timestamps, metadata, references |
| **Primary Brand** | `--color-primary: #2563eb` | Action buttons, active tabs |
| **Success / Booked** | `--color-success: #16a34a` | "ยืนยันแล้ว" (Booked badge background) |
| **Past / Neutral** | `--color-past: #64748b` | "สิ้นสุดแล้ว" (Past badge background) |
| **Focus Ring** | `--color-focus: #3b82f6` | 2px solid ring with 2px offset |

All text combinations must pass WCAG 2.2 AA minimum contrast ratios (>= 4.5:1 for normal text, >= 3:1 for large text and UI borders).

---

## 2. Timezone and Date Presentation Rules (`Q29`, `NFR-S1-07`)

1. **Mandatory Asia/Bangkok Timezone:**
   - All appointment intervals (`startsAt` to `endsAt`) and creation dates must be formatted explicitly in `Asia/Bangkok` (UTC+7) using `Intl.DateTimeFormat` or equivalent, regardless of the user's operating system or device timezone.
2. **Format Standard:**
   - Date: `d MMM yyyy` in Thai locale (e.g., `10 พ.ย. 2026`).
   - Time: `HH:mm` in 24-hour cycle (e.g., `16:00 – 17:00 น.`).
   - Combined Summary: `10 พ.ย. 2026, 16:00 – 17:00 น.`

---

## 3. Customer Booking Retrieval UI

### 3.1 Customer Bookings List (`#customer-bookings-section`)
A Customer navigates to "การจองของฉัน" (My Bookings) within the Customer Portal (`apps/web/src/customer-availability.tsx` / `apps/web/src/main.tsx`):

1. **Header & Navigation:**
   - Screen Title: `h1` "การจองของฉัน" (My Bookings).
   - Navigation button/tab to switch between "ตารางติวที่เปิดจอง" (Available Offers) and "การจองของฉัน" (My Bookings).
   - Button "รีเฟรช" (Refresh list).
2. **Booking Card Component (`.customer-booking-card`):**
   - **Tutor Reference:** Displays Tutor opaque reference or approved display name (e.g., `ผู้สอน: TUTOR-f7a8b9c0`).
   - **Appointment Window:** Bangkok time (e.g., `10 พ.ย. 2026, 16:00 – 17:00 น.`).
   - **Status Badge:**
     - `Booked` (Active/Upcoming): Green badge with text **`ยืนยันแล้ว`**.
     - `Past` (Elapsed): Gray badge with text **`สิ้นสุดแล้ว`**.
   - **Detail Action Button:** `<button data-testid="view-booking-detail">ดูรายละเอียด</button>`.
3. **Empty State (`.customer-bookings-empty`):**
   - Text: "คุณยังไม่มีประวัติการจองติว".
   - Action link/button: "ค้นหาตารางติวเพื่อเริ่มจอง" (navigates back to availability).
4. **Loading State:**
   - Text: "กำลังโหลดรายการจองของคุณ...".
5. **Error State (`.customer-bookings-error`):**
   - Text: "ไม่สามารถโหลดข้อมูลการจองได้ในขณะนี้".
   - Action button: "ลองใหม่อีกครั้ง" (retries fetch).

---

### 3.2 Customer Booking Detail View (`#customer-booking-detail-modal` / `.booking-detail-view`)
When a Customer clicks "ดูรายละเอียด" on a Booking card:

1. **Header:** Title `h2` "รายละเอียดการจอง".
2. **Field Summary Table / List:**
   - **รหัสการจอง (Booking ID):** Monospaced UUID string (e.g., `e4f8d53b-013d-4c57-891a-7b3c2e1f4001`) with copy button.
   - **ผู้สอน (Tutor):** `TUTOR-f7a8b9c0`.
   - **วันและเวลาติว (Appointment Time):** `10 พ.ย. 2026, 16:00 – 17:00 น. (Asia/Bangkok)`.
   - **สถานะ (Status):**
     - Upcoming: Badge `ยืนยันแล้ว` (`Booked`).
     - Elapsed: Badge `สิ้นสุดแล้ว` (`Past`). Notice: "การนัดหมายนี้สิ้นสุดลงแล้ว".
   - **วันที่ทำรายการ (Booked At):** Bangkok formatted timestamp.
3. **Close / Back Action:** `<button data-testid="close-detail-btn">ปิด / กลับสู่รายการ</button>`.
4. **Not Found State (`404 BOOKING_NOT_FOUND`):**
   - If user accesses an invalid or foreign Booking ID:
   - Displays "ไม่พบข้อมูลการจองนี้" with button "กลับสู่รายการจอง".
   - Zero private data (no Customer names, IDs, or timestamps) is rendered.

---

## 4. Tutor Schedule Inspection UI

### 4.1 Integration into Tutor Dashboard (`apps/web/src/tutor-slots.tsx`)
Fulfills `FR-S1-07` and `FR-S1-15`:

1. **Slots Calendar & Agenda (`AllSlotsAgenda` & `SlotCalendar`):**
   - Each Slot card displays its real-time occupancy status:
     - If `occupancy === 'Unoccupied'`: Blue/neutral badge **`ว่าง (เปิดรับจอง)`**.
     - If `occupancy === 'Occupied'`: Orange/green badge **`มีผู้จองแล้ว (Occupied)`**.
2. **Schedule Bookings List (`#tutor-schedule-bookings-section`):**
   - Section Title: `h2` "รายการนัดหมายบนตารางสอนของคุณ" (Bookings on Your Schedule).
   - Card for each assigned Booking:
     - **รหัสการจอง:** Booking UUID.
     - **ช่วงเวลา:** Bangkok formatted time (e.g., `10 พ.ย. 2026, 16:00 – 17:00 น.`).
     - **ผู้จอง:** Opaque Customer Reference (e.g., `CUST-e4f8d53b`); strict privacy enforcement: Customer password, email, and phone are never disclosed.
     - **สถานะ:**
       - Upcoming: Badge `มีนัดหมาย (Booked)`.
       - Elapsed: Badge `สิ้นสุดแล้ว (Past)`.
3. **Empty Schedule State:**
   - If Tutor has no bookings on their schedule:
   - Text: "ยังไม่มีผู้จองในช่วงเวลาที่คุณเปิดสอน".

---

## 5. Viewport and Accessibility Specifications

1. **Responsive Viewports:**
   - Small Mobile (320px): Single-column stacked cards, full-width buttons (min 44px touch target).
   - Standard Mobile (375px): Optimized padding (16px), readable typography.
   - Tablet (768px): Two-column card grid or tabular list.
   - Desktop (1280px): Multi-column dashboard with side-by-side agenda and booking details.
2. **Keyboard Navigation:**
   - All interactive elements (refresh buttons, detail triggers, modal dismissals) must be focusable using `Tab`.
   - `Enter` and `Space` activate buttons.
   - `Escape` key closes the Booking Detail modal and returns focus to the triggering element.
3. **Screen Reader Semantics:**
   - Section headings use proper semantic hierarchy (`h1` -> `h2` -> `h3`).
   - Badges provide accessible aria-labels (e.g., `aria-label="สถานะการจอง: ยืนยันแล้ว"`).
