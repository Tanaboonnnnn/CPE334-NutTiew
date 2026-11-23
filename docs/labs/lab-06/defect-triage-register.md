# Lab 6 — NutTiew Sprint 1 UAT Findings & Defect Triage Register (`L6-04`)

**Status:** RELEASE-READY ON `sprint1` — Partner UAT Team `TH-056_P2` (`PEW-DIY`) completed both the 22 Nov baseline UAT (`6/6 PASS`) and the 23 Nov Security UAT follow-up (`6/6 PASS` + `EV-01`–`EV-13`), independently reproducing **`DEF-NT-TH038-01` (4/4 HTTP `503` on NUL-byte login email + `\u0001` control-char bypass of email regex)**. Current queue: **1 accepted Sprint 1 `Minor` defect** ([Issue `#139`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/139)) — **RED recorded (`dd5dd97`) -> GREEN verified (`d906698`, 3/3 CI) -> teammate approved (`@Chxtamos`) -> merged to `sprint1` (`3dc1758`, [PR `#140`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/140), `#108` CLOSED)**, **1 `Not-defect`** (`NT-OBS-01`), and **1 non-blocking `Enhancement`** (`NT-ENH-01`). Release `sprint1 -> main` ([PR `#142`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/142)), Cloud Run deployment (`#109`), and independent partner retest/final acceptance (`#110`) remain **`PENDING`**. Because a genuine, reproducible Sprint 1 defect drove `#108` / `#139`, the Lab 6 §3.5 fallback TA controlled defect exercise is **superseded**.
**Issue:** [#107 (`[Lab 6][L6-04]`)](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/107) | **Defect Issue:** [#139 (`DEF-NT-TH038-01`)](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/139) | **Fix PR (`#108` CLOSED):** [#140 (Merged to `sprint1` @ `3dc1758`)](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/140) | **Release PR (`#109`):** [#142 (`sprint1 -> main`, PENDING)](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/142) | **Baseline:** [uat-baseline.md](uat-baseline.md) (`#104`) | **UAT Cases:** [uat-cases-and-handoff.md](uat-cases-and-handoff.md) (`#105`)
**Role:** Product Team (`CPE334-NutTiew` — `@Tanaboonnnnn`, `@Chxtamos`)
**Partner UAT Team:** `TH-056_P2` (`PEW-DIY` — Peepipat Suesoongnuen, Phalat Amachayapha); original supplemental NUL-byte API lead reported by `TH-038 / chaproi` (23 Nov 2026) and independently reproduced 4/4 times by `TH-056_P2`.
**Scope:** Delivered Sprint 1 (`F-S1-01`..`F-S1-05`, `AC-S1-01`..`AC-S1-35`) only. **Out of scope:** Sprint 2/3 capabilities (cancellation, rescheduling, Tutor cancellation, Slot withdrawal, notifications, summary/reporting) and TokTickIT individual labs.

---

## 1. Pinned Release Under Test & Source Provenance

| Attribute | Verified Value | Provenance / Verification State |
| --- | --- | --- |
| **Product / Release Scope** | NutTiew — Delivered Sprint 1 (`F-S1-01`..`F-S1-05`) | `docs/requirements.md`, `docs/sprints/plan.md`, `docs/features/F-S1-01`..`F-S1-05` |
| **Pinned Production Commit** | `42bb76247b257a4d9eff402f2e6b60a2ba44eda4` (`origin/main`) | Verified in [uat-baseline.md](uat-baseline.md) (`#104`) |
| **CD-Confirmed Cloud Run Revision** | `nuttiew-00010-gug` (100% traffic at 21 Nov 2026 00:39 ICT) | [CD Run `44784128286`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/44784128286) — **serving revision & traffic split during the 22 Nov and 23 Nov test windows still await live operator Cloud Run confirmation** |
| **Public Deployed URL** | `https://nuttiew-nxe2keefba-as.a.run.app/` | Reached by partner UAT runs on 22 Nov and 23 Nov 2026 ICT |
| **Partner UAT Returns Received** | 1) 22 Nov 2026: `uat-cases-and-handoff.md` + 18 redacted PNGs (`evidence/nuttiew-uat-2026-11-22/`);<br>2) 23 Nov 2026: `nuttiew_security_uat_report.md` (held off-repo) + 13 PNGs (`EV-01`–`EV-13`, archived in `evidence/nuttiew-security-uat-2026-11-23/`) | 22 Nov return synced into [uat-cases-and-handoff.md](uat-cases-and-handoff.md) (PR `#137`); 23 Nov partner security report summarized in this triage register with `EV-01`–`EV-13` screenshots archived (not synced into `uat-cases-and-handoff.md` in PR `#141`) |
| **Supplemental Lead Source** | `TH-038 / chaproi` (23 Nov 2026, 3/3 `503` on NUL-byte login email, tracked in `#139`), independently reproduced 4/4 times by `TH-056_P2` (`EV-13`) | Both sources attributed distinctly; no misattribution |
| **Lab 6 Extended Due Date** | **26 November 2026** (confirm exact cutoff time on LEB2) | Recorded in Issue `#104` / `#107` |

---

## 2. Summary of Received Partner UAT Results (`UAT-NT-01`..`UAT-NT-06` & Security Follow-Up)

Partner UAT Team `TH-056_P2` executed all six Sprint 1 UAT cases on **22 Nov 2026 (19:47–20:30 ICT)** and completed a second, deeper **Security UAT & Defect Confirmation pass on 23 Nov 2026 (13:43–14:06 ICT & 17:56 ICT)** using the four verified synthetic accounts (`Tutor A/B`, `Customer A/B`). No passwords, session cookies, or CSRF tokens were exposed in either return.

| Case ID | Mapped Sprint 1 Scope | Partner Execution Windows (ICT) | Evidence Source & IDs | Observed Outcome | Findings / Defects |
| --- | --- | --- | --- | --- | --- |
| `UAT-NT-01` | `F-S1-01` (`AC-S1-01`, `AC-S1-02`), `F-S1-02` (`AC-S1-08`), `F-S1-03` (`AC-S1-15`), `F-S1-04` (`AC-S1-19`), `F-S1-05` (`AC-S1-30`, `AC-S1-32`) | 22 Nov 19:51 & 23 Nov 13:45–13:57 | `TH-056_P2` (`NT-E01`; [EV-02](evidence/nuttiew-security-uat-2026-11-23/EV-02-tutor-a-slot1-created.png), [EV-05](evidence/nuttiew-security-uat-2026-11-23/EV-05-customer-a-booking1-confirmed.png), [EV-06](evidence/nuttiew-security-uat-2026-11-23/EV-06-customer-a-booking1-detail.png), [EV-07](evidence/nuttiew-security-uat-2026-11-23/EV-07-tutor-a-pseudonymous-cust.png)) | **PASS** | 0 functional defects (1 doc observation: `NT-OBS-01`) |
| `UAT-NT-02` | `F-S1-02` (`AC-S1-09`, `AC-S1-10`, `AC-S1-12`) | 22 Nov 19:49 & 23 Nov 13:48–13:52 | `TH-056_P2` (`NT-E02`; [EV-03](evidence/nuttiew-security-uat-2026-11-23/EV-03-tutor-a-slot-overlap-409.png), [EV-04](evidence/nuttiew-security-uat-2026-11-23/EV-04-tutor-a-past-date-422.png)) | **PASS** | 0 |
| `UAT-NT-03` | `F-S1-01` (`AC-S1-03`, `AC-S1-04`, `AC-S1-05`, `AC-S1-06`, `OD-005-E`) | 22 Nov 19:47–20:30 & 23 Nov 13:43–13:56, 17:56 | `TH-056_P2` (`NT-E03`; [EV-01](evidence/nuttiew-security-uat-2026-11-23/EV-01-invalid-login-401.png), [EV-13](evidence/nuttiew-security-uat-2026-11-23/EV-13-login-nul-byte-503.png)) + `TH-038` lead | **PASS on scripted steps; FAIL on malformed NUL/control-char email boundary** | **1 Accepted Defect:** `DEF-NT-TH038-01` ([Issue `#139`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/139)) |
| `UAT-NT-04` | `F-S1-01` (`AC-S1-07`), `F-S1-03` (`AC-S1-16`), `F-S1-04` (`AC-S1-22`), `F-S1-05` (`AC-S1-31`, `AC-S1-33`) | 22 Nov 20:00–20:30 & 23 Nov 13:57–14:04 | `TH-056_P2` (`NT-E04`; [EV-08](evidence/nuttiew-security-uat-2026-11-23/EV-08-customer-b-availability-occupied-hidden.png), [EV-09](evidence/nuttiew-security-uat-2026-11-23/EV-09-customer-b-isolated-bookings.png), [EV-10](evidence/nuttiew-security-uat-2026-11-23/EV-10-customer-b-slot-unavailable-409.png), [EV-11](evidence/nuttiew-security-uat-2026-11-23/EV-11-customer-a-persistence-intact.png), [EV-12](evidence/nuttiew-security-uat-2026-11-23/EV-12-tutor-b-isolated-workspace.png)) | **PASS** | 0 functional defects (`NT-OBS-01` doc note) |
| `UAT-NT-05` | `F-S1-02` (`AC-S1-08`), `F-S1-05` (`AC-S1-30`, `AC-S1-32`; conditional `AC-S1-34`) | 22 Nov 20:00 & 23 Nov 14:01–14:05 | `TH-056_P2` (`NT-E05`; [EV-06](evidence/nuttiew-security-uat-2026-11-23/EV-06-customer-a-booking1-detail.png), [EV-11](evidence/nuttiew-security-uat-2026-11-23/EV-11-customer-a-persistence-intact.png)) | **PASS** *(conditional redeploy check `NOT RUN`; see 22 Nov evidence-limitation note in `uat-cases-and-handoff.md §5.1`)* | 0 functional defects (`NT-OBS-01` doc note) |
| `UAT-NT-06` | `F-S1-02` (`AC-S1-14`), `F-S1-03` (`AC-S1-18`) | 22 Nov 20:00 & 23 Nov 14:04–14:06 | `TH-056_P2` (`NT-E06`; [EV-06](evidence/nuttiew-security-uat-2026-11-23/EV-06-customer-a-booking1-detail.png), [EV-07](evidence/nuttiew-security-uat-2026-11-23/EV-07-tutor-a-pseudonymous-cust.png), [EV-11](evidence/nuttiew-security-uat-2026-11-23/EV-11-customer-a-persistence-intact.png)) | **PASS** *(see 22 Nov evidence-limitation note in `uat-cases-and-handoff.md §5.1`)* | 0 |
| **Extended Security Checks (23 Nov)** | Forged JSON body (`AC-S1-28`/`BOOK-09`), NUL byte on `slots`/`bookings`/`availability`, foreign `Origin`, post-logout cookie replay, HTTP security headers | 23 Nov 2026 ICT | `TH-056_P2` Security Audit Report (§2.5–§2.6) | Forged body (`400`), non-login NUL (`400`), foreign `Origin` (`403 ORIGIN_DENIED`), cookie replay (`401`) all **PASS** | **1 Enhancement:** `NT-ENH-01` (Security headers on `GET /` & `X-RateLimit-*`) |

**Aggregate counts (as of 23 Nov 2026 ICT):**
- Total scripted UAT cases executed: **6 / 6** (`UAT-NT-01`..`UAT-NT-06`) — **6 PASS** on scripted UI steps (conditional redeploy step in `UAT-NT-05` remains explicitly **`NOT RUN`**; persistence across Cloud Run revision restart was historically demonstrated by the Product Team in Lab 5 C-05 / PR `#102` against older commit `ff55ac7` / revisions `00006`–`00007` — a different release, supporting evidence only, not independent UAT of `42bb762`).
- Total findings/observations triaged: **3** (`DEF-NT-TH038-01`, `NT-OBS-01`, `NT-ENH-01`).
- Total accepted Sprint 1 application defects: **1** (`0 Critical`, `0 Major`, **`1 Minor`** — `DEF-NT-TH038-01`, RED -> GREEN verified and merged to `sprint1` in `#140`; `#108` CLOSED).
- Linked GitHub Defect Issues opened: **[#139](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/139)** ([PR `#140`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/140) approved & merged to `sprint1` @ `3dc1758`; release [PR `#142`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/142) pending).

---

## 3. Received Findings & Triage Register (Lab 6 §3.3)

Every finding or observation received from independent testing is recorded below with reproducible preconditions, contract verification, classification, user-impact severity, owner, and disposition.

| Finding ID | Reporter / Team | Affected Tested Revision | Linked UAT ID(s) | Sprint 1 FR / BR / AC Reference | Classification | Severity (User Impact) | Owner | Linked Defect Issue | Fix Status / Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **`DEF-NT-TH038-01`** | Initial API lead: `TH-038 / chaproi` (23 Nov, 3/3 `503`); independently reproduced 4/4 times by partner UAT Team `TH-056_P2` (`PEW-DIY`, 23 Nov 17:56 ICT) | `42bb76247b257a4d9eff402f2e6b60a2ba44eda4` / `nuttiew-00010-gug` (CD baseline; test-time serving confirmation pending) | `UAT-NT-03` (extended login input boundary) | `F-S1-01` (`AC-S1-03`, `OD-005-E` in `docs/features/F-S1-01/api-spec.md`) | **Accepted defect** *(contract violation: malformed NUL `\u0000` email returns `503` instead of `400 INVALID_INPUT`; `\u0001` control char bypasses email regex and returns `401`)* | **Minor** *(Product Team confirmed; reporter suggested Medium; no auth bypass, no PII/SQL leak, browser `<input type="email">` strips NUL, but raw JSON malformed input causes false `503` outage signal and wasted DB/rate-limit work)* | `@Tanaboonnnnn` (fix implementation `#139`/`#140`); `@Chxtamos` (triage & PR review) | **[#139](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/139)** ([PR `#140`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/140) merged to `sprint1` @ `3dc1758`) | **Merged to `sprint1` (`#108` CLOSED)** — RED (`dd5dd97`, CI `45158080628`) -> GREEN (`d906698`, CI `45182661724` 3/3) -> `@Chxtamos` approved -> merged `sprint1` (`3dc1758`); `sprint1 -> main` release ([PR `#142`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/142)), Cloud Run deploy (`#109`), and partner retest (`#110`) **PENDING** |
| `NT-OBS-01` | `TH-056_P2` (`PEW-DIY`: Peepipat Suesoongnuen, Phalat Amachayapha; per-case student attribution pending confirmation) | `42bb76247b257a4d9eff402f2e6b60a2ba44eda4` / `nuttiew-00010-gug` (CD baseline; test-time serving confirmation pending) | `UAT-NT-01`, `UAT-NT-04`, `UAT-NT-05` | `F-S1-01` (`AC-S1-07`), `F-S1-03` (`AC-S1-15`, `OD-AV-02`), `F-S1-05` (`AC-S1-30..33`, `F-S1-05/data-spec.md:50`, `F-S1-05/ui-spec.md:53,76`), `NFR-S1-08` | **Not-defect** *(app matches Sprint 1 contract; handoff doc clarified; cross-view human-readable Tutor name is a non-blocking **Enhancement** tracked under `OD-AV-02`)* | **N/A (Not-defect)** — zero functional failure, zero data loss, zero auth/privacy breach, zero blocking user impact | `@Chxtamos` (triage & handoff clarification); `@Tanaboonnnnn` (peer review) | None (not a true Sprint 1 application defect) | **Triaged internally (Not-defect; handoff doc clarified) — external partner notification & acknowledgment pending** |
| `NT-ENH-01` | `TH-056_P2` (`PEW-DIY`, 23 Nov Security Audit §2.6) | `42bb76247b257a4d9eff402f2e6b60a2ba44eda4` / `nuttiew-00010-gug` | Extended Security Audit (§2.6) | Outside Sprint 1 AC (`AC-S1-01`..`AC-S1-35`); backend rate limiting (`429 RATE_LIMITED`) already exists via `admit()` | **Enhancement** *(optional browser security headers on `GET /`: `CSP`, `X-Frame-Options`, `X-Content-Type-Options`, `HSTS`, `Referrer-Policy` and `X-RateLimit-*` response headers)* | **N/A (Enhancement — Non-blocking)** | Product Team backlog | None (non-blocking post-Sprint 1 hardening) | **Deferred (non-blocking)** — does not block Sprint 1 acceptance |

### 3.1 Detailed Reproduction & Root-Cause Verification — `DEF-NT-TH038-01` ([Issue `#139`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/139))

- **Finding Summary:**
  Sending raw JSON containing an ASCII NUL byte (`\u0000`) inside `email` to `POST /api/v1/auth/login` returns **HTTP `503 Service Unavailable` (`SERVICE_UNAVAILABLE`)** instead of **HTTP `400 Bad Request` (`INVALID_INPUT`)**. In `TH-056_P2`'s extended Probe #10, ASCII control character `\u0001` (`"a\u0001b@example.test"`) also bypassed email validation and queried the database, returning `401 LOGIN_FAILED` instead of `400 INVALID_INPUT`.
- **Reproducible Preconditions & Non-Secret Inputs:**
  - Same-origin `POST https://nuttiew-nxe2keefba-as.a.run.app/api/v1/auth/login` (`Content-Type: application/json`), no active session required.
  - Payloads:
    - Repro #1–#3: `{"email":"a\u0000b@example.test","password":"x"}`
    - Repro #4 (trailing NUL on valid account): `{"email":"tutor.demo@example.test\u0000","password":"x"}`
    - Extended Probe #10 (control char SOH): `{"email":"a\u0001b@example.test","password":"x"}`
    - Control Probe #9 (NUL in password): `{"email":"tutor.demo@example.test","password":"a\u0000b"}`
- **Expected vs. Actual (Contract Authority: `F-S1-01` / `OD-005-E`):**
  - **Expected:** Malformed `email` containing NUL/control characters rejected at input validation before DB/rate-limit work with **HTTP `400` (`INVALID_INPUT`)** and no `Set-Cookie`. Control Probe #9 (NUL in password) returns `401 LOGIN_FAILED`.
  - **Actual (Observed live 23 Nov 2026 17:56 ICT by `TH-056_P2`, 4/4 trials):**
    - Repro #1–#4 (`\u0000` in `email`): **HTTP `503 SERVICE_UNAVAILABLE`**, no `Set-Cookie` (`requestId`s: `9784585a-db3e-4ff2-82df-a27e5af4657e`, `cc9480c3-9271-40b1-b48e-a0ccde312735`, `ac236279-f0e1-4b71-96bc-46d2eabf8547`, `5aa92a28-a8f7-4607-9527-e32d877830a5`).
    - Extended Probe #10 (`\u0001` in `email`): **HTTP `401 LOGIN_FAILED`** (`requestId`: `ba2f660d-bfaf-4eec-9f91-e39f4a7c61ec`).
    - Control Probe #9 (`\u0000` in `password`): **HTTP `401 LOGIN_FAILED`** (`requestId`: `886edd9f-da43-4174-9aed-fc4406e32d3a`).
    - All other endpoints (`slots`, `bookings`, `availability`) rejected `\u0000`/`%00` with `400 INVALID_INPUT`.
- **Root Cause Verified on `origin/main` (`42bb762`):**
  - `apps/api/src/app.ts:39` validates `email` with `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`, which excludes whitespace and `@` but does **not** reject ASCII control characters (`[\u0000-\u001F\u007F]`).
  - `email` containing `\u0000` passes validation, enters `admit()`, and reaches `pool.query('SELECT "id","role","passwordHash","isActive" FROM "User" WHERE "email"=$1', [email])` (`app.ts:41`). PostgreSQL UTF-8 rejects `0x00` (`SQLSTATE 22021`), and the `catch` block (`app.ts:46`) maps all query exceptions to `503 SERVICE_UNAVAILABLE`.
- **Evidence:**
  - Partner screenshot: [EV-13-login-nul-byte-503.png](evidence/nuttiew-security-uat-2026-11-23/EV-13-login-nul-byte-503.png) (`TH-056_P2`, 23 Nov 2026) + `TH-038` initial report (`requestId`s logged in `#139`).
  - Automated RED -> GREEN trace in [PR `#140`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/140):
    - **RED (`dd5dd97`):** `AUTH-NUL-01` in `apps/api/test/auth.db.test.ts` failed on [CI Run `45158080628`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45158080628) (`111 pass / 1 fail / 0 skip`; expected `400`, received `503`).
    - **GREEN (`d906698`):** Minimum fix (`/\p{Cc}/u.test(email)` in `apps/api/src/app.ts:39`) turned the same unchanged test GREEN on [CI Run `45182661724`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45182661724) (**3/3 GREEN**, `112 pass / 0 fail / 0 skip`). Approved by `@Chxtamos` and merged to `sprint1` at `3dc1758` (`#108` CLOSED).
- **Triage Decision & Correction Status:**
  - Classified as **`Accepted defect` (`Minor`)** (Product Team agreed) and fixed under **`#108` / `#139` / PR `#140`** (`/\p{Cc}/u.test(email)` in `apps/api/src/app.ts:39`, rejecting all Unicode C0/C1 control characters before `admit()` and `pool.query()`, covering both `\u0000` and `\u0001` while preserving password handling).
  - **`sprint1 -> main` release ([PR `#142`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/142)), Cloud Run deployment (`#109`), and independent partner retest (`#110`) remain `PENDING`.**

### 3.2 Detailed Reproduction & Contract Verification — `NT-OBS-01`

- **Finding Summary (Received from `TH-056_P2` in returned `uat-cases-and-handoff.md` §5.1):**
  `Tutor A` appears with three different non-PII identifier formats across views: `#1cb1d623` in the Tutor workspace, the full opaque Tutor reference ending in `1cb1d623` in Customer Availability, and `TUTOR-0a340de8` in Customer **My Bookings** (`การจองของฉัน`) and its booking detail view. All three refer to the same `Tutor A` account, whereas the original handoff script wrote `Tutor A (#1cb1d623)` uniformly across `UAT-NT-01`, `UAT-NT-04`, and `UAT-NT-05`.
- **Expected vs. Actual (Verified Against Delivered Sprint 1 Contracts):**
  - `F-S1-01` (`AC-S1-07`) & `NFR-S1-08`: Require non-PII actor references (never raw Tutor/Customer email or private credentials).
  - `F-S1-03` (`docs/features/F-S1-03/verification-ledger.md`, `OD-AV-02`): Explicitly freezes opaque `tutorRef` UUID in Availability because `User.tutorDisplayName` is blocked pending Tutor opt-in consent, stakeholder publication sign-off, and a forward-only migration.
  - `F-S1-05` (`docs/features/F-S1-05/data-spec.md:50`, `api-spec.md:42,53,88`, `ui-spec.md:53,76`): Explicitly specifies `` `tutorRef`: Generated as `"TUTOR-" + row.tutorId.slice(0, 8)` `` for My Bookings list and detail views.
- **Evidence:**
  - Partner UAT screenshots: `NT-E01` ([nt01-customer-booking-detail.png](evidence/nuttiew-uat-2026-11-22/nt01-customer-booking-detail.png), [nt01-tutor-booked-row.png](evidence/nuttiew-uat-2026-11-22/nt01-tutor-booked-row.png)), [EV-06](evidence/nuttiew-security-uat-2026-11-23/EV-06-customer-a-booking1-detail.png), [EV-07](evidence/nuttiew-security-uat-2026-11-23/EV-07-tutor-a-pseudonymous-cust.png).
  - Product Team contract verification on `origin/main` (`42bb762`): `docs/features/F-S1-05/data-spec.md:50`, `docs/features/F-S1-05/ui-spec.md:53,76`, `docs/features/F-S1-03/verification-ledger.md` (`OD-AV-02`).
- **Triage Decision & Action Taken:**
  - Classified internally as **`Not-defect`**; updated `§1.2`, `UAT-NT-01`, `UAT-NT-04`, and `UAT-NT-05` in [uat-cases-and-handoff.md](uat-cases-and-handoff.md).
  - **External communication status (Lab 6 §3.3):** Outward notification of `NT-OBS-01` (`Not-defect`) and `NT-ENH-01` (`Enhancement`) plus `#139` fix tracking to `TH-056_P2` remains **PENDING** (§5 Gate #1).

---

## 4. Severity Policy, Release-Blocking Gate & Actual Correction Queue (Lab 6 §3.3 & §3.5)

| Category / Severity | Release Gate Policy (Lab 6 §3.3 & Issue `#107`) | Count | Action Required |
| --- | --- | --- | --- |
| **Accepted Defect — Critical** | **Release-blocking** — must be fixed, covered by RED/GREEN regression tests, peer-reviewed, deployed via CI/CD, and independently retested before acceptance | **0** | None |
| **Accepted Defect — Major** | **Release-blocking** — must be fixed, covered by RED/GREEN regression tests, peer-reviewed, deployed via CI/CD, and independently retested before acceptance | **0** | None |
| **Accepted Defect — Minor** | Must be fixed **or** explicitly approved by the UAT Team as a documented known limitation in the acceptance decision | **1** (`DEF-NT-TH038-01`) | **Selected for Fix** under [Issue `#139`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/139) / [PR `#140`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/140) (`#108` -> `#109` -> `#110` partner retest) |
| **Duplicate** | Link to original Defect Issue with rationale | **0** | None (`TH-056_P2`'s 23 Nov reproduction corroborates `DEF-NT-TH038-01` in `#139`) |
| **Not-defect** | Document contract rationale, reproduction evidence, and partner notification before closing (Lab 6 §3.3) | **1** (`NT-OBS-01`) | Internal triage & handoff doc clarification complete; **external partner notification & acknowledgment pending** (§5 Gate #1) |
| **Enhancement (Post-Sprint 1)** | Does **not** block Sprint 1; defer to post-Sprint 1 backlog | **1** (`NT-ENH-01`) *(plus `OD-AV-02` Tutor display name)* | Deferred (non-blocking) |

### 4.1 Actual Correction Queue & Lab 6 §3.5 Status

- **Active NutTiew Sprint 1 Correction Queue:**
  1. **[#139 (`DEF-NT-TH038-01`)](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/139)** — `Minor` accepted defect (`POST /api/v1/auth/login` NUL/control-char email returns `503`/`401` instead of `400 INVALID_INPUT`):
     - **RED (Recorded):** [PR `#140`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/140) commit `dd5dd97`, [CI Run `45158080628`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45158080628) (`111 pass / 1 fail / 0 skip`; expected `400`, received `503`).
     - **GREEN & Regression (`#108` CLOSED):** Verified in commit `d906698` (`/\p{Cc}/u.test(email)` in `apps/api/src/app.ts:39`), [CI Run `45182661724`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45182661724) (**3/3 GREEN**, `112 pass / 0 fail / 0 skip`).
     - **Teammate Review & `sprint1` Merge:** [PR `#140`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/140) approved by `@Chxtamos` and merged into `sprint1` at `3dc1758`.
     - **Release & CI/CD Deploy (`#109` — PENDING):** `sprint1 -> main` release [PR `#142`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/142) awaiting review/merge, Lab 5 CD deployment, and post-deploy smoke verification.
     - **Independent Retest & Acceptance (`#110` — PENDING):** Pending `TH-056_P2` retest on the deployed corrected revision (`400 INVALID_INPUT` 4/4 trials) and formal dated acceptance decision.
- **Lab 6 §3.5 Fallback Controlled Defect Exercise Status:** **SUPERSEDED / NOT REQUIRED** — a genuine, independently reproduced Sprint 1 defect (`#139`) now drives `#108`–`#110` without fabricating incidents.

---

## 5. Partner Communication & Open Verification Gates

| Open Gate | Owner | Current Verified State | Downstream Issue |
| --- | --- | --- | --- |
| **1. Outward notification & partner acknowledgment of triage dispositions (`#139` Accepted Minor, `NT-OBS-01` Not-defect, `NT-ENH-01` Enhancement) (Lab 6 §3.3)** | Product Team (`@Tanaboonnnnn`, `@Chxtamos`) -> Partner UAT Team `TH-056_P2` | **PENDING** — send formal triage summary & `#139` link to `TH-056_P2` and record partner acknowledgment | `#107` (`L6-04`) |
| **2. Partner student-tester attribution per case (`UAT-NT-01`..`UAT-NT-06`, `EV-01`–`EV-13`) & corroboration of 22 Nov `NT-05`/`NT-06` captures** | Partner UAT Team `TH-056_P2` (Peepipat Suesoongnuen, Phalat Amachayapha) | **PENDING** — 23 Nov Security UAT package supplies distinct `EV-01`–`EV-13` captures, but per-case named student attribution (`Peepipat` / `Phalat`) still awaits explicit confirmation | `#107` / `#110` |
| **3. Live Cloud Run serving revision & traffic-split confirmation for test windows** | Product Team (`@Tanaboonnnnn`, `@Chxtamos`) | **PENDING** — CD Run `44784128286` confirmed `nuttiew-00010-gug` at 100% traffic on 21 Nov 2026 00:39 ICT; serving revision during 22–23 Nov runs requires operator Cloud Run verification | `#107` / `#110` |
| **4. Release `sprint1 -> main`, Cloud Run deploy & independent retest of `#139` (`DEF-NT-TH038-01`)** | `@Tanaboonnnnn` (release review/deploy), `@Chxtamos` (release PR/smoke), `TH-056_P2` (retest) | **MERGED TO `sprint1` (`#108` CLOSED)** — RED (`dd5dd97`) -> GREEN (`d906698`, CI `45182661724`) -> `@Chxtamos` approved -> merged `sprint1` (`3dc1758`); `sprint1 -> main` ([PR `#142`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/142)), Cloud Run deploy, and partner retest **PENDING** | `#109`, `#110` |
| **5. Independent Sprint 1 acceptance decision, date & approving testers** | Partner UAT Team `TH-056_P2` | **UNRECORDED** — must be recorded on the corrected deployed revision after `#139` retest (`Accepted`, `Accepted with explicitly documented minor limitations`, or `Not Accepted`) | `#110` (`L6-07`) |
| **6. Teammate review of release status sync PR & release PR `#142`** | `@Tanaboonnnnn` | **PENDING PR REVIEW** | `#109` (`L6-06`) |

### Partner Communication Log (Non-Secret)

- **21 Nov 2026 (ICT):** PR `#112` (`#104` baseline) and PR `#113` (`#105` UAT cases & handoff) merged into `sprint1`; synthetic accounts `Tutor A/B` and `Customer A/B` confirmed active in Cloud SQL `nuttiew-pg` and credentials prepared for private handoff.
- **22 Nov 2026 (19:47–20:30 ICT):** Partner UAT Team `TH-056_P2` executed `UAT-NT-01`..`UAT-NT-06`, recorded 6/6 PASS (`NT-E01`..`NT-E06`), and returned `uat-cases-and-handoff.md` with `NT-OBS-01` plus 18 redacted screenshots (triaged and merged in PR `#137`).
- **23 Nov 2026 (12:12–17:56 ICT):** Supplemental API review (`TH-038 / chaproi`) reported `DEF-NT-TH038-01` (`503` on NUL-byte login email, 3/3); Product Team opened [Issue `#139`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/139) and Draft RED [PR `#140`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/140). Partner UAT Team `TH-056_P2` completed a follow-up Security UAT pass (`EV-01`–`EV-13`), independently confirming `UAT-NT-01`..`UAT-NT-06` (`6/6 PASS`), reproducing `DEF-NT-TH038-01` 4/4 times (`EV-13`), finding `\u0001` control-char regex bypass (Probe #10), and noting optional security-header hardening (`NT-ENH-01`).
- **23 Nov 2026 (ICT) — Triage, GREEN fix & `sprint1` merge:** PR `#141` archived `EV-01`–`EV-13` and updated this register (merged to `sprint1` @ `f844326`). PR `#140` added GREEN fix `d906698` (`/\p{Cc}/u.test(email)`), passed 3/3 CI (`45182661724`), was approved by `@Chxtamos`, and merged to `sprint1` (`3dc1758`; `#108` CLOSED). Release PR `#142` (`sprint1 -> main`) opened for `#109`. **Outward triage notification to `TH-056_P2`, Cloud Run deployment, partner retest, and final acceptance remain PENDING.**
