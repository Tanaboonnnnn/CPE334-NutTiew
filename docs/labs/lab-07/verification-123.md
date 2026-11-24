# Lab 7 Part B — CR-L7-01 verification ledger

Scope: change only the new Customer Booking / bookable availability cutoff on Sprint 1. The 60-minute Slot duration, 60-day horizon, authorization, replay of existing Bookings and the remaining transaction rules are unchanged.

## Reviewed baseline and test-first sequence

| Evidence | Version / result |
|---|---|
| Accepted Lab 6 release reference | `main@f94dce99`, recorded Cloud Run revision `nuttiew-00012-nob`; see [Part A](cr-l7-01.md). No current production access was used for these tests. |
| Contract before implementation | [PR #162 review](https://github.com/Tanaboonnnnn/CPE334-NutTiew/pull/162#pullrequestreview-6044934616) on `ed35b4b` was marked AI-assisted. Tan separately confirmed that Mos himself read/reviewed the contract before this implementation began (team confirmation relayed in chat; not represented as a second GitHub review). Mos merged #162 into `sprint1@61df88855ebce97e41367a0de966e4537a72dbf6`. |
| RED, tests only | `fc493af8b27678c9f9a6f30ccd0fd80db41e8e9c` on unchanged application and 60-minute trigger. Earlier fixture-isolation attempts are not used as RED evidence. |
| GREEN implementation | `1d02e7772372d68e6e25037eedb57966e408bddd`; same changed-behavior tests, no test alteration after RED. |

Run from `apps/api` with test-only keys and disposable database roles:

```sh
../../node_modules/.bin/vitest run test/availability.db.test.ts test/bookings.db.test.ts -t 'AVA-03|BOOK-02|CR-L7-01'
```

- **RED:** 0 passed, 3 failed, 21 unselected. AVA-03 reported that the 89:59 Slot was incorrectly present. Both the HTTP 89:59 case and stale selection at about 75 minutes returned **201**, not the expected **422**. Failures were business assertions, not setup failures.
- **GREEN:** 3 passed, 0 failed, 21 unselected, on the same command. 89:59 excluded in availability, 90:00 retained with deterministic DB `T_view`, and too-soon POSTs return `422 BOOKING_NOT_ELIGIBLE` without a Booking row. BOOK-02 uses a near-boundary live positive write plus exact arithmetic; it does not claim HTTP scheduling at an exact microsecond.
- **Additional DB precision spot check:** real projection through `listCustomerAvailability`, one controlled `T_view`, synthetic Slots inserted at exact 60:00, 89:59.999999 and 90:00 in a rolled-back transaction: excluded, excluded, included. BOOK-02/BDF-21 verify exact SQL arithmetic at 90:00 and one microsecond below and pair it with real trigger/API cases.
- **Real lock evidence (BDF-22):** lock holder PID 46212 was observed in `pg_blocking_pids(46239)`; DB time before lock expiry was 18:35:06.075Z, cutoff 18:35:08.429Z, and trigger `T_elig` 18:35:08.439Z. The guard rejected with the expected SQLSTATE and no persisted Booking. BOOK-17 independently verifies the API transaction's post-wait rejection.

## Migration and regression

The new forward migration `20261125000000_lab7_q05_min_notice` replaces the active S1 function in place. No old migration was edited; a database that already has the S2 replacement guard will not have the old guard recreated by this migration. That safeguard is not an S2 reconciliation: its active new-Booking cutoff still requires its own forward reconciliation and review.

| Command / check | Observed result |
|---|---|
| `npm run db:migrate`, old Sprint 1 PostgreSQL 18.7 schema with existing synthetic rows | One migration applied. 10 existing Booking rows unchanged (ordered row digest/count), same guard OID/owner/grants/security/search path and same trigger definitions. |
| `npm run db:migrate`, separate fresh PostgreSQL 18.7 database | All five migrations applied. The local fixture reused the repo's test grants with a separate database name. |
| `npm run test:db` on fresh DB | **113 passed, 0 failed, 0 skipped, 15 files.** Includes role/privacy, ownership, persisted state, 60-minute Slot duration, concurrency, natural-key replay, Session protection and post-lock cutoff. |
| `npm test` | **36 passed**, 29 API + 7 web, 0 failed. |
| `npm run typecheck`, `npm run build` | Both passed. Build emitted a non-blocking Vite bundle-size warning. |
| Local Edge targeted run | Not run to assertions: Playwright reported the local API URL occupied at launch on both attempted local addresses. Use required, isolated GitHub Edge CI on the PR. |

Release and deployment, review on this implementation, exact merge SHA/tag, Docker/Edge CI and post-deployment smoke verification remain separate gates. Do not use pre-change Lab 6 evidence as proof of changed behavior on a live service. Sprint 2/3 integration and the preservation of their own distinct cutoffs are not claimed here.
