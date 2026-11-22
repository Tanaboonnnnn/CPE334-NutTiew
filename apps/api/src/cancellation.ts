import { DatabaseError, type Pool, type PoolClient } from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { BookingError } from './bookings.js';
import { getCustomerBookingDetail, type CustomerBookingDetailDto } from './retrieval.js';

/** Internal fault/barrier seams, injected only by integration tests. */
export type CancellationHooks = {
  beforeMutation?: (client: PoolClient) => Promise<void>;
  beforeCommit?: (client: PoolClient) => Promise<void>;
  afterCommit?: () => Promise<void>;
};

type MutationPrincipal = { userId: string; sessionId: string };
type Cancellation = { actor: 'Customer' } | { actor: 'Tutor'; reason: string };

export type TutorCancellationDto = {
  id: string;
  slotId: string;
  startsAt: string;
  endsAt: string;
  status: 'Cancelled';
  cancelledAt: string;
};

export function cancelCustomerBooking(
  pool: Pool, principal: MutationPrincipal, bookingId: string, hooks?: CancellationHooks,
): Promise<CustomerBookingDetailDto> {
  return cancelBooking(pool, principal, bookingId, { actor: 'Customer' }, async client => {
    const { data } = await getCustomerBookingDetail(client, principal.userId, bookingId);
    if (data.status !== 'Cancelled' || data.cancellationActor !== 'Customer') {
      throw new Error('Unexpected cancellation projection');
    }
    return data;
  }, hooks);
}

export function cancelTutorBooking(
  pool: Pool, principal: MutationPrincipal, bookingId: string, reason: string, hooks?: CancellationHooks,
): Promise<TutorCancellationDto> {
  return cancelBooking(pool, principal, bookingId, { actor: 'Tutor', reason }, async client => {
    // Do not select any Customer identity, notice identifier or cancellation reason.
    const { rows: [row] } = await client.query<{
      id: string; slotId: string; startsAt: Date; endsAt: Date; cancelledAt: Date;
    }>(
      'SELECT b.id, b."currentSlotId" AS "slotId", b."startsAt", b."endsAt", b."cancelledAt"' +
      ' FROM "Booking" b JOIN "Slot" s ON s.id=b."currentSlotId"' +
      " WHERE b.id=$1 AND s.\"tutorId\"=$2 AND b.status='Cancelled'" +
      " AND b.\"cancellationActor\"='Tutor' AND s.lifecycle='Withdrawn'",
      [bookingId, principal.userId],
    );
    if (!row || !row.cancelledAt) throw new BookingError(500, 'INTERNAL_ERROR');
    return {
      id: row.id, slotId: row.slotId, startsAt: row.startsAt.toISOString(), endsAt: row.endsAt.toISOString(),
      status: 'Cancelled', cancelledAt: row.cancelledAt.toISOString(),
    };
  }, hooks);
}

async function cancelBooking<T>(
  pool: Pool, principal: MutationPrincipal, bookingId: string, cancellation: Cancellation,
  project: (client: PoolClient) => Promise<T>, hooks?: CancellationHooks,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const client = await pool.connect().catch(() => { throw new BookingError(503, 'SERVICE_UNAVAILABLE'); });
    let phase: 'begin' | 'mutation' | 'projection' | 'commit' | 'acknowledged' = 'begin';
    let discard = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      phase = 'mutation';
      await hooks?.beforeMutation?.(client);
      // PR #128 owns lock discovery/order, authorization revalidation and the
      // post-lock PostgreSQL clock. Do not pre-lock or submit a timestamp here.
      await client.query('SELECT public.s2_mutate($1::text, $2::uuid, $3::uuid, $4::uuid, NULL, $5::text)',
        [cancellation.actor === 'Tutor' ? 'TutorCancel' : 'CustomerCancel',
          principal.userId, principal.sessionId, bookingId,
          cancellation.actor === 'Tutor' ? cancellation.reason : null]);
      phase = 'projection';
      const data = await project(client);
      await hooks?.beforeCommit?.(client);
      phase = 'commit';
      const commit = await client.query('COMMIT');
      if (commit.command !== 'COMMIT') throw new Error('Commit not acknowledged');
      phase = 'acknowledged';
      await hooks?.afterCommit?.();
      return data;
    } catch (error) {
      const pg = error instanceof DatabaseError ? error : undefined;
      const retryable = pg?.code === '40001' || pg?.code === '40P01';
      if (phase === 'acknowledged' || (phase === 'commit' && !retryable && !pg?.code?.startsWith('23'))) {
        discard = true;
        throw new BookingError(503, 'MUTATION_OUTCOME_UNKNOWN');
      }
      try { await client.query('ROLLBACK'); } catch { discard = true; }
      if (retryable) {
        if (attempt === 2) throw new BookingError(503, 'TRANSACTION_RETRY_EXHAUSTED');
      } else {
        if (phase === 'mutation') {
          if (pg?.code === '28000') throw new BookingError(401, 'UNAUTHENTICATED');
          // An internal privilege denial is not a role decision.
          if (pg?.code === '42501' && pg.message === 'Wrong role') throw new BookingError(403, 'FORBIDDEN');
          if (pg?.code === 'P0002') throw new BookingError(404, 'BOOKING_NOT_FOUND');
          if (pg?.code === '23514' && pg.constraint === 'booking_s2_cancelled_terminal') {
            throw new BookingError(409, 'BOOKING_NOT_CANCELLABLE');
          }
          if (pg?.code === 'P0B05') throw new BookingError(422, 'CANCELLATION_WINDOW_CLOSED');
          if (cancellation.actor === 'Tutor' && pg?.code === 'P0B01') throw new BookingError(500, 'INTERNAL_ERROR');
        }
        if (cancellation.actor === 'Tutor' && phase === 'projection' && error instanceof BookingError) throw error;
        throw new BookingError(503, 'SERVICE_UNAVAILABLE');
      }
    } finally {
      client.release(discard);
    }
    await delay(8 * (attempt + 1) + Math.floor(Math.random() * 8));
  }
  throw new BookingError(503, 'TRANSACTION_RETRY_EXHAUSTED');
}
