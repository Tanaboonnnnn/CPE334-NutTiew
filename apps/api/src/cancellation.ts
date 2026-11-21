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

export async function cancelCustomerBooking(
  pool: Pool,
  principal: { userId: string; sessionId: string },
  bookingId: string,
  hooks?: CancellationHooks,
): Promise<CustomerBookingDetailDto> {
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
      await client.query("SELECT public.s2_mutate('CustomerCancel', $1::uuid, $2::uuid, $3::uuid)",
        [principal.userId, principal.sessionId, bookingId]);
      phase = 'projection';
      const { data } = await getCustomerBookingDetail(client, principal.userId, bookingId);
      if (data.status !== 'Cancelled' || data.cancellationActor !== 'Customer') {
        throw new Error('Unexpected cancellation projection');
      }
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
        }
        throw new BookingError(503, 'SERVICE_UNAVAILABLE');
      }
    } finally {
      client.release(discard);
    }
    await delay(8 * (attempt + 1) + Math.floor(Math.random() * 8));
  }
  throw new BookingError(503, 'TRANSACTION_RETRY_EXHAUSTED');
}
