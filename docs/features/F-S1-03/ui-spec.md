# F-S1-03 — Customer Availability UI Specification (Part E)

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
