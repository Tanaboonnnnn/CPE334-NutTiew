import type { Pool, PoolClient } from 'pg';
import { BookingError } from './bookings.js';

export type NotificationHooks = {
  beforeMutation?: (client: PoolClient) => Promise<void>;
  beforeCommit?: (client: PoolClient) => Promise<void>;
  afterCommit?: () => Promise<void>;
};

export type CustomerNotificationDto = {
  id: string;
  kind: 'TutorCancelled';
  createdAt: string;
  readAt: string | null;
  reason: string;
  booking: {
    id: string;
    slotId: string;
    tutorRef: string;
    startsAt: string;
    endsAt: string;
    status: 'Cancelled';
    cancelledAt: string;
  };
};

type NotificationRow = {
  id: string;
  kind: string;
  createdAt: string;
  readAt: string | null;
  reason: string | null;
  bookingId: string;
  slotId: string;
  tutorId: string;
  startsAt: string;
  endsAt: string;
  bookingStatus: string;
  cancelledAt: string | null;
};

type PgError = { code?: string; message?: string };

const NOTIFICATION_SELECT_BASE = `
  SELECT
    n."id",
    n."kind",
    to_char(n."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
    to_char(n."readAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "readAt",
    b."tutorCancellationReason" AS "reason",
    b."id" AS "bookingId",
    b."currentSlotId" AS "slotId",
    s."tutorId",
    to_char(b."startsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",
    to_char(b."endsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
    b."status" AS "bookingStatus",
    to_char(b."cancelledAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "cancelledAt"
  FROM "Notification" AS n
  INNER JOIN "Booking" AS b
    ON b."id" = n."bookingId"
   AND b."customerId" = n."recipientCustomerId"
  INNER JOIN "Slot" AS s
    ON s."id" = b."currentSlotId"
`;

function projectNotification(row: NotificationRow): CustomerNotificationDto {
  if (
    row.kind !== 'TutorCancelled' ||
    row.bookingStatus !== 'Cancelled' ||
    !row.cancelledAt ||
    typeof row.reason !== 'string' ||
    row.reason.trim().length === 0
  ) {
    throw new BookingError(503, 'SERVICE_UNAVAILABLE');
  }
  return {
    id: row.id,
    kind: 'TutorCancelled',
    createdAt: row.createdAt,
    readAt: row.readAt,
    reason: row.reason,
    booking: {
      id: row.bookingId,
      slotId: row.slotId,
      tutorRef: `TUTOR-${row.tutorId.slice(0, 8)}`,
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: 'Cancelled',
      cancelledAt: row.cancelledAt,
    },
  };
}

export async function listCustomerNotifications(
  db: Pool | PoolClient,
  customerId: string,
): Promise<CustomerNotificationDto[]> {
  const res = await db.query<NotificationRow>(
    `${NOTIFICATION_SELECT_BASE}
     WHERE n."recipientCustomerId" = $1::uuid
       AND n."kind" = 'TutorCancelled'
     ORDER BY n."createdAt" DESC, n."id" DESC`,
    [customerId],
  );
  return res.rows.map(projectNotification);
}

export async function getCustomerNotificationDetail(
  db: Pool | PoolClient,
  customerId: string,
  notificationId: string,
): Promise<CustomerNotificationDto> {
  const res = await db.query<NotificationRow>(
    `${NOTIFICATION_SELECT_BASE}
     WHERE n."id" = $1::uuid
       AND n."recipientCustomerId" = $2::uuid
       AND n."kind" = 'TutorCancelled'`,
    [notificationId, customerId],
  );
  if (res.rowCount !== 1) {
    throw new BookingError(404, 'NOTIFICATION_NOT_FOUND');
  }
  return projectNotification(res.rows[0]);
}

export async function markCustomerNotificationRead(
  pool: Pool,
  principal: { userId: string; sessionId: string },
  notificationId: string,
  hooks?: NotificationHooks,
): Promise<CustomerNotificationDto> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const client = await pool.connect().catch(() => {
      throw new BookingError(503, 'SERVICE_UNAVAILABLE');
    });
    let phase: 'begin' | 'mutation' | 'projection' | 'commit' | 'acknowledged' = 'begin';
    let discard = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      phase = 'mutation';
      await hooks?.beforeMutation?.(client);
      await client.query("SELECT public.s2_mutate('MarkRead', $1::uuid, $2::uuid, $3::uuid)", [
        principal.userId,
        principal.sessionId,
        notificationId,
      ]);
      phase = 'projection';
      const data = await getCustomerNotificationDetail(client, principal.userId, notificationId);
      if (!data.readAt) {
        throw new BookingError(503, 'SERVICE_UNAVAILABLE');
      }
      await hooks?.beforeCommit?.(client);
      phase = 'commit';
      const commit = await client.query('COMMIT');
      if (commit.command !== 'COMMIT') throw new Error('Unexpected commit result');
      phase = 'acknowledged';
      await hooks?.afterCommit?.();
      return data;
    } catch (error) {
      const pg = error as PgError | null;
      const retryable = pg?.code === '40001' || pg?.code === '40P01' || pg?.code === 'P2034';
      if (phase === 'acknowledged' || (phase === 'commit' && !retryable && !pg?.code?.startsWith('23'))) {
        discard = true;
        throw new BookingError(503, 'SERVICE_UNAVAILABLE');
      }
      try {
        await client.query('ROLLBACK');
      } catch {
        discard = true;
      }
      if (retryable) {
        if (attempt < 2) {
          await new Promise(resolve => setTimeout(resolve, 10 * (attempt + 1)));
          continue;
        }
        throw new BookingError(503, 'SERVICE_UNAVAILABLE');
      }
      if (phase === 'mutation') {
        if (pg?.code === '28000') throw new BookingError(401, 'UNAUTHENTICATED');
        // An internal privilege denial (e.g. missing EXECUTE grant) is not a role decision.
        if (pg?.code === '42501' && pg.message === 'Wrong role') throw new BookingError(403, 'FORBIDDEN');
        if (pg?.code === 'P0002') throw new BookingError(404, 'NOTIFICATION_NOT_FOUND');
      }
      if (error instanceof BookingError) throw error;
      throw new BookingError(503, 'SERVICE_UNAVAILABLE');
    } finally {
      client.release(discard);
    }
  }
  throw new BookingError(503, 'SERVICE_UNAVAILABLE');
}
