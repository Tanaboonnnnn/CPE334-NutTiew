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
| Source limitation | Final instructor Master/official Theme 1 allocation not verified (SRS OD-011/012); later D2/final exact submission instructions not independently verified in this Issue. Keep Issue #12 dates as planning checkpoints, not confirmed instructor submission formats. |
| Scope | Schedule, responsibilities, interdependencies, test/review outcomes, risks and fallback; **no app implementation, no simulated test pass, no direct edits to `main`/`sprint1`** |

**Baseline:** At planning time `sprint1` contains `AGENTS.md`, `README.md`, `docs/requirements.md`, `docs/srs.md`, `docs/features.md`, `docs/traceability.md`, and `docs/system-sds.md`; no application scaffold is established. A documentation merge is not a working app or a passing test. The team must build a genuine UI → API → durable DB journey in Sprint 1. The concrete stack in the System SDS is **proposed**, not installed/approved: React/Vite, Express/TypeScript/Node, PostgreSQL/Prisma. The Part E feature contracts must validate integration feasibility before writing code.

## 2. Sprint goals and non-negotiable scope

| Sprint | Product scope (stable IDs) | Objective accepted outcome | Planned verification / release |
|---|---|---|---|
| **S1 — D1** | **F-S1-01** Authentication; **F-S1-02** Tutor Slots; **F-S1-03** Availability; **F-S1-04** exclusive Booking; **F-S1-05** protected Booking/Tutor reads; **SYS-01** integrity, privacy, persistence and evidence | Real Customer/Tutor login, logout and current identity; backend role/record checks; future single 60-minute Tutor offers; customer discovery, eligible booking, durable own records; Q28 cross-Tutor overlap prevented; all three DB races and Bangkok clock boundary handled; UI/API/DB function end-to-end | VAL-001..014 (especially **Race A VAL-005, Race B VAL-010, Race C VAL-011**), VAL-030/031/034/036 as applicable; AC-S1-01..35 and VC/TEST-S1-01..39 (real PASS/FAIL/SKIP recorded only upon execution); review/merge PR `sprint1 → main`; D1 evidence and submission |
| **S2 — proposed D2** | **F-S2-01** Customer cancellation/reopen; **F-S2-02** single atomic cross-Tutor reschedule; **F-S2-03** Tutor cancellation/reason/occupied withdrawal; **F-S2-04** durable private in-app notice; **F-S2-05** unoccupied Slot withdrawal/history; SYS-01 S2 regression | Q07–Q27 and Q32 remain enforced; cancellation outcomes differ by actor; original Slot reopening, Booking ID preservation/one successful reschedule/history, private notices remain readable, withdrawn Slot ID is not reactivated | VAL-015..027, 020/022/023/024, 030/036 as relevant; synced cross-operation DB races; S2 Feature SDS/STS peer approved before coding, integrated D2 evidence |
| **S3 — proposed completion** | **F-S3-01** authorized Tutor Appointment Summary; SYS-01 cross-sprint quality, regression, release/deployment preparation | Upcoming Booked/Past Booked/Cancelled counts match owner-filtered lists and approved in-progress treatment; whole-product integration and security regression; no inferred Completed state | VAL-028/029, 031..036 as applicable; performance/keyboard thresholds only if OD-010 approved; reviewed final release. Docker/GCP/CI is a **future Lab 5+ plan**, not an assumed D1 delivery |

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
| F-S3-01 | F-S1-05, S2 lifecycle/history, OD-006/009 | Team to assign/peer review before S3 | VAL-028/029/036; own Tutor count/list equivalence, in-progress treatment documented |

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
| **9–15 Nov (proposed S2)** | Confirm Part E contracts/OD-013/014/015 for cancellation/reschedule/withdrawal; implement and verify S2 operations in dependency order | Correct transactional rollback, owner permissions, no unintended S1 regression |
| **16–22 Nov (proposed S2)** | Private notice and lifecycle cross-operation races, integration, usability/security regression | VAL-015..027 real results with acknowledged limitations |
| **23–29 Nov (D2)** | Sprint 2 release/evidence and **Sprint 3 progress artifact**: accepted summary spec/STS, prototype or verified incremental work if ready | D2 checkpoint **29 Nov**; exact instructor submission method must be confirmed; no false Sprint 3 completion |
| **30 Nov–6 Dec (proposed S3)** | Summary count/list, in-progress decision, privacy/authorization tests, refinements | VAL-028/029/036, owner scope and count/list consistency |
| **7–13 Dec (completion)** | Full regression, remaining approved hardening, accepted release/evidence | Completion checkpoint **13 Dec**; only accepted tests and releases may be reported |

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

For S2/S3 the corresponding features must have independently reviewed Part E contracts, authorized future policy choices, real transaction/negative/regression tests, completed and peer-reviewed integration/release, plus no regression of Sprint 1 invariants. Do not require Docker/GCP/CI as **already delivered at D1**; NFR-013 is a later Lab 5+ deployment/readiness responsibility requiring separate evidence.

## 6. Capacity, risks, gates and controlled fallback

**Two-person feasibility:** approximately five calendar days remain from 3 November to D1. No evidence yet establishes the complete app/toolchain. This is a **critical schedule risk**: both students must coordinate shared DB/contract decisions quickly and reserve time for real-DB concurrency testing, independent peer review and release. Planned parallel feature work is possible **only after interface/schema contracts are approved**; do not parallelize conflicting migrations or count one person's self-review as independent. Actual student availability and task-hour estimates have not been supplied, so a capacity commitment cannot be claimed. Assign daily owners and track remaining work/test results in Issue-level checklists and Kanban.

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
| Optional UI polish, benchmarks/accessibility thresholds not approved | Owner TBD / OD-010 | Defer nonessential polish and unapproved thresholds after mandatory S1 correctness and tested end-to-end flow; document what remains |

**Fallback hierarchy:** (1) resolve source/security/data blockers; (2) preserve mandatory S1 vertical journey, authorization, durable DB and Races A/B/C; (3) simplify nonessential UI layout and optional filters without weakening requirements; (4) move only S2/S3 **planning features or unapproved refinements** after explicit peer/team approval, recording the delta; (5) if mandatory S1 cannot pass by D1, report accurately as incomplete rather than ship misleading evidence. Deadline pressure never authorizes removing required features, waiving review or falsifying verification.

## 7. Coverage and approval checklist

- **S1 features:** F-S1-01..05 + SYS-01, all mandatory Sprint 1 acceptance/test IDs `AC-S1-01..35`, `VC/TEST-S1-01..39`, Q01/Q02/Q03/Q04/Q05/Q06/Q28/Q29/Q30 as applicable; planned VAL-001..014, VAL-030/031/034/036.
- **S2 proposed:** F-S2-01..05 and VAL-015..027, VAL-030/036; S1 authorization/time/atomicity regression; Q07..Q27/Q32 and relevant privacy rules.
- **S3 proposed:** F-S3-01 and VAL-028/029 plus system quality/regression (VAL-031..036 as applicable); Q30/Q31 and open OD-006.
- **System NFR:** NFR-001/002/003/004/005/006/007/008/011/012/014/015/016 mapped to relevant features/sprints; NFR-009/010 remain *proposed* OD-010 test criteria; NFR-013 maps to **Lab 5+**, not completed by D1.
- **Explicit remaining gates:** OD-001..015 tracked in SRS; Issue #12 planning review does not close them automatically, does not approve new product rules and does not certify instructor/Theme eligibility.
- **Approval:** The two students must review and accept this allocation as a plan. @Tanaboonnnnn supplies substantive peer review on the Issue #12 PR into `sprint1`; @Chxtamos cannot self-approve or self-merge. The actual accepted D1 code/release and test evidence belong to later feature/integration Issues, not this Part D document.

## 8. References

- [Issue #12 — Part D plan](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/12)
- [Whole-product SRS](../srs.md), especially §§3, 10, 13, 15
- [Sprint 1 requirements and AC/VC IDs](../requirements.md)
- [Feature inventory](../features.md) and [cross-sprint traceability](../traceability.md)
- [System SDS](../system-sds.md), especially §§1, 3, 5, 7–10
- [AGENTS.md](../../AGENTS.md): local issue branch, review, validation and acceptance gates