# Lab 6 / #104 — NutTiew Sprint 1 UAT baseline and partner arrangement

**Status:** IN PROGRESS — version and read-only service checks recorded; partner agreement and authenticated independent UAT are **not** complete.
**Evidence checked:** 21 November 2026 (Asia/Bangkok).
**Issue:** [#104](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/104) | **Project:** [#6](https://github.com/users/Tanaboonnnnn/projects/6)
**Deadline:** **26 November 2026**, as extended by the instructor per the team; the updated **submission time** must be confirmed on LEB2. The original Lab 6 handout says 22 November.

## 1. Assessment contract and scope lock

Lab 6 §§1–3.1 assesses **only the delivered and agreed Sprint 1 behavior**. The two-member NutTiew team must act both as the Product Team (other team tests NutTiew) and as the UAT Team (NutTiew tests the other team's release). Neither team may self-certify its own product.

**Contract authority:** [Sprint 1 requirements](../../requirements.md) (FR-S1-01..19, BR-S1-01..22, NFR-S1-01..12, AC-S1-01..35), [requirements traceability](../../traceability.md), [feature inventory](../../features.md), and versioned [F-S1-01..05](../../features/) SDS/STS contracts. Relevant stakeholder decisions include Q01–Q06 and Q28–Q30. The Lab 6 handout takes precedence for the UAT activity. Do not infer any new business rule or instructor approval.

| Delivered feature | Sprint 1 UAT contract to exercise | Representative acceptance IDs |
| --- | --- | --- |
| F-S1-01 — Authentication/session | Existing Customer/Tutor sign-in, identity, logout, anonymous/role/owner protection | AC-S1-01..07 |
| F-S1-02 — Tutor slots | Authorized Tutor creates their own 60-minute future Slot; rejects overlap/invalid time; preserves correct schedule | AC-S1-08..14 |
| F-S1-03 — Customer availability | Customer sees eligible offers without another Customer's private Booking; stale/too-soon offers are not bookable | AC-S1-15..18 |
| F-S1-04 — Booking | Exclusive persisted Booking; 60-minute backend cutoff, same-Slot/customer overlaps and concurrency enforcement | AC-S1-19..29, AC-S1-35 |
| F-S1-05 — Protected retrieval | Own Customer Booking list/detail; Tutor's authorized schedule; refresh/persistence, Booked vs Past | AC-S1-30..34 |

This table is a **handoff scope map**, not a claim that each AC passed today's live test. For cross-feature and detailed VC/TEST mapping consult [traceability](../../traceability.md) and the individual STS files.

**Out of UAT acceptance scope:** Sprint 2/3 cancellation, rescheduling, Tutor cancellation, Slot withdrawal, notifications, appointment summary/reporting and any unfinished later-sprint workflows. Presence of later code on the same deployed service does not make it an assessed Sprint 1 requirement.

## 2. Pinned production release: observed evidence vs. remaining verification

| Evidence item | Grounded value / status |
| --- | --- |
| Repository | [Tanaboonnnnn/CPE334-NutTiew](https://github.com/Tanaboonnnnn/CPE334-NutTiew) |
| Current fetched remote integration head | `origin/sprint1` @ `41b310c83573e672be8c4189607380d56e598291` |
| Latest fetched released main head | `origin/main` @ `42bb76247b257a4d9eff402f2e6b60a2ba44eda4` |
| Human-reviewed release PR | [#103](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/103), approved by @Chxtamos, merged into `main` as `42bb762`; it promoted Lab 5 evidence without new application code |
| Git release tag | None returned by `git ls-remote --tags origin` during this check. Use the full immutable release commit, not a guessed tag |
| Public application URL | **https://nuttiew-nxe2keefba-as.a.run.app/** |
| GCP location and service | Cloud Run service `nuttiew`, `asia-southeast1` |
| Last verified CD run | [#44784128286](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/44784128286), completed **success** for exactly `42bb76247b257a4d9eff402f2e6b60a2ba44eda4` |
| Cloud Run revision from CD log | `nuttiew-00010-gug`: log verified **Ready**, matching immutable image digest and **100% production traffic** at 2026-11-20 17:39 UTC (2026-11-21 00:39 ICT) |
| Runtime image digest in that release | `sha256:4eea6f2d543db1ffa7c0a46bb42625dd4420e0a596c92628f64fdac2668b537b` |
| Persistent DB | Cloud SQL PostgreSQL `nuttiew-pg`, with earlier authenticated persistence evidence in [Lab 5 C-05](../lab-05/c05-persistence-evidence.md); a read-only database readiness query succeeded in this session |

**Revision caveat:** `nuttiew-00010-gug` is the **last CD-log-confirmed production revision**, *not* a fresh Cloud Run Console/service-describe read at the moment the partner begins UAT. GitHub's CD success is not proof that nobody changed traffic manually afterward. Reconfirm the serving revision/100% traffic and release digest from Cloud Run **read-only** immediately before partner testing; record that new observation with its timestamp. No live GCP configuration or SQL mutation is authorized by this note.

### 2.1 Live read-only smoke (21 Nov 2026 ICT)

All requests used the real public production URL from the user's connected computer, without a session/cookie or test-user credentials.

| Request | Actual HTTP response | Interpretation |
| --- | --- | --- |
| `GET /` | **200**, Thai NutTiew sign-in HTML | Public UI origin reachable |
| `GET /api/ready` | **200** `{"status":"ready"}` | API reachable; `apps/api/src/app.ts` executes `SELECT 1` against runtime PostgreSQL pool for this readiness response |
| `GET /api/v1/auth/me` (anonymous) | **401** | Protected current identity not exposed anonymously |
| `GET /api/v1/tutor/slots` (anonymous) | **401** | Protected Tutor Slot data denied |
| `GET /api/v1/customer/availability` (anonymous) | **401** | Availability requires login |
| `GET /api/v1/customer/bookings` (anonymous) | **401** | Private Customer Booking data denied |

**Limit:** These checks prove UI reachability, API readiness including a DB `SELECT 1`, and anonymous guards. They **do not** prove a fresh authenticated Tutor → Slot → Customer Booking → Customer/Tutor retrieval journey on revision `00010-gug`. The earlier [Lab 5 C-04 live workflow](../lab-05/c04-production-evidence.md) and [C-05 persistence proof](../lab-05/c05-persistence-evidence.md) were run against older released code/revisions (notably source `ff55ac7`, revisions `00006`/`00007`) and remain historical evidence only. A new partner-executed authenticated journey belongs to #105/#106 and this Issue's outstanding setup gate.

## 3. Lab 5 CI/CD merge-gate verification (read-only)

- **Effective active GitHub repository ruleset:** `CPE334 Lab 5 - reviewed PR and CI gates` (ID `27154099`). `GET /rules/branches/main` and `/rules/branches/sprint1` showed one approving review, resolution of review threads, non-fast-forward protection, and **strict** required checks: `Unit / types / build`, `PostgreSQL 18 / Auth / Slot / Race A`, `Microsoft Edge / Auth / Tutor UI E2E`. The legacy `/branches/<branch>/protection` endpoint returned 404; the *effective ruleset endpoint* was used rather than claiming the branches unprotected.
- **Exact main release CI:** [run #44712718679](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/44712718679) completed successfully with all **three named jobs** successful on `42bb762`.
- **Repeatable CD:** [run #44784128286](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/44784128286) passed its deploy gate, checked this release SHA's required Check Runs, ran the migration/deploy/read-only smoke sequence and verified production traffic on `nuttiew-00010-gug`. Workflow is [`deploy.yml`](../../../.github/workflows/deploy.yml); CI is [`ci.yml`](../../../.github/workflows/ci.yml).
- No PR merges, new deployments, GCP IAM/billing changes, runtime Secret Manager reads, or database writes were performed for Issue #104.

## 4. Partner roster and mutually agreed testing windows — ACTION REQUIRED

No independent partner group, external student names, contact channel, or testing time has been supplied or verified in Issue #104. **Do not mark this section complete or invent an arrangement.**

| Role / item | Recorded status |
| --- | --- |
| NutTiew Product Team | `@Tanaboonnnnn` and `@Chxtamos` (same two Group Project members) |
| External partner's Product Team / UAT Team | **PENDING:** team name, GitHub repository, deployed URL |
| External partner testers | **PENDING:** both actual student names/IDs for the assessed PDF (avoid publishing student IDs in a public Issue) |
| Communication and safe credential-handoff channel | **PENDING:** mutually agreed private channel |
| Initial UAT (both directions), Asia/Bangkok | **PENDING:** date/time and participants |
| Defect-fix/release interval, Asia/Bangkok | **PENDING:** agreed window and freeze expectations |
| Independent re-test/acceptance, Asia/Bangkok | **PENDING:** date/time and actual testers |
| Submission cut-off | **26 November 2026**, instructor extension; **PENDING** verified time on LEB2 |

**Action for the two human teammates:** identify and mutually confirm a two-person partner team **before** beginning independent UAT; explicitly schedule initial testing, correction and re-test early enough to finish before the deadline. Exchange product role information with the other team. If the external team is unavailable or the deployed app cannot be accessed, notify the instructor/TA and keep the actual message/evidence; do **not** replace independent UAT with self-testing.

## 5. Test accounts, synthetic data and safe reset policy — agreement pending

1. Existing pre-provisioned **Tutor** and **Customer** synthetic demonstration accounts were used in [C-04](../lab-05/c04-production-evidence.md). Their **current login validity has not been rechecked** for the release in §2. The partner must receive working credentials **privately**, not in this repo, GitHub Issues/PRs, public PDF or screenshots.
2. For ownership negatives, prepare **distinct Tutor/Customer test identities** if required by the UAT case contract. Confirm they truly exist before promising them to the partner; do not use real student accounts/data or expose another person's private records.
3. A test that creates a 60-minute Tutor Slot or a Booking **changes persistent production data**. Plan unique future Asia/Bangkok Slot times well past the 60-minute Booking cutoff and not overlapping existing offers/appointments. Label test records with non-sensitive case IDs in the private handoff/defect evidence.
4. Sprint 1 does **not** provide a cancellation/delete/reset UI. Do not truncate Cloud SQL tables, delete existing records, rerun an arbitrary production seed or issue destructive test cleanup commands. Prefer independent, fresh synthetic fixtures; maintain a private fixture ledger of created Slot/Booking IDs for re-test and avoid reusing occupied data.
5. Make cases independent or explicitly declare their sequence and consumed shared data. If reset/cleanup is genuinely necessary, require a separately reviewed and approved **non-destructive** procedure first.
6. `@Tanaboonnnnn` and `@Chxtamos` must both participate and review the final handoff. The actual executable cases are owned by [#105](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/105); this file locks the version and safe handoff preconditions, not the UAT case results.

## 6. Release communication and immutable acceptance

**Proposed protocol — not yet agreed by the external partner:**

1. Before initial UAT, send the other team the **exact URL, full Git commit, Cloud Run serving revision/traffic check timestamp, Sprint 1 scope and case IDs**. Exchange passwords separately in the private agreed channel.
2. Freeze unannounced deployment changes during partner test sessions. Before any necessary deployment that might affect UAT, notify partner testers of the planned time, changed source/revision and impacted tests; obtain their acknowledgement and record the actual changed version.
3. If a release changes while testing, record both old/new versions, re-run affected cases and use one clearly identified release for the final decision. Never claim old-version results as independent acceptance of a new release.
4. Independent UAT Team reports results and defects. Product Team classifies findings; reviewed fixes follow the existing `sprint1` → `main` CI/CD process. Only the **other team** can independently re-test and accept NutTiew.
5. Record all actual time windows, people, communications, acceptance results and evidence IDs in the final Lab 6 PDF; never fabricate missing acknowledgement or approval.

## 7. Issue #104 acceptance checklist / next handoff

| Gate | Status as of evidence date | How to close truthfully |
| --- | --- | --- |
| Sprint 1 contract and exclusion boundary identified | **VERIFIED** | §1 with source refs/IDs |
| Public URL, API, DB readiness and anonymous authorization smoke | **VERIFIED (limited)** | §2.1; full authenticated journey is still required |
| Exact most recent released main SHA, CD revision/digest at deploy time | **VERIFIED (historical CD log)** | §2; repeat *read-only* revision/traffic check immediately before test |
| Effective required CI/PR rules and latest green main checks | **VERIFIED** | §3, project ruleset and Actions |
| Fresh authenticated UI → API → DB path on declared partner-test release | **PENDING** | Execute safely with approved synthetic accounts, capture versioned proof |
| Both teams and all participant names, contact method and UAT/fix/re-test times | **PENDING EXTERNAL ARRANGEMENT** | Partner/team confirmation; record actual dates and participants |
| Live synthetic test credentials, distinct role fixtures, non-destructive data plan | **PARTIAL / PENDING** | Validate accounts privately; agree fixture/resets before handoff |
| Deployment-change communication and failure escalation protocol | **PROPOSED / PENDING PARTNER AGREEMENT** | Partner acknowledges; notify TA if access/availability blocked |

**Not a UAT sign-off, passed partner test, completed defect resolution or submission receipt.** Complete only after the required human partner arrangement and versioned authenticated test readiness are genuinely recorded.
