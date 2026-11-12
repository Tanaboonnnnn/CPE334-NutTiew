# F-S1-03 — Customer Availability UI Specification (Part E)

> **2026-11-10 UX-only Option A amendment (Issue #44, pending peer review):** Replace only the simultaneous full-list layout (`dateGroups.map(...)`) with **Option A — Date-First Monthly Calendar (Progressive Disclosure)** as directed in [Issue #15 comment #6763909620](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/15#issuecomment-6763909620) and detailed in [UX decision 2026-11-10](ui-decision-2026-11-10.md). The historical Part E baseline below ([PR #32](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/32) / Part F [PR #37](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/37)) remains preserved for traceability; only its simultaneous chronological full-list page layout is proposed to be superseded. The read-only API contract ([API](api-spec.md)), PostgreSQL eligibility/T_view (`OD-002 = 60 days`), `OD-AV-01..08`, `F-S1-04` confirmation/security ([F-S1-04 UI](../F-S1-04/ui-spec.md)), and `F-S1-05` `การจองของฉัน` tab ([F-S1-05 UI](../F-S1-05/ui-spec.md)) remain **unchanged**.

> **Review sequencing (Two-PR Gate):** This is a **docs-only Part E amendment** under Issue [#44](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/44) (separate from Deliverable 1 [#18](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/18) / PR [#43](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/43)). Obtain independent review from @Tanaboonnnnn and merge into `sprint1` **before** opening the Part F code-only PR.

## Amendment: Option A Date-First Monthly Calendar (Issue #44)

### A.1 Screen anatomy and progressive disclosure flow

1. **Preserved NutTiew Customer Shell:** Keep the single Navy `#202B44` sidebar (`เลือกช่วงเวลาติว`, `การจองของฉัน`, `บัญชีของฉัน`, `ออกจากระบบ`), top status/breadcrumb bar, `#account-details`, and session/logout guard transitions identically across desktop and collapsed mobile navigation.
2. **Hero Header:**
   - `h1#availability-heading`: **เลือกช่วงเวลาติว**
   - Helper instruction: **เลือกวันที่สะดวก แล้วเลือกช่วงเวลา** alongside explicit **Asia/Bangkok (UTC+07:00)** notice
   - Optional `ตรวจสอบล่าสุด` from response `meta.evaluatedAt` formatted explicitly in `Asia/Bangkok`
   - Primary refresh control: `โหลดข้อมูลล่าสุด`
3. **Balanced Calendar + Day Time Workspace (`#availability-section` when `offers.length > 0` after authenticated `200`):**
   - **Step 1 — Monthly Calendar (~40% left column on desktop `>= 768px`, first block on `< 768px`):**
     - Month/Year heading (`th-TH-u-ca-gregory-nu-latn` in `Asia/Bangkok`, e.g., `พฤศจิกายน 2026`, `มกราคม 2027`) + Prev (`เดือนก่อนหน้า`) and Next (`เดือนถัดไป`) `<button type="button">` controls supporting cross-month/year rollovers (`Nov -> Dec -> Jan`) and leap Februaries (`28`/`29` days).
     - Derived month bounds span from earliest eligible offer month (or `evaluatedAt` month) through `max(latestOfferMonth, month(evaluatedAt + 60 days))` without browser-clock eligibility filtering or hardcoded month limits.
     - 7-column Mon–Sun weekday grid (`จ`, `อ`, `พ`, `พฤ`, `ศ`, `ส`, `อา`). Out-of-month filler slots render as inert non-focusable spacers (`aria-hidden="true"`).
     - Each in-month day renders as a native `<button type="button">` displaying the day numeral and **eligible Slot offer count** (`N ช่วงเวลา` — total offers returned for that Bangkok day, **not** unique Tutor count). Zero-offer days show non-color empty markings (`—` / subtle dashed neutral styling, accessible label e.g. `"13 พ.ย. 2026 ไม่มีช่วงเวลาว่าง"`) and `disabled` state by design (`กดวันไม่ได้ตามดีไซน์`). Eligible days show accessible label matching `bangkokLongDate`, e.g. `"12 พ.ย. 2026 มี 8 ช่วงเวลา"` and `aria-pressed={isSelected}` plus non-color active badge/border cues.
   - **Step 2 — Selected Day Time Groups (~60% right column on desktop `>= 768px`, second block on `< 768px`):**
     - Heading displays the selected Bangkok date + offer count for that day (e.g., `12 พ.ย. 2026 · 8 ช่วงเวลา`).
     - Group offers matching `bangkokDayKey(new Date(offer.startsAt)) === selectedDayKey` by **exact `(startsAt, endsAt)` UTC instant pair** using memoized indexing from validated offers only, preserving deterministic server order (`startsAt ASC, tutorRef ASC, slotId ASC`). Never snap arbitrary minutes (e.g., `10:15`, `23:30`) to hourly buckets and never merge distinct `slotId`s.
     - **Omit quick period filter chips** (no morning/afternoon/evening chips in Phase 1).
     - Render time groups **collapsed by default** and display the **first 6 time groups** for the selected day initially; when `groups.length > 6`, render a native `<button type="button">` **`ดูเวลาเพิ่มเติม`** to reveal all remaining groups for that date without API filtering or truncating offers.
     - Each time-group toggle button (`aria-expanded={isExpanded}`) displays Bangkok `HH:mm–HH:mm น.`, explicit `สิ้นสุดในวันถัดไป` badge when `bangkokDayKey(startsAt) !== bangkokDayKey(endsAt)`, and option count (`N ตัวเลือก`).
     - Expanding a group reveals `<ul>` offer items (`[data-testid="availability-offer"]`, `data-offer-slot-id`, `data-tutor-ref`) in exact server `tutorRef ASC, slotId ASC` order, displaying opaque `tutorRef` (or approved `tutorDisplayName` only after `OD-AV-02`), Bangkok date/duration, and `เลือกช่วงเวลานี้` / `เลือกช่วงเวลานี้แล้ว` (`aria-pressed`).
4. **Step 3 — Non-Sticky Inline Selection & Confirmation Summary (`#selected-offer-summary`):**
   - Placed directly **below the selected day's time list** inside the right column on desktop (`>= 768px`) and directly **below the day's time list** in the mobile vertical stack (`320/375px`). Never `position: fixed` or `position: sticky` over interactive controls or focus outlines (`WCAG 2.2 SC 2.4.11`).
   - Remains mounted whenever `activeOffer && !loading && !listError`, preserving active transient selection and any unresolved `UnknownBookingOutcome` even when switching calendar days/months or when `refresh()` returns `data: []`.
   - Displays Bangkok date/time, cross-midnight badge when applicable, opaque `tutorRef`, explicit disclaimer **"การเลือกช่วงเวลานี้ยังไม่ใช่การจอง และยังไม่ได้ล็อกสิทธิ์จนกว่าจะยืนยันการจองในขั้นตอนถัดไป"**, `ยืนยันการจอง` / `ส่งคำขอเดิมอีกครั้ง`, `ยกเลิกการเลือก`, and CSRF retry if needed — using the unchanged `F-S1-04` confirmation flow.

### A.2 Calendar state machine extensions (additive to §3 baseline)

| State | Trigger | Required Option A behavior |
|---|---|---|
| Confirmed populated landing | First valid `200` with `data.length > 0` and valid `X-NutTiew-Session-Binding` | Build memoized day map; open earliest eligible offer month (`data[0]`); auto-select earliest eligible `selectedDayKey`; keep time groups collapsed initially; preserve `selectedSlotId`/`unknownOutcome` rules |
| Confirmed global empty | Valid `200` with `data: []` | Render `ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก` without empty calendar availability; keep `unknownOutcome` summary rendered if unresolved |
| Selected day/month empty | Valid `200` with `data.length > 0`, while viewed month or retained `selectedDayKey` (e.g., post-booking/refresh) has 0 offers | Render day/month empty panel inside Step 2 explaining no offers exist for that date/month; never label whole system globally empty |
| Read error / malformed DTO | Network, timeout, `500`, `503`, invalid `startsAt`/`endsAt`/`evaluatedAt`, or malformed DTO item | Hide calendar grid, counts, and derived state (`offers = []`); render `#availability-error` + `โหลดอีกครั้ง`; never show `0` counts as confirmed empty |
| Month / day navigation | User clicks `เดือนก่อนหน้า`, `เดือนถัดไป`, eligible date button, `ดูเวลาเพิ่มเติม`, or time-group toggle | Update local UI view state only; zero `GET` query params, zero `POST` triggers; preserve existing `selectedSlotId`, `selectedOfferSnapshot`, and `unknownOutcome` lock |
| UnknownBookingOutcome lock | Unresolved Booking POST (`503 BOOKING_OUTCOME_UNKNOWN` / network abort/timeout) | Keep `#selected-offer-summary` + `ส่งคำขอเดิมอีกครั้ง`; block (`disabled`) switching selection to any different `slotId` across all days/time groups until reconciled |
| Session change / logout | Logout click, `logoutError`, `401`/`403`, binding mismatch, `nuttiew-auth-changed` event | Immediately abort in-flight requests, clear offers, calendar selection, day map, and CSRF state; ignore delayed responses from prior Session |

### A.3 Responsive breakpoints, hit targets, and accessibility targets

| Viewport | Layout | Calendar/target geometry |
|---|---|---|
| `320 CSS px` | Single vertical stack (`Calendar` -> `Day Time Groups` -> inline `#selected-offer-summary`); zero horizontal overflow | All non-grid buttons (month step, time groups, `ดูเวลาเพิ่มเติม`, offer select, confirm) target `>= 44×44 CSS px`; day buttons keep height `>= 44 CSS px` and width `>= 36 CSS px` (exceeding WCAG 2.2 AA SC 2.5.8 `24×24px` minimum) so 7 columns never overflow or clip at `320px` |
| `375 CSS px` | Single vertical stack; compact mobile gutters; zero horizontal overflow | Every interactive button including all 7-column day cells achieves `>= 44×44 CSS px` |
| `>= 768px` (incl. `768px` & `1280px`) | Balanced two-column content area (~40% Calendar, ~60% Day Time Groups + inline `#selected-offer-summary`); no second sidebar | Use `minmax(344px, 40%) minmax(0, 60%)` when main area has two-pane width (collapsed sidebar at `768px`, full width at `1280px`) so all day buttons remain `>= 44×44 CSS px` with zero overflow |

- **Live announcements & keyboard navigation:** Announce selected date transitions concisely in `aria-live="polite"` (e.g., `"เลือกวันที่ 12 พ.ย. 2026 พบ 8 ช่วงเวลา"`), never reading 500 offer rows. Preserve logical DOM/Tab order across month controls -> eligible days -> time-group accordions -> `ดูเวลาเพิ่มเติม` -> expanded offer buttons -> inline `#selected-offer-summary`.
- **Contrast, reduced motion, zoom:** Maintain `#172137` dark ink on `#F47736` CTA (`5.76:1`), `#D96123` border (`>= 3:1`), `#66778A` interactive borders (`4.59:1` on white), `#455A76` muted ink (`>= 4.5:1`), `3px solid #AA4519` focus outline (`offset: 3px`), `@media (prefers-reduced-motion: reduce)`, and `200%` zoom usability without obscured focus.
- **Timezone invariance:** Compute Bangkok month titles, day keys (`YYYY-MM-DD`), weekday headers, cross-midnight checks, and `HH:mm` labels exclusively in `Asia/Bangkok`, independent of `UTC` or `America/Los_Angeles` browser settings.
- **Phase 1 boundary & Phase 2 deferment:** `GET /api/v1/customer/availability` remains unfiltered in Phase 1. Any future query/pagination addition requires profiling justification plus a separate Part E API amendment. All `UX-CAL-01..10` checks in [STS §2](tests.md#2-ux-calendar-planned-sts) and manual human WCAG 2.2 AA sign-off are **PLANNED / NOT RUN**.

---

## Baseline specification (historical Part E PR #32)

> **Historical note (`OD-002` reconciliation):** Content below preserves the original Part E baseline (`PR #32`). Its `OD-002` `OPEN` statement in §2 below was superseded on 2026-11-06 / 2026-11-08 by confirmed **`60 days`** evaluated against database `T_view` in [Issue #15](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/15#issuecomment-6685976712) and Part F [PR #37](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/37); see [UX decision 2026-11-10 §1](ui-decision-2026-11-10.md#od-002-horizon-provenance-reconciliation).

> **Part E UI contract only; no UI implementation/browser test.** Customer-specific bookable-only and the shared NutTiew design direction are recorded as peer decisions in [Feature SDS](specification.md#5-peer-review-decision-record). Tutor display name remains conditional on its separate data-approval gate. See [API](api-spec.md), [Data](data-spec.md), [STS](tests.md).

## 1. Screen and visual direction

Screen: **ช่วงเวลาติวที่พร้อมให้เลือก** — authenticated Customer availability discovery.

This is a focused scheduling utility, not a marketing page or a visually separate application. Customer Availability and the Tutor Calendar Dashboard share one NutTiew design system while allowing role-specific layouts.

| Shared product token | Customer Availability application |
|---|---|
| Brand / navigation | Text-only NutTiew wordmark; shared navy `#202B44` for brand/navigation and the same active-navigation, account and logout patterns as Tutor Dashboard |
| Canvas / surface | Light canvas `#F7F8FB`, white surface `#FFFFFF`; no nested cards |
| Text | Dark ink `#172137`; muted text must remain contrast-safe on the shared light surfaces |
| Primary action | Orange `#F47736` with dark-ink label/icon `#172137` and border `#D96123`; do not use white text on orange |
| Focus | Shared visible focus ring `3px solid #AA4519` with `outline-offset: 3px`; verify it remains unobscured in every state |
| Typography | Noto Sans Thai, Sarabun, system-ui, sans-serif; use the same type hierarchy as Tutor Dashboard |
| Spacing / corners | Shared 4/8/12/16/24/32px spacing scale and 8px radius; align component padding and row rhythm with Tutor Dashboard |

Use the same reusable button, status, focus and navigation patterns as Tutor Dashboard. Desktop navigation follows the same NutTiew shell; only Customer-authorized destinations are shown (availability, account and logout), never Tutor-only or unimplemented menus. At mobile widths use the same accessible collapsed-navigation behavior. Keep the Customer content light and readable; do not create a second brand palette with an unrelated accent.

No gradients, glassmorphism, hero banners, fake Tutor profiles, testimonials, ratings, prices, message panels, decorative emoji or card-in-card layouts. The orange CTA pairing and focus values are design tokens from the Tutor UI contract, not proof of WCAG conformance; Part F must verify actual rendered states and contrast.

## 2. Screen anatomy

1. Small text-only NutTiew wordmark.
2. Heading: เลือกช่วงเวลาติว.
3. Helper: appointment times are displayed in Asia/Bangkok.
4. Optional ตรวจสอบล่าสุด timestamp from response meta.evaluatedAt.
5. Chronological offers grouped by Bangkok calendar date.
6. Each offer shows an approved Tutor public display name when the OD-AV-02 data gate is cleared; otherwise it shows the stable opaque Tutor reference. Also show Bangkok date, 24-hour start/end and a เลือกช่วงเวลานี้ action.
7. Selected-offer summary uses the same approved name/fallback reference and time, and must state that selection **is not a Booking**.

Selecting an offer stores slotId in transient UI state only. It does not POST, reserve, occupy or confirm a Booking. The later #16 flow owns confirmation and must revalidate the selected Slot on the server.

### Display policy OD-AV-01

**Confirmed: Customer-specific bookable-only.** Show only offers the API evaluated as bookable for the authenticated Customer at `meta.evaluatedAt`: current Offered Slot, not occupied by an Active `Booked` row, at least 60 minutes before start, and not overlapping that Customer's own Active Booking even if the existing Booking belongs to another Tutor. Exact adjacency is allowed. Do not render unavailable offers or disclose why another Slot was excluded.

The maximum advance horizon remains open under SRS OD-002. The UI must not invent a date cap or imply that an unlimited horizon has been approved; update the visible range only after the team records that decision.

## 3. UI states

| State | Trigger | Required behavior |
|---|---|---|
| Session loading | /auth/me pending | Hide offers; show progress |
| Signed out | /auth/me returns 401 | Clear offers/selection; show Auth |
| Wrong role | Principal is not Customer | Access denied; do not call/render Customer availability |
| Initial loading | Customer verified; availability GET pending | Show progress, not empty/zero |
| Populated | 200 with offers | Render authorized offers in server order |
| Confirmed empty | 200 with data: [] | Show ยังไม่มีช่วงเวลาติวที่พร้อมให้เลือก |
| Read error | Network/timeout/500/503 | Show error and โหลดอีกครั้ง; never show empty/zero |
| Selection | Customer selects an offer | Mark selected; state no Booking was created |
| Stale selection | Later #16 rejects it | Show non-success, clear/mark stale selection, refresh; never show Booked |
| Session changed | Logout/account switch/binding mismatch | Immediately clear offers/selection and ignore late old-session responses |

Only a successful authorized 200 with data: [] may render confirmed-empty. A failed request or malformed payload is not an empty result.

## 4. Interaction and accessibility

- Semantic headings, native buttons, visible labels and logical Tab/Enter order.
- Every offer is keyboard selectable; selected state is communicated with text/semantics, not color alone.
- Visible :focus-visible; focus must not be obscured. Move focus to an error summary for blocking failures where appropriate.
- Announce loading, result count, empty and error transitions without repeatedly announcing the entire list.
- Primary controls target at least 44×44 CSS px as a design target only; this is not a verified pass. Part F records actual target-size, contrast, focus, zoom and 320 CSS px reflow evidence.
- NFR-S1-09 test planning is accepted, but this specification does not claim WCAG 2.2 AA conformance. Do not report WCAG AA or 44px as passed without the corresponding manual/browser evidence.

## 5. Responsive behavior

| Viewport | Proposed layout |
|---|---|
| 320/375 CSS px | Single-column list, 16px side gutters, no horizontal overflow |
| 768 CSS px | Readable constrained list; no unnecessary calendar grid |
| 1280 CSS px | Centered readable column; rows may place metadata/action in two columns |

Preserve the same chronological offer set and field visibility at every viewport. Do not crop offers or hide Tutor/time on mobile.

## 6. Privacy and content rules

Show only the approved Tutor public display name when the OD-AV-02 gate is cleared; otherwise show the opaque Tutor reference, plus Slot date/time. The server-side overlap check may use the authenticated Customer ID but must not reveal whether a matching Active Booking exists, which Tutor owns it, or any Booking/Customer details. Never derive a name from email or invent a name. Do not show/fetch Customer identity, emails/phones, Booking IDs/reasons, Tutor email, credentials/session fields or full private Tutor schedule. No unapproved profile fields, subjects, ratings, prices, locations, images or unrelated availability. No Booking confirmed/Booked/Reserved state in #15.

## 7. Acceptance mapping

| Criterion | UI requirement |
|---|---|
| AC-S1-15 | Selectable approved Tutor display name after its data gate, otherwise opaque Tutor reference, and Bangkok start/end |
| AC-S1-16 | Occupied/inside-cutoff offers and offers overlapping this Customer's Active Booking are excluded from the bookable-only list |
| AC-S1-17 | Selection is not reservation; #16 revalidates and UI shows non-success |
| AC-S1-18 | Asia/Bangkok rendering independent of device timezone |

Part F must capture real DB-backed browser evidence at 320/375/768/1280 CSS px and test keyboard selection, loading/empty/error/retry, 401/403, session switch, timezone and stale #16 response. None has been run in Part E.
