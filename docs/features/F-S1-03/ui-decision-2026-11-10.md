# UX Decision — Customer Availability Monthly Calendar (2026-11-10)

**Follow-up Issue:** [#44](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/44) (linked to [#15 Customer Availability](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/15) and [#16 Exclusive Booking](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/16)).
**Product direction owner:** @Tanaboonnnnn ([Issue #15 comment #6763909620](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/15#issuecomment-6763909620)).
**Feature-contract author:** @Chxtamos; **Independent peer reviewer:** @Tanaboonnnnn.
**Verified `sprint1` base:** `744958117c5ee9a3f4875578485f00f65a7cdc22` (following merged Deliverable 1 PR [#43](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/43), F-S1-05 PR [#42](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/42), F-S1-04 PR [#38](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/38), and F-S1-03 PR [#37](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/37)).

> **Two-PR Gate & Release Separation:** This document records a **docs-only Part E UX amendment** for peer review before any Part F React/CSS/E2E code change begins. It is **not** a blocking defect or change request against Deliverable 1 PR [#43](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/43) or Issue [#18](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/18). Obtain @Tanaboonnnnn's review approval and merge this docs-only amendment to `sprint1` first; only then branch the separate Part F implementation PR from the updated `sprint1`.

## 1. Superseded presentation and retained domain contracts

### Replaced presentation

In the baseline `F-S1-03` implementation (`apps/web/src/customer-availability.tsx`), `groupOffersByBangkokDate(offers)` renders every eligible Bangkok date group and every offer row (`dateGroups.map(...group.items.map(...))`) simultaneously in one long vertical list. When 500+ offers are returned across up to 60 days, Customers must scroll across many screens and scan repeated same-time offers across multiple Tutors.

This amendment replaces **only the Availability browsing layout** inside the Customer portal (`เลือกช่วงเวลาติว`) with **Option A — Date-First Monthly Calendar (Progressive Disclosure)**:
1. Choose a date on the monthly calendar (`1. เลือกวันที่`).
2. View distinct chronological time slots for that selected date (`2. เลือกเวลา`).
3. Expand a time group to see distinct `tutorRef` + `slotId` options and pick one offer (`เลือกช่วงเวลานี้`).
4. Review the inline selected-offer summary (`3. ตรวจสรุปและยืนยันการจอง`) and explicitly submit via the unchanged `F-S1-04` booking confirmation flow.

### Strictly unchanged contracts and boundaries

- **Customer portal shell & navigation:** Retain the NutTiew sidebar (`เลือกช่วงเวลาติว`, `การจองของฉัน` from `F-S1-05` [#17](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/17), `บัญชีของฉัน`, `ออกจากระบบ`), account banner, guarded logout transitions (`logoutBusy` / `logoutError` suspension + `recheckSession`), `X-NutTiew-Session-Binding` checks, and `nuttiew-auth-changed` cross-tab synchronization.
- **Phase 1 read-only HTTP & DTO contract ([API spec](api-spec.md)):** Continue calling `GET /api/v1/customer/availability` with **zero query parameters**. Client controls must never append `?from=`, `?to=`, `?page=`, `?cursor=`, or `?limit=` (which the backend rightly rejects with `400 INVALID_INPUT` under `BR-S1-20` and `OD-AV-03`). Consume only the validated allowlist `{ slotId, tutorRef, startsAt, endsAt }` and `meta.evaluatedAt` with `Cache-Control: no-store`.
- **Server-authoritative eligibility & concurrency (`OD-AV-01`, `F-S1-04`):** Retain `Slot.lifecycle = 'Offered'`, active Tutor check, PostgreSQL `T_view` lower bound (`+60 minutes`, `Q05`), `NOT EXISTS` active Slot occupancy, half-open `[startsAt, endsAt)` same-Customer cross-Tutor overlap check, and deterministic server sort (`startsAt ASC, tutorRef ASC, slotId ASC`). Confirmation continues through `GET /api/v1/auth/csrf` -> second `GET /api/v1/auth/me` binding check -> `POST /api/v1/customer/bookings` (`{"slotId"}` only) -> `SERIALIZABLE` + `booking_guard_s1()` at authoritative DB `T_elig`, handling `201 Created`, `200 OK` natural-key replay, `409 SLOT_UNAVAILABLE`/`CUSTOMER_OVERLAP`, `422 BOOKING_NOT_ELIGIBLE`, and `503`/`UnknownBookingOutcome` retry lock without change.
- **Tutor privacy (`OD-AV-02`):** Retain `tutorRef` UUID fallback until `OD-AV-02` (`User.tutorDisplayName` consent, stakeholder publication sign-off, forward-only migration) clears in a separate change. Never derive names from email, fetch Customer/Booking private details, or fabricate ratings, subjects, prices, locations, avatars, testimonials, or booking statuses.

### `OD-002` horizon provenance reconciliation

Per repository verification rules, conflicting documentation states are recorded explicitly rather than silently overwritten:
- [docs/srs.md](../../srs.md#13-open-decisions-and-approval-gates) (`OD-002`) and the historical initial `F-S1-03` Part E baseline ([PR #32](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/32)) recorded `OD-002` (maximum advance booking horizon) as `OPEN`.
- Subsequently, on 2026-11-06 and 2026-11-08 in [Issue #15 comments #6685976712 / #6721920473](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/15#issuecomment-6685976712) and the merged `F-S1-03` Part F implementation ([PR #37](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/37), `apps/api/src/availability.ts`), the team confirmed and implemented **`OD-002 = 60 days`** for Customer Availability (`Slot.startsAt <= view_clock.evaluated_at + INTERVAL '60 days'`, verified by `AVA-03` against PostgreSQL `T_view`). Meanwhile, Tutor Slot creation (`F-S1-02`) retains its accepted Sprint 1 Option A rule (future check without a 60-day cap).
- **UI obligation under Option A:** The calendar **never** enforces its own client-clock date cutoff and **never** hardcodes a fixed 2- or 3-month cap. All navigable months and eligible dates derive strictly from the authenticated `200` offers and server `meta.evaluatedAt` reference (`evaluatedAt` through `max(latestOfferStart, evaluatedAt + 60 days)`), cleanly supporting year boundaries (`Nov -> Dec -> Jan`) and leap years (`28`/`29` Feb).

## 2. Option A interaction contract and settled Part E choices

### 2.1 Monthly calendar header & landing rules

- **Instruction & anchor metadata:** Render the existing `เลือกช่วงเวลาติว` hero heading, short subtitle `"เลือกวันที่สะดวก แล้วเลือกช่วงเวลา"` alongside the explicit `Asia/Bangkok (UTC+07:00)` note, server `ตรวจสอบล่าสุด` (`meta.evaluatedAt` in `Asia/Bangkok`), and `โหลดข้อมูลล่าสุด` button.
- **Confirmed initial landing after authenticated `200`:**
  - Before a valid response passes session-binding validation and strict DTO/UTC timestamp checks, the schedule state is **loading** (or **read error** on `500`/`503`/network/timeout/malformed DTO) — never a zero-offer calendar grid.
  - When confirmed `data: []`, render the existing global confirmed-empty surface (`ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก`), with no fabricated calendar availability.
  - When `data.length > 0`, derive a memoized index `Map<BangkokDayKey, CustomerAvailabilityOffer[]>` once per validated payload, open the calendar to the **Bangkok calendar month containing the earliest eligible offer (`data[0]`)**, and **preselect that earliest eligible day** (`selectedDayKey`) automatically if no day is currently selected in this component mount. (If the Customer refreshes after selecting or interacting with a day, keep their chosen `selectedDayKey` unless they reset tabs/remount, so if a booked Slot disappears cleanly, that day's updated state stays visible instead of jumping unexpectedly.)
- **7-column Mon–Sun calendar grid (`จ`, `อ`, `พ`, `พฤ`, `ศ`, `ส`, `อา`):**
  - Display Thai month name and Christian-era year formatted explicitly in `Asia/Bangkok` (`th-TH-u-ca-gregory-nu-latn`, consistent with existing `bangkokLongDate` across `F-S1-02..05`, e.g., `พฤศจิกายน 2026`, `มกราคม 2027`).
  - Provide Prev Month (`เดือนก่อนหน้า`) and Next Month (`เดือนถัดไป`) `<button type="button">` controls supporting arbitrary month transitions including cross-year rollovers (e.g., Dec -> Jan) and Feb 29 in leap years (e.g., `2028-02-29`), disabled cleanly at the derived min/max bounds (`earliestMonth` through `latestMonth` computed from `evaluatedAt` + offers).
  - Leading/trailing cells outside the displayed month render as non-interactive empty spacers (`aria-hidden="true"`).
  - Each in-month day cell is a native `<button type="button">` displaying the day number and its **eligible Slot offer count** (e.g., `8 ช่วงเวลา`) — **counting actual offers (`offersForDay.length`), never unique Tutor count**.
  - **Zero-offer days inside a month:** Marked visibly empty using non-color indicators (`—` / subtle dashed neutral styling + descriptive text/label `"ไม่มีช่วงเวลาว่าง"`) and `disabled` by design (`"กดวันไม่ได้ตามดีไซน์"`, e.g., `aria-label="13 พ.ย. 2026 ไม่มีช่วงเวลาว่าง"`), never relying on color alone.
  - **Active day cells (`count > 0`):** Selectable via click or `Enter`/`Space`; indicate selected date with explicit `aria-pressed={isSelected}`, non-color indicator (`"กำลังเลือก"` / border accent + check badge), and clear accessible label matching `bangkokLongDate` (`th-TH-u-ca-gregory-nu-latn`), e.g., `"12 พ.ย. 2026 มี 8 ช่วงเวลา"`.

### 2.2 Selected-day time grouping & settled Part E choices

All three UX scope questions raised in `@Tanaboonnnnn`'s brief (§7) are settled for this Part E specification as follows:

1. **Time-group definition & initial visibility limit (Settled Choice #1 = `6` groups + `"ดูเวลาเพิ่มเติม"`):**
   - Filter offers where `bangkokDayKey(new Date(offer.startsAt)) === selectedDayKey`, preserving exact server order (`startsAt ASC, tutorRef ASC, slotId ASC`).
   - Group offers by their exact **`(startsAt, endsAt)` UTC pair** (`groupKey = ${startsAt}|${endsAt}`). Never coerce times to whole hours, never merge different `slotId`s, and never invent a `1h` assumption beyond validated offer endpoints.
   - Each time-group row is a native toggle button (`aria-expanded={isExpanded}`) showing Bangkok wall-clock interval + count (e.g., `09:00–10:00 น. · 3 ตัวเลือก`), plus the explicit **`สิ้นสุดในวันถัดไป`** badge when `bangkokDayKey(startsAt) !== bangkokDayKey(endsAt)` (e.g., `23:30–00:30 น.`).
   - Collapse time groups by default and render at most **6 time groups** initially for the selected day; when more than 6 distinct time groups exist on that day, render a native `<button type="button">` **`ดูเวลาเพิ่มเติม`** (`"ดูเวลาเพิ่มเติม (อีก N ช่วงเวลา)"`) to reveal all remaining groups in chronological order without modifying the API request or discarding eligible offers. Even if all 500+ offers occur on one date, initial interactive DOM controls stay compact (~30 day cells + 6 time-group buttons).
   - Expanding a time-group row reveals its individual `<li>` offer items (`[data-testid="availability-offer"]` with `data-offer-slot-id` and `data-tutor-ref`) in exact server `tutorRef ASC, slotId ASC` order, each displaying opaque `tutorRef`, Bangkok date/duration text, and `เลือกช่วงเวลานี้` / `เลือกช่วงเวลานี้แล้ว` (`aria-pressed`).
2. **Period quick-filter chips (Settled Choice #2 = Omit):**
   - Do **not** add morning/afternoon/evening quick-filter buttons in Phase 1. Omitting artificial time-of-day categories reduces interactive clutter and avoids implying business-hour semantics outside `F-S1-03`.
3. **Selected-offer summary & mobile placement (Settled Choice #3 = Non-sticky inline card after the day's time list):**
   - Render `#selected-offer-summary` inline directly **below the selected day's time-group list** inside the right (~60%) pane on desktop (`>= 768px`) and directly below the time-group list in the single vertical stack on mobile (`320/375px`).
   - Do **not** apply `position: fixed` or `position: sticky` to the summary/confirm bar on mobile, so focus indicators (`WCAG 2.2 SC 2.4.11`), calendar buttons, and expanded offer actions are never obscured.
   - Render `#selected-offer-summary` whenever `activeOffer && !loading && !listError` — including when the user switches calendar month/day OR when `unknownOutcome` persists even if `offers.length === 0` after refresh.
   - Selecting an offer sets transient UI state only and explicitly states: **"การเลือกช่วงเวลานี้ยังไม่ใช่การจอง และยังไม่ได้ล็อกสิทธิ์จนกว่าจะยืนยันการจองในขั้นตอนถัดไป"**, exposing `ยืนยันการจอง` (and `ยกเลิกการเลือก`, or `ส่งคำขอเดิมอีกครั้ง` when `unknownOutcome` is active).

### 2.3 Safe view transitions & empty/error distinction

- **No side-effect POST/GET on calendar navigation:** Changing month, clicking another day, expanding a time group, or clicking `"ดูเวลาเพิ่มเติม"` mutates local UI state only. It never dispatches `POST /api/v1/customer/bookings`, never clears or swaps `selectedSlotId`/`selectedOfferSnapshot`, and never clears `unknownOutcome`. While `unknownOutcome` is active for an unresolved `slotId`, selecting any other `slotId` remains locked (`disabled`) until retry/reconciliation settles.
- **Day-specific empty state:** Triggered when `offers.length > 0` overall, yet the currently inspected month (e.g., an empty intermediate month within the 60-day horizon) or currently retained `selectedDayKey` (e.g., its last Slot was booked or removed on refresh) has `0` eligible offers. Render an explicit day/month empty panel (`ยังไม่มีช่วงเวลาว่างในวันที่เลือก` / `ยังไม่มีช่วงเวลาว่างในเดือนนี้`) directing the user to choose another date or month with available counts.
- **Fail-closed error & session guards:** `401`/`403`, failed `X-NutTiew-Session-Binding`, logout initiation/uncertainty, network/500/503 failure, or invalid DTO timestamp/shape clears or hides calendar/time derived state and offers `โหลดอีกครั้ง` (or session recovery UI) without rendering empty `0` counts or merging stale old-session offers into a new session.

## 3. Responsive layout, tokens, Phase 2 gate, and accessibility target

- **Responsive geometry & `44×44 CSS px` target reconciliation:**
  - **Desktop & tablet (`>= 768px`):** Balanced two-column workspace (`~40%` calendar, `~60%` selected-day time options + inline `#selected-offer-summary`). Note: on desktop with the 245px sidebar open, maintain adequate width before breaking to two columns (or adjust `.customer-sidebar` collapse / grid breakpoint `>= 768px` when sidebar is collapsed) so calendar grid columns never compress date buttons below `44×44 CSS px`. Use CSS `grid-template-columns: minmax(344px, 40%) minmax(0, 60%)` when horizontal container width >= ~720px so desktop settles at ~40%/60% and 768px fits 7 day columns >= 44px side-by-side cleanly.
  - **Mobile (`320px` and `375px`):** Single vertical column (Calendar -> Selected Day Time Groups -> Non-sticky `#selected-offer-summary`), zero horizontal overflow (`documentElement.scrollWidth <= window.innerWidth`, WCAG 2.2 SC 1.4.10). Every navigation, month-step, time-group, `"ดูเวลาเพิ่มเติม"`, offer-select, and confirm button targets `>= 44×44 CSS px`. **Explicit 320px math note:** since 7 horizontal day columns × 44px = `308px` plus grid gaps and card padding exceeds 288–304px usable content width at `320px`, at `>= 375px` (`375`, `768`, `1280px`) every day button hits `>= 44×44 CSS px`, while at `320px` calendar day buttons prioritize zero page horizontal overflow (`SC 1.4.10`) with **`>= 44 CSS px` height** and **`>= 36 CSS px` width** (well above `WCAG 2.2 AA SC 2.5.8`'s `24×24 CSS px` minimum).
- **NutTiew visual tokens & contrast pairing (design targets, verified rendered states in Part F):**
  - Shared tokens: `#202B44` navy sidebar, `#F7F8FB` canvas, `#FFFFFF` card surface, `#172137` dark ink, `#455A76` muted ink (`>= 4.5:1` target), `#66778A` interactive borders (`>= 3:1` SC 1.4.11; `4.59:1` on white), `#F47736` primary CTA fill with `#172137` dark text (`5.76:1`) and `#D96123` border (`3.48:1` vs canvas, `3.69:1` vs white), keyboard focus outline `3px solid #AA4519` (`outline-offset: 3px`, `5.53:1` vs canvas, `5.87:1` vs white; `#FFBD94` inside dark navy sidebar). Never use white text on `#F47736`, gradients, glassmorphism, or decorative emojis.
- **Screen-reader & motion accessibility:**
  - Concise `aria-live="polite"` status announcement on day/month selection matching `bangkokLongDate` (e.g., `"เลือกวันที่ 12 พ.ย. 2026 พบ 8 ช่วงเวลา"` or empty-month notice) — never re-announcing hundreds of records.
  - Support `@media (prefers-reduced-motion: reduce)` and `200%` browser zoom without clipping text, losing focus rings, or creating horizontal page scroll.
- **Phase 2 profiling gate (deferred):** If genuine Part F or production profiling demonstrates that returning `500+` JSON records from `GET /api/v1/customer/availability` creates a SQL/network latency bottleneck, propose a **separate reviewed Part E API amendment** (covering date-range/cursor parameters, `T_view`/`60-day` semantics, ordering stability, `BR-S1-20` query validation updates, and privacy checks). Phase 1 strictly forbids query-param expansion in UI PRs.
- **Planned STS & manual gate:** Acceptance criteria `UX-CAL-01..10` are defined in [STS §2](tests.md#2-ux-calendar-planned-sts) alongside preserved regression obligations for `AVA-01..19`, `BOOK-01..33`, and `RET-*`. Every `UX-CAL` item is **PLANNED / NOT RUN** in this docs-only amendment; automated Playwright checks in later Part F must be reported separately from the **manual human WCAG 2.2 AA audit**, which remains **NOT RUN** until human inspection.
