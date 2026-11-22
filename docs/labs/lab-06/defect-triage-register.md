# Lab 6 — NutTiew Sprint 1 UAT Findings & Defect Triage Register (`L6-04`)

**Status:** ACTIVE TRIAGE RECORD — Partner UAT execution observations received (22 Nov 2026 ICT); **0 accepted Sprint 1 code defects** and **1 non-blocking handoff-documentation observation (`NT-OBS-01`)** triaged and verified against the delivered Sprint 1 contracts. Awaiting `@Tanaboonnnnn` peer review, partner student-tester attribution & formal acceptance decision (`#110`), serving Cloud Run revision confirmation for the test window, and TA guidance for the Lab 6 §3.5 controlled defect exercise (`#108`).
**Issue:** [#107 (`[Lab 6][L6-04]`)](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/107) | **Baseline:** [uat-baseline.md](uat-baseline.md) (`#104`) | **UAT Cases & Partner Execution Record:** [uat-cases-and-handoff.md](uat-cases-and-handoff.md) (`#105`)
**Role:** Product Team (`CPE334-NutTiew` — `@Tanaboonnnnn`, `@Chxtamos`)
**Partner UAT Team:** `TH-056_P2` (`PEW-DIY` — Peepipat Suesoongnuen, Phalat Amachayapha)
**Scope:** Delivered Sprint 1 (`F-S1-01`..`F-S1-05`, `AC-S1-01`..`AC-S1-35`) only. **Out of scope:** Sprint 2/3 capabilities (cancellation, rescheduling, Tutor cancellation, Slot withdrawal, notifications, summary/reporting) and TokTickIT individual labs.

---

## 1. Pinned Release Under Test & Source Provenance

| Attribute | Verified Value | Provenance / Verification State |
| --- | --- | --- |
| **Product / Release Scope** | NutTiew — Delivered Sprint 1 (`F-S1-01`..`F-S1-05`) | `docs/requirements.md`, `docs/sprints/plan.md`, `docs/features/F-S1-01`..`F-S1-05` |
| **Pinned Production Commit** | `42bb76247b257a4d9eff402f2e6b60a2ba44eda4` (`origin/main`) | Verified in [uat-baseline.md](uat-baseline.md) (`#104`) |
| **CD-Confirmed Cloud Run Revision** | `nuttiew-00010-gug` (100% traffic at 21 Nov 2026 00:39 ICT) | [CD Run `44784128286`](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/44784128286) — **serving revision & traffic split during the 22 Nov 2026 19:47–20:30 ICT run still await live Cloud Run confirmation** |
| **Public Deployed URL** | `https://nuttiew-nxe2keefba-as.a.run.app/` | Reached by partner UAT runs on 22 Nov 2026 ICT |
| **Partner UAT Return Received** | Updated `uat-cases-and-handoff.md` (§4.1–§5.1) from `TH-056_P2` | Received 22 Nov 2026 ICT; synced into [uat-cases-and-handoff.md](uat-cases-and-handoff.md) |
| **Lab 6 Extended Due Date** | **26 November 2026** (confirm exact cutoff time on LEB2) | Recorded in Issue `#104` / `#107` |

---

## 2. Summary of Received Partner UAT Results (`UAT-NT-01`..`UAT-NT-06`)

Partner UAT Team `TH-056_P2` executed all six Sprint 1 UAT cases against the deployed public URL on **22 Nov 2026 (19:47–20:30 ICT)** using the four verified synthetic accounts (`Tutor A`, `Tutor B`, `Customer A`, `Customer B`). No passwords, session cookies, or CSRF tokens were exposed in the returned record.

| Case ID | Mapped Sprint 1 Scope | Partner Execution Window (ICT) | Evidence Source & ID | Observed Outcome | Defects Reported |
| --- | --- | --- | --- | --- | --- |
| `UAT-NT-01` | `F-S1-01`..`F-S1-05` (`AC-S1-01,03,07,08,15,19,30..33`) | 22 Nov 2026, 19:51:09–19:51:15 | `TH-056_P2` · Codex (`NT-E01`) | **PASS** | 0 functional defects (1 doc observation: `NT-OBS-01`) |
| `UAT-NT-02` | `F-S1-02` (`AC-S1-09,10,12`) | 22 Nov 2026, 19:49:55–19:49:58 | `TH-056_P2` · Codex (`NT-E02`) | **PASS** | 0 |
| `UAT-NT-03` | `F-S1-01` (`AC-S1-01,02,04,05,06`) | 22 Nov 2026, 19:47–20:00:27 (Codex), 20:30 (Gemini), Copilot (time unrecorded) | `TH-056_P2` · Codex, Copilot, Gemini (`NT-E03`) | **PASS** | 0 |
| `UAT-NT-04` | `F-S1-01,03,04,05` (`AC-S1-06,16,22,30..32`) | 22 Nov 2026, 20:00:40–20:00:45 (Codex), 20:30 (Gemini) | `TH-056_P2` · Codex, Gemini (`NT-E04`) | **PASS** | 0 functional defects (1 doc observation: `NT-OBS-01`) |
| `UAT-NT-05` | `F-S1-05` (`AC-S1-30,31,34`) | 22 Nov 2026, 20:00:19–20:00:23 | `TH-056_P2` · Codex (`NT-E05`) | **PASS** *(conditional redeploy check `NOT RUN`)* | 0 functional defects (1 doc observation: `NT-OBS-01`) |
| `UAT-NT-06` | `F-S1-02,03` (`AC-S1-14,18`) | 22 Nov 2026, 20:00:23–20:00:26 | `TH-056_P2` · Codex (`NT-E06`) | **PASS** | 0 |

**Aggregate counts (as of 22 Nov 2026 ICT):**
- Total UAT cases executed: **6 / 6** (`UAT-NT-01`..`UAT-NT-06`) — **6 PASS, 0 FAIL, 0 BLOCKED** (conditional redeploy step in `UAT-NT-05` recorded `NOT RUN`; persistence across Cloud Run revision restart was independently proven in Lab 5 C-05 / PR `#102`).
- Total partner observations received: **1** (`NT-OBS-01`).
- Total accepted Sprint 1 application defects: **0** (`0 Critical`, `0 Major`, `0 Minor`).
- Linked GitHub Defect Issues opened: **None** (per Lab 6 §3.3 & §3.5 and Issue `#107`, Defect Issues are opened **only** for true failures; no defects have been fabricated).

---

## 3. Received Findings & Triage Register (Lab 6 §3.3)

Every finding or observation received from the independent UAT Team is recorded below with reproducible preconditions, contract verification, classification, user-impact severity, owner, and disposition.

| Finding ID | Reporter / Team | Affected Tested Revision | Linked UAT ID(s) | Sprint 1 FR / BR / AC Reference | Classification | Severity (User Impact) | Owner | Linked Defect Issue | Fix Status / Disposition |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `NT-OBS-01` | `TH-056_P2` (`PEW-DIY`: Peepipat Suesoongnuen, Phalat Amachayapha; per-case student attribution pending confirmation) | `42bb76247b257a4d9eff402f2e6b60a2ba44eda4` / `nuttiew-00010-gug` (CD baseline; test-time serving confirmation pending) | `UAT-NT-01`, `UAT-NT-04`, `UAT-NT-05` | `F-S1-01` (`AC-S1-07`), `F-S1-03` (`AC-S1-15`, `OD-AV-02`), `F-S1-05` (`AC-S1-30..33`, `F-S1-05/data-spec.md:50`, `F-S1-05/ui-spec.md:53,76`), `NFR-S1-08` | **Not-defect** *(app matches Sprint 1 contract; handoff doc clarified; cross-view human-readable Tutor name is a non-blocking **Enhancement** tracked under `OD-AV-02`)* | **N/A (Not-defect)** — zero functional failure, zero data loss, zero auth/privacy breach, zero blocking user impact | `@Chxtamos` (triage & handoff clarification); `@Tanaboonnnnn` (peer review) | None (not a true Sprint 1 application defect) | **Closed (Not-defect)** — Handoff script clarified in [uat-cases-and-handoff.md](uat-cases-and-handoff.md); Sprint 1 app code unchanged |

### 3.1 Detailed Reproduction & Contract Verification — `NT-OBS-01`

- **Finding Summary (Received from `TH-056_P2` in returned `uat-cases-and-handoff.md` §5.1):**
  `Tutor A` appears with three different non-PII identifier formats across views: `#1cb1d623` in the Tutor workspace, the full opaque Tutor reference ending in `1cb1d623` in Customer Availability, and `TUTOR-0a340de8` in Customer **My Bookings** (`การจองของฉัน`) and its booking detail view. All three refer to the same `Tutor A` account, whereas the original handoff script wrote `Tutor A (#1cb1d623)` uniformly across `UAT-NT-01`, `UAT-NT-04`, and `UAT-NT-05`.
- **Reproducible Preconditions & Non-Secret Inputs:**
  - Deployed Sprint 1 release (`https://nuttiew-nxe2keefba-as.a.run.app/`, pinned `42bb76247b257a4d9eff402f2e6b60a2ba44eda4`).
  - Synthetic accounts `Tutor A (Primary)` (`tutor.demo@example.test`) and `Customer A (Primary)` (`customer.demo@example.test`), with `Slot_1` created by `Tutor A` and booked by `Customer A` (22 Dec 2026, 14:00–15:00 ICT).
- **Reproduction Steps:**
  1. Sign in as `Tutor A` and inspect the Tutor workspace header/actor badge -> displays `#1cb1d623` (last 8 characters of `Tutor A`'s UUID).
  2. Sign in as `Customer A` and open **Availability** -> displays the full opaque `tutorRef` UUID ending in `1cb1d623`.
  3. Book the slot, open **การจองของฉัน** (`My bookings`), and open the booking detail view -> displays `TUTOR-0a340de8`.
- **Expected vs. Actual (Verified Against Delivered Sprint 1 Contracts):**
  - **UAT handoff script expectation (original PR `#113`):** Stated `Tutor A (#1cb1d623)` for all three steps.
  - **Delivered Sprint 1 Contract Authority:**
    - `F-S1-01` (`AC-S1-07`) & `NFR-S1-08`: Require non-PII actor references (never raw Tutor/Customer email or private credentials).
    - `F-S1-03` (`docs/features/F-S1-03/verification-ledger.md`, `OD-AV-02`): Explicitly freezes opaque `tutorRef` UUID in Availability because `User.tutorDisplayName` is blocked pending Tutor opt-in consent, stakeholder publication sign-off, and a forward-only migration.
    - `F-S1-05` (`docs/features/F-S1-05/data-spec.md:50`, `api-spec.md:42,53,88`, `ui-spec.md:53,76`): Explicitly specifies `` `tutorRef`: Generated as `"TUTOR-" + row.tutorId.slice(0, 8)` `` for My Bookings list and detail views (`TUTOR-0a340de8` is the first 8 hex characters of `Tutor A`'s UUID, while `#1cb1d623` is the last 8 hex characters).
  - **Actual Behavior:** Live deployed UI matches every reviewed Sprint 1 contract verbatim and leaks zero PII.
- **Evidence:**
  - Partner UAT screenshots (redacted, archived in `docs/labs/lab-06/evidence/nuttiew-uat-2026-11-22/`): `NT-E01` ([nt01-customer-booking-detail.png](evidence/nuttiew-uat-2026-11-22/nt01-customer-booking-detail.png), [nt01-tutor-booked-row.png](evidence/nuttiew-uat-2026-11-22/nt01-tutor-booked-row.png)), `NT-E04`, `NT-E05`, and `TH-056_P2` §5.1 handoff observation note.
  - Product Team contract verification on `origin/main` (`42bb762`): `docs/features/F-S1-05/data-spec.md:50`, `docs/features/F-S1-05/ui-spec.md:53,76`, `docs/features/F-S1-03/verification-ledger.md` (`OD-AV-02`).
- **Triage Decision & Action Taken:**
  - Classified as **`Not-defect`** against the delivered Sprint 1 application (`42bb762` / `nuttiew-00010-gug`); **no code change** and **no GitHub Defect Issue** required.
  - **Documentation clarification applied immediately:** Updated `§1.2`, `UAT-NT-01`, `UAT-NT-04`, and `UAT-NT-05` in [uat-cases-and-handoff.md](uat-cases-and-handoff.md) to state the exact expected non-PII Tutor reference per view (`#1cb1d623` in Tutor workspace, full `tutorRef` ending in `1cb1d623` in Availability, and `TUTOR-0a340de8` in My Bookings / detail).
  - **Non-blocking future enhancement note:** Unifying Tutor display labels across views remains tracked under `OD-AV-02` (requires Tutor consent + Sprint 2/3 migration; does not block Sprint 1).

---

## 4. Severity Policy, Release-Blocking Gate & Actual Correction Queue (Lab 6 §3.3 & §3.5)

| Category / Severity | Release Gate Policy (Lab 6 §3.3 & Issue `#107`) | Count | Action Required |
| --- | --- | --- | --- |
| **Accepted Defect — Critical** | **Release-blocking** — must be fixed, covered by RED/GREEN regression tests, peer-reviewed, deployed via CI/CD, and independently retested before acceptance | **0** | None |
| **Accepted Defect — Major** | **Release-blocking** — must be fixed, covered by RED/GREEN regression tests, peer-reviewed, deployed via CI/CD, and independently retested before acceptance | **0** | None |
| **Accepted Defect — Minor** | Must be fixed **or** explicitly approved by the UAT Team as a documented known limitation in the acceptance decision | **0** | None |
| **Duplicate** | Link to original Defect Issue with rationale | **0** | None |
| **Not-defect** | Document contract rationale & reproduction evidence before closing | **1** (`NT-OBS-01`) | Closed; handoff doc clarified in [uat-cases-and-handoff.md](uat-cases-and-handoff.md) |
| **Enhancement (Sprint 2/3)** | Does **not** block Sprint 1; defer to Sprint 2/3 backlog | **0** formal requests *(cross-view Tutor display name already tracked under `OD-AV-02`)* | Deferred (non-blocking) |

### 4.1 Actual Correction Queue & Lab 6 §3.5 Controlled Defect Exercise Protocol

- **Current NutTiew Sprint 1 Correction Queue:** **EMPTY (`0` legitimate Sprint 1 application defects).**
- **Mandatory Lab 6 §3.5 Zero-Defect Rule (Gate for Issue `#108` / `L6-05`):**
  - Because independent UAT of NutTiew Sprint 1 (`UAT-NT-01`..`UAT-NT-06`) produced **zero legitimate application defects**, the Product Team **must not** fabricate a defect, invent a fake partner finding, or intentionally break the healthy deployed Sprint 1 release (`origin/main` @ `42bb76247b257a4d9eff402f2e6b60a2ba44eda4`, revision `nuttiew-00010-gug`).
  - Before beginning **Issue `#108` (`[Lab 6][L6-05] Demonstrate RED/GREEN regression correction`)**, the Product Team must request an **instructor/TA-approved controlled defect exercise** on an isolated branch (preserving the assessed Sprint 1 release), unless additional partner findings emerge during the scheduled **Mon 23 Nov 2026, 13:30 ICT** confirmation session with `TH-056_P2`.

---

## 5. Partner Communication & Open Verification Gates

| Open Gate | Owner | Current Verified State | Downstream Issue |
| --- | --- | --- | --- |
| **1. Partner student-tester attribution per case (`UAT-NT-01`..`UAT-NT-06`)** | Partner UAT Team `TH-056_P2` (Peepipat Suesoongnuen, Phalat Amachayapha) | **PENDING** — returned §4.1 lists team roster & tool evidence sources (`Codex`, `Gemini`, `Copilot`) and explicitly marks per-case student attribution as awaiting confirmation (scheduled session **Mon 23 Nov 2026, 13:30 ICT**) | `#107` / `#110` |
| **2. Live Cloud Run serving revision & traffic-split confirmation for test window** | Product Team (`@Tanaboonnnnn`, `@Chxtamos`) | **PENDING** — CD Run `44784128286` confirmed `nuttiew-00010-gug` at 100% traffic on 21 Nov 2026 00:39 ICT; serving revision during 22 Nov 19:47–20:30 ICT requires operator Cloud Run verification | `#107` / `#110` |
| **3. Independent Sprint 1 acceptance decision, date & approving testers** | Partner UAT Team `TH-056_P2` | **UNRECORDED** — see [uat-cases-and-handoff.md §4.3](uat-cases-and-handoff.md#43-independent-acceptance-record); must record one of `Accepted`, `Accepted with explicitly documented minor limitations`, or `Not Accepted` | `#110` (`L6-07`) |
| **4. Instructor/TA approval for Lab 6 §3.5 controlled defect exercise (if 0 defects remain after 23 Nov session)** | Product Team + Course TA/Instructor | **PENDING** — required before `#108` (`L6-05`) if no genuine Sprint 1 defect is reported | `#108` (`L6-05`), `#109` (`L6-06`) |
| **5. Teammate review of this triage register & handoff update** | `@Tanaboonnnnn` | **PENDING PR REVIEW** | `#107` (`L6-04`) |

### Partner Communication Log (Non-Secret)

- **21 Nov 2026 (ICT):** PR `#112` (`#104` baseline) and PR `#113` (`#105` UAT cases & handoff) merged into `sprint1`; synthetic accounts `Tutor A/B` and `Customer A/B` confirmed active in Cloud SQL `nuttiew-pg` and credentials prepared for private handoff.
- **22 Nov 2026 (19:47–20:30 ICT):** Partner UAT Team `TH-056_P2` executed `UAT-NT-01`..`UAT-NT-06` against `https://nuttiew-nxe2keefba-as.a.run.app/`, verified all four synthetic UI sign-ins, recorded 6/6 PASS observations (`NT-E01`..`NT-E06`), and returned the populated `uat-cases-and-handoff.md` with handoff documentation observation `NT-OBS-01`.
- **22 Nov 2026 (ICT):** Product Team (`@Chxtamos`) logged and verified `NT-OBS-01` against Sprint 1 contracts (`F-S1-01`, `F-S1-03` `OD-AV-02`, `F-S1-05/data-spec.md:50`), classified it as `Not-defect`, clarified [uat-cases-and-handoff.md](uat-cases-and-handoff.md), and recorded the 0-defect register + Lab 6 §3.5 TA-controlled-exercise gate for `@Tanaboonnnnn` review and the **Mon 23 Nov 2026, 13:30 ICT** partner confirmation session.
