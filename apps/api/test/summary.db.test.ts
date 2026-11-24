import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import request from 'supertest';
import argon2 from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { Pool } from 'pg';
import { createPool } from '../src/config.js';
import { createApp } from '../src/app.js';

const runtimePool = createPool();
const ownerPool = new Pool({ connectionString: process.env.DATABASE_URL!, max: 10 });
const origin = 'http://localhost:5173';
const headers = { Origin: origin };
const marker = randomUUID().slice(0, 10);
const password = 'SummaryPassword!2026';

// Anchor future dates so all Slot/Booking inserts satisfy S2 Q05 eligibility guards naturally.
const futureAnchorMs = (() => {
  const d = new Date(Date.now() + 20 * 86_400_000);
  d.setUTCHours(8, 0, 0, 0);
  return d.getTime();
})();
const offsetIso = (days: number, hours = 0, extraMicros = 0): string => {
  const base = new Date(futureAnchorMs + days * 86_400_000 + hours * 3_600_000).toISOString();
  return base.replace(/\.(\d{3})Z$/, `.${String(extraMicros).padStart(6, '0')}Z`);
};

let currentSummaryClock: string | null = null;
let app: Express;
let server: ChildProcess | undefined;

async function createUser(email: string, role: 'Customer' | 'Tutor'): Promise<string> {
  const hash = await argon2.hash(password);
  const res = await ownerPool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role","isActive") VALUES($1,$2,$3,true) RETURNING "id"',
    [email, hash, role],
  );
  return res.rows[0].id;
}

async function createSlot(tutorId: string, startsAtIso: string, endsAtIso: string): Promise<string> {
  const res = await ownerPool.query<{ id: string }>(
    'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2::timestamptz,$3::timestamptz,\'Offered\') RETURNING "id"',
    [tutorId, startsAtIso, endsAtIso],
  );
  return res.rows[0].id;
}

async function seedBooking(params: {
  customerId: string;
  slotId: string;
  startsAtIso: string;
  endsAtIso: string;
  status: 'Booked' | 'Cancelled';
  cancellationActor?: 'Customer' | 'Tutor' | null;
  cancelledAtIso?: string | null;
  tutorCancellationReason?: string | null;
}): Promise<string> {
  const res = await ownerPool.query<{ id: string }>(
    `INSERT INTO "Booking"(
       "customerId","currentSlotId","startsAt","endsAt","status",
       "cancellationActor","cancelledAt","tutorCancellationReason"
     ) VALUES($1,$2,$3::timestamptz,$4::timestamptz,$5,$6,$7::timestamptz,$8)
     RETURNING "id"`,
    [
      params.customerId,
      params.slotId,
      params.startsAtIso,
      params.endsAtIso,
      params.status,
      params.cancellationActor ?? null,
      params.cancelledAtIso ?? null,
      params.tutorCancellationReason ?? null,
    ],
  );
  return res.rows[0].id;
}

/**
 * Fail-closed guard: refuse any fixture INSERT or historical trigger DDL unless
 * DATABASE_URL points to a loopback disposable test/CI database (*_ci or *_test).
 */
async function assertDisposableTestDatabase(db: Pick<Pool, 'query'>): Promise<void> {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) throw new Error('Refusing summary test fixtures: DATABASE_URL is not set');
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Refusing summary test fixtures: invalid DATABASE_URL');
  }
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error(`Refusing summary test fixtures: unsupported DATABASE_URL protocol "${parsed.protocol}"`);
  }
  const host = parsed.hostname.toLowerCase();
  const isLoopback = host === '127.0.0.1' || host === 'localhost' || host === '::1' || host === '[::1]';
  const dbName = parsed.pathname.replace(/^\/+/, '');
  if (!isLoopback || !/(_ci|_test)$/i.test(dbName)) {
    throw new Error(`Refusing summary test fixtures against non-disposable database "${dbName}" on "${host}"`);
  }
  const res = await db.query<{ db: string }>('SELECT current_database() AS db');
  const liveDb = res.rows[0]?.db ?? '';
  if (liveDb !== dbName || !/(_ci|_test)$/i.test(liveDb)) {
    throw new Error(`Refusing summary test fixtures: live database "${liveDb}" is not an allowed disposable test DB`);
  }
}

/**
 * Seed a genuinely past-ended historical Slot + Booking using the disposable
 * test DB owner connection for real-clock OS-process restart verification (SUM-07).
 * Keeps slot_s2_row_guard enabled; toggles only booking_s2_row_guard inside one
 * transaction after the fail-closed disposable-DB preflight.
 */
async function seedHistoricalPastBooking(tutorId: string, customerId: string, startsAtIso: string, endsAtIso: string): Promise<string> {
  const client = await ownerPool.connect();
  try {
    await assertDisposableTestDatabase(client);
    await client.query('BEGIN');
    const slotRes = await client.query<{ id: string }>(
      'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2::timestamptz,$3::timestamptz,\'Offered\') RETURNING "id"',
      [tutorId, startsAtIso, endsAtIso],
    );
    await client.query('ALTER TABLE public."Booking" DISABLE TRIGGER booking_s2_row_guard');
    const bookingRes = await client.query<{ id: string }>(
      'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3::timestamptz,$4::timestamptz,\'Booked\') RETURNING "id"',
      [customerId, slotRes.rows[0].id, startsAtIso, endsAtIso],
    );
    await client.query('ALTER TABLE public."Booking" ENABLE TRIGGER booking_s2_row_guard');
    await client.query('COMMIT');
    return bookingRes.rows[0].id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function loginCookieAndBinding(targetApp: Express, email: string): Promise<{ cookie: string; binding: string }> {
  const ipHex = randomUUID().replaceAll('-', '');
  const ip = '2001:db8:' + ipHex.slice(0, 4) + ':' + ipHex.slice(4, 8) + '::9';
  const loginRes = await request(targetApp)
    .post('/api/v1/auth/login')
    .set({ ...headers, 'X-Forwarded-For': ip })
    .send({ email, password });
  expect(loginRes.status).toBe(200);
  const cookie = loginRes.headers['set-cookie'][0] as string;
  const meRes = await request(targetApp).get('/api/v1/auth/me').set('Cookie', cookie);
  expect(meRes.status).toBe(200);
  return { cookie, binding: meRes.headers['x-nuttiew-session-binding'] as string };
}

async function unusedPort(): Promise<number> {
  const socket = createServer();
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', resolve);
  });
  const address = socket.address();
  if (!address || typeof address === 'string') throw new Error('No test port assigned');
  await new Promise<void>((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return address.port;
}

async function startServer(port: number) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      AUTH_CANONICAL_ORIGIN: origin,
      AUTH_TRUSTED_PROXIES: '::ffff:127.0.0.1,127.0.0.1,::1',
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server = child;
  let stderr = '';
  child.stderr?.on('data', chunk => { stderr = (stderr + String(chunk)).slice(-1200); });
  const base = 'http://127.0.0.1:' + port;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error('Test server exited before ready: ' + stderr);
    try {
      const response = await fetch(base + '/api/v1/auth/me', { signal: AbortSignal.timeout(750) });
      if (response.status === 401) return base;
    } catch { /* wait for startup */ }
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  throw new Error('Test API process did not become ready: ' + stderr);
}

async function stopServer() {
  const child = server;
  server = undefined;
  if (!child) return;
  if (child.exitCode === null) {
    const exited = once(child, 'exit');
    child.kill();
    await Promise.race([
      exited,
      new Promise((_, reject) => setTimeout(() => reject(new Error('API process would not stop')), 4_000)),
    ]);
  }
}

beforeAll(async () => {
  await assertDisposableTestDatabase(ownerPool);
  app = await createApp(runtimePool, {
    origin,
    csrfKey: randomBytes(32),
    rateKey: randomBytes(32),
    production: false,
    trustedProxies: ['127.0.0.1', '::1', '::ffff:127.0.0.1'],
    summaryClock: () => currentSummaryClock ?? new Date().toISOString(),
  });
}, 30_000);

afterAll(async () => {
  await stopServer();
  await runtimePool.end();
  await ownerPool.end();
});

describe('F-S3-01 (D2 Past Booked) — SUM-01..SUM-07', () => {
  it('SUM-01 returns owner-only Past Booked count/list ordered endsAt DESC, id DESC with security headers', async () => {
    const tutorAEmail = `sum01-ta-${marker}@example.test`;
    const tutorBEmail = `sum01-tb-${marker}@example.test`;
    const custEmail = `sum01-c-${marker}@example.test`;
    const custBEmail = `sum01-cb-${marker}@example.test`;
    const tutorAId = await createUser(tutorAEmail, 'Tutor');
    const tutorBId = await createUser(tutorBEmail, 'Tutor');
    const custId = await createUser(custEmail, 'Customer');
    const custBId = await createUser(custBEmail, 'Customer');

    const slotPastOld = await createSlot(tutorAId, offsetIso(1, 0), offsetIso(1, 1));
    const slotPastNew = await createSlot(tutorAId, offsetIso(2, 0), offsetIso(2, 1));
    const slotUpcoming = await createSlot(tutorAId, offsetIso(6, 0), offsetIso(6, 1));
    const slotCancelled = await createSlot(tutorAId, offsetIso(0, 0), offsetIso(0, 1));
    const slotTutorB = await createSlot(tutorBId, offsetIso(2, 0), offsetIso(2, 1));

    const bPastOld = await seedBooking({ customerId: custId, slotId: slotPastOld, startsAtIso: offsetIso(1, 0), endsAtIso: offsetIso(1, 1), status: 'Booked' });
    const bPastNew = await seedBooking({ customerId: custId, slotId: slotPastNew, startsAtIso: offsetIso(2, 0), endsAtIso: offsetIso(2, 1), status: 'Booked' });
    await seedBooking({ customerId: custId, slotId: slotUpcoming, startsAtIso: offsetIso(6, 0), endsAtIso: offsetIso(6, 1), status: 'Booked' });
    const bCancelled = await seedBooking({ customerId: custId, slotId: slotCancelled, startsAtIso: offsetIso(0, 0), endsAtIso: offsetIso(0, 1), status: 'Booked' });
    await seedBooking({ customerId: custBId, slotId: slotTutorB, startsAtIso: offsetIso(2, 0), endsAtIso: offsetIso(2, 1), status: 'Booked' });

    // Cancel bCancelled via the real Sprint 2 Customer cancellation endpoint
    const authCust = await loginCookieAndBinding(app, custEmail);
    const csrfRes = await request(app).get('/api/v1/auth/csrf').set('Cookie', authCust.cookie);
    expect(csrfRes.status).toBe(200);
    const cancelRes = await request(app)
      .post(`/api/v1/customer/bookings/${bCancelled}/cancel`)
      .set({
        ...headers,
        Cookie: authCust.cookie,
        'X-CSRF-Token': csrfRes.body.csrfToken as string,
        'X-NutTiew-Expected-Session-Binding': authCust.binding,
      })
      .send({});
    expect(cancelRes.status).toBe(200);

    const tEval = offsetIso(4, 0);
    currentSummaryClock = tEval;

    const { cookie, binding } = await loginCookieAndBinding(app, tutorAEmail);
    const res = await request(app).get('/api/v1/tutor/summary').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-nuttiew-session-binding']).toBe(binding);
    expect(res.body.data.pastBookedCount).toBe(2);
    expect(res.body.data.pastBooked).toHaveLength(2);
    expect(res.body.data.pastBooked.map((b: { id: string }) => b.id)).toEqual([bPastNew, bPastOld]);
    for (const item of res.body.data.pastBooked) {
      expect(item.status).toBe('Booked');
      expect(item.displayStatus).toBe('Past');
      expect(item.customerRef).toBe('CUST-' + custId.slice(0, 8));
    }
    expect(res.body.meta.evaluatedAt).toBe(tEval);

    // Non-violating tie-breaker proof: offered_slot_no_overlap_per_tutor + fixed 60-min slots
    // forbid two Booked rows for one Tutor sharing identical endsAt, so verify the exact SQL
    // ORDER BY tie-breaker (endsAt DESC, id DESC) directly on a read-only VALUES projection.
    const tieRes = await runtimePool.query<{ id: string }>(
      `WITH sample(id, ends_at) AS (
         VALUES
           ('00000000-0000-4000-8000-000000000001'::uuid, $1::timestamptz),
           ('00000000-0000-4000-8000-000000000009'::uuid, $1::timestamptz)
       )
       SELECT id FROM sample ORDER BY ends_at DESC NULLS LAST, id DESC NULLS LAST`,
      [offsetIso(2, 1)],
    );
    expect(tieRes.rows.map(r => r.id)).toEqual([
      '00000000-0000-4000-8000-000000000009',
      '00000000-0000-4000-8000-000000000001',
    ]);
  });

  it('SUM-02 includes exact-end boundary (endsAt === T_eval) and excludes in-progress (1 us after T_eval) with microsecond precision', async () => {
    const tutorAEmail = `sum02-ta-${marker}@example.test`;
    const tutorBEmail = `sum02-tb-${marker}@example.test`;
    const custAEmail = `sum02-ca-${marker}@example.test`;
    const custBEmail = `sum02-cb-${marker}@example.test`;
    const tutorAId = await createUser(tutorAEmail, 'Tutor');
    const tutorBId = await createUser(tutorBEmail, 'Tutor');
    const custAId = await createUser(custAEmail, 'Customer');
    const custBId = await createUser(custBEmail, 'Customer');

    const tEval = offsetIso(3, 1, 123); // exact microsecond .000123Z
    currentSummaryClock = tEval;

    // Exact boundary: endsAt === T_eval (included)
    const slotExact = await createSlot(tutorAId, offsetIso(3, 0, 123), offsetIso(3, 1, 123));
    const bExact = await seedBooking({ customerId: custAId, slotId: slotExact, startsAtIso: offsetIso(3, 0, 123), endsAtIso: offsetIso(3, 1, 123), status: 'Booked' });

    // Adjacent in-progress on same Tutor: startsAt === T_eval < endsAt (excluded)
    const slotInProgSameTutor = await createSlot(tutorAId, offsetIso(3, 1, 123), offsetIso(3, 2, 123));
    await seedBooking({ customerId: custAId, slotId: slotInProgSameTutor, startsAtIso: offsetIso(3, 1, 123), endsAtIso: offsetIso(3, 2, 123), status: 'Booked' });

    // Sub-millisecond in-progress on Tutor B with distinct Customer B: endsAt is 1 microsecond after T_eval (excluded)
    const slotOneUsAfter = await createSlot(tutorBId, offsetIso(3, 0, 124), offsetIso(3, 1, 124));
    await seedBooking({ customerId: custBId, slotId: slotOneUsAfter, startsAtIso: offsetIso(3, 0, 124), endsAtIso: offsetIso(3, 1, 124), status: 'Booked' });

    const authA = await loginCookieAndBinding(app, tutorAEmail);
    const resA = await request(app).get('/api/v1/tutor/summary').set('Cookie', authA.cookie);
    expect(resA.status).toBe(200);
    expect(resA.body.meta.evaluatedAt).toBe(tEval);
    expect(resA.body.data.pastBookedCount).toBe(1);
    expect(resA.body.data.pastBooked.map((b: { id: string }) => b.id)).toEqual([bExact]);
    expect(JSON.stringify(resA.body)).not.toContain('Completed');

    const authB = await loginCookieAndBinding(app, tutorBEmail);
    const resB = await request(app).get('/api/v1/tutor/summary').set('Cookie', authB.cookie);
    expect(resB.status).toBe(200);
    expect(resB.body.meta.evaluatedAt).toBe(tEval);
    expect(resB.body.data.pastBookedCount).toBe(0);
    expect(resB.body.data.pastBooked).toEqual([]);
  });

  it('SUM-03 enforces 401 anonymous, 403 Customer, and 200 empty single-snapshot for Tutor with 0 past rows', async () => {
    const tutorEmptyEmail = `sum03-empty-${marker}@example.test`;
    const custEmail = `sum03-c-${marker}@example.test`;
    await createUser(tutorEmptyEmail, 'Tutor');
    await createUser(custEmail, 'Customer');

    const tEval = offsetIso(4, 1, 456);
    currentSummaryClock = tEval;

    const anonRes = await request(app).get('/api/v1/tutor/summary');
    expect(anonRes.status).toBe(401);
    expect(anonRes.body.error?.code).toBe('UNAUTHENTICATED');

    const custAuth = await loginCookieAndBinding(app, custEmail);
    const custRes = await request(app).get('/api/v1/tutor/summary').set('Cookie', custAuth.cookie);
    expect(custRes.status).toBe(403);
    expect(custRes.body.error?.code).toBe('FORBIDDEN');

    const tutorAuth = await loginCookieAndBinding(app, tutorEmptyEmail);
    const tutorRes = await request(app).get('/api/v1/tutor/summary').set('Cookie', tutorAuth.cookie);
    expect(tutorRes.status).toBe(200);
    expect(tutorRes.body.data.pastBookedCount).toBe(0);
    expect(tutorRes.body.data.pastBooked).toEqual([]);
    expect(tutorRes.body.meta.evaluatedAt).toBe(tEval);
  });

  it('SUM-04 enforces strict DTO privacy allowlist with zero Customer email, raw customerId, or cancellation reason', async () => {
    const tutorEmail = `sum04-t-${marker}@example.test`;
    const secretCustEmail = `sum04-secret-pii-${marker}@example.test`;
    const secretReason = 'PRIVATE_MEDICAL_REASON_DO_NOT_LEAK_991';
    const tutorId = await createUser(tutorEmail, 'Tutor');
    const custId = await createUser(secretCustEmail, 'Customer');

    const slotPast = await createSlot(tutorId, offsetIso(1, 3), offsetIso(1, 4));
    const slotCancelled = await createSlot(tutorId, offsetIso(2, 3), offsetIso(2, 4));
    await seedBooking({ customerId: custId, slotId: slotPast, startsAtIso: offsetIso(1, 3), endsAtIso: offsetIso(1, 4), status: 'Booked' });
    const bTutorCancelled = await seedBooking({
      customerId: custId,
      slotId: slotCancelled,
      startsAtIso: offsetIso(2, 3),
      endsAtIso: offsetIso(2, 4),
      status: 'Booked',
    });

    const auth = await loginCookieAndBinding(app, tutorEmail);
    const csrfRes = await request(app).get('/api/v1/auth/csrf').set('Cookie', auth.cookie);
    expect(csrfRes.status).toBe(200);
    const tutorCancelRes = await request(app)
      .post(`/api/v1/tutor/bookings/${bTutorCancelled}/cancel`)
      .set({
        ...headers,
        Cookie: auth.cookie,
        'X-CSRF-Token': csrfRes.body.csrfToken as string,
        'X-NutTiew-Expected-Session-Binding': auth.binding,
      })
      .send({ reason: secretReason });
    expect(tutorCancelRes.status).toBe(200);

    currentSummaryClock = offsetIso(5, 0);

    const res = await request(app).get('/api/v1/tutor/summary').set('Cookie', auth.cookie);
    expect(res.status).toBe(200);
    expect(res.body.data.pastBooked).toHaveLength(1);
    expect(Object.keys(res.body.data.pastBooked[0]).sort()).toEqual([
      'createdAt',
      'customerRef',
      'displayStatus',
      'endsAt',
      'id',
      'slotId',
      'startsAt',
      'status',
    ]);
    const rawText = JSON.stringify(res.body);
    expect(rawText).not.toContain(secretCustEmail);
    expect(rawText).not.toContain(custId);
    expect(rawText).not.toContain(secretReason);
    expect(rawText).not.toContain('passwordHash');
    expect(rawText).not.toContain('SELECT ');
    expect(rawText).not.toContain('stack');

    // Verify 400 / 401 / 403 error payloads also contain zero PII, credentials, SQL, or stack traces
    const err400 = await request(app).get('/api/v1/tutor/summary?tutorId=' + randomUUID()).set('Cookie', auth.cookie);
    expect(err400.status).toBe(400);
    const err401 = await request(app).get('/api/v1/tutor/summary');
    expect(err401.status).toBe(401);
    const custAuth = await loginCookieAndBinding(app, secretCustEmail);
    const err403 = await request(app).get('/api/v1/tutor/summary').set('Cookie', custAuth.cookie);
    expect(err403.status).toBe(403);

    for (const errRes of [err400, err401, err403]) {
      expect(Object.keys(errRes.body).sort()).toEqual(['error', 'requestId']);
      expect(Object.keys(errRes.body.error).sort()).toEqual(['code', 'message']);
      const errRaw = JSON.stringify(errRes.body);
      expect(errRaw).not.toContain(secretCustEmail);
      expect(errRaw).not.toContain(custId);
      expect(errRaw).not.toContain(secretReason);
      expect(errRaw).not.toContain('passwordHash');
      expect(errRaw).not.toContain('SELECT');
      expect(errRaw).not.toContain('stack');
    }
  });

  it('SUM-05 rejects client query parameters with 400 INVALID_INPUT', async () => {
    const tutorEmail = `sum05-t-${marker}@example.test`;
    await createUser(tutorEmail, 'Tutor');
    const auth = await loginCookieAndBinding(app, tutorEmail);

    const res1 = await request(app).get(`/api/v1/tutor/summary?tutorId=${randomUUID()}`).set('Cookie', auth.cookie);
    expect(res1.status).toBe(400);
    expect(res1.body.error?.code).toBe('INVALID_INPUT');
    expect(res1.body.data).toBeUndefined();

    const res2 = await request(app).get('/api/v1/tutor/summary?status=Past').set('Cookie', auth.cookie);
    expect(res2.status).toBe(400);
    expect(res2.body.error?.code).toBe('INVALID_INPUT');
    expect(res2.body.data).toBeUndefined();
  });

  it('SUM-06 attributes rescheduled Booking strictly to current Tutor (Booking.currentSlotId -> Slot.tutorId)', async () => {
    const tutorAEmail = `sum06-ta-${marker}@example.test`;
    const tutorBEmail = `sum06-tb-${marker}@example.test`;
    const custEmail = `sum06-c-${marker}@example.test`;
    const tutorAId = await createUser(tutorAEmail, 'Tutor');
    const tutorBId = await createUser(tutorBEmail, 'Tutor');
    await createUser(custEmail, 'Customer');

    const oldStart = offsetIso(10, 0);
    const oldEnd = offsetIso(10, 1);
    const newStart = offsetIso(11, 0);
    const newEnd = offsetIso(11, 1);

    const oldSlotA = await createSlot(tutorAId, oldStart, oldEnd);
    const newSlotB = await createSlot(tutorBId, newStart, newEnd);

    const authCust = await loginCookieAndBinding(app, custEmail);
    const csrfRes = await request(app).get('/api/v1/auth/csrf').set('Cookie', authCust.cookie);
    expect(csrfRes.status).toBe(200);
    const csrfToken = csrfRes.body.csrfToken as string;

    const createRes = await request(app)
      .post('/api/v1/customer/bookings')
      .set({
        ...headers,
        Cookie: authCust.cookie,
        'X-CSRF-Token': csrfToken,
        'X-NutTiew-Expected-Session-Binding': authCust.binding,
      })
      .send({ slotId: oldSlotA });
    expect(createRes.status).toBe(201);
    const bookingId = createRes.body.data.id as string;

    const rescheduleRes = await request(app)
      .post(`/api/v1/customer/bookings/${bookingId}/reschedule`)
      .set({
        ...headers,
        Cookie: authCust.cookie,
        'X-CSRF-Token': csrfToken,
        'X-NutTiew-Expected-Session-Binding': authCust.binding,
      })
      .send({ slotId: newSlotB });
    expect(rescheduleRes.status).toBe(200);

    currentSummaryClock = offsetIso(12, 0);

    const authA = await loginCookieAndBinding(app, tutorAEmail);
    const authB = await loginCookieAndBinding(app, tutorBEmail);

    const resA = await request(app).get('/api/v1/tutor/summary').set('Cookie', authA.cookie);
    expect(resA.status).toBe(200);
    expect(resA.body.data.pastBookedCount).toBe(0);
    expect(resA.body.data.pastBooked).toEqual([]);

    const resB = await request(app).get('/api/v1/tutor/summary').set('Cookie', authB.cookie);
    expect(resB.status).toBe(200);
    expect(resB.body.data.pastBookedCount).toBe(1);
    expect(resB.body.data.pastBooked[0].id).toBe(bookingId);
  });

  it('SUM-07 persists Past Booked count and row across a real API OS-process restart', async () => {
    const tutorEmail = `sum07-t-${marker}@example.test`;
    const custEmail = `sum07-c-${marker}@example.test`;
    const tutorId = await createUser(tutorEmail, 'Tutor');
    const custId = await createUser(custEmail, 'Customer');

    const pastStart = new Date(Date.now() - 48 * 3_600_000);
    pastStart.setUTCMinutes(0, 0, 0);
    const pastEnd = new Date(pastStart.getTime() + 3_600_000);
    const bookingId = await seedHistoricalPastBooking(tutorId, custId, pastStart.toISOString(), pastEnd.toISOString());

    const port = await unusedPort();
    const base1 = await startServer(port);
    const ipHex = randomUUID().replaceAll('-', '');
    const testIp = '2001:db8:' + ipHex.slice(0, 4) + ':' + ipHex.slice(4, 8) + '::8';
    const login = await fetch(base1 + '/api/v1/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-For': testIp },
      body: JSON.stringify({ email: tutorEmail, password }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toBeTruthy();

    const beforeRes = await fetch(base1 + '/api/v1/tutor/summary', { headers: { Cookie: cookie! } });
    expect(beforeRes.status).toBe(200);
    const beforeBody = await beforeRes.json() as { data: { pastBookedCount: number; pastBooked: Array<{ id: string }> } };
    expect(beforeBody.data.pastBookedCount).toBe(1);
    expect(beforeBody.data.pastBooked[0].id).toBe(bookingId);

    await stopServer();
    const base2 = await startServer(port);

    const afterRes = await fetch(base2 + '/api/v1/tutor/summary', { headers: { Cookie: cookie! } });
    expect(afterRes.status).toBe(200);
    const afterBody = await afterRes.json() as { data: { pastBookedCount: number; pastBooked: Array<{ id: string }> }; meta: { evaluatedAt: string } };
    expect(afterBody.data.pastBookedCount).toBe(1);
    expect(afterBody.data.pastBooked[0].id).toBe(bookingId);
    expect(afterBody.meta.evaluatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/);
  }, 45_000);
});

describe('F-S3-01 Final Cancelled slice — #147', () => {
  it('SUM-09 / VAL-028/029/036: returns current-owner cancellations from both actors, safely ordered and projected', async () => {
    const emailA = 'sum09-a-' + marker + '@example.test';
    const emailB = 'sum09-b-' + marker + '@example.test';
    const customerEmail = 'sum09-private-' + marker + '@example.test';
    const secretReason = 'PRIVATE_TUTOR_REASON_SUM09';
    const tutorA = await createUser(emailA, 'Tutor');
    const tutorB = await createUser(emailB, 'Tutor');
    const customer = await createUser(customerEmail, 'Customer');
    const oldSlot = await createSlot(tutorA, offsetIso(10), offsetIso(10, 1));
    const currentSlot = await createSlot(tutorB, offsetIso(11), offsetIso(11, 1));
    const otherSlot = await createSlot(tutorB, offsetIso(12), offsetIso(12, 1));
    const foreignSlot = await createSlot(tutorA, offsetIso(13), offsetIso(13, 1));

    const authA = await loginCookieAndBinding(app, emailA);
    const authB = await loginCookieAndBinding(app, emailB);
    const authCustomer = await loginCookieAndBinding(app, customerEmail);
    const writeHeaders = async (auth: { cookie: string; binding: string }) => {
      const csrf = await request(app).get('/api/v1/auth/csrf').set('Cookie', auth.cookie);
      expect(csrf.status).toBe(200);
      return {
        ...headers,
        Cookie: auth.cookie,
        'X-CSRF-Token': csrf.body.csrfToken as string,
        'X-NutTiew-Expected-Session-Binding': auth.binding,
      };
    };
    const customerHeaders = await writeHeaders(authCustomer);
    const tutorBHeaders = await writeHeaders(authB);
    const zero = await request(app).get('/api/v1/tutor/summary').set('Cookie', authB.cookie);
    expect(zero.status).toBe(200);
    expect(zero.body.data).toMatchObject({ cancelledCount: 0, cancelled: [] });

    const booked = await request(app).post('/api/v1/customer/bookings')
      .set(customerHeaders).send({ slotId: oldSlot });
    expect(booked.status).toBe(201);
    const movedId = booked.body.data.id as string;
    const movedPath = '/api/v1/customer/bookings/' + movedId;
    expect((await request(app).post(movedPath + '/reschedule')
      .set(customerHeaders).send({ slotId: currentSlot })).status).toBe(200);
    const customerCancel = await request(app).post(movedPath + '/cancel').set(customerHeaders).send({});
    expect(customerCancel.status).toBe(200);

    const tutorCancelledId = await seedBooking({
      customerId: customer, slotId: otherSlot, startsAtIso: offsetIso(12), endsAtIso: offsetIso(12, 1), status: 'Booked',
    });
    const tutorCancel = await request(app).post('/api/v1/tutor/bookings/' + tutorCancelledId + '/cancel')
      .set(tutorBHeaders).send({ reason: secretReason });
    expect(tutorCancel.status).toBe(200);

    const foreignId = await seedBooking({
      customerId: customer, slotId: foreignSlot, startsAtIso: offsetIso(13), endsAtIso: offsetIso(13, 1), status: 'Booked',
    });
    expect((await request(app).post('/api/v1/customer/bookings/' + foreignId + '/cancel')
      .set(customerHeaders).send({})).status).toBe(200);

    currentSummaryClock = offsetIso(15, 0, 123);
    const summaryB = await request(app).get('/api/v1/tutor/summary').set('Cookie', authB.cookie);
    expect(summaryB.status).toBe(200);
    expect(summaryB.body.meta.evaluatedAt).toBe(currentSummaryClock);
    expect(summaryB.body.data).toMatchObject({
      pastBookedCount: 0, pastBooked: [], cancelledCount: 2,
      cancelled: [
        { id: tutorCancelledId, slotId: otherSlot, cancellationActor: 'Tutor', cancelledAt: tutorCancel.body.data.cancelledAt },
        { id: movedId, slotId: currentSlot, cancellationActor: 'Customer', cancelledAt: customerCancel.body.data.cancelledAt },
      ],
    });
    const exactFields = ['cancellationActor', 'cancelledAt', 'createdAt', 'customerRef', 'displayStatus', 'endsAt', 'id', 'slotId', 'startsAt', 'status'];
    for (const row of summaryB.body.data.cancelled) {
      expect(Object.keys(row).sort()).toEqual(exactFields);
      expect(row).toMatchObject({ status: 'Cancelled', displayStatus: 'Cancelled', customerRef: 'CUST-' + customer.slice(0, 8) });
    }
    for (const secret of [customer, customerEmail, secretReason, authB.cookie.split(';')[0], foreignId, oldSlot]) {
      expect(JSON.stringify(summaryB.body)).not.toContain(secret);
    }
    const summaryA = await request(app).get('/api/v1/tutor/summary').set('Cookie', authA.cookie);
    expect(summaryA.status).toBe(200);
    expect(summaryA.body.data.cancelledCount).toBe(1);
    expect(summaryA.body.data.cancelled.map((row: { id: string }) => row.id)).toEqual([foreignId]);
  });
});

describe('F-S3-01 Final Upcoming & In-Progress slice — #146 (OD-006 Option 1)', () => {
  it('SUM-09 / AC-S3-01-07 / VAL-028/029: classifies upcoming, in-progress, and past at microsecond start/end boundaries, enforces isolation, and keeps Booked immutable', async () => {
    const emailA = 'sum09-146-a-' + marker + '@example.test';
    const emailB = 'sum09-146-b-' + marker + '@example.test';
    const emailEmpty = 'sum09-146-empty-' + marker + '@example.test';
    const customerEmail = 'sum09-146-cust-' + marker + '@example.test';
    const customerBEmail = 'sum09-146-cust-b-' + marker + '@example.test';
    const tutorA = await createUser(emailA, 'Tutor');
    const tutorB = await createUser(emailB, 'Tutor');
    const tutorEmpty = await createUser(emailEmpty, 'Tutor');
    const customer = await createUser(customerEmail, 'Customer');
    const customerB = await createUser(customerBEmail, 'Customer');

    // Anchor T_eval at day+30 05:00:00.500000Z (microsecond precision)
    const tEval = offsetIso(30, 5, 500_000);

    // Tutor A non-overlapping 60-minute slots:
    // 1) exact end boundary: endsAt === T_eval -> pastBooked (NOT inProgressBooked)
    const slotExactEnd = await createSlot(tutorA, offsetIso(30, 4, 500_000), tEval);
    // 2) exact start boundary: startsAt === T_eval, endsAt > T_eval -> inProgressBooked (NOT upcomingBooked)
    const slotExactStart = await createSlot(tutorA, tEval, offsetIso(30, 6, 500_000));
    // 3) upcoming earlier & later -> upcomingBooked ordered startsAt ASC, id ASC
    const slotUpcoming1 = await createSlot(tutorA, offsetIso(30, 7, 0), offsetIso(30, 8, 0));
    const slotUpcoming2 = await createSlot(tutorA, offsetIso(30, 9, 0), offsetIso(30, 10, 0));

    const bExactEnd = await seedBooking({
      customerId: customer, slotId: slotExactEnd, startsAtIso: offsetIso(30, 4, 500_000), endsAtIso: tEval, status: 'Booked',
    });
    const bExactStart = await seedBooking({
      customerId: customer, slotId: slotExactStart, startsAtIso: tEval, endsAtIso: offsetIso(30, 6, 500_000), status: 'Booked',
    });
    const bUpcoming2 = await seedBooking({
      customerId: customer, slotId: slotUpcoming2, startsAtIso: offsetIso(30, 9, 0), endsAtIso: offsetIso(30, 10, 0), status: 'Booked',
    });
    const bUpcoming1 = await seedBooking({
      customerId: customer, slotId: slotUpcoming1, startsAtIso: offsetIso(30, 7, 0), endsAtIso: offsetIso(30, 8, 0), status: 'Booked',
    });

    // Tutor B non-overlapping 60-minute slots testing +1 microsecond boundaries:
    // 1) endsAt === T_eval + 1 μs (startsAt <= T_eval) -> inProgressBooked (NOT pastBooked)
    const slotPreEnd1us = await createSlot(tutorB, offsetIso(30, 4, 500_001), offsetIso(30, 5, 500_001));
    // 2) startsAt === T_eval + 1 μs -> upcomingBooked (NOT inProgressBooked)
    const slotPreStart1us = await createSlot(tutorB, offsetIso(30, 5, 500_001), offsetIso(30, 6, 500_001));
    // 3) cancelled future slot -> cancelled only (never upcoming/in-progress/past)
    const slotCancelledB = await createSlot(tutorB, offsetIso(30, 11, 0), offsetIso(30, 12, 0));

    const bPreEnd1us = await seedBooking({
      customerId: customerB, slotId: slotPreEnd1us, startsAtIso: offsetIso(30, 4, 500_001), endsAtIso: offsetIso(30, 5, 500_001), status: 'Booked',
    });
    const bPreStart1us = await seedBooking({
      customerId: customerB, slotId: slotPreStart1us, startsAtIso: offsetIso(30, 5, 500_001), endsAtIso: offsetIso(30, 6, 500_001), status: 'Booked',
    });
    const bCancelledB = await seedBooking({
      customerId: customerB, slotId: slotCancelledB, startsAtIso: offsetIso(30, 11, 0), endsAtIso: offsetIso(30, 12, 0),
      status: 'Booked',
    });

    const authA = await loginCookieAndBinding(app, emailA);
    const authB = await loginCookieAndBinding(app, emailB);
    const authEmpty = await loginCookieAndBinding(app, emailEmpty);
    const authCustomer = await loginCookieAndBinding(app, customerEmail);
    const authCustomerB = await loginCookieAndBinding(app, customerBEmail);
    const csrfB = await request(app).get('/api/v1/auth/csrf').set('Cookie', authCustomerB.cookie);
    expect(csrfB.status).toBe(200);
    const cancelResB = await request(app)
      .post('/api/v1/customer/bookings/' + bCancelledB + '/cancel')
      .set({
        ...headers,
        Cookie: authCustomerB.cookie,
        'X-CSRF-Token': csrfB.body.csrfToken as string,
        'X-NutTiew-Expected-Session-Binding': authCustomerB.binding,
      })
      .send({});
    expect(cancelResB.status).toBe(200);

    currentSummaryClock = tEval;

    // 1. Tutor A: exactStart in inProgressBooked, exactEnd in pastBooked, upcoming ordered startsAt ASC
    const resA = await request(app).get('/api/v1/tutor/summary').set('Cookie', authA.cookie);
    expect(resA.status).toBe(200);
    expect(resA.body.meta.evaluatedAt).toBe(tEval);
    expect(resA.body.data.upcomingBookedCount).toBe(2);
    expect(resA.body.data.upcomingBooked.map((r: { id: string }) => r.id)).toEqual([bUpcoming1, bUpcoming2]);
    expect(resA.body.data.inProgressBookedCount).toBe(1);
    expect(resA.body.data.inProgressBooked.map((r: { id: string }) => r.id)).toEqual([bExactStart]);
    expect(resA.body.data.pastBookedCount).toBe(1);
    expect(resA.body.data.pastBooked.map((r: { id: string }) => r.id)).toEqual([bExactEnd]);
    expect(resA.body.data.cancelledCount).toBe(0);
    expect(resA.body.data.cancelled).toEqual([]);

    const exactBookedFields = ['createdAt', 'customerRef', 'displayStatus', 'endsAt', 'id', 'slotId', 'startsAt', 'status'];
    for (const row of [...resA.body.data.upcomingBooked, ...resA.body.data.inProgressBooked]) {
      expect(Object.keys(row).sort()).toEqual(exactBookedFields);
      expect(row).toMatchObject({ status: 'Booked', displayStatus: 'Booked', customerRef: 'CUST-' + customer.slice(0, 8) });
    }
    const bodyAStr = JSON.stringify(resA.body);
    for (const forbidden of [customer, customerEmail, bPreEnd1us, bPreStart1us, bCancelledB, 'Completed']) {
      expect(bodyAStr).not.toContain(forbidden);
    }

    // 2. Tutor B: +1 μs boundaries (startsAt = T_eval + 1 μs -> upcoming; endsAt = T_eval + 1 μs -> in-progress)
    const resB = await request(app).get('/api/v1/tutor/summary').set('Cookie', authB.cookie);
    expect(resB.status).toBe(200);
    expect(resB.body.meta.evaluatedAt).toBe(tEval);
    expect(resB.body.data.upcomingBookedCount).toBe(1);
    expect(resB.body.data.upcomingBooked.map((r: { id: string }) => r.id)).toEqual([bPreStart1us]);
    expect(resB.body.data.inProgressBookedCount).toBe(1);
    expect(resB.body.data.inProgressBooked.map((r: { id: string }) => r.id)).toEqual([bPreEnd1us]);
    expect(resB.body.data.pastBookedCount).toBe(0);
    expect(resB.body.data.pastBooked).toEqual([]);
    expect(resB.body.data.cancelledCount).toBe(1);
    expect(resB.body.data.cancelled.map((r: { id: string }) => r.id)).toEqual([bCancelledB]);
    const bodyBStr = JSON.stringify(resB.body);
    for (const foreignId of [bExactEnd, bExactStart, bUpcoming1, bUpcoming2]) {
      expect(bodyBStr).not.toContain(foreignId);
    }

    // 3. Empty Tutor sees 0 counts and empty lists under the exact same single-statement snapshot
    const resEmpty = await request(app).get('/api/v1/tutor/summary').set('Cookie', authEmpty.cookie);
    expect(resEmpty.status).toBe(200);
    expect(resEmpty.body.meta.evaluatedAt).toBe(tEval);
    expect(resEmpty.body.data).toEqual({
      upcomingBookedCount: 0,
      upcomingBooked: [],
      inProgressBookedCount: 0,
      inProgressBooked: [],
      pastBookedCount: 0,
      pastBooked: [],
      cancelledCount: 0,
      cancelled: [],
    });

    // 4. Role denials (Customer 403, anonymous 401)
    expect((await request(app).get('/api/v1/tutor/summary').set('Cookie', authCustomer.cookie)).status).toBe(403);
    expect((await request(app).get('/api/v1/tutor/summary')).status).toBe(401);

    // 5. Persisted Booking business state remains immutably 'Booked' after summary evaluation
    const dbCheck = await ownerPool.query<{ id: string; status: string }>(
      'SELECT "id", "status" FROM "Booking" WHERE "id" = ANY($1::uuid[])',
      [[bExactEnd, bExactStart, bUpcoming1, bUpcoming2, bPreEnd1us, bPreStart1us]],
    );
    expect(dbCheck.rows).toHaveLength(6);
    for (const row of dbCheck.rows) {
      expect(row.status).toBe('Booked');
    }
    expect(tutorEmpty).toBeTruthy();
  });
});
