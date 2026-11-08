# F-S1-03 — Customer Availability Discovery Part F implementation and setup

**Issue:** [#15](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/15).
**Sources:**
- Part E approved-design PR [#32](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/32) (merged to `sprint1` as `98d9841227b69820714492c276bcbe402cc21330`).
- Shared Booking data-foundation Issue [#33](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/33) — Part E PR [#34](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/34) and Part F PR [#36](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/36) (merged to `sprint1` as `f124760e4c4cd5dce8a450d7f4c4478672fc1ff9`).

**Scope owner:** @Chxtamos; **peer reviewer:** @Tanaboonnnnn.
This document describes the **Part F code implementation branch** (`feature/15-customer-availability`) and does not itself constitute peer-review approval, stakeholder business-rule sign-off, or a Sprint 1 release.

## What the feature implements

- **Read-only Customer availability API (`GET /api/v1/customer/availability`):**
  - Requires a live authenticated DB-backed session (`requireSession`) with role `Customer` (`requireRole('Customer')`); anonymous callers receive `401 UNAUTHENTICATED`, and `Tutor` sessions receive `403 FORBIDDEN`.
  - Rejects all query parameters (`Object.keys(req.query).length > 0`) with `400 INVALID_INPUT` (`BR-S1-20`, `OD-AV-03`).
  - Evaluates one PostgreSQL `T_view` per read via a materialized CTE (`WITH view_clock AS MATERIALIZED (SELECT COALESCE($2::timestamptz, clock_timestamp()) AS evaluated_at)`) and returns `meta.evaluatedAt` in both populated and empty (`data: []`) `200 OK` responses (`OD-AV-04`), alongside `Cache-Control: no-store` and `X-NutTiew-Session-Binding` (`OD-AV-06`).
  - Enforces **Customer-specific bookable-only** filtering (`OD-AV-01`, `FR-S1-08/09`, `AC-S1-15/16`, `BR-S1-06/07/08/09/10/11/12/15/17/20/21`, `Q05`, `Q28`, `OD-002`) as a **read-only consumer** of the merged shared `Slot` and `Booking` tables (`#33` / PR `#36`):
    1. `Slot.lifecycle = 'Offered'` owned by an active `Tutor` user (`User.role = 'Tutor' AND User.isActive = true`) with a valid 60-minute interval (`endsAt = startsAt + INTERVAL '60 minutes'`).
    2. `Slot.startsAt >= view_clock.evaluated_at + INTERVAL '60 minutes'` (`Q05` 60-minute cutoff; `60:00` included, `59:59` excluded).
    3. `Slot.startsAt <= view_clock.evaluated_at + INTERVAL '60 days'` (confirmed `OD-002` 60-day maximum advance horizon evaluated against database `T_view`; `60 days` included, `> 60 days` excluded).
    4. No active Booking (`Booking.status = 'Booked'`) references `Booking.currentSlotId = Slot.id` (`OD-AV-05`; no `Slot.isBooked` column exists or is used).
    5. No active Booking owned by the authenticated Customer (`Booking.customerId = principal.userId AND Booking.status = 'Booked'`) overlaps `[Slot.startsAt, Slot.endsAt)` using half-open interval comparison (`Booking.startsAt < Slot.endsAt AND Slot.startsAt < Booking.endsAt`), even across different Tutors; exact adjacency (`Booking.endsAt = Slot.startsAt` or `Slot.endsAt = Booking.startsAt`), `Cancelled` bookings, and other Customers' bookings on different Slots do not exclude the candidate (`AVA-15/16/17`).
  - Formats `startsAt`, `endsAt`, and `meta.evaluatedAt` inside PostgreSQL (`to_char(ts AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`) so wire timestamps are always UTC `YYYY-MM-DDTHH:mm:ss.sssZ` regardless of PostgreSQL session `TimeZone` (`AVA-04/09`).
  - Orders eligible offers deterministically by `startsAt ASC, tutorRef ASC, slotId ASC` (`OD-AV-03`, `AVA-08`).
  - Enforces the strict response allowlist (`slotId`, `tutorRef`, `startsAt`, `endsAt` + `meta.requestId`, `meta.evaluatedAt`). Because `OD-AV-02` (`User.tutorDisplayName` source/consent/migration gate) remains closed, `tutorDisplayName` is omitted and only opaque `tutorRef` UUID is returned; no email-derived name, Customer identity, Booking row, or private Tutor data is ever returned (`AVA-05/18`).
- **Customer Availability React UI (`apps/web/src/customer-availability.tsx`, `apps/web/src/customer-availability.css`, `apps/web/src/main.tsx`):**
  - Renders the authenticated Customer workspace (**เลือกช่วงเวลาติว**) sharing the NutTiew design system tokens (`#202B44` navy sidebar, `#F7F8FB` canvas, `#FFFFFF` surface, `#172137` dark ink, `#F47736` orange primary action with `#172137` dark label and `#D96123` border, `3px solid #AA4519` focus outline with `3px` offset, `#66778a` control border) with Tutor Dashboard (`OD-AV-08`, `AVA-19`), showing only Customer-authorized navigation (`เลือกช่วงเวลาติว`, `บัญชีของฉัน`, `ออกจากระบบ`).
  - Formats all offer dates/times and `meta.evaluatedAt` in `Asia/Bangkok` (`UTC+07:00`) regardless of browser/device timezone, including explicit cross-midnight badge (`สิ้นสุดในวันถัดไป`) (`AC-S1-18`, `AVA-04`).
  - Distinguishes loading, populated, confirmed-empty (`200 OK` with `data: []`), and read-error (`503`/network/timeout with `โหลดอีกครั้ง` retry) states; never renders empty/zero when a read fails (`AVA-09/10`). Validates response payload structure and parseable UTC timestamps before committing state, failing into read error with retry on malformed responses rather than throwing render exceptions.
  - Implements transient client-side offer selection (`เลือกช่วงเวลานี้` / `เลือกช่วงเวลานี้แล้ว`) and a selected-offer summary (`#selected-offer-summary`) that explicitly states selection is **not** a Booking or reservation (`AC-S1-17`), clearing transient selection if the selected offer is no longer available on refresh; Booking creation and server-side revalidation belong to Issue `#16`.
  - Guards session state across logout transitions for Customer and Tutor alike: unmounts private data immediately upon logout initiation, renders the session guard screen on pending or uncertain logout (`503`/timeout) with retry and recheck controls rather than rendering a false empty schedule or verified account banner, and binds availability responses to the active session via `X-NutTiew-Session-Binding` and `window.localStorage` `storage` events (`nuttiew-auth-changed`) so delayed responses from a logged-out or switched Customer session never repaint (`AVA-12`).

**Explicitly out of scope:**
- Creating or modifying `Booking` schema, migrations, triggers, or adding `Slot.isBooked` (owned by merged `#33` PR `#36`).
- `POST` Booking creation, transactional `T_elig` revalidation, or Booking confirmation UI (owned by Issue `#16`).
- Customer/Tutor Booking list/detail retrieval (owned by Issue `#17`).
- Adding `User.tutorDisplayName` before the `OD-AV-02` stakeholder/consent/migration gate is approved.

## Verification commands

```powershell
npm run db:generate
npm run db:migrate
npm test
npm run typecheck
npm run build
npm run test:db
npm run test:e2e -- --reporter=line
```

See [Part F verification ledger](verification-ledger.md) for actual observed command outcomes, `AVA-01..19` status, `AVA-14` latency measurements, computed contrast ratios, and gated items (`AVA-11`, `AVA-18` positive case, manual human WCAG 2.2 AA audit).
