# Lab 6 — NutTiew Sprint 1 UAT Submission Index & Evidence Map (`L6-08` / `#111`)

**Status:** PUBLIC-SAFE SUBMISSION INDEX — Controlled 13-page self-contained PDF (`Lab6_CPE334_NutTiew_Parts_A_D.pdf`) assembled locally for LEB2 upload (**kept outside public Git** because it contains both students' IDs per Issue `#111` privacy rules). Awaiting teammate PDF review, LEB2 upload by **26 Nov 2026** (confirm exact cutoff time on LEB2), and upload confirmation before closing `#111`.
**Issue:** [#111 (`[Lab 6][L6-08]`)](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/111) | **Prerequisites (All CLOSED):** `#104`, `#105`, `#106`, `#107`, `#108`, `#109`, `#110`
**Team:** NutTiew (`@Tanaboonnnnn`, `@Chxtamos`) | **Partner Team:** `TH-056_P2` (`PEW-DIY` — Peepipat Suesoongnuen, Phalat Amachayapha / `L0u1sss`)
**Scope:** Delivered Sprint 1 (`F-S1-01`..`F-S1-05`, `AC-S1-01`..`AC-S1-35`) only. **Out of scope:** Sprint 2/3 capabilities and TokTickIT individual labs.

---

## 1. Self-Contained PDF Contents & Rubric Alignment (`A20 / B25 / C20 / D35`)

| Part / Rubric | Controlled PDF Pages | Graded Scope Covered | Linked Issues / PRs | Authoritative Repo Sources & Evidence IDs |
| --- | --- | --- | --- | --- |
| **Cover & TOC** | `pp. 1–2` | Team/Theme/URLs, controlled Student IDs (PDF only), Sprint 1 scope, release lineage summary, rubric & page-range contents table | `#111` | `main@42bb762` → `main@f94dce99`, Cloud Run `nuttiew-00012-nob` |
| **Part A (20%)** | `pp. 3–5` | Pinned Sprint 1 baseline, safe handoff & non-secret synthetic accounts, full executable UAT cases (`UAT-NT-01`..`06`), Sprint 1 AC traceability | `#104` (PR `#112`), `#105` (PR `#113`) | [uat-baseline.md](uat-baseline.md), [uat-cases-and-handoff.md](uat-cases-and-handoff.md) |
| **Part B (25%)** | `pp. 6–9` | B.1 Outgoing UAT on partner `PEW-DIY` (`UAT-01`..`08`); B.2–B.3 Incoming UAT on `NutTiew` (22 Nov & 23 Nov) with embedded readable screenshots `EV-01`, `02`, `03`, `04`, `06`, `07`, `10`, `12`, `13` | `#106` (PR `#138`), `#107` (PR `#137`, `#141`) | [pew-diy-independent-uat.md](pew-diy-independent-uat.md), `evidence/nuttiew-uat-2026-11-22/`, `evidence/nuttiew-security-uat-2026-11-23/` |
| **Part C (20%)** | `p. 10` | Incoming triage register (`DEF-NT-TH038-01` Accepted Minor → `#139`, `NT-OBS-01` Not-defect, `NT-ENH-01` Enhancement) + outgoing `PEW-UAT05-UX-01` (Minor UX Known Limitation) | `#107` (PR `#137`, `#141`), `#139` | [defect-triage-register.md](defect-triage-register.md), [Issue `#139`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/139) |
| **Part D (35%)** | `pp. 11–12` | Release lineage table, `AUTH-NUL-01` excerpt & `apps/api/src/app.ts:39` diff, real RED → GREEN counts, human PR reviews, CD deploy `45212589215` (`nuttiew-00012-nob`), live smoke, partner retest (`RT-01`–`RT-04`), two-way Sprint 1 acceptance decisions | `#108` (PR `#140`), `#109` (PR `#142`, `#143`), `#110` | [PR `#140`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/140), [PR `#142`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/142), [CD Run `45212589215`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45212589215), [Issue `#110`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/110) |
| **Appendix** | `p. 13` | Both team members' verified contributions, AI-use declaration, honest known limitations, LEB2 upload checklist | `#111` | This index + GitHub audit trail |

---

## 2. Verified Release Lineage & Post-Deploy Evidence Summary (`#108` / `#109` / `#110`)

| Stage | Branch / PR | Commit SHA | CI / CD Run | Verified Outcome |
| --- | --- | --- | --- | --- |
| **Assessed Baseline** | `main` (PR `#103`) | `42bb7624` | [CD `44784128286`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/44784128286) | `nuttiew-00010-gug` (`100%` traffic) — defective for `#139` (`503` on NUL-byte login email) |
| **RED Regression** | `feature/139-auth-nul-input` (PR `#140`) | `dd5dd973` | [CI `45158080628`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45158080628) | `AUTH-NUL-01` failed as expected (`111 pass / 1 fail / 0 skip`: expected `400`, got `503`) |
| **GREEN Fix** | `feature/139-auth-nul-input` (PR `#140`) | `d9066982` | [CI `45182661724`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45182661724) | `apps/api/src/app.ts:39` (`/\p{Cc}/u.test(email)`) — **3/3 PASS** (`112/112` DB, `36/36` unit, Edge E2E) |
| **Staging Merge** | `sprint1` (PR `#140`, `#143`) | `3dc17584` → `102c51b` | [CI `45202348141`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45202348141) | `@Chxtamos` approved PR `#140`; `#108` CLOSED; PR `#143` synced triage status |
| **Release Merge** | `main` (PR `#142`) | `f94dce99` | [CI `45204901005`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45204901005) | `@Tanaboonnnnn` approved & merged `sprint1 → main` (**3/3 PASS**) |
| **Production CD** | `main` (`workflow_dispatch`) | `f94dce99` | [CD `45212589215`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45212589215) | `@Chxtamos` approved `demo` env → **`nuttiew-00012-nob`** (`100%` traffic, `sha256:851b688a4796f5e340ac92dcf7e28877e5a1098198f4c18001b75feceb38673a`) |

**Live Post-Deploy Smoke Checks on `https://nuttiew-nxe2keefba-as.a.run.app/` (`nuttiew-00012-nob`, 23 Nov 2026 23:16 ICT):**
- `GET /api/ready` → `200 {"status":"ready"}`
- `POST /api/v1/auth/login` (`a\u0000b@example.test`, `tutor.demo@example.test\u0000`, `a\u0001b@example.test`) → `400`, `Set-Cookie=''` (**FIXED** from `503` / `401`)
- `POST /api/v1/auth/login` (password `a\u0000b`) → `401`, `Set-Cookie=''` (preserved)
- `GET /api/v1/auth/me` (anonymous) → `401`

---

## 3. Final Two-Way Sprint 1 Acceptance Decisions (`#110`, 24 Nov 2026 ICT)

- **PEW-DIY (`TH-056_P2`) → NutTiew Sprint 1:** **Accepted** (Peepipat Suesoongnuen & `L0u1sss`, on `main@f94dce99` / `nuttiew-00012-nob`, CD `45212589215`; `RT-01`–`RT-03` evidenced, `RT-04` reported `PASS` at 24 Nov 00:24 ICT with transparent qualification that the partner's attached 400 screenshot showed the empty-body control case while NutTiew's `AUTH-NUL-01` CI and live smoke corroborate the fix separately).
- **NutTiew → PEW-DIY Sprint 1:** **Accepted with Minor limitations** (`@Tanaboonnnnn` & `@Chxtamos`, on `b03c9043533a6dc1f8a6fb958983ddb0da9529c7` / `pewdiy-uat-00002-bnt` & restart `00003-8c5`; explicitly accepting `PEW-UAT05-UX-01` generic out-of-stock checkout message while core invariants pass; owner API captures `EV-UAT06/07-API-01` cited as corroboration only).

---

## 4. Privacy & Remaining Human Submission Gates

- **Privacy hygiene:** Private Student IDs exist **only** in the locally generated controlled PDF (`Lab6_CPE334_NutTiew_Parts_A_D.pdf`, kept untracked outside Git). Zero passwords, session cookies, CSRF tokens, or private keys appear in this repository or in the PDF.
- **Remaining human actions before closing `#111` (and `#139`):**
  1. Both students review the local controlled PDF (`Lab6_CPE334_NutTiew_Parts_A_D.pdf`) and verify exact legal name/ID details on p. 1.
  2. Upload the PDF via **LEB2** by **26 Nov 2026** (confirm exact cutoff time on LEB2) and record the upload confirmation on Issue `#111`.
  3. Confirm repository variable `DEPLOY_ENABLED` is reset to `false` after CD Run `45212589215`.
