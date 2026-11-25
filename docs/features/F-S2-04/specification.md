# F-S2-04 — Private Tutor-Cancellation Notice Feature SDS (Part E)

> **Documentation contract only; no application code, migration, executable test, PostgreSQL run or approval is included.** Issue [#114](https://github.com/Tanaboonnnnn/CPE334-NutTiew/issues/114); owner and independent reviewer are to be assigned by the two-person team. Prepared on `docs/114-s2-contracts` from local `origin/sprint1` @ `41b310c83573e672be8c4189607380d56e598291`; the remote head was **not** re-fetched. Status: **DRAFT FOR HUMAN REVIEW**.

## 1. Authority and baseline

Sources: [SRS](../../srs.md) (Q21–Q25, FR-031/032, BR-021..025, NFR-007/014, VAL-023/024/036, OD-008), [Feature Inventory](../../features.md), [traceability](../../traceability.md), [System SDS](../../system-sds.md) (§§3.2–3.3, 5.3, 6), [plan](../../sprints/plan.md), and the accepted Sprint 1 retrieval contract.

**Verified local facts:** there is no `Notification` table in the accepted schema. F-S2-03 creates it (`id`, `recipientCustomerId`, `bookingId`, `kind='TutorCancelled'`, `createdAt`, `readAt`) and inserts exactly one per successful Tutor cancellation. The cancellation reason lives on `Booking.tutorCancellationReason`; this feature **projects** it rather than duplicating it. There is no read/notification endpoint in Sprint 1.

**Sprint 1 baseline isolation:** no Sprint 1 endpoint or DTO is changed. The F-S1-05 Booking detail extension (reason for the owner) is a Sprint 2 change and must be regression-tested. Do not deploy over the Lab 6 UAT release.

## 2. Outcome and journey

The owning Customer can list and re-read private notices created by Tutor cancellations, mark them read, and still read them later. A read notice is never deleted or hidden by age. No other Customer or Tutor can see the notice or its reason.

1. After a successful Tutor cancellation, the Customer has one `TutorCancelled` notice addressed to them.
2. Customer opens the notification list; each item shows the affected Booking, Tutor cancellation time and reason.
3. Customer opens one notice; the reason is shown.
4. Customer marks it read; the notice remains in the list and remains readable.
5. Customer can re-open the read notice later; no time-based expiry occurs.
6. The same reason also appears in the owning Customer's cancelled Booking detail.

## 3. Scope

**In scope:** Customer-only list/detail/read of own `TutorCancelled` notices; durable read state; reason projection from the owning Booking; no automatic expiry; response/error contract; authorization/privacy; read-update concurrency; UI and planned STS.

**Out of scope:** notice creation (F-S2-03), other notice kinds, push/email/SMS delivery, unread-count badge semantics beyond a simple derived count, pagination/filtering, delete/archive, retention/export policy (OD-008), admin views, marking all read, notification preferences, and deployment.

**No-change layers:** `Slot`, `Booking` writes (other than reading the reason), auth/session tables, availability, Tutor schedule, CSRF middleware.

## 4. Invariants

| Invariant | F-S2-04 contract |
|---|---|
| Recipient | Only `Notification.recipientCustomerId = principal.userId` from a live Customer Session. |
| Kind | Only `TutorCancelled` is exposed in S2. |
| Reason | Projected from the owning `Booking.tutorCancellationReason`; never stored twice, never read from another Booking. |
| Durability | `readAt` never deletes or hides the notice; there is no time-based expiry predicate. |
| Read idempotence | Marking read is idempotent; an already-read notice keeps its original `readAt`. |
| Creation coupling | A notice exists only for a committed Tutor cancellation; a Customer cancellation or reschedule creates none. |
| Privacy | Foreign/unknown notice → 404 identical body; no reason, Customer identity or Booking detail for a non-recipient. |
| No delete | No API deletes a notice; deletion/retention is undecided (OD-008). |

## 5. Business rules

- **BR-021:** one notice per successful Tutor cancellation, for the affected owning Customer only.
- **BR-022:** reason visible only to that Customer.
- **BR-023:** reason appears in both the notice and the cancelled Booking detail.
- **BR-024:** reading does not make it inaccessible.
- **BR-025:** no automatic time-based expiry; deletion/retention remains open.
- **NFR-014:** notice durability after read and age.
- **NFR-007:** data minimization in every response body and negative payload.

## 6. State model

| Event | `readAt` | Visible in list | Content readable |
|---|---|---|---|
| Tutor cancellation commits | `NULL` | yes | yes |
| Customer marks read | timestamp | yes | yes |
| Customer marks read again | unchanged timestamp | yes | yes |
| Any elapsed time | unchanged | yes | yes |
| Customer cancellation / reschedule | no notice created | n/a | n/a |

There is no `Deleted` state and no expiry transition.

## 7. Read and update protocol (proposed for review)

1. Authenticate `requireSession` + `requireRole('Customer')`; empty query; valid UUID for detail/read.
2. List/detail: one owner-scoped SQL predicate `n.recipientCustomerId = $principal` joined to `Booking` on `n.bookingId` and to `Slot` for the interval; no client owner parameter.
3. Detail/read of a foreign or unknown notice returns 404 with an identical body.
4. Mark read: `UPDATE "Notification" SET "readAt" = COALESCE("readAt", clock_timestamp()) WHERE "id"=$id AND "recipientCustomerId"=$principal RETURNING ...`.
5. The `notification_guard_s2()` trigger permits only `readAt: NULL → timestamp` (or no-op) and rejects every other UPDATE, DELETE and TRUNCATE.
6. Return the updated notice only after the update commits; an already-read notice returns its original `readAt`.
7. No transaction retry loop is required for a single-row idempotent update; a connection failure returns 503 with no false success.

## 8. Failure and concurrency

- Concurrent mark-read requests: one sets `readAt`; the others return the same value (idempotent), no error required.
- A notice whose Booking is missing cannot exist because of the FK; if it does, fail closed rather than fabricate content.
- A read failure never deletes the notice.
- No cross-feature transaction is opened by this read path.

## 9. Security and privacy

- Foreign/unknown notice → 404; wrong role → 403; anonymous → 401.
- The list/detail never includes the Tutor's identity beyond the existing `tutorRef` policy, another Customer's identity, credentials, Session/CSRF data, SQL or a stack trace.
- The reason is returned only with an owner-scoped notice or the owner's cancelled Booking detail.
- CSRF/Origin rules apply to the read-marking POST.

## 10. Acceptance criteria (feature-level, stable IDs)

| ID | Acceptance criterion |
|---|---|
| AC-S2-04-01 | The owning Customer lists exactly their `TutorCancelled` notices with Booking reference, interval, `createdAt`, `readAt` and reason; no other Customer's notice appears. |
| AC-S2-04-02 | Marking a notice read sets `readAt`; re-reading returns the same notice and reason; no deletion. |
| AC-S2-04-03 | A foreign or unknown notice returns 404 with an identical body; no reason/Booking detail leaks. |
| AC-S2-04-04 | A notice remains retrievable after an elapsed-time simulation; no automatic expiry predicate exists. |
| AC-S2-04-05 | The reason also appears in the owner's cancelled Booking detail and nowhere else. |
| AC-S2-04-06 | Concurrent mark-read requests are idempotent; exactly one `readAt` value persists. |
| AC-S2-04-07 | Customer cancellation and reschedule create no notice; only a committed Tutor cancellation does. |
| AC-S2-04-08 | Direct SQL cannot change notice content/recipient/booking/kind, delete a notice, or create a second notice for the same Booking. |
| AC-S2-04-09 | Responses and logs contain no third-party identity, credential, Session/CSRF data, SQL or stack trace. |

## 11. Dependencies, open decisions and blockers

- **Depends on:** F-S2-03 `Notification` table and creation transaction; the shared Sprint 2 Booking DTO extension for the cancelled Booking detail reason.
- **OD-008 (OPEN):** retention, deletion and export are undecided. No delete endpoint is authorized.
- **OD-013 (OPEN):** not directly applicable; mark-read is idempotent by `COALESCE`.
- **OD-014 (OPEN):** reason content policy belongs to F-S2-03; this feature only displays the stored value.
- **Blocker:** implementation waits for the reviewed F-S2-03 migration and the notice-read authorization contract.

## 12. Definition of Done (for the later implementation Issue)

- Contract and STS reviewed before code.
- Real UI → API → DB list/detail/read journey plus privacy, durability, idempotence and negative cases executed and recorded.
- Sprint 1 regression suite still passes.
- No unfinished Sprint 2 build deployed over the Lab 6 UAT release.

## 13. Independent review checklist

- [ ] Confirm owner-scoped predicate and 404-for-foreign privacy.
- [ ] Confirm reason is projected from the owning Booking, not duplicated.
- [ ] Confirm no expiry predicate and no delete endpoint.
- [ ] Confirm mark-read idempotence and the guard's allowed update.
- [ ] Confirm the reason also appears in the owner's Booking detail only.
- [ ] Confirm OD-008 remains open.
- [ ] Confirm no code, migration, executable test or deployment is claimed.
