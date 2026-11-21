# F-S2-04 — Private Tutor-Cancellation Notice Data Contract (Part E)

> **Proposed data contract for independent review; no Prisma model, SQL migration, trigger, index or database test is added by Issue #114.** Every SQL fragment below is **illustrative and NOT EXECUTED**.

## 1. Canonical source and ownership

The `Notification` table is created by the F-S2-03 migration (`id`, `recipientCustomerId`, `bookingId`, `kind`, `createdAt`, `readAt`). This feature **reads** it and updates only `readAt`. It does not create a second table and does not duplicate the cancellation reason: the reason is projected from the owning `Booking.tutorCancellationReason`.

## 2. Read model

| Output field | Source | Rule |
|---|---|---|
| `id` | `Notification.id` | Owner-scoped |
| `kind` | `Notification.kind` | Only `TutorCancelled` in S2 |
| `createdAt` | `Notification.createdAt` | Never an expiry input |
| `readAt` | `Notification.readAt` | `null` = unread; never deletes |
| `reason` | `Booking.tutorCancellationReason` via `Notification.bookingId` | Owner-scoped join; never duplicated |
| `booking.id` / `slotId` / `startsAt` / `endsAt` / `status` / `cancelledAt` | `Booking` + `Slot` | Current owner-scoped Booking state |
| `booking.tutorRef` | `Slot.tutorId` prefix | Existing F-S1-05 style; no raw Tutor identity |

```sql
-- PROPOSED, NOT EXECUTED.
SELECT
  n."id", n."kind", n."createdAt", n."readAt",
  b."tutorCancellationReason" AS "reason",
  b."id" AS "bookingId", b."currentSlotId" AS "slotId",
  b."startsAt", b."endsAt", b."status", b."cancelledAt",
  s."tutorId"
FROM "Notification" AS n
JOIN "Booking" AS b ON b."id" = n."bookingId"
JOIN "Slot" AS s ON s."id" = b."currentSlotId"
WHERE n."recipientCustomerId" = $1
  AND n."kind" = 'TutorCancelled'
ORDER BY n."createdAt" DESC, n."id" DESC;
```

- There is **no** `expiresAt`, no `deletedAt`, no `readAt < ...` filter and no age-based predicate.
- The owner predicate is applied in SQL, not after fetching.
- Detail and mark-read use the same `recipientCustomerId = $principal` predicate; a foreign row is indistinguishable from a missing row.

## 3. Mark-read update

```sql
-- PROPOSED, NOT EXECUTED.
UPDATE "Notification"
   SET "readAt" = COALESCE("readAt", clock_timestamp())
 WHERE "id" = $1
   AND "recipientCustomerId" = $2
   AND "kind" = 'TutorCancelled'
RETURNING "id", "kind", "createdAt", "readAt";
```

- Idempotent: a second call keeps the original `readAt`.
- `rowCount = 0` → 404 `NOTIFICATION_NOT_FOUND` (foreign or missing).
- No delete, no content change, no Booking/Slot write.

## 4. Guard requirement

`notification_guard_s2()` must:

| Operation | Rule |
|---|---|
| INSERT | Only from the F-S2-03 Tutor-cancellation transaction; `kind='TutorCancelled'`; `readAt IS NULL`; recipient equals the Booking's `customerId`. |
| UPDATE | Only `readAt: NULL → timestamp` or a no-op; reject changes to `recipientCustomerId`, `bookingId`, `kind`, `createdAt`. |
| DELETE / TRUNCATE | Reject unconditionally. |

The trigger must raise a non-success error so the whole transaction rolls back. The runtime role must not be able to disable it. Exact SQL and trigger order are proven in Part F.

## 5. Constraints and indexes

- `notification_one_per_booking_kind UNIQUE (bookingId, kind)` prevents a second notice for the same Booking.
- `notification_recipient_created_idx (recipientCustomerId, createdAt DESC, id DESC)` supports the owner list.
- `notification_read_after_create CHECK (readAt IS NULL OR readAt >= createdAt)`.
- FKs to `User` and `Booking` are restrictive; no cascade delete is authorized.

## 6. Durability and retention

- NFR-014 requires the notice to remain retrievable after read and after elapsed time.
- **OD-008 remains OPEN:** user/admin deletion, retention duration and export are not decided. This contract provides no delete endpoint and no cleanup job.
- A future retention implementation must be a separately reviewed change and must not silently remove notices.

## 7. DTO and cross-feature consistency

- The notice DTO is defined in [API](api-spec.md) §2; it includes `reason` and a minimal Booking summary.
- The same reason appears in the owner's cancelled Booking detail via the shared Sprint 2 Booking DTO extension ([F-S2-01 data](../F-S2-01/data-spec.md) §6).
- No Tutor or third-party DTO includes the reason.

## 8. No-change layers

- No `Slot` or `Booking` write in this feature.
- No auth/session table change.
- No change to F-S1-05 list/detail beyond the shared Sprint 2 status/cancellation fields.
- No notification delivery channel (email/SMS/push).

## 9. Open decisions

- **OD-008:** retention/deletion/export are open.
- **OD-014:** reason content policy belongs to F-S2-03; this feature only displays the stored value.
- **OD-013:** not directly applicable; mark-read is idempotent by `COALESCE`.
