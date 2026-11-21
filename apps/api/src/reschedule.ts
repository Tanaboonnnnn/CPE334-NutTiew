import { DatabaseError, type Pool, type PoolClient } from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { BookingError } from './bookings.js';
import { getCustomerBookingDetail, type CustomerBookingDetailDto } from './retrieval.js';

/** Internal fault/barrier seams, injected only by integration tests. */
export type RescheduleHooks = {
  beforeMutation?: (client: PoolClient) => Promise<void>;
  beforeCommit?: (client: PoolClient) => Promise<void>;
  afterCommit?: () => Promise<void>;
};

function mapRescheduleMutationError(pg: DatabaseError | undefined): BookingError {
  if (!pg) return new BookingError(503, 'SERVICE_UNAVAILABLE');
  if (pg.code === '28000') return new BookingError(401, 'UNAUTHENTICATED');
  if (pg.code === '42501' && pg.message === 'Wrong role') return new BookingError(403, 'FORBIDDEN');
  if (pg.code === 'P0002') {
    return pg.message === 'Destination not found'
      ? new BookingError(404, 'SLOT_NOT_FOUND')
      : new BookingError(404, 'BOOKING_NOT_FOUND');
  }
  if (pg.code === '23505' && pg.constraint === 'reschedule_history_booking_unique') {
    return new BookingError(409, 'RESCHEDULE_ALREADY_USED');
  }
  if (
    pg.code === '23514' &&
    (pg.constraint === 'booking_s2_cancelled_terminal' || pg.constraint === 'reschedule_history_distinct_slots')
  ) {
    return new BookingError(409, 'RESCHEDULE_NOT_APPLICABLE');
  }
  if ((pg.code === '23505' && pg.constraint === 'booking_one_active_per_slot') || pg.code === 'P0B01') {
    return new BookingError(409, 'SLOT_UNAVAILABLE');
  }
  if (pg.code === '23P01' && pg.constraint === 'booked_customer_no_overlap') {
    return new BookingError(409, 'CUSTOMER_OVERLAP');
  }
  if (pg.code === 'P0B05') return new BookingError(422, 'RESCHEDULE_WINDOW_CLOSED');
  return new BookingError(503, 'SERVICE_UNAVAILABLE');
}

/** Atomically reschedules an owned Booked booking at most once via s2_mutate('Reschedule', ...). */
export async function rescheduleCustomerBooking(
  pool: Pool,
  principal: { userId: string; sessionId: string },
  bookingId: string,
  destinationSlotId: string,
  hooks?: RescheduleHooks,
): Promise<CustomerBookingDetailDto> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const client = await pool.connect().catch(() => { throw new BookingError(503, 'SERVICE_UNAVAILABLE'); });
    let phase: 'begin' | 'mutation' | 'projection' | 'commit' | 'acknowledged' = 'begin';
    let discard = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      phase = 'mutation';
      await hooks?.beforeMutation?.(client);
      await client.query(
        "SELECT public.s2_mutate('Reschedule', $1::uuid, $2::uuid, $3::uuid, $4::uuid)",
        [principal.userId, principal.sessionId, bookingId, destinationSlotId],
      );
      phase = 'projection';
      const { data } = await getCustomerBookingDetail(client, principal.userId, bookingId);
      if (data.status !== 'Booked' || data.slotId !== destinationSlotId) {
        throw new Error('Unexpected reschedule projection');
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
          throw mapRescheduleMutationError(pg);
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
