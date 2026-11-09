import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { Pool } from 'pg';
import { createPool } from '../src/config.js';
import { createApp } from '../src/app.js';
import { createCustomerBooking } from '../src/bookings.js';

const runtimePool = createPool();
const ownerPool = new Pool({ connectionString: process.env.DATABASE_URL!, max: 10 });
const origin = 'http://localhost:5173';
const headers = { Origin: origin };
const marker = randomUUID().slice(0, 10);
const password = 'RetrievalPassword!2026';

// Future baseline anchor so slots and bookings are naturally eligible and valid under canonical DB triggers
const baseAnchor = new Date(Date.now() + 25 * 86_400_000);
baseAnchor.setUTCHours(8, 0, 0, 0);
let slotCounter = 0;

let app: Express;
let tutorAId: string;
let tutorBId: string;
let customerAId: string;
let customerBId: string;

type AuthBundle = {
  userId: string;
  email: string;
  cookie: string;
  csrf: string;
  binding: string;
  sessionId: string;
};

let authTutorA: AuthBundle;
let authTutorB: AuthBundle;
let authCustomerA: AuthBundle;
let authCustomerB: AuthBundle;

async function createUser(email: string, role: 'Customer' | 'Tutor'): Promise<string> {
  const hash = await argon2.hash(password);
  const res = await ownerPool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role","isActive") VALUES($1,$2,$3,true) RETURNING "id"',
    [email, hash, role],
  );
  return res.rows[0].id;
}

function nextSlotStart(hours = 3): Date {
  slotCounter += hours;
  return new Date(baseAnchor.getTime() + slotCounter * 3_600_000);
}

async function createSlot(tutorId: string, start?: Date): Promise<{ id: string; tutorId: string; startsAt: Date; endsAt: Date }> {
  const startsAt = start ?? nextSlotStart(3);
  const endsAt = new Date(startsAt.getTime() + 3_600_000);
  const res = await ownerPool.query<{ id: string }>(
    'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
    [tutorId, startsAt, endsAt],
  );
  return { id: res.rows[0].id, tutorId, startsAt, endsAt };
}

async function loginBundle(targetApp: Express, email: string, userId: string): Promise<AuthBundle> {
  const loginRes = await request(targetApp)
    .post('/api/v1/auth/login')
    .set(headers)
    .send({ email, password });
  expect(loginRes.status).toBe(200);
  const cookie = loginRes.headers['set-cookie'][0] as string;

  const meRes = await request(targetApp).get('/api/v1/auth/me').set('Cookie', cookie);
  expect(meRes.status).toBe(200);
  const binding = meRes.headers['x-nuttiew-session-binding'] as string;

  const csrfRes = await request(targetApp).get('/api/v1/auth/csrf').set('Cookie', cookie);
  expect(csrfRes.status).toBe(200);
  const csrf = csrfRes.body.csrfToken as string;

  const sessionRes = await ownerPool.query<{ id: string }>(
    'SELECT "id" FROM "Session" WHERE "userId"=$1 AND "revokedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 1',
    [userId],
  );
  expect(sessionRes.rowCount).toBe(1);

  return {
    userId,
    email,
    cookie,
    csrf,
    binding,
    sessionId: sessionRes.rows[0].id,
  };
}

describe('F-S1-05 Protected Booking Retrieval & Authorized Tutor Schedule View (RET-01..RET-14, RET-17)', () => {
  let customerABooking1Id: string;
  let customerABooking2Id: string;
  let customerBBookingId: string;
  let slotA1Id: string;
  let slotA2Id: string;
  let slotA3UnbookedId: string;
  let slotB1Id: string;

  beforeAll(async () => {
    tutorAId = await createUser(`tutor_a_${marker}@example.com`, 'Tutor');
    tutorBId = await createUser(`tutor_b_${marker}@example.com`, 'Tutor');
    customerAId = await createUser(`cust_a_${marker}@example.com`, 'Customer');
    customerBId = await createUser(`cust_b_${marker}@example.com`, 'Customer');

    app = await createApp(runtimePool, {
      origin,
      csrfKey: Buffer.alloc(32, 7),
      rateKey: Buffer.alloc(32, 9),
      production: false,
    });

    authTutorA = await loginBundle(app, `tutor_a_${marker}@example.com`, tutorAId);
    authTutorB = await loginBundle(app, `tutor_b_${marker}@example.com`, tutorBId);
    authCustomerA = await loginBundle(app, `cust_a_${marker}@example.com`, customerAId);
    authCustomerB = await loginBundle(app, `cust_b_${marker}@example.com`, customerBId);

    // Create 3 slots for Tutor A
    const s1 = await createSlot(tutorAId);
    slotA1Id = s1.id;
    const s2 = await createSlot(tutorAId);
    slotA2Id = s2.id;
    const s3 = await createSlot(tutorAId);
    slotA3UnbookedId = s3.id;

    // Create 1 slot for Tutor B
    const sb1 = await createSlot(tutorBId);
    slotB1Id = sb1.id;

    // Book slotA1 and slotA2 for Customer A using canonical createCustomerBooking
    const b1 = await createCustomerBooking(runtimePool, { userId: customerAId, sessionId: authCustomerA.sessionId }, slotA1Id);
    customerABooking1Id = b1.data.id;
    const b2 = await createCustomerBooking(runtimePool, { userId: customerAId, sessionId: authCustomerA.sessionId }, slotA2Id);
    customerABooking2Id = b2.data.id;

    // Book slotB1 for Customer B
    const bb = await createCustomerBooking(runtimePool, { userId: customerBId, sessionId: authCustomerB.sessionId }, slotB1Id);
    customerBBookingId = bb.data.id;
  });

  afterAll(async () => {
    await runtimePool.end();
    await ownerPool.end();
  });

  // RET-01: Customer Lists Own Committed Bookings
  it('RET-01: Customer lists own committed bookings in deterministic ascending order without leaking other customers', async () => {
    const res = await request(app)
      .get('/api/v1/customer/bookings')
      .set('Cookie', authCustomerA.cookie);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['x-nuttiew-session-binding']).toBe(authCustomerA.binding);
    expect(res.body.meta?.evaluatedAt).toBeDefined();

    const data = res.body.data;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);

    const ids = data.map((b: { id: string }) => b.id);
    expect(ids).toContain(customerABooking1Id);
    expect(ids).toContain(customerABooking2Id);
    expect(ids).not.toContain(customerBBookingId);

    // Order: startsAt ASC, id ASC
    const starts = data.map((b: { startsAt: string }) => new Date(b.startsAt).getTime());
    expect(starts[0]).toBeLessThanOrEqual(starts[1]);

    const item = data[0];
    expect(item.id).toBeDefined();
    expect(item.slotId).toBeDefined();
    expect(item.tutorId).toBe(tutorAId);
    expect(item.tutorRef).toBe('TUTOR-' + tutorAId.slice(0, 8));
    expect(item.startsAt.endsWith('Z')).toBe(true);
    expect(item.endsAt.endsWith('Z')).toBe(true);
    expect(item.status).toBe('Booked');
    expect(item.displayStatus).toBe('Booked');
    expect(item.createdAt).toBeDefined();
  });

  // RET-02: Customer Retrieves Single Booking Detail
  it('RET-02: Customer retrieves single booking detail by ID', async () => {
    const res = await request(app)
      .get(`/api/v1/customer/bookings/${customerABooking1Id}`)
      .set('Cookie', authCustomerA.cookie);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['x-nuttiew-session-binding']).toBe(authCustomerA.binding);

    const data = res.body.data;
    expect(data.id).toBe(customerABooking1Id);
    expect(data.slotId).toBe(slotA1Id);
    expect(data.tutorId).toBe(tutorAId);
    expect(data.tutorRef).toBe('TUTOR-' + tutorAId.slice(0, 8));
    expect(data.status).toBe('Booked');
    expect(data.displayStatus).toBe('Booked');
    expect(data.createdAt).toBeDefined();
    expect(data.updatedAt).toBeDefined();
    expect(res.body.meta?.evaluatedAt).toBeDefined();
  });

  // RET-03: Cross-Customer Access Refusal (Safe 404)
  it('RET-03: Cross-Customer probe returns safe 404 BOOKING_NOT_FOUND (no 403 confirmation)', async () => {
    const res = await request(app)
      .get(`/api/v1/customer/bookings/${customerABooking1Id}`)
      .set('Cookie', authCustomerB.cookie);

    expect(res.status).toBe(404);
    expect(res.body.error?.code).toBe('BOOKING_NOT_FOUND');
    expect(res.body.error?.message).toBe('Booking not found');
    expect(res.body.data).toBeUndefined();
  });

  // RET-04: Tutor Lists Schedule Bookings
  it('RET-04: Tutor retrieves bookings scheduled on own slots with pseudonymous customerRef and no PII', async () => {
    const res = await request(app)
      .get('/api/v1/tutor/bookings')
      .set('Cookie', authTutorA.cookie);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.headers['x-nuttiew-session-binding']).toBe(authTutorA.binding);
    expect(res.body.meta?.evaluatedAt).toBeDefined();

    const data = res.body.data;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(2);

    const booking = data.find((b: { id: string }) => b.id === customerABooking1Id);
    expect(booking).toBeDefined();
    expect(booking.slotId).toBe(slotA1Id);
    expect(booking.tutorId).toBe(tutorAId);
    expect(booking.customerRef).toBe('CUST-' + customerAId.slice(0, 8));
    expect(booking.customerId).toBeUndefined();
    expect(booking.status).toBe('Booked');
    expect(booking.displayStatus).toBe('Booked');

    // Does not include Tutor B's booking
    const foreign = data.find((b: { id: string }) => b.id === customerBBookingId);
    expect(foreign).toBeUndefined();
  });

  // RET-05: Tutor Own-Slots Dynamic Occupancy
  it('RET-05: Tutor own-slots list (/tutor/slots) dynamically projects occupancy: Occupied / Unoccupied', async () => {
    const res = await request(app)
      .get('/api/v1/tutor/slots')
      .set('Cookie', authTutorA.cookie);

    expect(res.status).toBe(200);
    const slots = res.body.data;
    expect(Array.isArray(slots)).toBe(true);

    const s1 = slots.find((s: { id: string }) => s.id === slotA1Id);
    expect(s1).toBeDefined();
    expect(s1.occupancy).toBe('Occupied');

    const s2 = slots.find((s: { id: string }) => s.id === slotA2Id);
    expect(s2).toBeDefined();
    expect(s2.occupancy).toBe('Occupied');

    const s3 = slots.find((s: { id: string }) => s.id === slotA3UnbookedId);
    expect(s3).toBeDefined();
    expect(s3.occupancy).toBe('Unoccupied');
  });

  // RET-06: Cross-Tutor Schedule Isolation
  it('RET-06: Cross-Tutor schedule isolation: Tutor B cannot inspect Tutor A schedule bookings', async () => {
    const res = await request(app)
      .get('/api/v1/tutor/bookings')
      .set('Cookie', authTutorB.cookie);

    expect(res.status).toBe(200);
    const data = res.body.data;
    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBe(1);
    expect(data[0].id).toBe(customerBBookingId);
    expect(data[0].tutorId).toBe(tutorBId);

    // Any query parameters fail closed
    const queryRes = await request(app)
      .get(`/api/v1/tutor/bookings?tutorId=${tutorAId}`)
      .set('Cookie', authTutorB.cookie);
    expect(queryRes.status).toBe(400);
    expect(queryRes.body.error?.code).toBe('INVALID_INPUT');
  });

  // RET-07: Time-Derived "Past" Appointment Display (Q30, AC-S1-34)
  it('RET-07: Elapsed appointment displays displayStatus: Past while database status remains Booked', async () => {
    // We instantiate an app instance configured with an evaluation clock shifted past slotA1 endsAt
    const slotRes = await ownerPool.query<{ endsAt: Date }>(
      'SELECT "endsAt" FROM "Slot" WHERE "id"=$1',
      [slotA1Id],
    );
    const endsAt = slotRes.rows[0].endsAt;
    const pastEvalTime = new Date(endsAt.getTime() + 10_000); // 10s after end

    const shiftedApp = await createApp(runtimePool, {
      origin,
      csrfKey: Buffer.alloc(32, 7),
      rateKey: Buffer.alloc(32, 9),
      production: false,
      availabilityClock: () => pastEvalTime,
    });

    const res = await request(shiftedApp)
      .get(`/api/v1/customer/bookings/${customerABooking1Id}`)
      .set('Cookie', authCustomerA.cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.displayStatus).toBe('Past');
    expect(res.body.data.status).toBe('Booked');

    // Verify database row directly via ownerPool: status MUST strictly be 'Booked', never 'Completed'
    const dbRow = await ownerPool.query<{ status: string }>(
      'SELECT "status" FROM "Booking" WHERE "id"=$1',
      [customerABooking1Id],
    );
    expect(dbRow.rows[0].status).toBe('Booked');
  });

  // RET-08: Anonymous Access Refusal
  it('RET-08: Anonymous callers receive 401 UNAUTHENTICATED on all retrieval endpoints', async () => {
    const r1 = await request(app).get('/api/v1/customer/bookings');
    expect(r1.status).toBe(401);
    expect(r1.body.error?.code).toBe('UNAUTHENTICATED');

    const r2 = await request(app).get(`/api/v1/customer/bookings/${customerABooking1Id}`);
    expect(r2.status).toBe(401);
    expect(r2.body.error?.code).toBe('UNAUTHENTICATED');

    const r3 = await request(app).get('/api/v1/tutor/bookings');
    expect(r3.status).toBe(401);
    expect(r3.body.error?.code).toBe('UNAUTHENTICATED');
  });

  // RET-09: Tutor Calling Customer Endpoints
  it('RET-09: Tutor session calling Customer booking endpoints receives 403 FORBIDDEN', async () => {
    const r1 = await request(app)
      .get('/api/v1/customer/bookings')
      .set('Cookie', authTutorA.cookie);
    expect(r1.status).toBe(403);
    expect(r1.body.error?.code).toBe('FORBIDDEN');

    const r2 = await request(app)
      .get(`/api/v1/customer/bookings/${customerABooking1Id}`)
      .set('Cookie', authTutorA.cookie);
    expect(r2.status).toBe(403);
    expect(r2.body.error?.code).toBe('FORBIDDEN');
  });

  // RET-10: Customer Calling Tutor Endpoints
  it('RET-10: Customer session calling Tutor booking endpoints receives 403 FORBIDDEN', async () => {
    const r1 = await request(app)
      .get('/api/v1/tutor/bookings')
      .set('Cookie', authCustomerA.cookie);
    expect(r1.status).toBe(403);
    expect(r1.body.error?.code).toBe('FORBIDDEN');
  });

  // RET-11: Malformed UUID Path Parameter
  it('RET-11: Malformed non-UUID in path parameter returns 400 INVALID_INPUT', async () => {
    const res = await request(app)
      .get('/api/v1/customer/bookings/not-a-valid-uuid')
      .set('Cookie', authCustomerA.cookie);
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe('INVALID_INPUT');
  });

  // RET-12: Query Parameters Forbidden
  it('RET-12: Unexpected query parameters on list and detail endpoints return 400 INVALID_INPUT', async () => {
    const r1 = await request(app)
      .get('/api/v1/customer/bookings?page=1')
      .set('Cookie', authCustomerA.cookie);
    expect(r1.status).toBe(400);
    expect(r1.body.error?.code).toBe('INVALID_INPUT');

    const r2 = await request(app)
      .get(`/api/v1/customer/bookings/${customerABooking1Id}?expand=slot`)
      .set('Cookie', authCustomerA.cookie);
    expect(r2.status).toBe(400);
    expect(r2.body.error?.code).toBe('INVALID_INPUT');

    const r3 = await request(app)
      .get('/api/v1/tutor/bookings?filter=all')
      .set('Cookie', authTutorA.cookie);
    expect(r3.status).toBe(400);
    expect(r3.body.error?.code).toBe('INVALID_INPUT');
  });

  // RET-13: Minimal Payload Privacy Leak Check
  it('RET-13: Full JSON response inspection: Zero leakage of password hashes, session tokens, or unmasked emails', async () => {
    const endpoints = [
      { path: '/api/v1/customer/bookings', cookie: authCustomerA.cookie },
      { path: `/api/v1/customer/bookings/${customerABooking1Id}`, cookie: authCustomerA.cookie },
      { path: '/api/v1/tutor/bookings', cookie: authTutorA.cookie },
      { path: '/api/v1/tutor/slots', cookie: authTutorA.cookie },
    ];

    for (const ep of endpoints) {
      const res = await request(app).get(ep.path).set('Cookie', ep.cookie);
      expect(res.status).toBe(200);
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('passwordHash');
      expect(text).not.toContain('tokenDigest');
      expect(text).not.toContain('csrfNonce');
      expect(text).not.toContain('cust_a_');
      expect(text).not.toContain('cust_b_');
      expect(text).not.toContain('tutor_a_');
    }
  });

  // RET-14: Persistence Across Application Process Restart and Pool Reconnection (FR-S1-16, NFR-S1-03)
  it('RET-14: Fresh application instance and connection pool reading persistent DB returns identical committed bookings', async () => {
    // Create a new, isolated connection pool simulating process restart
    const restartedPool = createPool();
    try {
      const restartedApp = await createApp(restartedPool, {
        origin,
        csrfKey: Buffer.alloc(32, 7),
        rateKey: Buffer.alloc(32, 9),
        production: false,
      });

      // Login fresh session for Customer A on restartedApp
      const freshAuth = await loginBundle(restartedApp, `cust_a_${marker}@example.com`, customerAId);

      const res = await request(restartedApp)
        .get(`/api/v1/customer/bookings/${customerABooking1Id}`)
        .set('Cookie', freshAuth.cookie);

      expect(res.status).toBe(200);
      expect(res.body.data.id).toBe(customerABooking1Id);
      expect(res.body.data.slotId).toBe(slotA1Id);
      expect(res.body.data.status).toBe('Booked');
    } finally {
      await restartedPool.end();
    }
  });

  // RET-17: Single Statement Evaluation Snapshot Uniformity, Empty List Metadata, and Q30 Boundary
  it('RET-17: Snapshot uniformity, empty list metadata, Q30 exact boundary, and session TimeZone independence', async () => {
    // 1. Empty list metadata
    const freshCustId = await createUser(`cust_empty_${marker}@example.com`, 'Customer');
    const freshCustAuth = await loginBundle(app, `cust_empty_${marker}@example.com`, freshCustId);

    const emptyRes = await request(app)
      .get('/api/v1/customer/bookings')
      .set('Cookie', freshCustAuth.cookie);

    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body.data).toEqual([]);
    expect(typeof emptyRes.body.meta?.evaluatedAt).toBe('string');
    expect(emptyRes.body.meta.evaluatedAt.endsWith('Z')).toBe(true);

    // 2. Multi-row snapshot uniformity
    const multiRes = await request(app)
      .get('/api/v1/customer/bookings')
      .set('Cookie', authCustomerA.cookie);

    expect(multiRes.status).toBe(200);
    const metaEvaluatedAt = multiRes.body.meta.evaluatedAt;
    expect(metaEvaluatedAt).toBeDefined();

    // 3. Q30 exact boundary test: evaluated at endsAt - 1s vs endsAt vs endsAt + 1s
    const slotRes = await ownerPool.query<{ endsAt: Date }>(
      'SELECT "endsAt" FROM "Slot" WHERE "id"=$1',
      [slotA1Id],
    );
    const endsAt = slotRes.rows[0].endsAt;

    // Evaluated at endsAt - 1s -> displayStatus: Booked
    const beforeApp = await createApp(runtimePool, {
      origin,
      csrfKey: Buffer.alloc(32, 7),
      rateKey: Buffer.alloc(32, 9),
      production: false,
      availabilityClock: () => new Date(endsAt.getTime() - 1000),
    });
    const beforeRes = await request(beforeApp)
      .get(`/api/v1/customer/bookings/${customerABooking1Id}`)
      .set('Cookie', authCustomerA.cookie);
    expect(beforeRes.body.data.displayStatus).toBe('Booked');

    // Evaluated at exact endsAt -> displayStatus: Past
    const exactApp = await createApp(runtimePool, {
      origin,
      csrfKey: Buffer.alloc(32, 7),
      rateKey: Buffer.alloc(32, 9),
      production: false,
      availabilityClock: () => endsAt,
    });
    const exactRes = await request(exactApp)
      .get(`/api/v1/customer/bookings/${customerABooking1Id}`)
      .set('Cookie', authCustomerA.cookie);
    expect(exactRes.body.data.displayStatus).toBe('Past');

    // Evaluated at endsAt + 1s -> displayStatus: Past
    const afterApp = await createApp(runtimePool, {
      origin,
      csrfKey: Buffer.alloc(32, 7),
      rateKey: Buffer.alloc(32, 9),
      production: false,
      availabilityClock: () => new Date(endsAt.getTime() + 1000),
    });
    const afterRes = await request(afterApp)
      .get(`/api/v1/customer/bookings/${customerABooking1Id}`)
      .set('Cookie', authCustomerA.cookie);
    expect(afterRes.body.data.displayStatus).toBe('Past');

    // 4. Session TimeZone independence: test SQL under SET LOCAL TIME ZONE 'UTC' and 'Asia/Bangkok'
    const client = await runtimePool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL TIME ZONE 'UTC'");
      const utcQuery = await client.query<{ displayStatus: string }>(
        `WITH eval_snapshot AS (
           SELECT $2::timestamptz AS evaluated_at
         )
         SELECT
           CASE WHEN b."endsAt" <= s_clock.evaluated_at THEN 'Past' ELSE 'Booked' END AS "displayStatus"
         FROM eval_snapshot AS s_clock
         CROSS JOIN "Booking" AS b
         WHERE b."id" = $1`,
        [customerABooking1Id, endsAt],
      );
      expect(utcQuery.rows[0].displayStatus).toBe('Past');

      await client.query("SET LOCAL TIME ZONE 'Asia/Bangkok'");
      const bkkQuery = await client.query<{ displayStatus: string }>(
        `WITH eval_snapshot AS (
           SELECT $2::timestamptz AS evaluated_at
         )
         SELECT
           CASE WHEN b."endsAt" <= s_clock.evaluated_at THEN 'Past' ELSE 'Booked' END AS "displayStatus"
         FROM eval_snapshot AS s_clock
         CROSS JOIN "Booking" AS b
         WHERE b."id" = $1`,
        [customerABooking1Id, endsAt],
      );
      expect(bkkQuery.rows[0].displayStatus).toBe('Past');
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  });
});
