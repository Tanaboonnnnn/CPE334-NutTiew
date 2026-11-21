# Shared Sprint 2 migration candidate — audit notes

**PR REVIEW CANDIDATE — NOT HUMAN-APPROVED OR AUTHORIZED FOR SHARED/PRODUCTION DEPLOYMENT.**

## PR readiness — Issue #127

- GitHub ruleset #27154099 was extended to include `sprint2` while preserving the existing approval, required-check and non-fast-forward rules. Verify the rule on GitHub before merging.
- The exact SQL candidate has been placed in `apps/api/prisma/migrations/20261110000000_s2_shared_transition_foundation/migration.sql` so Prisma can apply it on **disposable PR CI databases**. This does not authorize a real database migration, production deployment, or merge.
- The paired baseline/candidate regression script now reads that executable candidate. CI must prove `prisma migrate deploy` executed the new SQL and that all required checks passed on the review commit.
- Paired regression excludes the new S2 migration when building both initial S1 schemas, then installs that exact file only on the candidate. This prevents accidental double-application now that the file resides in Prisma's discovery directory.
- Review and explicitly approve the SQL, migration lock window, the S2 SECURITY DEFINER interface, runtime-role creation order, and verified recovery procedure. Feature-level API/UI acceptance stays with #115–#119.

## Independent audit remediation — 2026-11-22

**Executable PR candidate locally reverified; hosted PR verification and human approval remain pending.** SQL Git blob: `308bd35f5364c40c4145d755db77edbcdcb85a3e`. This differs from the prior-tested `50e5375a30b161f08e4f761f1fdef1d71cd66bf9` only by the review/deployment warning header and the Prisma migration path. The earlier verification section below describes the pre-audit candidate.

**Independent local PR-candidate rerun:** `scripts/verify-s2-shared-regression.sh` exited **0** after skipping the candidate file during initial S1 schema setup. Untouched S1 baseline **111/111** and S2 candidate **111/111** DB regression tests passed; focused S2 suite **32/32** passed (including **18 race cases**). The runner verified fresh S1→S2 application, an injected pre-COMMIT DDL rollback, refusal preserving five legacy Cancelled rows, and Prisma diff reporting no representable difference. Temporary logs: baseline `tmp.SlBUB9SRJl`, candidate `tmp.6tv7Ovwof5`, rollback `tmp.R5QsTEKU1n`, refusal `tmp.mL8BdS8nOf`. Local `npm run typecheck`, `npm run build`, `npm test` (**36/36**) and `git diff --check` also exited **0**. No full feature E2E, hosted CI, production migration or deploy was performed in this local rerun.

| Finding | Remediation / remaining gate |
|---|---|
| SEC-01 | Added sprint2 to PR and push filters in the CI workflow, keeping main/sprint1, read-only permissions, and all three existing job names. The candidate is now in Prisma's executable migrations path for disposable CI. Hosted PR checks must still be verified. |
| SEC-02 | Repository owner extended ruleset 27154099 to refs/heads/sprint2, preserving one approving review, three checks, resolved conversations and non-fast-forward protection. Verify actual PR enforcement before merge; classic protections remain unverified. |
| SEC-03 | CI setup now grants SELECT on S2 read tables and EXECUTE on s2_mutate after creating the runtime role when S2 is present, verifies EXECUTE as that runtime login, and enables only the disposable S2 fixture path. The S1 path remains conditional on the S2 function being absent. Rehearsed install-before-role in a fresh network-isolated PostgreSQL 18.7 container: actual runtime login performed a Customer cancellation; direct Booking status UPDATE privilege remained absent. Compose locally declares its runtime role before migrate; hosted/production role ordering was not exercised. |
| SEC-04 / SEC-05 | Discovery is scoped to the caller's Customer/Tutor ownership before any foreign lock set can be formed. Definitive locked checks remain. Focused tests hold foreign User/Slot locks and assert the same not-found code for foreign/missing cancel, reschedule and withdraw targets, plus wrong role, revoked Session, inactive caller, and unchanged committed state. HTTP privacy and CSRF remain feature-level. |
| PERF-01 | Changed legacy preflight from COUNT to EXISTS and added transaction-local lock_timeout=5s and statement_timeout=120s (per statement). Access-exclusive locks remain necessary for atomic DDL/backfill. One local synthetic rehearsal with 10,000 Slots and 5,000 Bookings completed in under one second on a whole-second timer and created 10,000 guard rows. This is not a production lock budget; rehearse with representative data and contention before rollout. |
| PERF-02 | Mark-read returns the existing readAt under the recipient-scoped row lock without replaying UPDATE. A test compares the persisted timestamp and tuple ID across a repeat. |
| PERF-03 | Monitoring only: keep the version write protocol intact. Under representative load, collect lock waits, HOT updates and dead tuples before considering fillfactor tuning. No contention benchmark was performed. |
| PERF-04 | Mutation reads now project only required columns, without materializing password hashes or Session digests/nonces. |

Latest local verification: disposable paired database runner exit 0; untouched S1 and S2 candidate each 111/111 with no skips; focused suite 32/32 including 18 race cases; fresh apply, rollback injected immediately before COMMIT, legacy refusal (five rows retained), and Prisma diff (no representable difference) passed. The first paired attempt timed out on BDF-10 at its existing 5s limit; the unchanged assertion passed on fresh replay. Typecheck, build, unit suite (36/36), CI shell syntax, YAML structure, and diff whitespace checks passed. Raw local logs: baseline tmp.8sqWxsVVGF; candidate tmp.C0xMO3j8JD; rollback tmp.K92HNlhfSn; refusal tmp.2PkiyIfzA9. Hosted CI/Edge and deployment were not run.

## Source and scope

Local worktree CPE334-NutTiew-S2-SHARED, branch chore/s2-shared-migration-review. Baseline origin/sprint2: 3ecfb31a23089a0468ccf0fc86edf0fd8e6bd357. The earlier tested SQL blob f5e733d9015b433c7a6e67931b43f5bf5cb5931f was superseded by the audit-remediated candidate. The SQL now resides in Prisma migrations for **disposable CI application and human PR review**, not for production deployment. Applied S1 migrations and API/UI code are unchanged.

## Database interface for review

The service runtime can execute public.s2_mutate(op, principal, sid, target, destination, reason), but not write S2 state directly. S1 SELECT/INSERT and the Slot id-only UPDATE grant needed by SELECT FOR UPDATE are retained; the Slot trigger still rejects id updates. The function is owned by the migration owner, has a pinned pg_catalog/pg_temp search path, schema-qualified relations, and no PUBLIC EXECUTE. The owner is non-superuser and is not the application login. The internal Slot version table and helper are not runtime-writable/callable. Synthetic Cancelled INSERT is only for the dedicated disposable fixture login and requires Customer cancellation metadata; no history actor is backfilled. The probe is test-only and can exercise rejecting triggers directly.

The function replaces adapter-issued domain DML, not the feature behavior. Invoke once in an adapter-owned SERIALIZABLE transaction without already holding domain locks. It discovers candidates, locks User UUIDs in order, then Slot UUIDs in order, the specific Session, the Booking when applicable, and Slot version rows before sampling PostgreSQL wall-clock time. A changed Booking lock set aborts with 40001. Version writes make stale competing withdrawal/occupancy snapshots abort, without changing the Slot row for Customer cancellation. S1 Booked INSERT retains the post-wait Q05 check. Tutor cancellation writes Booking, then Slot, then the notice, with a deferred consistency check. MarkRead is recipient-scoped and preserves the first read timestamp. The reschedule unique constraint enforces one successful history row; a failed move rolls back its history.

The runtime remains a trusted service credential, not an end-user identity. Database checks revalidate the supplied actor and Session, but HTTP adapters must authenticate the token, derive actor/Session IDs server-side, enforce CSRF and binding, use owner-scoped reads, and handle transaction retries, commit acknowledgement, and safe error mapping. Do not let clients invoke this function directly. The reviewer should check this adapter-interface change against the feature transaction contracts, together with role provisioning (runtime role exists before migration), the migration lock window, and rollback strategy. No new stakeholder policy is implied.

## Final verification (supersedes all earlier BLOCKED results)

- PostgreSQL 18.7, verified disposable Docker container on 127.0.0.1:15439. Fresh databases: nuttiew_s2_pair_a_f73fa3bc74 and nuttiew_s2_pair_final_f73fa3bc74. SQL applied via SET ROLE s2_review_owner (non-superuser NOLOGIN); DB regressions use separate runtime/probe/fixture logins. Catalog confirms the function owner, SECURITY DEFINER, pinned search path, six named guards, no fixture EXECUTE, no runtime helper EXECUTE, and no runtime guard-row UPDATE.
- scripts/verify-s2-shared-regression.sh: exit 0. Both npm run test:db runs passed 111/111 across 15 files each, zero skips. Previous role-auth errors resolved after correct provisioning; BDF-22/24/25 now run with the probe. Candidate AVA-02/15/16/17, BDF-04/15 use isolated synthetic fixtures; BDF-01/03 check actual S2 triggers; BDF-16/27 and SLOT-16/17 assert the S2 rejection labels; BDF-20 now withdraws a real S2 Slot and checks S2 rejection SQLSTATEs. The S1 branches of those assertions remain intact. No earlier DB failure reproduced in the final comparison.
- Focused Vitest suite: 31/31, including all 18 combinations of Booking insert, move into Slot, or move away versus withdrawal, both orders at READ COMMITTED, REPEATABLE READ and SERIALIZABLE. Contender snapshots precede the winner's commit; blocking is observed except withdrawal-first on a Slot already occupied, which is rejected immediately. Persisted state checked after each case. Also verifies runtime raw writes and fake Cancelled INSERT denied, owner-only notice read mutation, rollback, and destination cutoff. The earlier raw-write RED case returned 23514 instead of the required privilege denial 42501.
- Fresh replay PASS. Late-DDL rollback PASS: injected division by zero immediately before COMMIT in a streamed copy, verified S1 guard and absence of candidate objects, then applied the pristine file. Legacy refusal PASS: five synthetic pre-existing Cancelled rows retained and S1 schema checks unchanged. Once genuine S2 history exists, use a separately reviewed, data-preserving forward remediation rather than dropping it.
- Prisma migrate diff --exit-code: no representable difference, including SlotVersionGuard. SQL-only guards/checks are covered by catalog inspection and actual behavior tests rather than Prisma diff.
- npm run typecheck, npm run build, npm test (36/36), bash -n on the review runner, and git diff --check: PASS. Feature E2E is deferred to #115–#119; no feature was implemented here.

Raw disposable run logs (local temp): baseline tmp.i28U6HBBDF; candidate tmp.FSOOzikOmZ; injected rollback tmp.gS1EPKa4V5; legacy refusal tmp.K7sqA4vqlX. The runner creates unique databases and never resets an existing one. It expects the named local disposable container and existing test roles from this review environment; provide its full ID and disposable credentials via environment variables, not source files.

## Correct canonical F-S2-01 coverage mapping

The prior #115 proposal table was incorrect. This mapping is derived from `docs/features/F-S2-01/specification.md` AC table (§10) and `tests.md` CAN table (§2), not copied from that proposal:

| AC | Canonical criterion | CAN trace |
|---|---|---|
| AC-S2-01-01 | Successful owner cancel at >=30m; committed Cancelled/Customer/time; Slot still Offered/unoccupied | CAN-01; CAN-05 covers Slot projection/reopen behavior |
| AC-S2-01-02 | Exact 30:00 succeeds; 29:59.999 returns 422 without change | CAN-02 |
| AC-S2-01-03 | Foreign/unknown 404; already cancelled 409; anonymous 401; wrong role 403 | CAN-03 (foreign/unknown/auth); CAN-04 (repeat/lost response) |
| AC-S2-01-04 | Reopened slot remains subject to independent Q05 <60m rejection | CAN-06; CAN-05 covers availability read when >=60m |
| AC-S2-01-05 | Cancel vs new Booking race in both orders, safe persisted outcomes | CAN-07, CAN-08 |
| AC-S2-01-06 | DB failure or Session revocation leaves state unchanged | CAN-09 and CAN-10 |
| AC-S2-01-07 | Post-lock T_elig cutoff after a lock wait crossing 30m | CAN-11 |
| AC-S2-01-08 | No identity/reason/credential/session/SQL leakage | CAN-12 |
| AC-S2-01-09 | Direct SQL cannot repeat, reverse cancellation or alter identity/interval | CAN-13 |
| separate durability NFR | API restart and persistent reread | CAN-14 |

CAN-08 is concurrent double-cancel uniqueness/state evidence; CAN-05 is the availability/Slot-no-write case; CAN-06 is the separate 60-minute cutoff. These identifiers are intentionally not reassigned.

The AC/CAN traces are the feature verification plan, not a claim that the HTTP/UI cases have passed. OD-008, OD-013, OD-014 and OD-015 remain open. No staging, commit, push, GitHub/Project mutation, production DB operation or deployment.
