# UX Decision — Tutor Calendar Dashboard (2026-11-05)

**Decision owner:** @Tanaboonnnnn (requested in conversation on 2026-11-05).
**Visual direction source:** @Chxtamos's detailed *Tutorix-inspired Calendar Dashboard*
change-request text, reproduced in the owner's accepted task instructions;
the screenshot itself is **not available as a verifiable GitHub artifact**.
**Review status:** owner-directed implementation candidate; **peer acceptance
of the replacement visual contract is pending this follow-up PR's review**.
**Baseline:** Part E PR #27 and Part F PR #28 (merged into `sprint1`
at `ed451be2ca3e366bdfc1900f4c4697aa7e50b6a0`).

## Superseded visual layout, retained domain contract

The previous *Tutor screen* used the approved Auth warm-neutral/pine palette
and a narrow create-form-first full-list layout. Replace **only the Tutor
presentation** with a navy/orange scheduling dashboard: a genuine sidebar,
account details, a 24-hour date timeline with three day columns at desktop,
read-only arbitrary-minute 60-minute Slot blocks, an inline create panel,
and a complete all-slots chronological agenda. At tablet widths reduce visible
day columns; on mobile show the all-slots agenda in place of the timeline.
All navigation is real. No fake Students, Revenue, Messages, Bookings,
notification counts, subjects, learners, reschedule or demo appointments.

**Not superseded:** the F-S1-01 Login/Auth appearance, trusted identity,
session handling, the F-S1-02 API and DB contract, immutable Slot semantics,
the Option A absence of working hours/advance-horizon/grid limitations,
UTC transport/Asia-Bangkok display, cross-midnight precision, full private
own-list, network-uncertainty reconciliation and stale-success protection.

## Ownership and display boundaries

- Only `GET /api/v1/tutor/slots` (full owner DTO list, no query) and
  `POST /api/v1/tutor/slots`; calendar navigation is in memory and never
  changes server-side selection. The agenda shows **every** returned Slot.
- Calendar day positions use **real minute offsets**, not 15/30/60-minute
  snapping. The hour grid marks time visually but imposes no creation rule.
  Days cover 00:00 through 24:00, with cross-midnight slices appearing on
  their respective dates.
- Summary numbers count real returned Slots only. The UI must label
  `Offered` as an opened time, **not** as a confirmed Customer Booking.
  Until Issue #16, occupancy is the existing safely derived `Unoccupied`.
- No new API parameters, endpoints, schema, booking, withdrawal, editing,
  deletion, bulk operation, recurrence, working-hours rule, or role selector.

## Accessibility and acceptance

The redesign must preserve visible labels and focus, keyboard-usable
navigation, semantic 44px targets for primary controls, contrast-tested
semantic colors, clear loading/empty/conflict/network/permission states,
safe role/owner transitions, and no overflow at 320/375/768/1280px.
Color is never the sole Slot status indicator. Reduced motion must not
hide focus or essential information. The 24-hour timeline is a *visual
projection*: every Slot remains readable in its accessible agenda row.

**UX-R1:** desktop navy sidebar, white canvas, orange accessible action,
real Tutor role/ID and no fictitious navigation or figures.
**UX-R2:** real Slot clock placement at arbitrary minutes (13:17, 13:59);
cross-midnight and all-day (24-hour) access without work-hour restrictions.
**UX-R3:** date navigation locally changes only the calendar; full own-list
agenda remains complete, ordered, and owner-private.
**UX-R4:** 320/375 mobile agenda; 768 adaptive layout; 1280 three-day
timeline; keyboard labels, contrast and no horizontal overflow.
**UX-R5:** unchanged secure create/CSRF/GET refresh, 409/422/503 recovery
and old-Tutor delayed-200 safety.
**UX-R6:** evidence must be from actual app, real PostgreSQL and Browser,
not a mock screenshot; include automatic checks and explicitly distinguish
human accessibility verification not performed.

**Approval gate:** the owner has selected this direction for development.
@Chxtamos must review the delta in this PR before this file and the amended
UI spec are considered an accepted replacement. Human WCAG/keyboard/contrast
signoff is a separate manual gate, not implied by passing Playwright.
