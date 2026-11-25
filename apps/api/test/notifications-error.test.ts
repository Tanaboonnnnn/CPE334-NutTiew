import type { Pool, PoolClient } from 'pg';
import { expect, it, vi } from 'vitest';
import { BookingError } from '../src/bookings.js';
import { markCustomerNotificationRead } from '../src/notifications.js';

const principal = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
};
const notifId = '33333333-3333-4333-8333-333333333333';

function mockPool(queryImpl: (sql: string) => Promise<unknown>) {
  const release = vi.fn();
  const client = {
    query: vi.fn((sql: string) => queryImpl(sql)),
    release,
  } as unknown as PoolClient;
  const pool = {
    connect: vi.fn(async () => client),
  } as unknown as Pool;
  return { pool, client, release };
}

const sampleRow = {
  id: notifId,
  kind: 'TutorCancelled',
  createdAt: '2026-11-22T09:00:00.000Z',
  readAt: '2026-11-22T09:05:00.000Z',
  reason: 'ผู้สอนติดธุระ',
  bookingId: '44444444-4444-4444-8444-444444444444',
  slotId: '55555555-5555-4555-8555-555555555555',
  tutorId: '66666666-6666-4666-8666-666666666666',
  startsAt: '2026-11-23T09:00:00.000Z',
  endsAt: '2026-11-23T10:00:00.000Z',
  bookingStatus: 'Cancelled',
  cancelledAt: '2026-11-22T09:00:00.000Z',
};

it('evicts the PG client (release(true)) and returns 503 when ROLLBACK fails after a mutation error', async () => {
  const { pool, release } = mockPool(async sql => {
    if (sql.startsWith('BEGIN')) return { command: 'BEGIN' };
    if (sql.includes('s2_mutate')) throw Object.assign(new Error('boom'), { code: 'XX000' });
    if (sql === 'ROLLBACK') throw new Error('connection terminated during rollback');
    return {};
  });

  await expect(markCustomerNotificationRead(pool, principal, notifId)).rejects.toMatchObject({
    status: 503,
    errorCode: 'SERVICE_UNAVAILABLE',
  });
  expect(release).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledWith(true);
});

it('evicts the PG client (release(true)) and returns 503 when COMMIT outcome is uncertain', async () => {
  const { pool, release } = mockPool(async sql => {
    if (sql.startsWith('BEGIN')) return { command: 'BEGIN' };
    if (sql.includes('s2_mutate')) return { rows: [{ s2_mutate: new Date() }] };
    if (sql.includes('FROM "Notification"')) return { rowCount: 1, rows: [sampleRow] };
    if (sql === 'COMMIT') throw new Error('socket closed while awaiting COMMIT');
    return {};
  });

  await expect(markCustomerNotificationRead(pool, principal, notifId)).rejects.toMatchObject({
    status: 503,
    errorCode: 'SERVICE_UNAVAILABLE',
  });
  expect(release).toHaveBeenCalledTimes(1);
  expect(release).toHaveBeenCalledWith(true);
});

it('maps generic PostgreSQL 42501 (missing EXECUTE grant) to 503 SERVICE_UNAVAILABLE, and only "Wrong role" 42501 to 403 FORBIDDEN', async () => {
  const infra = mockPool(async sql => {
    if (sql.startsWith('BEGIN')) return { command: 'BEGIN' };
    if (sql.includes('s2_mutate')) {
      throw Object.assign(new Error('permission denied for function s2_mutate'), { code: '42501' });
    }
    if (sql === 'ROLLBACK') return { command: 'ROLLBACK' };
    return {};
  });
  await expect(markCustomerNotificationRead(infra.pool, principal, notifId)).rejects.toEqual(
    new BookingError(503, 'SERVICE_UNAVAILABLE'),
  );
  expect(infra.release).toHaveBeenCalledWith(false);

  const wrongRole = mockPool(async sql => {
    if (sql.startsWith('BEGIN')) return { command: 'BEGIN' };
    if (sql.includes('s2_mutate')) {
      throw Object.assign(new Error('Wrong role'), { code: '42501' });
    }
    if (sql === 'ROLLBACK') return { command: 'ROLLBACK' };
    return {};
  });
  await expect(markCustomerNotificationRead(wrongRole.pool, principal, notifId)).rejects.toEqual(
    new BookingError(403, 'FORBIDDEN'),
  );
  expect(wrongRole.release).toHaveBeenCalledWith(false);
});
