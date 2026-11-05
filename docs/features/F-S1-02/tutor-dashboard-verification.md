# Tutor Calendar Dashboard — UI follow-up verification

**Date:** 2026-11-05 (Asia/Bangkok).
**Baseline:** remote `sprint1` at `ed451be2ca3e366bdfc1900f4c4697aa7e50b6a0` (Part E PR #27 and approved/merged Part F PR #28).
**Branch:** `docs/issue-14-tutorix-ui-contract`.
**Scope:** owner-requested @Chxtamos Tutorix-inspired **NutTiew** Tutor Calendar redesign. The brand reference is inspiration only; no Tutorix logos/content used. This is a follow-up review of an **amended visual contract**, not a claim that the original Part E calendar was approved.
**UX authority:** [Dated owner decision / pending peer acceptance](ui-decision-2026-11-05.md), [UI Spec amendment](ui-spec.md), [STS UX-R1…UX-R6](tests.md).
**Test environment:** local Windows, Node 24, Microsoft Edge, dedicated local PostgreSQL 18 test database; not GCP/production.
**Commit/CI:** new follow-up PR HEAD and GitHub-hosted CI must be checked **after push**, not inferred from local commands.

## Authenticated real-data screenshots

Each image was captured by `e2e/tutor.dashboard.spec.ts` while authenticated as a test **Tutor**, with real PostgreSQL `User` and four actual **Offered** Slot rows. It uses the existing owner-only API, no mock Booking/Customer data. The files are stable, reviewable repository artifacts, not generated UI mockups.

| View | Real captured evidence | Coverage |
|---|---|---|
| Narrow mobile (320 CSS px) | [dashboard-320.png](evidence/dashboard-320.png) | Mobile navigation, agenda fallback, no horizontal overflow |
| Mobile (375 CSS px) | [dashboard-375.png](evidence/dashboard-375.png) | Forms, date picker and complete persisted agenda |
| Tablet (768 CSS px) | [dashboard-768.png](evidence/dashboard-768.png) | Two actual calendar date columns, day-step navigation |
| Desktop (1280 CSS px) | [dashboard-1280.png](evidence/dashboard-1280.png) | Navy sidebar, orange create action, three-column 24-hour timeline |
| Desktop after POST 201 | [dashboard-after-create-1280.png](evidence/dashboard-after-create-1280.png) | Genuine persisted 11:37–12:37 Slot visible in calendar **and** complete agenda |

The screenshots show **test fixture accounts only** (short role-derived account reference) and their genuine disposable database Slots. They must **not** be construed as stakeholder/product data.

## UX-R1…UX-R6: observable checks

| Requirement | Evidence and expected behavior | Status |
|---|---|---|
| UX-R1: Real shell and brand | NutTiew-only dashboard, trusted Tutor account from /auth/me, functional own-calendar/account/logout navigation, no fake students, revenue, bookings, notifications or reschedule actions | **PASS — Playwright** |
| UX-R2: 24h, any-minute, midnight | `13:17` produces top offset `797`; `13:59` produces `839`. A `23:30→00:30` real Slot renders on both adjacent dates; the calendar remains scrollable across all 24 hours | **PASS — Playwright** |
| UX-R3: Purely local calendar navigation | Next/Previous/Today/day picker do **not** issue date-filter query or re-request the server. All Slot IDs remain in full chronological agenda even when outside calendar viewport | **PASS — Playwright** |
| UX-R4: Responsive and keyboard | Browser at 320/375/768/1280px with no page horizontal overflow, mobile agenda fallback, 768px two-column calendar, 1280px three columns, primary button >=44px, mobile menu actions and keyboard activation of navigation | **PASS — automated checks**, see manual gate below |
| UX-R4: Measured contrast | Six computed browser foreground/background samples, including orange primary action and sidebar, meet **4.5:1 minimum**. Ratios: brand 14.09, sidebar nav 14.09, primary action 5.76, summary 6.12, day heading 10.90, agenda 11.99 | **PASS — sampled automated contrast**, not exhaustive WCAG |
| UX-R5: Truthful domain and failure states | Real PostgreSQL conflicting overlapping create returns 409 and preserves form values; empty own-list does not invent cards; 503 Logout does not falsely claim logout. Existing SLOT 503/abort/network recovery, old Tutor delayed authorized HTTP 200 privacy, future+60min preview are covered by original Slot E2E | **PASS — Playwright**, subject to latest full-suite result below |
| UX-R6: Real persisted creation and role isolation | 11:37 local Bangkok create is actually inserted into PostgreSQL, end-start exactly 60m, shown in both UI projections, still in agenda after reload; Customer never sees Tutor dashboard | **PASS — Playwright** |

The authoritative owner-slot response still has only `id`, `startsAt`, `endsAt`, `lifecycle`, `occupancy`; no backend route/schema/security edits were necessary. The calendar is a projection of the existing full GET; no API pagination, filtering or mutation was introduced.

**Repeat-run E2E isolation:** the existing Auth browser specs
(`e2e/auth.a11y.spec.ts`, `e2e/auth.matrix.spec.ts`, `e2e/auth.spec.ts`,
`e2e/auth.stale.spec.ts`) now use unique reserved documentation-only IPv6
client addresses per test with the existing *local E2E proxy-trust setup*.
This prevents unrelated, repeated browser runs against the same disposable
PostgreSQL database from exhausting each other's real Auth IP-rate buckets.
The manual `page.request.post` in the stale-response spec passes that same
test identity. **No production Auth limiter, session logic or proxy trust
configuration was changed.** These test-harness edits are separately
reviewable and are not a new business rule or a weakening of security.

## Command verification — executed on the follow-up Working Tree

| Command | Local result |
|---|---|
| `npm ci` and `npm run db:generate` | **PASS** during follow-up setup |
| `npm run db:migrate` | **PASS**, 2 migrations, no pending |
| `npm test` | **PASS 25/25**, 3 files |
| `npm run typecheck` | **PASS** API + web |
| `npm run build` | **PASS** API + Vite web |
| `npm run test:db` | **PASS 43/43**, 10 files, real PG and Race A both winner orders, full Auth and Slot behavior |
| `npm exec -- playwright test e2e/tutor.dashboard.spec.ts --reporter=line` | **PASS 10/10**, new UX suite with real DB |
| `npm run test:e2e -- --reporter=line` | **PASS 32/32**, existing Auth 15 + Slot 7 + new dashboard 10 |
| `git diff --check` | Run before committing/pushing and record outcome in the PR |

**Successful local test total: 25 Unit + 43 PostgreSQL Integration + 32 Edge = 100 tests.**
These are **local** results; hosted GitHub Actions for the new commit are separately verified by linked CI checks after opening the PR.

## Manual and downstream gates — NOT RUN / NOT claimed

- **Human WCAG/keyboard/contrast acceptance:** **NOT RUN**. Automated sampled contrast, focus/button tests and browser screenshots are not a substitute for a named human tester's WCAG/keyboard audit. Reviewer/owner should confirm visual behavior, zoom/screen readers and contrast of all remaining state combinations before final UX signoff.
- **Production/GCP schema/role/migration verification:** **NOT RUN** and outside this UI follow-up scope.
- **Combined post-INSERT/pre-COMMIT real API process failure:** **NOT RUN**; this is not a claim of application transaction durability beyond tests already executed in merged Part F.
- **Customer booking, reschedule, Tutor withdrawal and Sprint 2 features:** **NOT IMPLEMENTED** in this PR by design.
- **24/7 stakeholder or instructor policy signoff:** **NOT GRANTED**. Option A means this Sprint 1 feature adds no working-hours, maximum horizon or minute-grid constraint; it does **not** create a globally approved 24-hour operating policy.
- **Peer approval and Issue #14 final DoD:** **PENDING**. The owner directed this follow-up UI candidate, but @Chxtamos has to review this specific PR. Do not self-approve, self-merge or close Issue #14 based on automated tests.

## Review checklist

Verify the exact before/after contract in [ui-spec.md](ui-spec.md), inspect the five screenshots at full resolution, view the genuine Slot creation on a fresh local PostgreSQL setup, check the new dashboard tests **without skipping the original Auth/Slot suites**, and inspect GitHub Actions conclusions at the exact PR HEAD. Record any new visual approval or rejected proposal explicitly; historical Part E approval is not retroactive approval of this redesign.
