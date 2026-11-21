# Sprint 2 Contract Readiness — F-S2-01..05 (Issue #114)

> **Documentation and review-readiness record only.** No application code, migration, executable test, PostgreSQL run, CI result, approval, merge or deployment is claimed. Initially authored on `docs/114-s2-contracts` from local `origin/sprint1` @ `41b310c83573e672be8c4189607380d56e598291`. During independent audit, `origin/sprint1` was fetched and the worktree fast-forwarded to `8e808253f7aaf1df3af273d1dff878c4caf7f607`; the new base adds the Lab 6 UAT document only and no application changes. Status: **DRAFT FOR HUMAN REVIEW**.

## 1. Baseline and release isolation

### 1.1 Locally observed refs and audit refresh

| Ref | Observed SHA | Meaning |
|---|---|---|
| current branch `docs/114-s2-contracts` | `8e808253f7aaf1df3af273d1dff878c4caf7f607` | Initially branched from `41b310c`; fast-forwarded during audit; uncommitted contract files retained |
| fetched `origin/sprint1` | `8e808253f7aaf1df3af273d1dff878c4caf7f607` | Integration head fetched during audit; the only added file relative to `41b310c` is `docs/labs/lab-06/uat-baseline.md` |
| local `origin/main` | `42bb76247b257a4d9eff402f2e6b60a2ba44eda4` | Release head visible locally |

**Authoring phase:** no remote queries or writes. **Audit phase:** verified `origin/sprint1` by fetch and local fast-forward; this is not verification of CI status, approval, live deployment or actual external UAT. Any subsequent PR, CI and Project status are separate workflow steps and must be reported from actual outcomes.

### 1.2 Conflicts observed (reported, not silently resolved)

| Item | Observation | Handling |
|---|---|---|
| `README.md` release line | Claims accepted `main` @ `4cbfb8c`; local `origin/main` is `42bb762` and the local #104 UAT note records `42bb762` as the released head | Neither is re-verified here. Treat the README line as potentially stale and require a fresh remote check before any release claim. |
| System SDS §7.1 lock order | States User → Slot → Booking | The implemented Sprint 1 adapter (`apps/api/src/bookings.ts`) acquires User → Slot → **Session** → Booking. S2 contracts adopt the implemented order and flag the SDS wording for a separately reviewed correction. |
| F-S1-05 DTO | Hardcodes `status:'Booked'` and `displayStatus:'Booked'|'Past'` | S2 requires `Cancelled`/actor/time/reason; recorded as an explicit S2 change layer with Sprint 1 regression tests. |
| F-S1-02 Slot DTO | Types `lifecycle:'Offered'` only | S2 requires `'Offered'|'Withdrawn'` + `withdrawnAt`; recorded as an explicit S2 change layer. |
| S1 guards | `booking_guard_s1()` rejects all Booking UPDATE/DELETE/TRUNCATE; `slot_guard_s1()` rejects all Slot UPDATE/DELETE/TRUNCATE | S2 needs one reviewed forward migration replacing both; this is a release blocker, not optional work. |
| Missing S2 tables | No `RescheduleHistory`, no `Notification` | Contracts propose both; no table exists yet. |
| Assignment model | No `Booking.tutorId` | Tutor is always `Slot.tutorId` through `currentSlotId`; contracts never invent a Booking Tutor column. |

### 1.3 Sprint 1 / Lab 6 UAT isolation

- The Lab 6 UAT baseline is recorded in the local branch `docs/104-uat-baseline` at commit `2a2f146` (`docs/labs/lab-06/uat-baseline.md`), including public URL `https://nuttiew-nxe2keefba-as.a.run.app/`, release `42bb762`, and Cloud Run revision `nuttiew-00010-gug` as the last CD-log-confirmed revision. Those facts were **not** re-verified by network access in this task.
- Sprint 2 contracts and any later implementation must not be deployed over the release being used for partner UAT. Deployment, traffic changes, Cloud SQL writes and secret access are outside Issue #114.
- The existing 209-test Sprint 1 claim in `README.md` is a recorded project statement, not a result produced by this task. No PASS is claimed here.
- Branch/worktree isolation: this work is in `CPE334-NutTiew-114`. The separate Lab 6 worktree `CPE334-NutTiew` @ `2a2f146` (modified `AGENTS.md`, untracked `CON`) was not cleaned, reset or switched. The human-requested Kanban agent-guidance diff was copied into this Issue branch for teammate review; its original local working copy remains untouched.

## 2. Feature dependency graph

```
Shared S2 migration (reviewed, separate Issue)
  |-- booking_guard_s2()  (replaces append-only guard)
  |-- slot_guard_s2()     (enables one-way Offered -> Withdrawn)
  |-- Booking cancellation columns + CHECK
  |-- RescheduleHistory + UNIQUE(bookingId)
  |-- Notification + UNIQUE(bookingId, kind)
        |
        +--> F-S2-01 Customer cancel (needs booking guard only)
        +--> F-S2-02 Reschedule (needs booking guard + RescheduleHistory)
        +--> F-S2-03 Tutor cancel (needs booking guard + slot guard + Notification)
        +--> F-S2-04 Notice read (needs F-S2-03 Notification + creation transaction)
        +--> F-S2-05 Slot withdrawal (needs slot guard only)
```

- **F-S2-01** is the smallest independent slice; it requires no Slot write.
- **F-S2-02** requires the same Booking guard plus the new history table; it must coordinate with F-S2-03 on the shared guard shape.
- **F-S2-03** is the first feature that mutates `Slot`; it must not be implemented before `slot_guard_s2()` is reviewed.
- **F-S2-04** depends on F-S2-03's committed notice creation; it has no independent write path.
- **F-S2-05** is independent of cancellation but shares `slot_guard_s2()`.
- The shared migration must land once, reviewed as a coherent change. Three separate conflicting trigger migrations are not acceptable.

## 3. Booking/Slot transition matrix

| Operation | Booking `status` | Booking `currentSlotId`/interval | Original Slot | Destination Slot | History | Notice |
|---|---|---|---|---|---|---|
| New Booking (S1) | `Booked` (new) | copied from Slot | unchanged `Offered` | n/a | none | none |
| Customer cancel (F-S2-01) | `Booked → Cancelled`, actor `Customer` | unchanged | stays `Offered`, unoccupied | n/a | none | none |
| Tutor cancel (F-S2-03) | `Booked → Cancelled`, actor `Tutor`, reason | unchanged | `Offered → Withdrawn` | n/a | none | one `TutorCancelled` |
| Reschedule (F-S2-02) | stays `Booked`, same ID | moves to destination | stays `Offered`, unoccupied | stays `Offered`, occupied | one immutable row | none |
| Tutor withdrawal (F-S2-05) | no Booking change | n/a | `Offered → Withdrawn` (must be unoccupied) | n/a | none | none |
| Direct Slot edit/delete with Active Booking | forbidden | forbidden | forbidden | forbidden | none | none |
| `Cancelled → Booked` | forbidden | forbidden | forbidden | forbidden | none | none |
| `Withdrawn → Offered` | forbidden | forbidden | forbidden | forbidden | none | none |

Derived rules:

- `Slot.lifecycle='Offered'` means **published**, not necessarily free; occupancy is `EXISTS(Booking WHERE currentSlotId=Slot.id AND status='Booked')`.
- A Customer cancellation reopens the Slot only by releasing occupancy; the Slot row is not written.
- A Tutor cancellation withdraws the Slot; it must never be reoffered under the same ID.
- A reschedule moves occupancy; both Slot rows remain `Offered`.
- `Past` is a display classification for `Booked` rows; it is not a status and never frees a Slot.

## 4. Transaction, rollback and concurrency matrix

| Operation | Isolation / locks (proposed) | Writes | Retry | Required rollback/race proof |
|---|---|---|---|---|
| F-S2-01 cancel | SERIALIZABLE; User(Customer, current Tutor) → Slot → Session → Booking | Booking `Cancelled` | 3 attempts on `40001/40P01/P2034`/lock-set change | cancel vs new Booking; two cancels; fault after UPDATE; Session revoke during wait |
| F-S2-02 reschedule | SERIALIZABLE; User(Customer, old Tutor, new Tutor) → both Slots → Session → Booking | RescheduleHistory INSERT + Booking move | same | same-Booking double reschedule; destination booking race; reschedule vs Tutor cancel; fault between writes |
| F-S2-03 Tutor cancel | SERIALIZABLE; User(Tutor, Customer) → Slot → Session → Booking | Booking `Cancelled` → Slot `Withdrawn` → Notification INSERT | same | Tutor cancel vs Customer cancel; vs reschedule; occupied-Slot direct SQL; fault at each write |
| F-S2-04 notice read | single owner-scoped read/UPDATE; no multi-row transaction | Notification `readAt` only | none needed; idempotent `COALESCE` | concurrent mark-read; foreign/unknown 404; no delete |
| F-S2-05 withdrawal | SERIALIZABLE; User(Tutor) → Slot → Session → (Booked Booking check) | Slot `Offered → Withdrawn` | same | withdrawal vs new Booking; vs reschedule; vs Tutor cancel; occupied direct SQL |

Shared requirements:

- `T_elig` is `clock_timestamp()` sampled **after** all required lock waits and immediately before the guarded write; never `now()` or a client time.
- Cutoffs: `>= 30m` (Customer cancel), `>= 60m` (original and destination reschedule), `>= 60m` (Tutor cancel), strict `> T_elig` (Slot withdrawal). Equality passes where the SRS says "at least".
- Global lock order is User UUID ascending → Slot UUID ascending → Session auth sub-lock → Booking. A changed discovered lock set aborts and restarts discovery; no out-of-order late lock.
- The runtime service holds the locks; DB triggers are the final backstop for direct SQL. Triggers must raise non-success errors and must not be disablable by the runtime role.
- A genuine `23505`/`23P01` is a business conflict or invariant breach, never a retry-until-success signal.
- Unknown COMMIT outcome is not rollback: return a safe unknown-outcome error and require an authenticated re-read.

## 5. Security and privacy matrix

| Surface | Role / owner predicate | Forbidden disclosure | Negative case |
|---|---|---|---|
| `POST /customer/bookings/{id}/cancel` | Customer; `Booking.customerId = principal` | foreign Booking existence, Tutor/Customer identity, reason, SQL | foreign/unknown → 404 identical |
| `POST /customer/bookings/{id}/reschedule` | Customer; `Booking.customerId = principal` | previous Tutor/history, other Customer, destination owner | foreign → 404; OD-015 unresolved |
| `POST /tutor/bookings/{id}/cancel` | Tutor; `Slot.tutorId = principal` via `currentSlotId` | Customer identity, reason echo, notice ID | wrong Tutor → 404 identical |
| `GET/POST /customer/notifications*` | Customer; `Notification.recipientCustomerId = principal` | other recipient, reason for non-owner, Booking detail for non-owner | foreign/unknown → 404 identical |
| `POST /tutor/slots/{id}/withdraw` | Tutor; `Slot.tutorId = principal` | Customer/Booking identity, raw lifecycle internals | foreign → 404 identical |
| All mutation POSTs | CSRF token, canonical Origin/Referer, expected Session binding | credentials, Session/CSRF data, SQL, stack | 401/403/403 with no mutation |

Additional rules:

- The Tutor-cancellation reason is visible only to the owning Customer (notice and cancelled Booking detail), never to other Customers, other Tutors, or logs.
- Responses use the existing safe error envelope; new codes must be added to the `messages` map at implementation.
- A `P0B03`/`P0B04` guard rejection maps to the documented conflict, never to success or a generic 500 unless the contract says the invariant is breached.

## 6. Regression strategy

| Area | Why it can regress | Required regression |
|---|---|---|
| F-S1-04 Booking | Shared `booking_guard_s2()` replaces the append-only guard | Full S1 Booking STS, including Q05 boundary, Race B/C, replay, rollback |
| F-S1-02 Tutor Slots | `slot_guard_s2()` replaces the S1 Slot guard | Slot creation, overlap Race A, immutable interval, DTO extension |
| F-S1-03 Availability | Withdrawn Slots must disappear; reopened Slots reappear | Availability eligibility, privacy, stale-view rejection |
| F-S1-05 Retrieval | `status`/`displayStatus` extension changes output | Customer list/detail, Tutor schedule, Booked vs Past, owner-scoping |
| Auth/CSRF | New mutation routes reuse the shared policy | 401/403, CSRF, Origin, Session binding, revoked Session |
| Migrations | New columns/tables/triggers can drift from Prisma | Fresh DB apply, `prisma migrate diff`/drift check, no dropped constraints |
| E2E | New actions change the Customer/Tutor flows | Browser E2E for cancel, reschedule, Tutor cancel, notice read, withdraw |

Regression evidence must record the source SHA, reviewed schema SHA, commands and actual PASS/FAIL/SKIP. The README's 209-test statement is not a substitute for a fresh run.

## 7. Traceability mapping

### 7.1 Requirements → feature → acceptance → STS → validation

| Requirement | Feature | Acceptance | STS | Validation |
|---|---|---|---|---|
| FR-020/021; BR-007/008; Q07/Q08 | F-S2-01 | AC-S2-01-01..09 | CAN-01..14 | VAL-015/016 |
| FR-022..027; BR-009..016; Q09–Q16/Q28 | F-S2-02 | AC-S2-02-01..10 | RSC-01..16 | VAL-017..020 |
| FR-028..030; BR-017..020; Q17–Q20 | F-S2-03 | AC-S2-03-01..10 | TCAN-01..14 | VAL-021/022 |
| FR-031/032; BR-021..025; Q21–Q25 | F-S2-04 | AC-S2-04-01..09 | NTF-01..12 | VAL-023/024/036 |
| FR-033/034; BR-026/027/032; Q26/Q27/Q32 | F-S2-05 | AC-S2-05-01..09 | WDR-01..14 | VAL-025..027 |
| NFR-005 (atomic consistency) | F-S2-01/02/03/05 | AC-S2-01-06, AC-S2-02-07, AC-S2-03-06, AC-S2-05-08 | CAN-09, RSC-09, TCAN-06, WDR-09 | VAL-014/020/022 |
| NFR-006 (time correctness) | F-S2-01/02/03/05 | AC-S2-01-02/07, AC-S2-02-03, AC-S2-03-02, AC-S2-05-04 | CAN-02/11, RSC-03, TCAN-02, WDR-04 | VAL-008/009/015/018/021 |
| NFR-007 (data minimization) | F-S2-01/02/03/04 | AC-S2-01-08, AC-S2-02-10, AC-S2-03-10, AC-S2-04-09 | CAN-12, RSC-14, TCAN-11, NTF-10 | VAL-023/036 |
| NFR-008 (retry safety) | F-S2-02 (and shared mutations) | AC-S2-02-05/07 | RSC-05, RSC-09, RSC-15 | VAL-020; OD-013 open |
| NFR-014 (notice durability) | F-S2-04 | AC-S2-04-02/04 | NTF-02, NTF-04, NTF-12 | VAL-024 |

### 7.2 Explicit ID coverage

- Functional requirements: FR-020, FR-021, FR-022, FR-023, FR-024, FR-025, FR-026, FR-027, FR-028, FR-029, FR-030, FR-031, FR-032, FR-033, FR-034.
- Business rules: BR-007, BR-008, BR-009, BR-010, BR-011, BR-012, BR-013, BR-014, BR-015, BR-016, BR-017, BR-018, BR-019, BR-020, BR-021, BR-022, BR-023, BR-024, BR-025, BR-026, BR-027, BR-032.
- Stakeholder decisions: Q07, Q08, Q09, Q10, Q11, Q12, Q13, Q14, Q15, Q16, Q17, Q18, Q19, Q20, Q21, Q22, Q23, Q24, Q25, Q26, Q27, Q32.
- Validation: VAL-015, VAL-016, VAL-017, VAL-018, VAL-019, VAL-020, VAL-021, VAL-022, VAL-023, VAL-024, VAL-025, VAL-026, VAL-027.
- Non-functional: NFR-005, NFR-006, NFR-007, NFR-008, NFR-014.
- Open decisions: OD-008, OD-013, OD-014, OD-015.

### 7.3 Q coverage

Q07/Q08 → F-S2-01; Q09–Q16 → F-S2-02; Q17–Q20 → F-S2-03; Q21–Q25 → F-S2-04; Q26/Q27/Q32 → F-S2-05. Q05/Q28/Q30 remain shared constraints and are not redefined.

### 7.4 Change-layer inventory (S2 edits to accepted S1 output)

| Accepted S1 surface | S2 change | Regression owner |
|---|---|---|
| Customer Booking list/detail DTO | `status: 'Booked'|'Cancelled'`; `displayStatus: 'Booked'|'Past'|'Cancelled'`; cancellation fields | F-S2-01/04 + F-S1-05 regression |
| Tutor Slot DTO | `lifecycle: 'Offered'|'Withdrawn'`; `withdrawnAt` | F-S2-05 + F-S1-02 regression |
| Booking guard | `booking_guard_s2()` replaces append-only guard | Shared migration + F-S1-04 regression |
| Slot guard | `slot_guard_s2()` enables one-way withdrawal | Shared migration + F-S1-02 regression |
| Database | New columns, `RescheduleHistory`, `Notification` | Shared migration |

No other Sprint 1 endpoint or DTO is intentionally changed.

## 8. Open decision register

| ID | Status | Contract impact | Must be resolved before |
|---|---|---|---|
| **OD-008** | **OPEN** | Retention/deletion/export of notices, reasons and history. Contracts provide no delete endpoint and no expiry. | F-S2-04 notice sign-off; any retention implementation |
| **OD-013** | **OPEN** | Idempotency key, replay window and repeated-response behaviour for cancel/reschedule/withdraw. Contracts fix invariants only; unknown outcome requires re-read. | F-S2-01/02/03/05 implementation |
| **OD-014** | **OPEN** | Definition of a "meaningful" Tutor reason beyond trim-and-nonblank; length/vocabulary policy. A 500-code-point maximum is **PROPOSED only**. | F-S2-03 implementation and STS approval |
| **OD-015** | **OPEN** | Previous-Tutor visibility of historical Booking/reschedule data. Contracts expose no history endpoint. | Any history UI/API; F-S2-02 sign-off |

Additional unresolved engineering items (not stakeholder decisions):

- Exact reason length bound if OD-014 is not resolved.
- Whether a notification unread count is displayed; contracts derive it from the list and do not persist a count.
- Migration reconciliation of any pre-existing `Cancelled` fixture rows before the cancellation CHECK is added.
- SDS §7.1 lock-order wording (Session position) needs a separate editorial correction.

## 9. Human-review prerequisites

Before any feature implementation:

1. **Contract review:** the other human teammate reviews all five feature contracts, the shared transition matrix and the STS. The author must not self-approve.
2. **Shared migration review:** one reviewed forward migration for the Booking guard, Slot guard, Booking columns, `RescheduleHistory` and `Notification`; separate from feature code review.
3. **STS approval:** the planned cases, fixtures, barriers, controlled-clock seam and fault-injection points are accepted.
4. **Decision log:** OD-008/013/014/015 remain open or are resolved with recorded owner approval; no silent policy is invented.
5. **Baseline check:** re-fetch `origin/sprint1`, confirm the base SHA and that the Lab 6 UAT release is unchanged; do not deploy S2 work during partner testing.
6. **PR path:** Issue-linked PR to `sprint1`, human review by the other teammate, required CI; release to `main` only through a separate reviewed `sprint1 → main` PR.

## 10. Contract files in this change

- [F-S2-01 specification](../features/F-S2-01/specification.md), [UI](../features/F-S2-01/ui-spec.md), [API](../features/F-S2-01/api-spec.md), [data](../features/F-S2-01/data-spec.md), [STS](../features/F-S2-01/tests.md)
- [F-S2-02 specification](../features/F-S2-02/specification.md), [UI](../features/F-S2-02/ui-spec.md), [API](../features/F-S2-02/api-spec.md), [data](../features/F-S2-02/data-spec.md), [STS](../features/F-S2-02/tests.md)
- [F-S2-03 specification](../features/F-S2-03/specification.md), [UI](../features/F-S2-03/ui-spec.md), [API](../features/F-S2-03/api-spec.md), [data](../features/F-S2-03/data-spec.md), [STS](../features/F-S2-03/tests.md)
- [F-S2-04 specification](../features/F-S2-04/specification.md), [UI](../features/F-S2-04/ui-spec.md), [API](../features/F-S2-04/api-spec.md), [data](../features/F-S2-04/data-spec.md), [STS](../features/F-S2-04/tests.md)
- [F-S2-05 specification](../features/F-S2-05/specification.md), [UI](../features/F-S2-05/ui-spec.md), [API](../features/F-S2-05/api-spec.md), [data](../features/F-S2-05/data-spec.md), [STS](../features/F-S2-05/tests.md)

No application source, executable test, Prisma schema, migration or Sprint 1 contract was modified. The audit additionally includes the human-requested `AGENTS.md` Kanban status-sync guidance (a documented PR scope extension) so the teammate can review this team-wide workflow change alongside Issue #114.
