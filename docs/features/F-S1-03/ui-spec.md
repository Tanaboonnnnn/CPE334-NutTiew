# F-S1-03 — Customer Availability UI Specification (Part E)

> **Proposed Part E contract only; no UI implementation/browser test.** See [Feature SDS](specification.md), [API](api-spec.md), [Data](data-spec.md), [STS](tests.md). Peer review and display-policy acceptance are required before Part F.

## 1. Screen and visual direction

Screen: **ช่วงเวลาติวที่พร้อมให้เลือก** — authenticated Customer availability discovery.

This is a focused scheduling utility, not a marketing or Tutor Dashboard page. Proposed Customer visual direction reuses the approved NutTiew Auth language:

- Warm neutral canvas #F6F4EF, white surface #FFFFFF, graphite text #262B28, muted text #4F5853, restrained pine accent #285C4B, visible boundary #77877B and visible focus.
- Thai/English font stack: Noto Sans Thai, Sarabun, system-ui, sans-serif.
- The navy/orange F-S1-02 Calendar Dashboard is scoped to Tutor screens; do not copy it into Customer UI without a separate decision.
- No gradients, glassmorphism, hero banners, fake tutor profiles, testimonials, ratings, prices, message panels, decorative emoji or card-in-card layouts.

## 2. Screen anatomy

1. Small text-only NutTiew wordmark.
2. Heading: เลือกช่วงเวลาติว.
3. Helper: appointment times are displayed in Asia/Bangkok.
4. Optional ตรวจสอบล่าสุด timestamp from response meta.evaluatedAt.
5. Chronological offers grouped by Bangkok calendar date.
6. Each offer shows a stable non-sensitive Tutor reference, Bangkok date, 24-hour start/end and a เลือกช่วงเวลานี้ action.
7. Selected-offer summary may show Tutor reference/time and must state that selection **is not a Booking**.

Selecting an offer stores slotId in transient UI state only. It does not POST, reserve, occupy or confirm a Booking. The later #16 flow owns confirmation and must revalidate the selected Slot on the server.

### Display policy OD-AV-01

**Proposed default: bookable-only for the authenticated Customer.** Show only offers the API evaluated as bookable at meta.evaluatedAt, including the absence of an overlapping Active Booking owned by that Customer. This follows the proposal in requirements.md §14.2 but remains pending owner confirmation and peer review.

If rejected, the alternative is to show future Offered Slots with a generic ไม่พร้อมให้จอง state. Never distinguish Occupied from Too soon, reveal a Customer/Booking ID/reason, or allow selecting an unavailable offer. Do not mix policies.

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
- Primary controls target at least 44×44 CSS px as a design proposal. Verify contrast, focus, zoom and 320 CSS px reflow in Part F.
- NFR-S1-09 is proposed; this specification does not claim WCAG 2.2 AA conformance.

## 5. Responsive behavior

| Viewport | Proposed layout |
|---|---|
| 320/375 CSS px | Single-column list, 16px side gutters, no horizontal overflow |
| 768 CSS px | Readable constrained list; no unnecessary calendar grid |
| 1280 CSS px | Centered readable column; rows may place metadata/action in two columns |

Preserve the same chronological offer set and field visibility at every viewport. Do not crop offers or hide Tutor/time on mobile.

## 6. Privacy and content rules

Show only the opaque Tutor reference and Slot date/time. The server-side overlap check may use the authenticated Customer ID but must not reveal whether a matching Active Booking exists, which Tutor owns it, or any Booking/Customer details. Do not show/fetch Customer identity, emails/phones, Booking IDs/reasons, Tutor email, credentials/session fields or full private Tutor schedule. No fake names, subjects, ratings, prices, locations, images or availability. No Booking confirmed/Booked/Reserved state in #15.

## 7. Acceptance mapping

| Criterion | UI requirement |
|---|---|
| AC-S1-15 | Selectable Tutor reference and Bangkok start/end |
| AC-S1-16 | Occupied/inside-cutoff offers and offers overlapping this Customer's Active Booking are not bookable; generic unavailable state only if alternate policy accepted |
| AC-S1-17 | Selection is not reservation; #16 revalidates and UI shows non-success |
| AC-S1-18 | Asia/Bangkok rendering independent of device timezone |

Part F must capture real DB-backed browser evidence at 320/375/768/1280 CSS px and test keyboard selection, loading/empty/error/retry, 401/403, session switch, timezone and stale #16 response. None has been run in Part E.
