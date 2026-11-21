# F-S2-04 — Private Tutor-Cancellation Notice Software Test Specification (Part E)

> **Planned STS only.** No executable test, PostgreSQL run, browser test or PASS result is included. Execute against the reviewed F-S2-03 migration and record the exact source/schema SHA.

## 1. Traceability and test setup

Sources: [Feature SDS](specification.md), [UI](ui-spec.md), [API](api-spec.md), [data](data-spec.md), [SRS](../../srs.md) (Q21–Q25, FR-031/032, BR-021..025, NFR-007/014, VAL-023/024/036, OD-008), [System SDS](../../system-sds.md) (§§3.2–3.3, 5.3) and the Sprint 1 retrieval STS.

Required Part F setup: disposable PostgreSQL 18 at the reviewed S2 schema SHA; Customer A/B, Tutor A/B; live Sessions; a committed Tutor cancellation created through the API (F-S2-03) and a Customer cancellation and reschedule for negative creation checks; a controlled clock for elapsed-time simulation; a fresh connection for final-row inspection.

All cases below are **PLANNED / NOT RUN**.

## 2. Planned STS cases

| ID | Requirement trace | Setup / action | Expected observable result |
|---|---|---|---|
| NTF-01 | FR-031/032; AC-S2-04-01; VAL-023 | Customer A lists notices after one Tutor cancellation. | Exactly one `TutorCancelled` notice for A with Booking summary, interval, `createdAt`, `readAt=null` and reason; no other Customer's notice. |
| NTF-02 | BR-024; AC-S2-04-02; VAL-024 | Mark read, then retrieve again and re-open the detail. | 200 with `readAt` set; second read returns the same reason/content; notice remains listed. |
| NTF-03 | AC-S2-04-03; NFR-001 | Customer B requests A's notice ID and an unknown UUID; anonymous and Tutor role. | 404 for foreign/unknown with identical body; 401; 403; no reason/Booking/identity leak. |
| NTF-04 | BR-025; AC-S2-04-04; NFR-014; VAL-024 | Simulate a long elapsed interval (old `createdAt`, old `readAt`). | The notice is still returned; no expiry predicate exists; content unchanged. |
| NTF-05 | BR-023; AC-S2-04-05; VAL-023 | Compare the notice reason with the owner's cancelled Booking detail; check a foreign Customer's detail. | Same reason for the owner in both; no reason for a foreign Customer. |
| NTF-06 | AC-S2-04-06 | Two concurrent mark-read requests for the same notice. | One persisted `readAt`; both responses return that value; no error required; notice content unchanged. |
| NTF-07 | AC-S2-04-07; BR-021 | Perform a Customer cancellation and a reschedule; then list notices. | No notice is created by either operation; only a committed Tutor cancellation creates one. |
| NTF-08 | AC-S2-04-08 | Direct SQL: change `recipientCustomerId`, `bookingId`, `kind`, `createdAt`, delete the notice, truncate, insert a second notice for the same Booking. | Guard/unique index rejects each; committed rows unchanged. |
| NTF-09 | AC-S2-04-08 | Direct SQL: set `readAt` to an arbitrary earlier timestamp or to `NULL` after read. | Guard rejects unsupported transitions; `readAt` remains the original timestamp. |
| NTF-10 | AC-S2-04-09; NFR-007 | Inspect list/detail/mark-read bodies, error bodies and logs. | No third-party identity, credential, Session/CSRF data, SQL or stack trace; no reason in logs. |
| NTF-11 | AC-S2-04-01 | Create notices for two Customers and inspect ordering and scoping. | Newest first, stable by `id`; each Customer sees only their rows. |
| NTF-12 | NFR-003 | Mark read, restart the API process against the same DB, re-read the list. | `readAt` and content persist; the notice is still listed. |

## 3. Required existing-anchor coverage

| Anchor | Planned case |
|---|---|
| VAL-023 | NTF-01, NTF-05 |
| VAL-024 | NTF-02, NTF-04, NTF-12 |
| FR-031 / BR-021..023 | NTF-01, NTF-05, NTF-07 |
| FR-032 / BR-024/025 | NTF-02, NTF-04, NTF-09 |
| NFR-001 | NTF-03 |
| NFR-003 | NTF-12 |
| NFR-007 | NTF-03, NTF-10 |
| NFR-014 | NTF-04, NTF-12 |
| OD-008 | NTF-04, NTF-08 (no delete claimed) |

Feature AC IDs `AC-S2-04-01..09` are new and do not renumber Sprint 1 IDs.

## 4. Part E boundary and Part F evidence

**Part E:** planned cases only; no test has run and no PASS is claimed.

**Part F evidence per run:** case ID; command; source commit; reviewed S2 schema SHA; PostgreSQL version; fixture IDs; expected/actual HTTP; Notification/Booking rows before/after; PASS/FAIL/SKIP with reason. Redact secrets, reasons from logs and real user data.

## 5. Independent review checklist

- [ ] Confirm the owner-scoped SQL predicate and 404-for-foreign privacy.
- [ ] Confirm the reason is projected from the owning Booking, not duplicated.
- [ ] Confirm no expiry predicate, no delete endpoint and no cleanup job.
- [ ] Confirm mark-read idempotence and the guard's allowed update.
- [ ] Confirm the reason appears only in the owner's notice and cancelled Booking detail.
- [ ] Confirm OD-008 remains open.
- [ ] Confirm no executable test or code is claimed by this Part E document.

**Status:** PLANNED / NOT RUN.
