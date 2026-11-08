import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { Pool } from 'pg';
import { createPool, readKey } from '../src/config.js';
import { createApp } from '../src/app.js';
import { listCustomerAvailability } from '../src/availability.js';

const runtimePool = createPool();
const ownerPool = new Pool({ connectionString: process.env.DATABASE_URL!, max: 6 });
const origin = 'http://localhost:5173';
const headers = { Origin: origin };
const marker = randomUUID().slice(0, 12);
const ipHex = randomUUID().replaceAll('-', '');
const rateTestIp = '2001:db8:' + ipHex.slice(0, 4) + ':' + ipHex.slice(4, 8) + ':' + ipHex.slice(8, 12) + '::a';
const password = 'AvailTestPassword!2026';

// Base instant far enough in the future (10 days ahead) so real DB clock_timestamp()
// also sees seeded slots as >60m and <=60d when needed, while remain isolated from other tests.
const baseAnchor = new Date(Date.now() + 10 * 86_400_000);
baseAnchor.setUTCHours(4, 0, 0, 0); // 04:00 UTC = 11:00 Asia/Bangkok

let app: Express;
let tutorAId = '';
let tutorBId = '';
let tutorCId = '';
let inactiveTutorId = '';
let customer1Id = '';
let customer2Id = '';
let tutorACookie = '';
let customer1Cookie = '';
let customer2Cookie = '';

async function createUser(email: string, role: 'Customer' | 'Tutor', isActive = true): Promise<string> {
  const hash = await argon2.hash(password);
  const res = await ownerPool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role","isActive") VALUES($1,$2,$3,$4) RETURNING "id"',
    [email, hash, role, isActive],
  );
  return res.rows[0].id;
}

async function createSlot(tutorId: string, startsAt: Date): Promise<{ id: string; startsAt: Date; endsAt: Date }> {
  const endsAt = new Date(startsAt.getTime() + 3_600_000);
  const res = await ownerPool.query<{ id: string }>(
    'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
    [tutorId, startsAt, endsAt],
  );
  return { id: res.rows[0].id, startsAt, endsAt };
}

async function createBooking(
  customerId: string,
  slot: { id: string; startsAt: Date; endsAt: Date },
  status: 'Booked' | 'Cancelled' = 'Booked',
): Promise<string> {
  const res = await ownerPool.query<{ id: string }>(
    'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,$5) RETURNING "id"',
    [customerId, slot.id, slot.startsAt, slot.endsAt, status],
  );
  return res.rows[0].id;
}

async function loginCookie(email: string): Promise<string> {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .set(headers)
    .set('X-Forwarded-For', rateTestIp)
    .send({ email, password });
  expect(res.status).toBe(200);
  return res.headers['set-cookie'][0] as string;
}

beforeAll(async () => {
  // Choose deterministic Tutor UUID order by creating three Tutors and ordering their IDs
  const t1 = await createUser(`avail-ta-${marker}@example.test`, 'Tutor');
  const t2 = await createUser(`avail-tb-${marker}@example.test`, 'Tutor');
  const t3 = await createUser(`avail-tc-${marker}@example.test`, 'Tutor');
  [tutorAId, tutorBId, tutorCId] = [t1, t2, t3].sort((a, b) => a.localeCompare(b));
  inactiveTutorId = await createUser(`avail-tinactive-${marker}@example.test`, 'Tutor', false);
  customer1Id = await createUser(`avail-c1-${marker}@example.test`, 'Customer');
  customer2Id = await createUser(`avail-c2-${marker}@example.test`, 'Customer');

  app = await createApp(runtimePool, {
    origin,
    csrfKey: readKey('AUTH_CSRF_HMAC_KEY'),
    rateKey: readKey('AUTH_RATE_KEY'),
    production: false,
    trustedProxies: ['::ffff:127.0.0.1', '127.0.0.1', '::1'],
  });

  const tutorEmailRes = await ownerPool.query<{ email: string }>('SELECT "email" FROM "User" WHERE "id"=$1', [tutorAId]);
  tutorACookie = await loginCookie(tutorEmailRes.rows[0].email);
  customer1Cookie = await loginCookie(`avail-c1-${marker}@example.test`);
  customer2Cookie = await loginCookie(`avail-c2-${marker}@example.test`);
}, 30_000);

afterAll(async () => {
  await ownerPool
    .query('UPDATE "User" SET "isActive"=false WHERE "id" = ANY($1::uuid[])', [
      [tutorAId, tutorBId, tutorCId, inactiveTutorId, customer1Id, customer2Id].filter(Boolean),
    ])
    .catch(() => {});
  await Promise.all([runtimePool.end(), ownerPool.end()]);
});

describe('F-S1-03 Customer Availability real PostgreSQL integration (AVA-01..10, AVA-14..18)', () => {
  it('AVA-06 denies anonymous (401) and Tutor role (403) with Cache-Control: no-store and no offer data', async () => {
    const anon = await request(app).get('/api/v1/customer/availability');
    expect(anon.status).toBe(401);
    expect(anon.headers['cache-control']).toBe('no-store');
    expect(anon.body.error?.code).toBe('UNAUTHENTICATED');
    expect(anon.body.data).toBeUndefined();

    const tutorRes = await request(app)
      .get('/api/v1/customer/availability')
      .set('Cookie', tutorACookie);
    expect(tutorRes.status).toBe(403);
    expect(tutorRes.headers['cache-control']).toBe('no-store');
    expect(tutorRes.body.error?.code).toBe('FORBIDDEN');
    expect(tutorRes.body.data).toBeUndefined();
  });

  it('AVA-07 rejects any query parameter (customerId, tutorId, role, from, to, page, cursor, limit, arbitrary) with 400 INVALID_INPUT', async () => {
    for (const q of [
      `customerId=${customer2Id}`,
      `tutorId=${tutorAId}`,
      'role=Tutor',
      'from=2026-11-08T00:00:00Z',
      'to=2026-12-08T00:00:00Z',
      'page=1',
      'cursor=abc',
      'limit=10',
      'arbitrary=1',
    ]) {
      const res = await request(app)
        .get(`/api/v1/customer/availability?${q}`)
        .set('Cookie', customer1Cookie);
      expect(res.status, `Query ${q} must fail 400`).toBe(400);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.error?.code).toBe('INVALID_INPUT');
      expect(res.body.data).toBeUndefined();
    }
  });

  it('AVA-01/05/08/18 returns eligible offers in deterministic startsAt ASC -> tutorRef ASC -> slotId ASC order with strict allowlist and no email/displayName leakage', async () => {
    const tSame = new Date(baseAnchor.getTime() + 2 * 3_600_000);
    const tLater = new Date(baseAnchor.getTime() + 4 * 3_600_000);
    // Insert in reverse tutor order to prove SQL ORDER BY tutorRef ASC, slotId ASC
    const slotB = await createSlot(tutorBId, tSame);
    const slotA = await createSlot(tutorAId, tSame);
    const slotLater = await createSlot(tutorAId, tLater);
    const slotInactiveTutor = await createSlot(inactiveTutorId, tSame);

    const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', customer1Cookie);
    expect(meRes.status).toBe(200);
    const expectedBinding = meRes.headers['x-nuttiew-session-binding'];
    expect(typeof expectedBinding).toBe('string');

    const res = await request(app)
      .get('/api/v1/customer/availability')
      .set('Cookie', customer1Cookie);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-nuttiew-session-binding']).toBe(expectedBinding);
    expect(Object.keys(res.body).sort()).toEqual(['data', 'meta']);
    expect(Object.keys(res.body.meta).sort()).toEqual(['evaluatedAt', 'requestId']);
    expect(res.body.meta.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

    const ourSlots = (res.body.data as Array<Record<string, unknown>>).filter(
      row => row.slotId === slotA.id || row.slotId === slotB.id || row.slotId === slotLater.id || row.slotId === slotInactiveTutor.id,
    );
    expect(ourSlots.map(r => r.slotId)).toEqual([slotA.id, slotB.id, slotLater.id]);

    for (const item of res.body.data as Array<Record<string, unknown>>) {
      expect(Object.keys(item).sort()).toEqual(['endsAt', 'slotId', 'startsAt', 'tutorRef']);
      expect(item).not.toHaveProperty('tutorDisplayName');
      expect(item).not.toHaveProperty('email');
      expect(item).not.toHaveProperty('customerId');
      expect(item).not.toHaveProperty('bookingId');
      expect(item.startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(item.endsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }

    const rawJson = JSON.stringify(res.body);
    expect(rawJson).not.toContain('@example.test');
    expect(rawJson).not.toContain('passwordHash');
    expect(rawJson).not.toContain('csrfNonce');
    expect(rawJson).not.toContain('tutorDisplayName');
  });

  it('AVA-02/15/16/17 excludes occupied slots and same-Customer cross-Tutor overlaps while allowing exact adjacency, Cancelled bookings and other-Customer non-target overlaps', async () => {
    // Use a dedicated day window (+12 days) for overlap & occupancy matrix
    const dayStart = new Date(baseAnchor.getTime() + 2 * 86_400_000);
    // 1) Occupied slot on Tutor A at 06:00-07:00 UTC (booked by Customer 2)
    const occupiedSlot = await createSlot(tutorAId, new Date(dayStart.getTime() + 2 * 3_600_000));
    const c2OccupiedBookingId = await createBooking(customer2Id, occupiedSlot, 'Booked');

    // 2) Customer 1's own active booking with Tutor A at 08:00-09:00 UTC
    const c1BookedSlotA = await createSlot(tutorAId, new Date(dayStart.getTime() + 4 * 3_600_000));
    const c1BookingId = await createBooking(customer1Id, c1BookedSlotA, 'Booked');

    // 3) Free Tutor C slot overlapping C1's booking at 08:30-09:30 UTC (AVA-15: excluded for C1, included for C2!)
    const overlappingSlotC = await createSlot(tutorCId, new Date(dayStart.getTime() + 4.5 * 3_600_000));

    // 4) Free Tutor B slots adjacent to C1's 08:00-09:00 UTC booking:
    //    07:00-08:00 UTC (preceding adjacent) and 09:00-10:00 UTC (succeeding adjacent) (AVA-16: both included for C1)
    const adjacentBeforeSlotB = await createSlot(tutorBId, new Date(dayStart.getTime() + 3 * 3_600_000));
    const adjacentAfterSlotB = await createSlot(tutorBId, new Date(dayStart.getTime() + 5 * 3_600_000));

    // 5) Cancelled C1 booking on Tutor A at 11:00-12:00 UTC, and overlapping free Tutor B slot at 11:30-12:30 UTC (AVA-17: both included for C1)
    const cancelledSlotA = await createSlot(tutorAId, new Date(dayStart.getTime() + 7 * 3_600_000));
    const cancelledBookingId = await createBooking(customer1Id, cancelledSlotA, 'Cancelled');
    const overlapsCancelledSlotB = await createSlot(tutorBId, new Date(dayStart.getTime() + 7.5 * 3_600_000));

    // 6) Free Tutor B slot at 06:00-07:00 UTC overlapping C2's active booking on Tutor A (AVA-17: included for C1, excluded for C2!)
    const overlapsC2SlotB = await createSlot(tutorBId, new Date(dayStart.getTime() + 2 * 3_600_000));

    const resC1 = await request(app).get('/api/v1/customer/availability').set('Cookie', customer1Cookie);
    expect(resC1.status).toBe(200);
    const c1SlotIds = new Set((resC1.body.data as Array<{ slotId: string }>).map(x => x.slotId));

    // AVA-02: occupiedSlot and c1BookedSlotA are excluded for everyone
    expect(c1SlotIds.has(occupiedSlot.id)).toBe(false);
    expect(c1SlotIds.has(c1BookedSlotA.id)).toBe(false);
    // AVA-15: overlappingSlotC (08:30-09:30) excluded for C1 due to C1's 08:00-09:00 booking on Tutor A
    expect(c1SlotIds.has(overlappingSlotC.id)).toBe(false);
    // AVA-16: exact half-open [start,end) adjacent slots (07:00-08:00 and 09:00-10:00) are included for C1
    expect(c1SlotIds.has(adjacentBeforeSlotB.id)).toBe(true);
    expect(c1SlotIds.has(adjacentAfterSlotB.id)).toBe(true);
    // AVA-17: Cancelled booking neither occupies cancelledSlotA nor blocks overlapsCancelledSlotB, and C2's booking on Tutor A does not block overlapsC2SlotB for C1
    expect(c1SlotIds.has(cancelledSlotA.id)).toBe(true);
    expect(c1SlotIds.has(overlapsCancelledSlotB.id)).toBe(true);
    expect(c1SlotIds.has(overlapsC2SlotB.id)).toBe(true);

    // Verify C2 perspective: overlappingSlotC IS available to C2, while overlapsC2SlotB is excluded for C2
    const resC2 = await request(app).get('/api/v1/customer/availability').set('Cookie', customer2Cookie);
    expect(resC2.status).toBe(200);
    const c2SlotIds = new Set((resC2.body.data as Array<{ slotId: string }>).map(x => x.slotId));
    expect(c2SlotIds.has(occupiedSlot.id)).toBe(false);
    expect(c2SlotIds.has(c1BookedSlotA.id)).toBe(false);
    expect(c2SlotIds.has(overlappingSlotC.id)).toBe(true);
    expect(c2SlotIds.has(overlapsC2SlotB.id)).toBe(false);

    // AVA-05: Ensure none of the Booking IDs or Customer IDs appear anywhere in the serialized response
    const rawC1 = JSON.stringify(resC1.body);
    expect(rawC1).not.toContain(c2OccupiedBookingId);
    expect(rawC1).not.toContain(c1BookingId);
    expect(rawC1).not.toContain(cancelledBookingId);
    expect(rawC1).not.toContain(customer1Id);
    expect(rawC1).not.toContain(customer2Id);
  });

  it('AVA-03 enforces exact Q05 60:00 vs 59:59 lower boundary and confirmed OD-002 60-day advance horizon upper boundary against DB T_view', async () => {
    // Use a far future synthetic T_view (+120 days) so only slots in that window match
    const controlledTView = new Date(Date.now() + 120 * 86_400_000);
    controlledTView.setUTCHours(10, 0, 0, 0);

    const pastSlot = await createSlot(tutorAId, new Date(controlledTView.getTime() - 60_000));
    const slot59m59s = await createSlot(tutorAId, new Date(controlledTView.getTime() + 3_599_000));
    const slotExact60m = await createSlot(tutorBId, new Date(controlledTView.getTime() + 3_600_000));
    const slotExact60d = await createSlot(tutorAId, new Date(controlledTView.getTime() + 60 * 86_400_000));
    const slot60dPlus1s = await createSlot(tutorBId, new Date(controlledTView.getTime() + 60 * 86_400_000 + 1_000));
    const slot61d = await createSlot(tutorAId, new Date(controlledTView.getTime() + 61 * 86_400_000));

    const clockApp = await createApp(runtimePool, {
      origin,
      csrfKey: readKey('AUTH_CSRF_HMAC_KEY'),
      rateKey: readKey('AUTH_RATE_KEY'),
      production: false,
      trustedProxies: ['::ffff:127.0.0.1', '127.0.0.1', '::1'],
      availabilityClock: () => controlledTView,
    });

    const res = await request(clockApp).get('/api/v1/customer/availability').set('Cookie', customer1Cookie);
    expect(res.status).toBe(200);
    expect(res.body.meta.evaluatedAt).toBe(controlledTView.toISOString());

    const ids = (res.body.data as Array<{ slotId: string }>).map(x => x.slotId);
    const candidateSet = new Set([
      pastSlot.id,
      slot59m59s.id,
      slotExact60m.id,
      slotExact60d.id,
      slot60dPlus1s.id,
      slot61d.id,
    ]);
    expect(ids).not.toContain(pastSlot.id);
    expect(ids).not.toContain(slot59m59s.id);
    expect(ids).toContain(slotExact60m.id);
    expect(ids).toContain(slotExact60d.id);
    expect(ids).not.toContain(slot60dPlus1s.id);
    expect(ids).not.toContain(slot61d.id);
    expect(ids.filter(id => candidateSet.has(id))).toEqual([slotExact60m.id, slotExact60d.id]);
  });

  it('AVA-04/09 produces byte-for-byte identical UTC ...sssZ timestamps for populated and empty results when PostgreSQL session TimeZone switches between UTC and Asia/Bangkok', async () => {
    const populatedTView = new Date(Date.now() + 120 * 86_400_000);
    populatedTView.setUTCHours(10, 0, 0, 0);
    const emptyTView = new Date(Date.now() + 300 * 86_400_000);
    emptyTView.setUTCHours(15, 30, 45, 123);

    const client = await runtimePool.connect();
    try {
      await client.query("SET TIME ZONE 'UTC'");
      const popUtc = await listCustomerAvailability(client, customer1Id, populatedTView);
      const emptyUtc = await listCustomerAvailability(client, customer1Id, emptyTView);

      await client.query("SET TIME ZONE 'Asia/Bangkok'");
      const popBkk = await listCustomerAvailability(client, customer1Id, populatedTView);
      const emptyBkk = await listCustomerAvailability(client, customer1Id, emptyTView);

      // AVA-04: populated results are byte-for-byte identical
      expect(popUtc.data.length).toBeGreaterThanOrEqual(2);
      expect(JSON.stringify(popBkk)).toBe(JSON.stringify(popUtc));
      expect(popUtc.evaluatedAt).toBe(populatedTView.toISOString());

      // AVA-09: empty results return data: [] and identical non-null evaluatedAt in UTC ...sssZ format
      expect(emptyUtc.data).toEqual([]);
      expect(emptyBkk.data).toEqual([]);
      expect(emptyUtc.evaluatedAt).toBe(emptyTView.toISOString());
      expect(JSON.stringify(emptyBkk)).toBe(JSON.stringify(emptyUtc));
    } finally {
      await client.query('RESET TimeZone').catch(() => {});
      client.release();
    }

    // Also verify HTTP empty response headers and envelope
    const emptyClockApp = await createApp(runtimePool, {
      origin,
      csrfKey: readKey('AUTH_CSRF_HMAC_KEY'),
      rateKey: readKey('AUTH_RATE_KEY'),
      production: false,
      trustedProxies: ['::ffff:127.0.0.1', '127.0.0.1', '::1'],
      availabilityClock: () => emptyTView,
    });
    const httpEmpty = await request(emptyClockApp).get('/api/v1/customer/availability').set('Cookie', customer1Cookie);
    expect(httpEmpty.status).toBe(200);
    expect(httpEmpty.headers['cache-control']).toBe('no-store');
    expect(httpEmpty.body.data).toEqual([]);
    expect(httpEmpty.body.meta.evaluatedAt).toBe(emptyTView.toISOString());
  });

  it('AVA-10 returns 503 SERVICE_UNAVAILABLE (never empty 200) when PostgreSQL read fails', async () => {
    const failingPool = {
      query: async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM "Session"')) {
          return runtimePool.query(sql, params);
        }
        throw new Error('Simulated PostgreSQL read failure');
      },
    } as unknown as Pool;

    const brokenApp = await createApp(failingPool, {
      origin,
      csrfKey: readKey('AUTH_CSRF_HMAC_KEY'),
      rateKey: readKey('AUTH_RATE_KEY'),
      production: false,
      trustedProxies: ['::ffff:127.0.0.1', '127.0.0.1', '::1'],
    });

    const res = await request(brokenApp).get('/api/v1/customer/availability').set('Cookie', customer1Cookie);
    expect(res.status).toBe(503);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.error?.code).toBe('SERVICE_UNAVAILABLE');
    expect(res.body.data).toBeUndefined();
  });

  it('AVA-14 records reproducible p95 latency for authenticated Customer availability GET', async () => {
    // Warm up
    for (let i = 0; i < 5; i++) {
      const warm = await request(app).get('/api/v1/customer/availability').set('Cookie', customer1Cookie);
      expect(warm.status).toBe(200);
    }
    const samplesMs: number[] = [];
    for (let i = 0; i < 40; i++) {
      const t0 = performance.now();
      const res = await request(app).get('/api/v1/customer/availability').set('Cookie', customer1Cookie);
      const elapsed = performance.now() - t0;
      expect(res.status).toBe(200);
      samplesMs.push(Number(elapsed.toFixed(2)));
    }
    const sorted = [...samplesMs].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1];
    const max = sorted[sorted.length - 1];
    console.info('AVA14_BENCHMARK', JSON.stringify({ samples: sorted.length, p50Ms: p50, p95Ms: p95, maxMs: max }));
    expect(Number.isFinite(p95)).toBe(true);
  });
});
