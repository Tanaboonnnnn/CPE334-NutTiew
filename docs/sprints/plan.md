# NutTiew — Three-Sprint Delivery Plan and Sprint 1 Acceptance Boundary

> **Status: PROPOSED — Issue #12 / Deliverable 1 Part D.** This plan is not a record of feature completion, executed tests, instructor authorization, or accepted release. The team must peer-review dates, capacity and Sprint 2/3 allocations. Product rules Q01–Q32 are controlled by [SRS](../srs.md); Sprint 1 identities by [requirements](../requirements.md); assignments by [Feature Inventory](../features.md), [traceability](../traceability.md), and architecture by [System SDS](../system-sds.md).

## 1. Document control, authority, scope

| Item | Plan |
|---|---|
| Issue | [#12 — D1-04 Part D](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/12) |
| Owner / peer reviewer | @Chxtamos / @Tanaboonnnnn (independent human review) |
| Product / people | NutTiew one-to-one tutoring appointments; two students |
| Integration / release | Issue `docs/*` or `feature/*` branch → reviewed PR into `sprint1` → separate reviewed release PR into `main` |
| Mandatory Sprint 1 checkpoint | **D1: 8 November 2026, 23:59 Asia/Bangkok** |
| Later checkpoints stated by Issue #12 | **D2: 29 November 2026** (Sprint 2 and evidence of Sprint 3 progress); **completion: 13 December 2026** (Sprint 3) |
| Source limitation | Reviewer-cited Group Work Specification v1, Deliverable 2 v1 and Final Delivery v1 inform these Lab, D2 and final checkpoints. The authoritative final Master and official Theme allocation remain unverified (OD-011/012). |
| Scope | Schedule, responsibilities, interdependencies, test/review outcomes, risks and fallback; **no app implementation, no simulated test pass, no direct edits to `main`/`sprint1`** |

**Baseline:** At planning time `sprint1` contains `AGENTS.md`, `README.md`, `docs/requirements.md`, `docs/srs.md`, `docs/features.md`, `docs/traceability.md`, and `docs/system-sds.md`; no application scaffold is established. A documentation merge is not a working app or a passing test. The team must build a genuine UI → API → durable DB journey in Sprint 1. The concrete stack in the System SDS is **proposed**, not installed/approved: React/Vite, Express/TypeScript/Node, PostgreSQL/Prisma. The Part E feature contracts must validate integration feasibility before writing code.

## 2. Sprint goals and non-negotiable scope

| Sprint | Product scope (stable IDs) | Objective accepted outcome | Planned verification / release |
|---|---|---|---|
| **S1 — D1** | **F-S1-01** Authentication; **F-S1-02** Tutor Slots; **F-S1-03** Availability; **F-S1-04** exclusive Booking; **F-S1-05** protected Booking/Tutor reads; **SYS-01** integrity, privacy, persistence and evidence | Real Customer/Tutor login, logout and current identity; backend role/record checks; future single 60-minute Tutor offers; customer discovery, eligible booking, durable own records; Q28 cross-Tutor overlap prevented; all three DB races and Bangkok clock boundary handled; UI/API/DB function end-to-end | VAL-001..014 (especially **Race A VAL-005, Race B VAL-010, Race C VAL-011**), VAL-030/031/034/036 as applicable; AC-S1-01..35 and VC/TEST-S1-01..39 (real PASS/FAIL/SKIP recorded only upon execution); review/merge PR `sprint1 → main`; D1 evidence and submission |
| **S2 - proposed D2 with Lab 5-7** | **F-S2-01** cancellation/reopen, **F-S2-02** single reschedule/history, **F-S2-03** Tutor cancellation, **F-S2-04** private notice, **F-S2-05** Slot withdrawal, and SYS-01 regression | Q07-Q27/Q32, ownership and atomic persistence must work in tested candidate | S2 VAL-015..027 and cross-operation race evidence, peer-reviewed SDS/STS before code; Lab 5-7 evidence; D2 integrated reviewed main/GCP release also includes one implemented/tested S3 workflow |
| **S3 - tested D2 increment and final completion** | **F-S3-01** Tutor-authorized summary; minimum one real DB-backed count/list rule by D2; remaining approved refinements before final | By D2 actual Tutor-only count/list and authorization in UI/API/DB, then remaining categories/regression by 13 Dec | Implemented AND tested S3 rule (VAL-028/029/036), same owner/time count/list parity, CI and deployed main candidate; Lab 5 Docker/GCP/CI after D1, not an D1 deliverable |

**Mandatory S1 boundary cannot be traded away:** real credentials/session; own roles and record-level checks; exactly 60-minute Slot publishing; Customer availability; Booking with 60-minute cutoff and exclusive real-DB guarantees; Customer/Tutor private reads; persistence across refresh/restart; denied invalid/past/occupied/overlap requests; authenticated end-to-end UI/API/DB; negative and synchronized real-DB tests for Race A/B/C; accepted release on `main`. Demo-only mocks, memory-only records, UI-only blocking, a PR without a release, or tests described but not run do **not** satisfy this scope.

## 3. Feature dependencies, owners and verification handoffs

**Ownership plan:** Owner is accountable for getting a change reviewed and verifiable, not sole author of all code. @Chxtamos leads Part D and existing Issues #13/#15/#17; @Tanaboonnnnn leads existing Issues #14/#16/#18. The team coordinates shared architecture and migrations; no Issue assignment changes are made by this plan. These are **planning assignments requiring team agreement**, not a reassignment of existing GitHub Issues. The author of each PR must have the **other human teammate** review. Any actual feature-Issue owner/reviewer already assigned by GitHub prevails until explicitly updated.

| Work package | Depends on | Proposed accountable driver / independent reviewer | Exit evidence (not yet executed) |
|---|---|---|---|
| A / B / C baseline | Issue #9 SRS, #10 Feature Inventory, #11 System SDS | Issue-specific existing assignees; both check consistency | Document references and reviewed PRs integrated in `sprint1`; technical choices and OD gates still identified |
| Shared project scaffold + database (SYS-01) | reviewed SD-01..12 / OD-005; environment and schema/migration decisions | @Tanaboonnnnn / @Chxtamos | Runnable reproducible local install, migrations/seed and data persistence; secrets excluded |
| F-S1-01 (#13) | System SDS; own **Feature SDS + UI/API/data contracts + STS reviewed before code** | @Chxtamos / @Tanaboonnnnn (existing Issue owner/reviewer) | VAL-001/002/034/036; actual login/logout/role/session tests |
| F-S1-02 (#14) | F-S1-01; same Part E contract gate; DB exclusion constraint strategy | @Tanaboonnnnn / @Chxtamos (existing Issue owner/reviewer) | VAL-003..005; real-DB overlapping offer Race A and negative cases |
| F-S1-03 (#15) | F-S1-02, authenticated API; OD-004 safe availability fields | @Chxtamos / @Tanaboonnnnn (existing Issue owner/reviewer) | VAL-006/009/036; stale/too-soon/occupied privacy-safe responses |
| F-S1-04 (#16) | F-S1-01/02/03; DB uniqueness/exclusion/trigger and OD-005/013 guards | @Tanaboonnnnn / @Chxtamos (existing Issue owner/reviewer) | VAL-007..011/014/030; Race B/C, Q05 wait crossing and rollback/duplicate safety |
| F-S1-05 (#17) | F-S1-01/04; approved response allowlist | @Chxtamos / @Tanaboonnnnn (existing Issue owner/reviewer) | VAL-012/013/031/036; own Customer/Tutor reads and persistence |
| F-S2-01/02 | F-S1-04/05; S2 Part E contracts and Q07–Q16; OD-013 | Team to assign/peer review before S2 | VAL-015..020, 030; correct cancelled/reopened or one-history reschedule state |
| F-S2-03/04/05 | F-S1-02/04; cancellation/notice/withdrawal integrity; OD-008/014/015 | Team to assign/peer review before S2 | VAL-021..027, 036 and Booking-vs-withdraw / reschedule-vs-Tutor-cancel race |
| F-S3-01 - tested D2 minimum | F-S1-05/Booked data; OD-006/009, S2 lifecycle for later Cancelled category | @Chxtamos implementation/test driver and @Tanaboonnnnn independent reviewer, proposed | By 25 Nov implement Tutor-only **Past Booked count plus matching list** via real UI/API/DB; same Tutor/time snapshot and status Booked, deny anonymous/Customer/foreign Tutor. Real DB fixtures, VAL-028/029/036 commands/results/SHA, include in D2 deployed main candidate; prototype/spec alone does not count |

**Contract-before-code sequence for each Feature:** source SRS FR/BR/NFR + accepted AC/Q → versioned Feature SDS (`specification.md`, applicable `ui-spec.md`/`api-spec.md`, data/transaction contract) → STS (`tests.md`, named failing/negative cases, evidence criteria) → *independent PR review* → feature code + tests → actual build/unit/API/DB/E2E results → reviewed feature PR to `sprint1`. A stub file or unreviewed spec does not open the implementation gate. SYS-01's migration/locking/Q05 design requires independent real PostgreSQL proof before Booking claims completion.

## 4. Sequence, checkpoints and integration strategy

Dates below are **planning allocations**, not claims that tasks were performed or promises of completion. Work is highly compressed: use checkpoints as stop/go decisions and escalate capacity risk, not as permission to skip mandatory acceptance.

| Date/window (ICT) | Planned step | Exit / escalation |
|---|---|---|
| **3 Nov** | Review merged Parts A/B/C, approve feasibility/pending OD-005, author/review Part D; list per-feature Issues/contracts; test local Node/Postgres compatibility | Traceability/stack gaps owned; if local DB unavailable, escalate immediately rather than marking setup done |
| **4 Nov** | Review System SDS security/schema details and Part E specs/STS for F-S1-01 and F-S1-02; prepare scaffold/migration/seed, auth/slot test fixtures | Contracts reviewed **before code**, migration applies on clean local test DB, no secrets |
| **5 Nov** | Complete auth and Tutor Slot vertical slice; real DB and Race A; prepare F-S1-03/04 contract reviews | Negative role/overlap tests with actual committed state; ownership and Q05 blocking issues escalated |
| **6 Nov** | Availability + Booking implementation, Q05 guard, Race B/C, fail/duplicate handling, protected reads contract/code | Real DB barriers and persisted rows, no second success; any unproven constraint is a release blocker |
| **7 Nov** | End-to-end UI/API/DB journeys, security/private read checks, restart durability, real test evidence; review feature PRs then integrate `sprint1` | All S1 AC/VC mapped to observed pass/fail/skip; blockers fixed, never silently waived |
| **8 Nov before 23:59** | Issue #18 (@Tanaboonnnnn owner / @Chxtamos reviewer) independent integration review, separately reviewed `sprint1 → main` release, versioned evidence/submission package: whole-product Parts A–D, per-feature Part E SDS/STS, Part F source/test logs and release SHA, and required D1 PDF/report per authoritative course instructions | Only claim D1 acceptance if main contains the working slice and actual tests/review/release evidence; instructor/Theme gates remain explicit |
| **9-11 Nov - S2 and Lab 5 setup** | Both review S2 feature SDS/STS before code. @Tanaboonnnnn leads Docker/GCP/Cloud SQL/secrets; @Chxtamos leads CI and S1 regression planning | Reviewed contracts, migration/seed setup and CI plan; reserve **at least 50% of combined planned capacity** for Lab 5 to 15 Nov; available hours remain unknown |
| **12-15 Nov - Lab 5 due 15 Nov** | Both: Docker, CI/CD, GCP Cloud Run with durable Cloud SQL; @Tanaboonnnnn deployment driver and @Chxtamos test/peer-review driver | Version/commit/image SHA, CI run URL/status, GCP URL/version, secret checks, post-deploy auth/Booking and DB restart persistence evidence. Lab 5 due 15 Nov, after D1 but mandatory for D2 |
| **16-19 Nov - S2 and Lab 6 setup** | Both implement reviewed F-S2-01..05 in dependency order; @Chxtamos prepares cross-team UAT scenarios/defect log and @Tanaboonnnnn deployed candidate/fixes | S2 VAL-015..027/DB race and rollback proof as ready; reserve **at least one-third of combined planned capacity** for Lab 6/UAT/retests |
| **20-22 Nov - Lab 6 due 22 Nov** | Both run cross-team UAT; @Chxtamos coordinates scenario/evidence/defect log, @Tanaboonnnnn triages repairs and re-tests | Dated UAT outcomes, defect IDs/severity/owners, linked repair PRs and re-test results; feed residual defects into D2 regression |
| **23-25 Nov - Sprint 3 working increment** | @Chxtamos gets F-S3-01 SDS/STS peer-reviewed BEFORE coding, implements Tutor-only **DB-backed Past Booked count and matching list** through UI/API. @Tanaboonnnnn independently reviews | **By 25 Nov** one meaningful **implemented AND tested** S3 rule; DB fixtures, owner-scoped identical time/count/list semantics, deny wrong roles/foreign Tutor, VAL-028/029/036 evidence and commit SHA; spec/prototype alone fails |
| **26-28 Nov - Lab 7 and D2 candidate** | @Tanaboonnnnn Lab 7 maintenance/metrics + GCP deployment driver; @Chxtamos S1/S2/S3 regression and self-contained D2 PDF driver. Review sprint1-to-main release PR, include Lab 6 fixes | **By 28 Nov target:** tagged/versioned **main** candidate deployed GCP via Lab 5 CI/CD, successful observed run/status, SHA, GCP URL/version, post-deploy DB persistence, S1/S2 regressions and tested S3 rule, authorization, Lab 7 metrics/maintenance evidence, D2 PDF draft |
| **29 Nov - D2 and Lab 7 due** | Both verify release and submit **self-contained D2 PDF via LEB2** as cited in Deliverable 2 v1; @Tanaboonnnnn validates deployed runtime and @Chxtamos PDF/evidence/receipt | D2 requires integrated **main/GCP release candidate** with CI, tested S1+S2 and one **implemented/tested S3 rule**, post-deploy persistence/regression, Lab 5/6/7 and UAT re-test proofs. Missing gate = NOT MET |
| **30 Nov - pre-exam buffer** | Both stabilize approved refinements and prepare final PDF/storyboard and two-member demo video script; @Chxtamos report/video lead and @Tanaboonnnnn release lead | Tested S3 D2 slice remains functioning; final reporting and video responsibilities drafted before exams |
| **1-11 Dec - final exams** | Protect exam time; no core S3 implementation scheduled, only low-risk defect retests and documentation/video capture | Escalate unresolved mandatory items; do not silently postpone/claim complete |
| **12-13 Dec - final due 13 Dec** | Both verify final accepted release and submit **Final PDF plus demo video with both students explaining** per reviewer-cited Final Delivery v1 | Verified source SHA/tests, final self-contained PDF, two-person video and submission receipt; confirm latest instructor version |

**Integration cadence:** no feature PR before its reviewed contracts; PRs are independently reviewed (no self-approval), and only accepted feature branches land on `sprint1`. After final S1 verification, open a separate `sprint1 → main` release PR and review it. Avoid simultaneous merge conflicts by naming file/feature ownership and sequencing schema migrations before dependent services. GitHub Project #6 advances `Backlog → Specified → Started → PR Review → Fixing → Done` based on verified work, not calendar dates.

## 5. Definition of Done and objective evidence

| Gate | S1 acceptance and measured evidence | Outcome if absent |
|---|---|---|
| Source/contract | Part A/B/C references and applicable **peer-reviewed Part E SDS/STS before implementation**, including stable IDs | Contract/implementation gate **BLOCKED** |
| Working path | Customer/Tutor UI → authenticated API → durable relational DB, real login/logout/current identity and persisted own records after restart | **NOT DONE** if mock/in-memory/UI-only |
| Domain | Exactly 60-minute Slots, no same-Tutor active overlap; valid/invalid/occupied/too-soon cutoffs; one Active Booking per Slot; no cross-Tutor Customer overlap | **NOT DONE** if invariant unproven |
| Security | Backend role + record authorization, sanitized error/data allowlists, credentials hashed, no secrets committed | **NOT DONE** on unauthorized read/write |
| Race / rollback | Synchronized *real DB* Races A/B/C, Q05 post-wait boundary, rejected writes and injected rollback, final committed rows inspected | **NOT DONE** if HTTP-only/mock-only |
| Tests | VAL-001..014 and S1-applicable VAL-030/031/034/036; AC-S1-01..35 / VC/TEST-S1-01..39 have actual command, setup, SHA and PASS/FAIL/SKIP records | No manufactured PASS; unresolved required FAIL/NOT RUN blocks release |
| Integration / delivery | Peer-reviewed feature PRs into `sprint1`; independently reviewed `sprint1 → main` PR; release SHA and D1 artifact/evidence by deadline | Staging/PR alone **does not count as accepted release** |

**D2 acceptance gate (after D1):** Peer-reviewed Part E SDS/STS must precede all S2/S3 code. By 29 Nov produce tested S1+S2 AND at least one **implemented/tested S3** rule in a reviewed integrated **main** release candidate deployed on **GCP via Lab 5 CI/CD**. Record version/tag, SHA, CI run/status, GCP URL/version, post-deploy DB persistence, S1/S2/S3 regression and authorization/negative tests. Lab 6 UAT defects/re-tests and Lab 7 maintenance/metrics feed this evidence. Submit a self-contained **D2 PDF via LEB2**. By 13 Dec provide final PDF and demo video with BOTH students explaining; reserve exams 1-11 Dec. Do not claim these plans are executed tests or deployments; not required at D1.

## 6. Capacity, risks, gates and controlled fallback

**Two-person feasibility:** D1 leaves roughly five calendar days from 3 Nov; after D1, Lab 5/6/7 overlap with mandatory S2 and at least one tested S3 rule before D2. Allocate approximately half of combined planned capacity to Lab 5 through 15 Nov, one-third to Lab 6 through 22 Nov, prioritize Lab 7/main/GCP/PDF on 26-29 Nov and prepare final artifacts before 1-11 Dec exams. Actual student hours are UNKNOWN; these fractions are planning safeguards, not capacity proof. Both students peer-review opposite authored PRs. If core correctness/review/release gates fail, explicitly report NOT MET instead of silently reducing mandatory scope.

| Risk / open gate | Owner / checkpoint | Containment and defensible fallback |
|---|---|---|
| **OD-011/012:** final instructor Master and formal Theme eligibility unverified | @Tanaboonnnnn obtains instructor/TA evidence; @Chxtamos compares before formal D1 sign-off | Present drafts as provisional, record source/version/delta; **do not** assert instructor sign-off |
| **OD-005:** proposed stack, session, DB triggers/locking and Q05 post-contention proof not yet accepted/executed | @Tanaboonnnnn design lead + @Chxtamos review, before Part E implementation | Probe real DB early; choose reviewed simpler implementation only if it still proves Race A/B/C and Q05; **never** remove DB integrity checks |
| **OD-001..004:** Tutor hours/horizon/grid, availability safe fields unresolved | Product decision owner/team before F-S1-02/03 final contracts | Implement only confirmed constraints; defer optional filtering and non-approved input restrictions, not mandatory Slot/browse outcomes |
| **OD-013:** duplicate/unknown-response Booking retry contract | F-S1-04 owner with peer review before Booking SDS/STS sign-off | Preserve at-most-one and reconcile with authorized own reads while token/replay protocol remains explicitly proposed; don't claim exactly-once response |
| **OD-006/008/009/014/015:** in-progress summary, retention, reporting snapshot, meaningful reason, prior-Tutor privacy | Relevant S2/S3 feature owner and stakeholder/team before affected contract | Mark blocking decisions and do not invent product rules; no unauthorized historical visibility |
| Missing local DB/toolchain or incompatible Postgres extension/ORM migration | Shared SYS-01 owner, setup checkpoint | Prioritize reproducible dev DB and constraints, temporarily replace an unworkable ORM detail **via reviewed design delta**, not with memory-only or unguarded writes |
| Late failed Race A/B/C, Q05, auth, persistence, or release checks | Both people, S1 test/release gates | Stop false acceptance, record FAIL/NOT RUN and remediate smallest cause; escalate deadline impact. **Do not quietly cut mandatory S1 feature** |
| Reviewer unavailable/merge queue and limited two-person capacity | Each PR author requests other teammate promptly; daily check-in | Keep PRs small, parallelize independent reviewable contracts, capture unresolved blockers; no self-approve or skip release PR |
| Missing Lab 5/6/7 evidence, UAT re-tests, or D2 main/GCP candidate | @Tanaboonnnnn deployment and Lab 5/7, @Chxtamos Lab 6/UAT/regression | Reserve Lab capacity and capture exact failed gates; no false D2 deployment or passed-test claims |
| Missing implemented/tested S3 rule or exam capacity | @Chxtamos S3/API and PDF/video, @Tanaboonnnnn peer reviewer/release | Deliver narrow DB-backed Tutor count/list by 25 Nov; defer only optional polishing, prep final report/video before exams |
| Optional UI polish, benchmarks/accessibility thresholds not approved | Owner TBD / OD-010 | Defer nonessential polish and unapproved thresholds after mandatory S1 correctness and tested end-to-end flow; document what remains |

**Fallback hierarchy:** (1) resolve source/data/security blockers; (2) protect mandatory S1 real UI/API/durable DB and Race A/B/C; (3) protect D2 tested S2 features, one implemented/tested S3 rule, Lab 5-7 and deployed main/GCP candidate; (4) simplify ONLY optional UI polish/refinements with peer/team approval; (5) if a required checkpoint fails, state NOT MET and preserve failing evidence rather than asserting acceptance.

## 7. Coverage and approval checklist

- **S1 features:** F-S1-01..05 + SYS-01, all mandatory Sprint 1 acceptance/test IDs `AC-S1-01..35`, `VC/TEST-S1-01..39`, Q01/Q02/Q03/Q04/Q05/Q06/Q28/Q29/Q30 as applicable; planned VAL-001..014, VAL-030/031/034/036.
- **S2 proposed:** F-S2-01..05 and VAL-015..027, VAL-030/036; S1 authorization/time/atomicity regression; Q07..Q27/Q32 and relevant privacy rules.
- **S3 proposed:** F-S3-01 **minimum implemented/tested Tutor DB-backed count/list by D2 29 Nov** with **VAL-028**, **VAL-029**, **VAL-036**; remaining approved refinements/full regression by final. Q30/Q31 and OD-006 remain controlled.
- **System NFR:** NFR-001..008/011/012/014/015/016 mapped to sprint features; NFR-009/010 proposed OD-010 thresholds, not approved. NFR-013 requires **Lab 5 Docker/CI/GCP by 15 Nov** and a **main/GCP deployed candidate by D2 29 Nov**, NOT by D1; Lab 6 UAT/retests due 22 Nov and Lab 7 maintenance/metrics due 29 Nov. D2 PDF via LEB2, final PDF and both-student demo video due 13 Dec according to reviewer-cited v1 handouts.
- **Explicit remaining gates:** OD-001..015 tracked in SRS; Issue #12 planning review does not close them automatically, does not approve new product rules and does not certify instructor/Theme eligibility.
- **Approval:** The two students must review and accept this allocation as a plan. @Tanaboonnnnn supplies substantive peer review on the Issue #12 PR into `sprint1`; @Chxtamos cannot self-approve or self-merge. The actual accepted D1 code/release and test evidence belong to later feature/integration Issues, not this Part D document.

## 8. References

- [Issue #12 — Part D plan](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/12)
- [Whole-product SRS](../srs.md), especially §§3, 10, 13, 15
- [Sprint 1 requirements and AC/VC IDs](../requirements.md)
- [Feature inventory](../features.md) and [cross-sprint traceability](../traceability.md)
- [System SDS](../system-sds.md), especially §§1, 3, 5, 7–10
- [AGENTS.md](../../AGENTS.md): local issue branch, review, validation and acceptance gates

**PR #24 source provenance:** This revision follows reviewer citations of group_work_specs_v1.pdf section 4, project_deliverable_2_v1.pdf sections 2/3.3/3.5, and project_final_delivery_v1.pdf. The complete handouts were not independently opened for this edit; final instructor Master and Theme sign-off remain open (OD-011/012).
