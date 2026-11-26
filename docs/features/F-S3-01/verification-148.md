# F-S3-01: #148 integration and regression evidence

Candidate base: `sprint3@27027878633a245d2ad367eff7ce0205dd52049f`. This contains [#158](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/158) (Cancelled) and [#159](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/159) (Upcoming and In-Progress). Their exact-head runs [45419585456](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45419585456) and [45439725513](https://github.com/Tanaboonnnnn/CPE334-NutTiew/actions/runs/45439725513) passed all three required jobs. Those runs predate #148's changes. They must not be reused as evidence for the #148 candidate.

## Requirement-to-test map

| Requirement / acceptance | Cases | Candidate evidence location |
| --- | --- | --- |
| FR-035/036, BR-030/031/033, AC-S3-01-01..08, OD-006/009, VAL-028/029/036 | SUM-01..07, SUM-09: true PostgreSQL fixtures, one microsecond snapshot, disjoint exact IDs and count/list parity across all four groups, owner isolation, Customer/anonymous denials, immutable Booked state, both cancellation actors across the fixtures, non-disclosure, API OS-process restart using the same authenticated session and persisted rows | `apps/api/test/summary.db.test.ts`; PostgreSQL job |
| AC-S3-01-09, NFR-006/007/015/016 | SUM-08/08b and SUM-10: all four groups with populated and empty states, owned rows only, Thai time in a Los Angeles browser, list and heading semantics, keyboard refresh, mobile-width reload, no prior snapshot left visible after a 503 and a real retry; separate cancellation-actor/reason UI assertions | `e2e/summary.spec.ts`; Edge job |
| Prior S1/S2 contracts | Authentication/session, availability, booking and races A/B/C, notification, reschedule, cancellation, retrieval and withdrawal suites including DB ownership and error paths | `npm test`, `npm run test:db`, `npm run test:e2e`; all required jobs |
| Accepted Lab 6 #139 input validation | AUTH-NUL-01 and existing valid/invalid sign-in/session checks | `apps/api/test/auth.db.test.ts`; PostgreSQL job |

## Lab 6 reconciliation and boundaries

Carry forward only the already-reviewed [#140](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/140) input check and regression into the Sprint 3 candidate. It previously entered `main@f94dce99af198b225aafb54bfbf46da420836f35` through [#142](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/142). Test the behavior on the candidate; the old main release is provenance, not candidate evidence. [#110 acceptance](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/110#issuecomment-7110865094) was a separate team decision; RT-04 was partner-reported PASS without direct case evidence and is not counted as an independent result here.

## Recording results

The linked #148 pull request/check runs are the execution ledger for the exact candidate head (update when the head changes). Record command or job, SHA, run link, actual PASS/FAIL/SKIP/NOT RUN and limitations. Browser reload, a real API process restart, and a deployed-service restart are different checks. This PR does not deploy or restart a hosted service, exercise real accounts, or perform a formal accessibility audit. Preserve the assessed Lab 6 release and Sprint 2 branch.
