# Lab 6 — Independent UAT of PEW-DIY Sprint 1 (`L6-03` / #106)

> **Status: EXECUTION RECORDED; PEER REVIEW AND REMAINING INDEPENDENT CHECKS PENDING.** This is the NutTiew team's **outgoing** UAT of PEW-DIY, not the incoming TH-056_P2 test of NutTiew (#107). This report is an evidence-grounded public-repository copy of the tester-supplied **PEW-DIY-Lab6-UAT-v6.md** (22 Nov 2026); private student IDs and credentials are intentionally omitted. It is **not** final Sprint 1 acceptance.

**Owner issue:** [#106](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/106) | **UAT team:** NutTiew (`@Tanaboonnnnn`, `@Chxtamos`) | **Product team:** PEW-DIY (`TH-056_P2`).

**Tester attribution:** The supplied independent browser execution record identifies **`@Tanaboonnnnn`** as the executing student. **`@Chxtamos`'s case-by-case testing participation has not been documented in the supplied record and must be confirmed from actual participation before the #106 "both students" gate can be checked.** Reviewing this PR alone must not be represented as having run the omitted tests.

**Authoritative case list:** [PEW-DIY Sprint 1 Lab 6 handoff, `UAT-01`–`UAT-08`](https://github.com/Peepipat-Suesoongnuen/PEW-DIY/blob/sprint/1-staging/docs/labs/lab-06/README.md). No Sprint 2/3 work is assessed.

## 1. Environment, provenance and safeguards

| Item | Recorded source and verification |
| --- | --- |
| Isolated UAT origin | [`https://pewdiy-uat-qtz73ahnlq-as.a.run.app/`](https://pewdiy-uat-qtz73ahnlq-as.a.run.app/), NOT the shared `pewdiy` demo. All reported state-changing tests used the isolated UAT service/database. |
| Partner-supplied tested source commit | `b03c9043533a6dc1f8a6fb958983ddb0da9529c7` |
| Partner-supplied immutable image digest | `sha256:e636ea0c95b027e68ab07ca550a9ce57f2343f99603391cc161936a220cbc2d4` |
| Initial UAT revision | `pewdiy-uat-00002-bnt`, reported by the PEW-DIY operator as 100% traffic (not independently inspected in Cloud Run). |
| Same-image restart/redeploy | `pewdiy-uat-00003-8c5`, reported by the operator as 100% traffic with the same image and isolated `pewdiy_uat` database. Tested routing/traffic was not directly inspected by NutTiew. |
| Our browser execution | 22 Nov 2026, **20:40–20:47 ICT**; later read-back around **21:17 ICT** and quantity-form checks around **21:44 ICT**, using Chrome on a cloud computer. Exact per-action timestamps other than those explicitly noted were not captured; do not infer them. |
| Partner supplemental API verification | PEW-DIY's [Lab 6 §4 live API evidence](https://github.com/Peepipat-Suesoongnuen/PEW-DIY/blob/sprint/1-staging/docs/labs/lab-06/README.md#corroborated-live-api-evidence-on-pewdiy-uat-00003-8c5) reports direct API probes around 22 Nov 2026 **22:00 ICT** on `00003-8c5`. **Product Team evidence is supplemental; it does not become independent UAT.** |
| Synthetic actors | `B-A` / `B-B` (Borrowers), `C-A` (Custodian). Passwords and cookies are not present in this report. |
| Synthetic items | `fixture-e-one` (1/1 before checkout), `fixture-e-many` (3/3), `fixture-e-zero` (0/0). Subsequent state for E-ONE was 0/1 available/total. |
| Cleanup | The tester did **not** reset or alter the UAT deployment; the owner controls any later cleanup/reset after evidence retention. |

**Version boundary:** The two UAT revisions are an owner-reported same-image restart, not an independent verification of Cloud Run traffic. Do not combine observations with a different image or database without a new release baseline.

## 2. Independent execution record (Part B / Lab 6 §3.2)

`PASS` below means the *recorded independent steps* met their expected Sprint 1 behavior. `NOT FULLY EXECUTED` explicitly distinguishes unrun independent steps from the Product Team's own confirmation; it is **not** a PASS or a fabricated BLOCKED outcome.

| Case / partner acceptance reference | NutTiew tester and time (ICT) | Our actual observed result vs. partner expectation | Recorded outcome | Evidence |
| --- | --- | --- | --- | --- |
| **UAT-01** Sign-in, roles, logout — F-01 `AC-F01-01/02/06/11`, F-02 `AC-F02-03/06` | `@Tanaboonnnnn`, 22 Nov 20:40–20:47 window | `B-A`, `B-B`, `C-A` signed in. Borrower saw Catalog / My requests / My loans; Custodian saw Catalog / Submitted requests. Invalid credentials were rejected (`401`, generic error); signed-out protected navigation returned to sign-in. | **PASS** | Browser execution record v6 §UAT-01 |
| **UAT-02** Catalog stock — F-02 `AC-F02-01/02/03/06`, F-03 `AC-F03-01/02/04/05` | Same initial session window | Before consumption, both roles saw synthetic stock **E-ONE 1/1**, **E-MANY 3/3**, **E-ZERO 0/0**. Zero-stock item displayed UNAVAILABLE and no borrow form; anonymous catalog access redirected to sign-in. | **PASS** | Browser record and `E02a` pre-checkout Catalog |
| **UAT-03** Request persistence/no reservation — F-04 `AC-F04-01/06/07/08`, F-03 `AC-F03-03` | Same initial window | `B-A` submitted quantity 1; My requests displayed the `Submitted` record after reload, while E-ONE remained **1/1** until checkout. | **PASS** | Browser record, synthetic request `3334c7cb-35f7-43a0-ba8b-8f722b241e7e` |
| **UAT-04** Checkout and loan read-back — F-05 `AC-F05-01/06/08/09/10`, F-04 `AC-F04-05/06`, F-03 `AC-F03-03` | Same initial window; checkout **22 Nov 20:43:26 ICT** | `C-A` checked out B-A's one-unit request; status changed to Checked out, B-A saw an **Active** loan (quantity 1) after reload; E-ONE fell to **0/1**. Due **29 Nov 2026** equals 22 Nov plus 7 Bangkok calendar days. | **PASS** | `E01`, `E02c`; loan `27ba9193-5f91-4edc-b8d2-fb2af7453693` |
| **UAT-05** Competing checkout — F-04 `AC-F04-02/06/09`, F-05 `AC-F05-02/03/04`, F-03 `AC-F03-03/07` | Same initial window | Two Borrower requests existed before checkout without reserving stock; after B-A's successful checkout, C-A could not check out B-B's request. B-B remained Submitted, with no second loan, and stock stayed **0/1**. **Mismatch:** UI said “This request cannot be checked out. Refresh requests and availability.” instead of identifying insufficient stock as the reason. | **FAIL on expected explanatory error text; core stock/transaction invariants PASS. Accepted by Product Team as a Minor UX Defect / Known Limitation (not yet accepted by the independent UAT Team).** | `E02a`–`E02d`; partner's known-limitation disposition (§4) |
| **UAT-06** Forbidden role/owner access — F-01 `AC-F01-04/05/08/09/12`, F-04 `AC-F04-04/10`, F-05 `AC-F05-07/08` | Our role-scoped UI checks in initial window; supplemental partner verification ~22:00 | **Our observation:** role navigation and own-list separation were visible. **Not independently run:** direct cross-owner request/loan route probes, Borrower attempt to POST checkout, and full before/after authorization invariant. **Partner verification:** `B-B` reading `B-A`'s loan and request and `B-A` attempting B-B's checkout all returned **403 FORBIDDEN**; no protected fields/stock/loan counts changed, per `EV-UAT06-API-01`. | **NOT FULLY EXECUTED — independent negative-route steps NOT RUN; owner-only API evidence available.** | Our role-list observations; owner `E03` screenshot; [`EV-UAT06-API-01`](https://github.com/Peepipat-Suesoongnuen/PEW-DIY/blob/sprint/1-staging/docs/labs/lab-06/README.md#corroborated-live-api-evidence-on-pewdiy-uat-00003-8c5) |
| **UAT-07** Invalid/forged request without writes — F-04 `AC-F04-02/03/09`, F-05 `AC-F05-11`, stock boundaries | Our form checks ~**21:44**; partner API evidence ~22:00 | **Our observation:** with E-MANY **3/3**, submitting form values **0** and **4** triggered native browser minimum/maximum validation; B-A's existing request count stayed **1→1** and E-MANY stayed **3→3**. **Not independently run:** `POST /api/requests` with 0, 4, and forged `borrower_id`. **Partner verification:** 0/forged input → `400 VALIDATION_ERROR`, 4 → `409 INSUFFICIENT_AVAILABILITY`, with no new request/stock change per `EV-UAT07-API-01`. | **PASS (UI subset); API-assisted independent steps NOT RUN. Overall NOT FULLY EXECUTED.** | `E04a`–`E04d`; [`EV-UAT07-API-01`](https://github.com/Peepipat-Suesoongnuen/PEW-DIY/blob/sprint/1-staging/docs/labs/lab-06/README.md#corroborated-live-api-evidence-on-pewdiy-uat-00003-8c5) |
| **UAT-08** Persistence after controlled restart — F-01 `AC-F01-06/11`, F-02 `AC-F02-08`, F-04 `AC-F04-07`, F-05 `AC-F05-09` | Our before/after readback in initial and ~**21:17** windows; owner restart record | After owner-reported same-image restart (revision `00003-8c5`), we signed in again as `B-A` and `C-A` and observed the same synthetic request/loan IDs, status, quantity, due date, B-B pending request and the three inventory counts. Owner additionally reported readiness `200` and request/loan counts unchanged. | **PASS for our post-restart UI readback; restart operator/traffic evidence is Product Team-supplied.** | Our before/after identifiers in §3, partner `E06` and restart note |

**Case execution totals:** Five independent browser cases recorded **PASS** (`01`–`04`, `08`); one case (`05`) has a **Minor UX FAIL** in the stated message expectation while its state invariants passed; two cases (`06`, `07`) remain **not fully executed independently**. Do **not** summarize this as “8/8 independent PASS.”

## 3. Synthetic state / negative-invariant record

These references are synthetic, not credentials or real customer data.

| Synthetic object | Recorded ID or stock | Post-execution observation |
| --- | --- | --- |
| B-A request (`UAT-03/04`) | `3334c7cb-35f7-43a0-ba8b-8f722b241e7e` | Checked out |
| B-B competing request (`UAT-05`) | `32486ac4-d501-41f8-9f57-a511b7a2c2a5` | Submitted; no Active Loan |
| B-A loan (`UAT-04/08`) | `27ba9193-5f91-4edc-b8d2-fb2af7453693` | Active; quantity 1; due 2026-11-29 |
| E-ONE | `fixture-e-one` | **1/1** (before checkout) → **0/1** (after checkout) available/total; no negative stock |
| E-MANY | `fixture-e-many` | **3/3 → 3/3** despite invalid quantity attempts |
| E-ZERO | `fixture-e-zero` | **0/0**, unavailable |
| B-A My requests during `UAT-07` | 1 → 1 | No UI-created request for invalid quantities |
| Owner `EV-UAT06-API-01` read/write denial | 403 on cross-owner loan/request reads and Borrower checkout | Product Team reports B-A request **1→1**, B-A loan **1→1**, B-B request **1→1**, B-B loan **0→0**, stock unchanged; **not independently verified by NutTiew** |
| Owner `EV-UAT07-API-01` API rejects | 400 (0 / forged owner), 409 (quantity 4) | Product Team reports B-A request **1→1**, E-MANY **3→3**; **not independently verified by NutTiew** |

No destructive reset, shared-demo test mutation, or GCP deployment action was performed by the NutTiew UAT Team in this execution.

## 4. Outgoing finding and Product Team disposition (Part C)

| Field | Recorded value |
| --- | --- |
| Finding ID | `PEW-UAT05-UX-01` (local UAT report identifier; **not** a fabricated GitHub Defect Issue number) |
| Product Team / reporter | PEW-DIY / NutTiew independent UAT |
| Tested baseline | `b03c9043533a6dc1f8a6fb958983ddb0da9529c7`, UAT revision `pewdiy-uat-00002-bnt`; subsequent same-image UAT revision `pewdiy-uat-00003-8c5` |
| Requirement / case | PEW-DIY `UAT-05`, F-05 `AC-F05-02/03/04` and F-03 stock rejection |
| Repro preconditions | Isolated E-ONE 1/1, B-A and B-B each have a Submitted request for 1, C-A is signed in |
| Repro steps | C-A checks out B-A's request; then C-A attempts B-B's competing request after available stock reached zero |
| Expected | Competing checkout rejected safely with a reason that identifies insufficient stock; no second loan, B-B Submitted, stock never negative |
| Actual | Second checkout rejected and protected state unchanged; UI error was **“This request cannot be checked out. Refresh requests and availability.”** and did not identify insufficient stock |
| Severity and impact | **Minor UX**: custodian lacks actionable reason, must recheck stock; **not** a duplicate-loan or oversell defect, and no confidential data exposed |
| Evidence | `E02a`–`E02d` images in the tester-supplied source package; specific error text and post-rejection state recorded above |
| Product Team decision | Per tester-supplied v6 and the [partner's Lab 6 finding-management section](https://github.com/Peepipat-Suesoongnuen/PEW-DIY/blob/sprint/1-staging/docs/labs/lab-06/README.md#findings-reported-by-the-uat-team), PEW-DIY **accepted the minor UX defect as a known limitation** and proposed correcting the message after Sprint 1. **No fix or independent retest claimed.** |
| Communication | Reporter states this finding was discussed verbally with PEW-DIY. No audio recording is required by Lab 6. The Product Team's written disposition in its Lab 6 record corroborates receipt; exact call participants/time and a GitHub issue number were not supplied. |
| Acceptance gate | **Independent UAT Team sign-off still unrecorded**. Product Team approval of a known limitation is not equivalent to tester acceptance. |

**Proposed future copy (not a required Sprint 1 feature expansion):** Display a safe insufficient-stock reason when a stock conflict is truly the cause, without exposing other Borrowers' data. This is a proposal; do not report it as implemented.

**Additional non-defect UX observation:** On quantity 0/4, native browser validity text appears but the Submit button still visually resembles an active CTA. Existing form validation prevents the invalid request; this is an enhancement suggestion, **not** proof of a server-side defect.

## 5. Evidence register and provenance

The screenshots listed below are from the tester's uploaded image set. **Only filenames and separately verified observations are included in this Git text record; the binary upload set is not asserted to be committed here.** Before the final assessed PDF, embed readable selected screenshots with their case IDs, original action/context and tested revision. Do not claim owner-generated API captures were made by our UAT Team.

| Evidence ID | Original file / authoritative source | What it supports | Origin |
| --- | --- | --- | --- |
| `E01` | `PEW-DIY-E01-Normal-Loan.jpg` | B-A owns Active loan, 1 unit, due 29 Nov | NutTiew browser screenshot |
| `E02a` | `PEW-DIY-E02a-Stock-Before.jpg` | Synthetic catalogue before competing checkout | NutTiew browser screenshot |
| `E02b` | `PEW-DIY-E02b-Rejected-Checkout.jpg` | Custodian's actual generic checkout error (Minor finding) | NutTiew browser screenshot |
| `E02c` | `PEW-DIY-E02c-Stock-After.jpg` | E-ONE 0 available / 1 total | NutTiew browser screenshot |
| `E02d` | `PEW-DIY-E02d-No-New-Loan.jpg` | B-B has no new Active Loan | NutTiew browser screenshot |
| `E03` | `PEW-DIY-E03-Owner-Verification.png` / [partner's original verification](https://github.com/Peepipat-Suesoongnuen/PEW-DIY/blob/sprint/1-staging/docs/verification/sprint-1/README.md) | A foreign-loan page denies B-B (no record fields shown) | Product Team; NOT independent UAT |
| `E04a` | `PEW-DIY-UAT07-Quantity-0.jpg` | UI blocks quantity 0 | NutTiew browser screenshot |
| `E04b` | `PEW-DIY-UAT07-Quantity-4.jpg` | UI blocks quantity 4 | NutTiew browser screenshot |
| `E04c` | `PEW-DIY-UAT07-Requests-After.jpg` | No extra B-A request after invalid form attempts | NutTiew browser screenshot |
| `E04d` | `PEW-DIY-UAT07-Stock-After.jpg` | E-MANY still 3/3 | NutTiew browser screenshot |
| `EV-UAT06-API-01` | [PEW-DIY Lab 6 live verification](https://github.com/Peepipat-Suesoongnuen/PEW-DIY/blob/sprint/1-staging/docs/labs/lab-06/README.md#corroborated-live-api-evidence-on-pewdiy-uat-00003-8c5) | 403/403/403, denied body and unchanged data | Product Team |
| `EV-UAT07-API-01` | Same official partner Lab 6 record | 400 / 400 / 409, unchanged E-MANY and request count | Product Team |
| `E06` / `E07` | Same partner Lab 6 record + tester-supplied v6 | Owner-reported restart and acceptance of Minor limitation | Product Team |

**Evidence integrity limitation:** User-supplied image filenames are included as an index, not imaginary Git-hosted image links. The final PDF owner (#111) must receive the actual uploaded image files (or the evidence bundle prepared alongside this report). Original source and operator logs must remain distinguishable.

## 6. Remaining gates before #106 can truthfully be closed

- [x] Partner's eight executable cases, scope, roles and isolated URL captured; credentials were used privately and are not reproduced.
- [x] User-reported execution of all available normal, business-rule and persistence UI flows recorded with tested versions, inputs, observed results and limitations.
- [x] Minor UAT-05 defect reproduced at the browser surface, sent verbally per reporter, and recorded as acknowledged by the Product Team; no fictional Fix Issue number created.
- [x] Our normal journey and negative UI observations indexed with source filenames; owner's supplemental negative API evidence linked explicitly as owner evidence.
- [ ] `UAT-06` **direct forbidden request/loan access and Borrower checkout** independently verified by NutTiew, including no leak/no write, **or** instructor/TA-documented decision addressing the unrun requirements.
- [ ] `UAT-07` **direct API invalid/forged request attempts** independently verified by NutTiew, **or** instructor/TA-documented decision addressing that gap. Native browser validation is not a substitute for these server checks.
- [ ] `@Chxtamos`'s actual **student participation in the independent case execution** documented accurately (not inferred from PR review).
- [ ] Selected readable screenshots included in the reviewable/submission evidence package and linked to corresponding cases.
- [ ] UAT Team's explicit final PEW-DIY Sprint 1 decision, with participating tester(s), exact image/revision, conditions, and date, recorded for final #110 / submission; acceptance is not inferred from the Product Team's decision.

**Disposition:** This report is ready for teammate review as an **honest interim Part B + outgoing Part C record**. It must **not** be called eight independent passes, fully accepted, or a completed #106 until the remaining DoD is satisfied. If testing arrangements become genuinely blocked, notify the instructor/TA and preserve the message/decision; do not invent permission to waive required testing.

## 7. Student contributions, AI use and publication hygiene

| Contributor | Evidence-backed contribution | Verification |
| --- | --- | --- |
| `@Tanaboonnnnn` | Supplied the browser UAT record v6, synthetic IDs, observations and screenshots; verbally reported the UAT-05 finding to the partner according to the tester's account | Source report v6; exact per-action time is not independently corroborated |
| `@Chxtamos` | Requested to review the #106 PR; **independent testing actions not supplied in the record** | To be completed with real actions/cases when the teammate confirms |
| PEW-DIY Product Team | Provided isolated UAT release/fixtures, same-image restart statement, supplemental backend checks and finding disposition | Their own Lab 6 README; not independent NutTiew UAT |

AI assistance was used for browser driving, recording evidence and drafting/reviewing this report. The underlying UI observations belong to the named tester's supplied execution record; the Product Team's supplemental API tests are labeled accordingly. This file intentionally omits the private student ID present in the course-only source, all passwords, cookies, tokens and unrelated personal records. This PR does not change app code, GCP, the partner service or data.