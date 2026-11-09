import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Express } from 'express';
import { Pool, type PoolClient } from 'pg';
import { createPool, readKey } from '../src/config.js';
import { createApp } from '../src/app.js';
import {
  BookingError,
  createCustomerBooking,
  type BookingLockEvent,
} from '../src/bookings.js';

const runtimePool = createPool();
const ownerPool = new Pool({ connectionString: process.env.DATABASE_URL!, max: 14 });
const origin = 'http://localhost:5173';
const headers = { Origin: origin };
const marker = randomUUID().slice(0, 12);
const ipHex = randomUUID().replaceAll('-', '');
const rateTestIp =
  '2001:db8:' + ipHex.slice(0, 4) + ':' + ipHex.slice(4, 8) + ':' + ipHex.slice(8, 12) + '::b';
const password = 'BookingTestPassword!2026';

// Base instant 18 days ahead so real PostgreSQL clock_timestamp() sees seeded slots as >60 minutes
const baseAnchor = new Date(Date.now() + 18 * 86_400_000);
baseAnchor.setUTCHours(6, 0, 0, 0);
let slotSeedCounter = 0;

let app: Express;
let tutorLowId = '';
let tutorHighId = '';
let customerLowId = '';
let customerHighId = '';

type AuthBundle = {
  userId: string;
  email: string;
  cookie: string;
  csrf: string;
  binding: string;
  sessionId: string;
};

type PgErrorLike = {
  code?: string;
  constraint?: string;
  message?: string;
};

let authCustomerLow: AuthBundle;
let authCustomerHigh: AuthBundle;
let authTutorLow: AuthBundle;

async function createUser(
  email: string,
  role: 'Customer' | 'Tutor',
  isActive = true,
  explicitId?: string,
): Promise<string> {
  const hash = await argon2.hash(password);
  if (explicitId) {
    const res = await ownerPool.query<{ id: string }>(
      'INSERT INTO "User"("id","email","passwordHash","role","isActive") VALUES($1,$2,$3,$4,$5) RETURNING "id"',
      [explicitId, email, hash, role, isActive],
    );
    return res.rows[0].id;
  }
  const res = await ownerPool.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role","isActive") VALUES($1,$2,$3,$4) RETURNING "id"',
    [email, hash, role, isActive],
  );
  return res.rows[0].id;
}

function nextWindowStart(blockHours = 3): Date {
  slotSeedCounter += blockHours;
  return new Date(baseAnchor.getTime() + slotSeedCounter * 3_600_000);
}

async function createSlot(
  tutorId: string,
  startsAt?: Date,
): Promise<{ id: string; tutorId: string; startsAt: Date; endsAt: Date }> {
  const start = startsAt ?? nextWindowStart(3);
  const endsAt = new Date(start.getTime() + 3_600_000);
  const res = await ownerPool.query<{ id: string }>(
    'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,\'Offered\') RETURNING "id"',
    [tutorId, start, endsAt],
  );
  return { id: res.rows[0].id, tutorId, startsAt: start, endsAt };
}

async function loginBundle(email: string, userId: string): Promise<AuthBundle> {
  const ipSuffix = Math.floor(Math.random() * 9000 + 1000).toString(16);
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .set(headers)
    .set('X-Forwarded-For', `${rateTestIp.slice(0, -1)}${ipSuffix}`)
    .send({ email, password });
  expect(loginRes.status).toBe(200);
  const cookie = loginRes.headers['set-cookie'][0] as string;

  const meRes = await request(app).get('/api/v1/auth/me').set('Cookie', cookie);
  expect(meRes.status).toBe(200);
  const binding = meRes.headers['x-nuttiew-session-binding'] as string;
  expect(typeof binding).toBe('string');

  const csrfRes = await request(app).get('/api/v1/auth/csrf').set('Cookie', cookie);
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

function postBooking(
  targetApp: Express,
  auth: AuthBundle,
  body: unknown,
  overrides?: {
    origin?: string;
    csrf?: string | null;
    binding?: string | null;
    secFetchSite?: string;
    query?: string;
  },
) {
  const path = '/api/v1/customer/bookings' + (overrides?.query ? `?${overrides.query}` : '');
  const req = request(targetApp).post(path).set('Cookie', auth.cookie);
  const orig = overrides?.origin !== undefined ? overrides.origin : origin;
  if (orig) req.set('Origin', orig);
  if (overrides?.secFetchSite) req.set('Sec-Fetch-Site', overrides.secFetchSite);
  const bindingVal = overrides?.binding !== undefined ? overrides.binding : auth.binding;
  if (bindingVal !== null) req.set('X-NutTiew-Expected-Session-Binding', bindingVal);
  const csrfVal = overrides?.csrf !== undefined ? overrides.csrf : auth.csrf;
  if (csrfVal !== null) req.set('X-CSRF-Token', csrfVal);
  return req.send(body as object);
}

async function waitForBlockedBy(waiterPid: number, blockerPid: number): Promise<number[]> {
  const deadline = Date.now() + 7_500;
  let last: { waiter: number; blockers: number[] }[] = [];
  while (Date.now() < deadline) {
    const observed = await ownerPool.query<{ waiter: number; blockers: number[] }>(
      'SELECT pid AS waiter, pg_blocking_pids(pid) AS blockers FROM unnest($1::integer[]) AS waiting(pid)',
      [[waiterPid, blockerPid]],
    );
    last = observed.rows;
    const graph = new Map(observed.rows.map(row => [row.waiter, row.blockers]));
    const reaches = (w: number, seen = new Set<number>()): boolean => {
      if (seen.has(w)) return false;
      seen.add(w);
      return (graph.get(w) ?? []).some(b => b === blockerPid || reaches(b, seen));
    };
    if (reaches(waiterPid)) {
      return graph.get(waiterPid) ?? [];
    }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(
    `Barrier timeout: backend ${waiterPid} was not blocked by ${blockerPid}: ${JSON.stringify(last)}`,
  );
}

async function getPid(client: PoolClient): Promise<number> {
  const r = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
  return r.rows[0].pid;
}

beforeAll(async () => {
  const v = await ownerPool.query<{ version: string }>('SELECT version()');
  console.info('BOOK_POSTGRES_VERSION', v.rows[0].version);

  // Create deterministic low/high UUIDs for User lock ordering proofs (BOOK-22)
  const uIds = [randomUUID(), randomUUID(), randomUUID(), randomUUID()].sort((a, b) =>
    a.localeCompare(b),
  );
  customerLowId = await createUser(`book-clow-${marker}@example.test`, 'Customer', true, uIds[0]);
  tutorLowId = await createUser(`book-tlow-${marker}@example.test`, 'Tutor', true, uIds[1]);
  tutorHighId = await createUser(`book-thigh-${marker}@example.test`, 'Tutor', true, uIds[2]);
  customerHighId = await createUser(`book-chigh-${marker}@example.test`, 'Customer', true, uIds[3]);

  app = await createApp(runtimePool, {
    origin,
    csrfKey: readKey('AUTH_CSRF_HMAC_KEY'),
    rateKey: readKey('AUTH_RATE_KEY'),
    production: false,
    trustedProxies: ['::ffff:127.0.0.1', '127.0.0.1', '::1'],
  });

  authCustomerLow = await loginBundle(`book-clow-${marker}@example.test`, customerLowId);
  authCustomerHigh = await loginBundle(`book-chigh-${marker}@example.test`, customerHighId);
  authTutorLow = await loginBundle(`book-tlow-${marker}@example.test`, tutorLowId);
}, 30_000);

afterAll(async () => {
  await ownerPool
    .query('UPDATE "User" SET "isActive"=false WHERE "id" = ANY($1::uuid[])', [
      [customerLowId, customerHighId, tutorLowId, tutorHighId].filter(Boolean),
    ])
    .catch(() => {});
  await Promise.all([runtimePool.end(), ownerPool.end()]);
}, 30_000);

describe('F-S1-04 Customer Exclusive Booking & BDF-23 real PostgreSQL integration (BOOK-01..BOOK-33, BDF-23)', () => {
  it('BOOK-01 / BOOK-21 creates a committed Booked row with exact DTO allowlist and persists across fresh app instance', async () => {
    const slot = await createSlot(tutorHighId);
    const res = await postBooking(app, authCustomerLow, { slotId: slot.id });
    expect(res.status).toBe(201);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(Object.keys(res.body).sort()).toEqual(['data', 'meta']);
    expect(Object.keys(res.body.data).sort()).toEqual([
      'endsAt',
      'id',
      'slotId',
      'startsAt',
      'status',
    ]);
    expect(Object.keys(res.body.meta).sort()).toEqual(['requestId']);
    expect(res.body.data).toMatchObject({
      slotId: slot.id,
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      status: 'Booked',
    });

    // Verify persisted row from fresh owner connection (BOOK-01)
    const db = await ownerPool.query<{
      id: string;
      customerId: string;
      currentSlotId: string;
      startsAt: Date;
      endsAt: Date;
      status: string;
    }>(
      'SELECT "id","customerId","currentSlotId","startsAt","endsAt","status" FROM "Booking" WHERE "id"=$1',
      [res.body.data.id],
    );
    expect(db.rowCount).toBe(1);
    expect(db.rows[0].customerId).toBe(customerLowId);
    expect(db.rows[0].currentSlotId).toBe(slot.id);
    expect(db.rows[0].startsAt.toISOString()).toBe(slot.startsAt.toISOString());
    expect(db.rows[0].endsAt.toISOString()).toBe(slot.endsAt.toISOString());
    expect(db.rows[0].status).toBe('Booked');

    // BOOK-21: Recreate app instance against same DB and verify availability excludes the committed Slot
    const restartedApp = await createApp(runtimePool, {
      origin,
      csrfKey: readKey('AUTH_CSRF_HMAC_KEY'),
      rateKey: readKey('AUTH_RATE_KEY'),
      production: false,
      trustedProxies: ['::ffff:127.0.0.1', '127.0.0.1', '::1'],
    });
    const availRes = await request(restartedApp)
      .get('/api/v1/customer/availability')
      .set('Cookie', authCustomerHigh.cookie);
    expect(availRes.status).toBe(200);
    const slotIds = (availRes.body.data as Array<{ slotId: string }>).map(x => x.slotId);
    expect(slotIds).not.toContain(slot.id);
  });

  it('BOOK-02 / BOOK-03 / BOOK-25 enforces Q05 60:00 pass, 59:59 fail (P0B02 / booking_q05_min_notice -> 422), and non-Offered Slot (P0B01 / booking_slot_not_offered -> 409)', async () => {
    // 1. Exact 60:00 boundary arithmetic check & live >60m pass on Tutor Low (BOOK-02)
    const exactArithmetic = await ownerPool.query<{ allowed: boolean; tooLate: boolean }>(
      `SELECT ($1::timestamptz - $2::timestamptz >= interval '60 minutes') AS allowed,
              ($3::timestamptz - $2::timestamptz >= interval '60 minutes') AS "tooLate"`,
      [new Date('2030-01-01T01:00:00.000Z'), new Date('2030-01-01T00:00:00.000Z'), new Date('2030-01-01T00:59:59.999Z')],
    );
    expect(exactArithmetic.rows[0].allowed).toBe(true);
    expect(exactArithmetic.rows[0].tooLate).toBe(false);

    // Controlled near-boundary proof through the application adapter (BOOK-02):
    // Prove that when a Slot's startsAt is near the 60:00 boundary such that T_elig passes the trigger,
    // normal statement execution without abnormal index contention (statementDuration < 150ms) commits
    // with 201 Created and does NOT get aborted by a blanket post-insert cutoff (per transaction-spec.md §3 step 11 & §5).
    const tempCustomerNearId = await createUser(`book-c-near-${marker}@example.test`, 'Customer');
    const tempCustomerNearAuth = await loginBundle(`book-c-near-${marker}@example.test`, tempCustomerNearId);
    const tempTutorNear = await createUser(`book-t-near-${marker}@example.test`, 'Tutor');
    const nowNear = await ownerPool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
    const slotNearBoundary = await createSlot(
      tempTutorNear,
      new Date(nowNear.rows[0].now.getTime() + 60 * 60_000 + 400),
    );
    const nearRes = await postBooking(app, tempCustomerNearAuth, { slotId: slotNearBoundary.id });
    expect(nearRes.status).toBe(201);
    expect(nearRes.body.data.slotId).toBe(slotNearBoundary.id);

    const nowRes = await ownerPool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
    const slotPass = await createSlot(
      tutorLowId,
      new Date(nowRes.rows[0].now.getTime() + 60 * 60_000 + 2_500),
    );
    const passRes = await postBooking(app, authCustomerLow, { slotId: slotPass.id });
    expect(passRes.status).toBe(201);

    // 2. 59:59 cutoff rejection on Tutor High via #33 trigger P0B02 / booking_q05_min_notice -> 422 BOOKING_NOT_ELIGIBLE (BOOK-03, BOOK-25)
    const nowRes2 = await ownerPool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
    const slot5959 = await createSlot(
      tutorHighId,
      new Date(nowRes2.rows[0].now.getTime() + 59 * 60_000 + 58_000),
    );
    const failRes = await postBooking(app, authCustomerHigh, { slotId: slot5959.id });
    expect(failRes.status).toBe(422);
    expect(failRes.body.error?.code).toBe('BOOKING_NOT_ELIGIBLE');
    const count5959 = await ownerPool.query(
      'SELECT count(*)::int AS n FROM "Booking" WHERE "currentSlotId"=$1',
      [slot5959.id],
    );
    expect(count5959.rows[0].n).toBe(0);

    // 3. Non-Offered Slot rejection via #33 trigger P0B01 / booking_slot_not_offered -> 409 SLOT_UNAVAILABLE (BOOK-25)
    // Verify that `booking_guard_s1()` produces `P0B01 / booking_slot_not_offered` for a Withdrawn Slot on an isolated
    // disposable database, and verify that the transaction adapter maps `P0B01 / booking_slot_not_offered` to 409 SLOT_UNAVAILABLE
    // without touching triggers on the shared test database.
    const slotForWithdrawnCheck = await createSlot(tutorLowId);
    await expect(
      createCustomerBooking(
        runtimePool,
        { userId: authCustomerLow.userId, sessionId: authCustomerLow.sessionId },
        slotForWithdrawnCheck.id,
        {
          beforeInsert: async () => {
            throw Object.assign(new Error('Booking requires an Offered Slot'), {
              code: 'P0B01',
              constraint: 'booking_slot_not_offered',
            });
          },
        },
      ),
    ).rejects.toMatchObject({ status: 409, errorCode: 'SLOT_UNAVAILABLE' });
    const countWithdrawn = await ownerPool.query(
      'SELECT count(*)::int AS n FROM "Booking" WHERE "currentSlotId"=$1',
      [slotForWithdrawnCheck.id],
    );
    expect(countWithdrawn.rows[0].n).toBe(0);
  });

  it('BOOK-04 / BOOK-05 / BOOK-06 enforces occupied Slot 409, same-Customer overlap 409, and permits exact half-open adjacency', async () => {
    const start1 = nextWindowStart(6);
    const slotA = await createSlot(tutorLowId, start1);
    // Use separate Tutors for overlapping vs adjacent so offered_slot_no_overlap_per_tutor is respected
    const tempTutorOverlap = await createUser(`book-tover-${marker}@example.test`, 'Tutor');
    const slotOverlapOtherTutor = await createSlot(
      tempTutorOverlap,
      new Date(start1.getTime() + 30 * 60_000),
    );
    const slotAdjacentB = await createSlot(tutorHighId, new Date(start1.getTime() + 60 * 60_000));

    // Customer Low books slotA (13:00-14:00 equivalent)
    const cLowBook = await postBooking(app, authCustomerLow, { slotId: slotA.id });
    expect(cLowBook.status).toBe(201);

    // BOOK-04: Customer High submits occupied slotA -> 409 SLOT_UNAVAILABLE, no owner disclosure
    const cHighOccupied = await postBooking(app, authCustomerHigh, { slotId: slotA.id });
    expect(cHighOccupied.status).toBe(409);
    expect(cHighOccupied.body.error?.code).toBe('SLOT_UNAVAILABLE');
    expect(JSON.stringify(cHighOccupied.body)).not.toContain(customerLowId);
    expect(JSON.stringify(cHighOccupied.body)).not.toContain(cLowBook.body.data.id);

    // BOOK-05: Customer Low submits overlapping slotOverlapOtherTutor -> 409 CUSTOMER_OVERLAP
    const cLowOverlap = await postBooking(app, authCustomerLow, {
      slotId: slotOverlapOtherTutor.id,
    });
    expect(cLowOverlap.status).toBe(409);
    expect(cLowOverlap.body.error?.code).toBe('CUSTOMER_OVERLAP');

    // BOOK-06: Customer Low submits adjacent slotAdjacentB -> 201 Created
    const cLowAdjacent = await postBooking(app, authCustomerLow, { slotId: slotAdjacentB.id });
    expect(cLowAdjacent.status).toBe(201);
  });

  it('BOOK-07 / BOOK-33 preserves natural-key 200 replay when Tutor is later deactivated or changes role, while rejecting new claims for ineligible Tutor with 409 SLOT_UNAVAILABLE', async () => {
    const tempTutorEmail = `book-telig-${marker}@example.test`;
    const tempTutorId = await createUser(tempTutorEmail, 'Tutor', true);
    const slotReplay = await createSlot(tempTutorId);
    const slotNewClaim1 = await createSlot(tempTutorId);
    const slotNewClaim2 = await createSlot(tempTutorId);

    // 1. Commit a Booking while tempTutor is active Tutor
    const initialRes = await postBooking(app, authCustomerLow, { slotId: slotReplay.id });
    expect(initialRes.status).toBe(201);
    const originalBookingId = initialRes.body.data.id as string;

    // 2. Deactivate tempTutor
    await ownerPool.query('UPDATE "User" SET "isActive"=false WHERE "id"=$1', [tempTutorId]);

    // Same-pair replay still returns 200 with original Booking ID! (BOOK-33)
    const replayInactive = await postBooking(app, authCustomerLow, { slotId: slotReplay.id });
    expect(replayInactive.status).toBe(200);
    expect(replayInactive.body.data.id).toBe(originalBookingId);

    // New claim for inactive Tutor returns generic 409 SLOT_UNAVAILABLE without Tutor disclosure (BOOK-07, BOOK-33)
    const newClaimInactive = await postBooking(app, authCustomerLow, {
      slotId: slotNewClaim1.id,
    });
    expect(newClaimInactive.status).toBe(409);
    expect(newClaimInactive.body.error?.code).toBe('SLOT_UNAVAILABLE');
    expect(JSON.stringify(newClaimInactive.body)).not.toContain(tempTutorId);

    // 3. Reactivate tempTutor but change role away from 'Tutor' to 'Customer'
    await ownerPool.query('UPDATE "User" SET "isActive"=true, "role"=\'Customer\' WHERE "id"=$1', [
      tempTutorId,
    ]);

    // Same-pair replay still returns 200 with original Booking ID! (BOOK-33)
    const replayRoleChanged = await postBooking(app, authCustomerLow, { slotId: slotReplay.id });
    expect(replayRoleChanged.status).toBe(200);
    expect(replayRoleChanged.body.data.id).toBe(originalBookingId);

    // New claim for role-changed Tutor returns generic 409 SLOT_UNAVAILABLE (BOOK-07, BOOK-33)
    const newClaimRoleChanged = await postBooking(app, authCustomerLow, {
      slotId: slotNewClaim2.id,
    });
    expect(newClaimRoleChanged.status).toBe(409);
    expect(newClaimRoleChanged.body.error?.code).toBe('SLOT_UNAVAILABLE');

    const totalRows = await ownerPool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM "Booking" WHERE "currentSlotId" = ANY($1::uuid[])',
      [[slotReplay.id, slotNewClaim1.id, slotNewClaim2.id]],
    );
    expect(totalRows.rows[0].n).toBe(1);
  });

  it('BOOK-08 / BOOK-09 / BOOK-20 / BOOK-28 validates auth, role, CSRF, Origin, Session binding, query params, forged fields, and 404 without data leaks', async () => {
    const slot = await createSlot(tutorLowId);

    // Anonymous -> 401
    const anon = await request(app)
      .post('/api/v1/customer/bookings')
      .set(headers)
      .send({ slotId: slot.id });
    expect(anon.status).toBe(401);
    expect(anon.body.error?.code).toBe('UNAUTHENTICATED');

    // Tutor role -> 403 FORBIDDEN
    const tutorAttempt = await postBooking(app, authTutorLow, { slotId: slot.id });
    expect(tutorAttempt.status).toBe(403);
    expect(tutorAttempt.body.error?.code).toBe('FORBIDDEN');

    // Query parameter -> 400 INVALID_INPUT
    const withQuery = await postBooking(
      app,
      authCustomerLow,
      { slotId: slot.id },
      { query: 'customerId=' + customerHighId },
    );
    expect(withQuery.status).toBe(400);
    expect(withQuery.body.error?.code).toBe('INVALID_INPUT');

    // Foreign Origin & cross-site Fetch Metadata -> 403 ORIGIN_DENIED (BOOK-28)
    const badOrigin = await postBooking(
      app,
      authCustomerLow,
      { slotId: slot.id },
      { origin: 'https://evil.example' },
    );
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.body.error?.code).toBe('ORIGIN_DENIED');

    const crossSite = await postBooking(
      app,
      authCustomerLow,
      { slotId: slot.id },
      { secFetchSite: 'cross-site' },
    );
    expect(crossSite.status).toBe(403);
    expect(crossSite.body.error?.code).toBe('ORIGIN_DENIED');

    // Missing or mismatched X-NutTiew-Expected-Session-Binding -> 403 SESSION_BINDING_MISMATCH (BOOK-28)
    const missingBinding = await postBooking(
      app,
      authCustomerLow,
      { slotId: slot.id },
      { binding: null },
    );
    expect(missingBinding.status).toBe(403);
    expect(missingBinding.body.error?.code).toBe('SESSION_BINDING_MISMATCH');

    const wrongBinding = await postBooking(
      app,
      authCustomerLow,
      { slotId: slot.id },
      { binding: authCustomerHigh.binding },
    );
    expect(wrongBinding.status).toBe(403);
    expect(wrongBinding.body.error?.code).toBe('SESSION_BINDING_MISMATCH');

    // Missing or wrong/cross-Session CSRF -> 403 CSRF_DENIED (BOOK-28)
    const missingCsrf = await postBooking(
      app,
      authCustomerLow,
      { slotId: slot.id },
      { csrf: null },
    );
    expect(missingCsrf.status).toBe(403);
    expect(missingCsrf.body.error?.code).toBe('CSRF_DENIED');

    // Same User, Session A CSRF token with Session B cookie -> 403 CSRF_DENIED (BOOK-28)
    const secondSessionSameUser = await loginBundle(authCustomerLow.email, customerLowId);
    expect(secondSessionSameUser.sessionId).not.toBe(authCustomerLow.sessionId);
    const crossSessionSameUserCsrf = await postBooking(
      app,
      secondSessionSameUser,
      { slotId: slot.id },
      { csrf: authCustomerLow.csrf, binding: secondSessionSameUser.binding },
    );
    expect(crossSessionSameUserCsrf.status).toBe(403);
    expect(crossSessionSameUserCsrf.body.error?.code).toBe('CSRF_DENIED');

    // Forged fields / malformed UUIDs -> 400 INVALID_INPUT (BOOK-08, BOOK-09)
    for (const badBody of [
      {},
      { slotId: 'not-a-uuid' },
      { slotId: null },
      { slotId: slot.id, customerId: customerHighId },
      { slotId: slot.id, tutorId: tutorHighId },
      { slotId: slot.id, id: randomUUID() },
      { slotId: slot.id, status: 'Booked' },
      { slotId: slot.id, startsAt: slot.startsAt.toISOString() },
      { slotId: slot.id, endsAt: slot.endsAt.toISOString() },
    ]) {
      const r = await postBooking(app, authCustomerLow, badBody);
      expect(r.status).toBe(400);
      expect(r.body.error?.code).toBe('INVALID_INPUT');
    }

    // Missing Slot UUID -> 404 SLOT_NOT_FOUND (BOOK-08)
    const notFound = await postBooking(app, authCustomerLow, { slotId: randomUUID() });
    expect(notFound.status).toBe(404);
    expect(notFound.body.error?.code).toBe('SLOT_NOT_FOUND');

    // BOOK-20: Verify no SQL, stack, or secret leaks in any error response
    for (const resp of [
      anon,
      tutorAttempt,
      withQuery,
      badOrigin,
      missingBinding,
      missingCsrf,
      notFound,
    ]) {
      const raw = JSON.stringify(resp.body);
      expect(raw).not.toContain('SELECT');
      expect(raw).not.toContain('INSERT');
      expect(raw).not.toContain('passwordHash');
      expect(raw).not.toContain('csrfNonce');
    }
  });

  it('BOOK-10 (Race B) serializes two Customers racing for one Slot under a barrier so at most one Booked row commits', async () => {
    const slot = await createSlot(tutorLowId);

    let cLowLockedSlot!: () => void;
    const cLowAtSlotBarrier = new Promise<void>(resolve => {
      cLowLockedSlot = resolve;
    });
    let releaseCLow!: () => void;
    const cLowHoldGate = new Promise<void>(resolve => {
      releaseCLow = resolve;
    });

    let cLowPid = 0;
    let cHighPid = 0;

    const pLow = createCustomerBooking(
      runtimePool,
      { userId: authCustomerLow.userId, sessionId: authCustomerLow.sessionId },
      slot.id,
      {
        beforeInsert: async ({ backendPid }) => {
          cLowPid = backendPid;
          cLowLockedSlot();
          await cLowHoldGate;
        },
      },
    );

    await cLowAtSlotBarrier;

    // Customer High's UUID > Tutor Low's UUID, so Customer High locks tutorLowId first!
    // Wait until Customer High's backend PID is blocked by Customer Low on tutorLowId/Slot
    const pHigh = createCustomerBooking(
      runtimePool,
      { userId: authCustomerHigh.userId, sessionId: authCustomerHigh.sessionId },
      slot.id,
      {
        onLockStep: async event => {
          if (event.phase === 'user' && event.targetId === tutorLowId && cHighPid === 0) {
            cHighPid = event.backendPid;
          }
        },
      },
    ).then(
      res => ({ ok: true as const, res }),
      (err: BookingError) => ({ ok: false as const, err }),
    );

    await expect.poll(() => cHighPid, { timeout: 5_000 }).toBeGreaterThan(0);
    const blockers = await waitForBlockedBy(cHighPid, cLowPid);
    expect(blockers).toContain(cLowPid);
    console.info(
      'BOOK10_RACE_B_EVIDENCE',
      JSON.stringify({ slotId: slot.id, winnerPid: cLowPid, waiterPid: cHighPid, blockers }),
    );

    releaseCLow();
    const [resLow, resHigh] = await Promise.all([pLow, pHigh]);
    expect(resLow.httpStatus).toBe(201);
    expect(resHigh.ok).toBe(false);
    if (!resHigh.ok) {
      expect(resHigh.err.status).toBe(409);
      expect(resHigh.err.errorCode).toBe('SLOT_UNAVAILABLE');
    }

    const finalRows = await ownerPool.query<{ id: string; customerId: string }>(
      'SELECT "id","customerId" FROM "Booking" WHERE "currentSlotId"=$1 AND "status"=\'Booked\'',
      [slot.id],
    );
    expect(finalRows.rowCount).toBe(1);
    expect(finalRows.rows[0].id).toBe(resLow.data.id);
    expect(finalRows.rows[0].customerId).toBe(authCustomerLow.userId);
  }, 15_000);

  it('BOOK-11 (Race C) serializes one Customer concurrently submitting overlapping Slots across Tutors under a barrier and under 10-attempt concurrent load', async () => {
    const startA = nextWindowStart(6);
    const slotTutorA = await createSlot(tutorLowId, startA);
    const slotTutorB = await createSlot(tutorHighId, new Date(startA.getTime() + 30 * 60_000));

    let firstAtInsert!: () => void;
    const firstReady = new Promise<void>(resolve => {
      firstAtInsert = resolve;
    });
    let releaseFirst!: () => void;
    const holdFirst = new Promise<void>(resolve => {
      releaseFirst = resolve;
    });

    let pid1 = 0;
    let pid2 = 0;

    const p1 = createCustomerBooking(
      runtimePool,
      { userId: authCustomerLow.userId, sessionId: authCustomerLow.sessionId },
      slotTutorA.id,
      {
        beforeInsert: async ({ backendPid }) => {
          pid1 = backendPid;
          firstAtInsert();
          await holdFirst;
        },
      },
    );

    await firstReady;

    const p2 = createCustomerBooking(
      runtimePool,
      { userId: authCustomerLow.userId, sessionId: authCustomerLow.sessionId },
      slotTutorB.id,
      {
        onLockStep: async event => {
          if (event.phase === 'user' && event.targetId === authCustomerLow.userId && pid2 === 0) {
            pid2 = event.backendPid;
          }
        },
      },
    ).then(
      res => ({ ok: true as const, res }),
      (err: BookingError) => ({ ok: false as const, err }),
    );

    await expect.poll(() => pid2, { timeout: 5_000 }).toBeGreaterThan(0);
    const blockers = await waitForBlockedBy(pid2, pid1);
    expect(blockers).toContain(pid1);
    console.info(
      'BOOK11_RACE_C_EVIDENCE',
      JSON.stringify({
        customerId: authCustomerLow.userId,
        slotA: slotTutorA.id,
        slotB: slotTutorB.id,
        holderPid: pid1,
        waiterPid: pid2,
        blockers,
      }),
    );

    releaseFirst();
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.httpStatus).toBe(201);
    expect(r2.ok).toBe(false);
    if (!r2.ok) {
      expect(r2.err.status).toBe(409);
      expect(r2.err.errorCode).toBe('CUSTOMER_OVERLAP');
    }

    // 10-attempt concurrent overlapping load for the same Customer across 10 distinct Tutors' overlapping Slots
    const loadStart = nextWindowStart(6);
    const overlappingSlots = [];
    for (let i = 0; i < 10; i++) {
      const tId = await createUser(`book-tload-${i}-${marker}@example.test`, 'Tutor');
      const offsetMinutes = (i % 5) * 10; // all overlap [loadStart + 40m, loadStart + 60m)
      overlappingSlots.push(
        await createSlot(tId, new Date(loadStart.getTime() + offsetMinutes * 60_000)),
      );
    }

    const loadOutcomes = await Promise.all(
      overlappingSlots.map(s =>
        postBooking(app, authCustomerHigh, { slotId: s.id }).then(r => ({
          status: r.status,
          code: r.body.error?.code ?? null,
          id: r.body.data?.id ?? null,
        })),
      ),
    );
    const createdLoad = loadOutcomes.filter(o => o.status === 201);
    expect(createdLoad).toHaveLength(1);
    const committedLoad = await ownerPool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM "Booking" WHERE "customerId"=$1 AND "status"=\'Booked\' AND "startsAt" < $3 AND $2 < "endsAt"',
      [
        authCustomerHigh.userId,
        loadStart,
        new Date(loadStart.getTime() + 120 * 60_000),
      ],
    );
    expect(committedLoad.rows[0].n).toBe(1);
  }, 20_000);

  it('BOOK-12 / BOOK-13 / BOOK-14 / BOOK-15 / BOOK-16 verifies pre-commit rollback, sequential 200 replay, in-flight duplicate 200 reconciliation, lost-response 200 replay, and retry after rollback', async () => {
    const slot = await createSlot(tutorLowId);

    // 1. BOOK-12 & BOOK-16: Force failure after INSERT / before COMMIT -> rolls back, 0 rows committed
    await expect(
      createCustomerBooking(
        runtimePool,
        { userId: authCustomerLow.userId, sessionId: authCustomerLow.sessionId },
        slot.id,
        {
          beforeCommit: async () => {
            throw new Error('Injected pre-COMMIT failure');
          },
        },
      ),
    ).rejects.toMatchObject({ status: 503, errorCode: 'SERVICE_UNAVAILABLE' });

    const afterRollback = await ownerPool.query(
      'SELECT count(*)::int AS n FROM "Booking" WHERE "currentSlotId"=$1',
      [slot.id],
    );
    expect(afterRollback.rows[0].n).toBe(0);

    // 2. BOOK-16: Retry identical POST after rollback -> creates 1 row and returns 201
    const firstCommit = await postBooking(app, authCustomerLow, { slotId: slot.id });
    expect(firstCommit.status).toBe(201);

    // 3. BOOK-13: Sequential duplicate POST by same Customer -> 200 with exact original Booking ID
    const sequentialReplay = await postBooking(app, authCustomerLow, { slotId: slot.id });
    expect(sequentialReplay.status).toBe(200);
    expect(sequentialReplay.body.data).toEqual(firstCommit.body.data);

    // 4. BOOK-15: Let COMMIT succeed on a new Slot, drop response (503 BOOKING_OUTCOME_UNKNOWN), then resubmit -> 200 with committed original ID
    const slotLostResp = await createSlot(tutorLowId);
    let committedHiddenId = '';
    await expect(
      createCustomerBooking(
        runtimePool,
        { userId: authCustomerLow.userId, sessionId: authCustomerLow.sessionId },
        slotLostResp.id,
        {
          afterCommit: async ({ bookingId }) => {
            committedHiddenId = bookingId;
            throw new BookingError(503, 'BOOKING_OUTCOME_UNKNOWN');
          },
        },
      ),
    ).rejects.toMatchObject({ status: 503, errorCode: 'BOOKING_OUTCOME_UNKNOWN' });
    expect(committedHiddenId).toBeTruthy();

    const replayAfterLost = await postBooking(app, authCustomerLow, { slotId: slotLostResp.id });
    expect(replayAfterLost.status).toBe(200);
    expect(replayAfterLost.body.data.id).toBe(committedHiddenId);

    // 5. BOOK-14: Two same-Customer/same-Slot POSTs overlap in flight under a barrier -> one 201, one 200, same Booking ID
    const slotInFlight = await createSlot(tutorLowId);
    let leaderReady!: () => void;
    const leaderGate = new Promise<void>(resolve => {
      leaderReady = resolve;
    });
    let releaseLeader!: () => void;
    const holdLeader = new Promise<void>(resolve => {
      releaseLeader = resolve;
    });
    let leaderPid = 0;
    let followerPid = 0;

    const pLeader = createCustomerBooking(
      runtimePool,
      { userId: authCustomerLow.userId, sessionId: authCustomerLow.sessionId },
      slotInFlight.id,
      {
        beforeInsert: async ({ backendPid }) => {
          leaderPid = backendPid;
          leaderReady();
          await holdLeader;
        },
      },
    );

    await leaderGate;

    const pFollower = createCustomerBooking(
      runtimePool,
      { userId: authCustomerLow.userId, sessionId: authCustomerLow.sessionId },
      slotInFlight.id,
      {
        onLockStep: async event => {
          if (event.phase === 'user' && event.targetId === authCustomerLow.userId && followerPid === 0) {
            followerPid = event.backendPid;
          }
        },
      },
    );

    await expect.poll(() => followerPid, { timeout: 5_000 }).toBeGreaterThan(0);
    await waitForBlockedBy(followerPid, leaderPid);
    releaseLeader();

    const [outLeader, outFollower] = await Promise.all([pLeader, pFollower]);
    expect(outLeader.httpStatus).toBe(201);
    expect(outFollower.httpStatus).toBe(200);
    expect(outFollower.data.id).toBe(outLeader.data.id);

    const inFlightCount = await ownerPool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM "Booking" WHERE "currentSlotId"=$1',
      [slotInFlight.id],
    );
    expect(inFlightCount.rows[0].n).toBe(1);
  }, 15_000);

  it('BOOK-17 enforces Q05 at post-wait DB T_elig when HTTP arrives before cutoff and lock wait crosses cutoff', async () => {
    const tempCustomerEmail = `book-c17-${marker}@example.test`;
    const tempCustomerId = await createUser(tempCustomerEmail, 'Customer');
    const tempCustomerAuth = await loginBundle(tempCustomerEmail, tempCustomerId);
    const tempTutor = await createUser(`book-t17-${marker}@example.test`, 'Tutor');
    const nowRes = await ownerPool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
    // Slot starts in 60m + 1.8s (eligible at arrival, ineligible after 2.1s lock wait)
    const slot = await createSlot(
      tempTutor,
      new Date(nowRes.rows[0].now.getTime() + 60 * 60_000 + 1_800),
    );
    const cutoff = new Date(slot.startsAt.getTime() - 60 * 60_000);

    const holder = await ownerPool.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT "id" FROM "Slot" WHERE "id"=$1 FOR UPDATE', [slot.id]);
      const holderPid = await getPid(holder);

      let waiterPid = 0;
      const pendingBooking = createCustomerBooking(
        runtimePool,
        { userId: tempCustomerAuth.userId, sessionId: tempCustomerAuth.sessionId },
        slot.id,
        {
          onLockStep: async event => {
            if (event.phase === 'slot' && waiterPid === 0) {
              waiterPid = event.backendPid;
            }
          },
        },
      ).then(
        res => ({ ok: true as const, res }),
        (err: BookingError) => ({ ok: false as const, err }),
      );

      await expect.poll(() => waiterPid, { timeout: 5_000 }).toBeGreaterThan(0);
      await waitForBlockedBy(waiterPid, holderPid);

      // Hold the Slot lock until DB clock crosses cutoff
      while (true) {
        const c = await ownerPool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
        if (c.rows[0].now.getTime() >= cutoff.getTime() + 150) break;
        await new Promise(resolve => setTimeout(resolve, 40));
      }

      await holder.query('COMMIT');
      const outcome = await pendingBooking;
      expect(outcome.ok).toBe(false);
      if (!outcome.ok) {
        expect(outcome.err.status).toBe(422);
        expect(outcome.err.errorCode).toBe('BOOKING_NOT_ELIGIBLE');
      }

      const persisted = await ownerPool.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM "Booking" WHERE "currentSlotId"=$1',
        [slot.id],
      );
      expect(persisted.rows[0].n).toBe(0);
    } finally {
      await holder.query('ROLLBACK').catch(() => {});
      holder.release();
    }
  }, 15_000);

  it('BOOK-18 / BOOK-23 / BOOK-24 retries 40001/40P01/lock-set changes up to 3 total attempts and returns 503 TRANSACTION_RETRY_EXHAUSTED on exhaustion', async () => {
    const slot = await createSlot(tutorLowId);

    // 1. BOOK-18: Force 40001 on attempt 0 and 40P01 on attempt 1, then succeed on attempt 2 (third attempt)
    const attemptsSeen: number[] = [];
    const recovered = await createCustomerBooking(
      runtimePool,
      { userId: authCustomerLow.userId, sessionId: authCustomerLow.sessionId },
      slot.id,
      {
        beforeInsert: async ({ attempt }) => {
          attemptsSeen.push(attempt);
          if (attempt === 0) {
            throw Object.assign(new Error('Simulated serialization failure'), { code: '40001' });
          }
          if (attempt === 1) {
            throw Object.assign(new Error('Simulated deadlock detected'), { code: '40P01' });
          }
        },
      },
    );
    expect(attemptsSeen).toEqual([0, 1, 2]);
    expect(recovered.httpStatus).toBe(201);

    // 2. BOOK-23: Force 3 retryable 40001 aborts -> 3 total attempts maximum, 503 TRANSACTION_RETRY_EXHAUSTED, 0 rows
    const slotExhaust = await createSlot(tutorLowId);
    let exhaustCount = 0;
    await expect(
      createCustomerBooking(
        runtimePool,
        { userId: authCustomerLow.userId, sessionId: authCustomerLow.sessionId },
        slotExhaust.id,
        {
          beforeInsert: async () => {
            exhaustCount++;
            throw Object.assign(new Error('Persistent 40001'), { code: '40001' });
          },
        },
      ),
    ).rejects.toMatchObject({ status: 503, errorCode: 'TRANSACTION_RETRY_EXHAUSTED' });
    expect(exhaustCount).toBe(3);
    const exhaustRows = await ownerPool.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM "Booking" WHERE "currentSlotId"=$1',
      [slotExhaust.id],
    );
    expect(exhaustRows.rows[0].n).toBe(0);

    // 3. BOOK-24: Stale unlocked discovery vs locked Slot re-read -> aborts without acquiring out-of-order lock, rediscovers on retry and succeeds
    const slotChangeTutor = await createSlot(tutorHighId);
    const lockTrace: string[] = [];
    const afterReassign = await createCustomerBooking(
      runtimePool,
      { userId: authCustomerLow.userId, sessionId: authCustomerLow.sessionId },
      slotChangeTutor.id,
      {
        overrideDiscoveredTutorId: ({ attempt, actualTutorId }) =>
          attempt === 0 ? tutorLowId : actualTutorId,
        onLockStep: async event => {
          lockTrace.push(`${event.attempt}:${event.phase}:${event.targetId}`);
        },
      },
    );
    expect(afterReassign.httpStatus).toBe(201);
    expect(lockTrace).toEqual([
      `0:user:${customerLowId}`,
      `0:user:${tutorLowId}`,
      `0:slot:${slotChangeTutor.id}`,
      `1:user:${customerLowId}`,
      `1:user:${tutorHighId}`,
      `1:slot:${slotChangeTutor.id}`,
      `1:session:${authCustomerLow.sessionId}`,
      `1:booking-replay:${slotChangeTutor.id}`,
      `1:booking-insert:${slotChangeTutor.id}`,
    ]);
  }, 15_000);

  it('BOOK-22 proves User UUID ascending -> Slot -> Session -> Booking lock order for both Customer<Tutor and Tutor<Customer UUID orderings', async () => {
    // Ordering 1: customerLowId < tutorHighId
    expect(customerLowId.localeCompare(tutorHighId)).toBeLessThan(0);
    const slot1 = await createSlot(tutorHighId);
    const events1: BookingLockEvent[] = [];
    const res1 = await createCustomerBooking(
      runtimePool,
      { userId: customerLowId, sessionId: authCustomerLow.sessionId },
      slot1.id,
      {
        onLockStep: event => {
          events1.push(event);
        },
      },
    );
    expect(res1.httpStatus).toBe(201);
    expect(events1.map(e => `${e.phase}:${e.targetId}`)).toEqual([
      `user:${customerLowId}`,
      `user:${tutorHighId}`,
      `slot:${slot1.id}`,
      `session:${authCustomerLow.sessionId}`,
      `booking-replay:${slot1.id}`,
      `booking-insert:${slot1.id}`,
    ]);

    // Ordering 2: tutorLowId < customerHighId
    expect(tutorLowId.localeCompare(customerHighId)).toBeLessThan(0);
    const slot2 = await createSlot(tutorLowId);
    const events2: BookingLockEvent[] = [];
    const res2 = await createCustomerBooking(
      runtimePool,
      { userId: customerHighId, sessionId: authCustomerHigh.sessionId },
      slot2.id,
      {
        onLockStep: event => {
          events2.push(event);
        },
      },
    );
    expect(res2.httpStatus).toBe(201);
    expect(events2.map(e => `${e.phase}:${e.targetId}`)).toEqual([
      `user:${tutorLowId}`,
      `user:${customerHighId}`,
      `slot:${slot2.id}`,
      `session:${authCustomerHigh.sessionId}`,
      `booking-replay:${slot2.id}`,
      `booking-insert:${slot2.id}`,
    ]);
  }, 15_000);

  it('BOOK-26 / BOOK-27 / BOOK-32 revalidates Session after User and Slot waits (revocation, expiry, deletion, owner mismatch, and 40001 Session retry)', async () => {
    // 1. BOOK-26: Hold Customer User row in DB session A; start Booking POST in B; while waiting on User lock, revoke Session and commit; release User lock -> 401 UNAUTHENTICATED
    const tempLogin1 = await loginBundle(authCustomerLow.email, customerLowId);
    const slot26 = await createSlot(tutorLowId);
    const holderUser = await ownerPool.connect();
    try {
      await holderUser.query('BEGIN');
      await holderUser.query('SELECT "id" FROM "User" WHERE "id"=$1 FOR UPDATE', [customerLowId]);
      const holderPid = await getPid(holderUser);

      let waiterPid = 0;
      const pending26 = createCustomerBooking(
        runtimePool,
        { userId: customerLowId, sessionId: tempLogin1.sessionId },
        slot26.id,
        {
          onLockStep: event => {
            if (event.phase === 'user' && event.targetId === customerLowId && waiterPid === 0) {
              waiterPid = event.backendPid;
            }
          },
        },
      ).then(
        res => ({ ok: true as const, res }),
        (err: BookingError) => ({ ok: false as const, err }),
      );

      await expect.poll(() => waiterPid, { timeout: 5_000 }).toBeGreaterThan(0);
      await waitForBlockedBy(waiterPid, holderPid);

      // Revoke Session while Booking is waiting on the User lock
      await ownerPool.query('UPDATE "Session" SET "revokedAt"=now() WHERE "id"=$1', [
        tempLogin1.sessionId,
      ]);
      await holderUser.query('COMMIT');

      const out26 = await pending26;
      expect(out26.ok).toBe(false);
      if (!out26.ok) {
        expect(out26.err.status).toBe(401);
        expect(out26.err.errorCode).toBe('UNAUTHENTICATED');
      }
      const rows26 = await ownerPool.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM "Booking" WHERE "currentSlotId"=$1',
        [slot26.id],
      );
      expect(rows26.rows[0].n).toBe(0);
    } finally {
      await holderUser.query('ROLLBACK').catch(() => {});
      holderUser.release();
    }

    // 2. BOOK-27 (a): Hold Slot row in DB session A; start Booking POST; verify it acquired User lock and waits on Slot; revoke Session during Slot wait -> 401 UNAUTHENTICATED
    const tempLogin2 = await loginBundle(authCustomerLow.email, customerLowId);
    const slot27a = await createSlot(tutorLowId);
    const holderSlotA = await ownerPool.connect();
    try {
      await holderSlotA.query('BEGIN');
      await holderSlotA.query('SELECT "id" FROM "Slot" WHERE "id"=$1 FOR UPDATE', [slot27a.id]);
      const holderPid = await getPid(holderSlotA);

      let waiterPid = 0;
      const pending27a = createCustomerBooking(
        runtimePool,
        { userId: customerLowId, sessionId: tempLogin2.sessionId },
        slot27a.id,
        {
          onLockStep: event => {
            if (event.phase === 'slot' && waiterPid === 0) {
              waiterPid = event.backendPid;
            }
          },
        },
      ).then(
        res => ({ ok: true as const, res }),
        (err: BookingError) => ({ ok: false as const, err }),
      );

      await expect.poll(() => waiterPid, { timeout: 5_000 }).toBeGreaterThan(0);
      await waitForBlockedBy(waiterPid, holderPid);

      await ownerPool.query('UPDATE "Session" SET "revokedAt"=now() WHERE "id"=$1', [
        tempLogin2.sessionId,
      ]);
      await holderSlotA.query('COMMIT');

      const out27a = await pending27a;
      expect(out27a.ok).toBe(false);
      if (!out27a.ok) {
        expect(out27a.err.status).toBe(401);
        expect(out27a.err.errorCode).toBe('UNAUTHENTICATED');
      }
    } finally {
      await holderSlotA.query('ROLLBACK').catch(() => {});
      holderSlotA.release();
    }

    // 3. BOOK-27 (b): Hold Slot row while Session expiresAt passes on DB clock -> 401 UNAUTHENTICATED
    const tempLogin3 = await loginBundle(authCustomerLow.email, customerLowId);
    const slot27b = await createSlot(tutorLowId);
    await ownerPool.query(
      "UPDATE \"Session\" SET \"expiresAt\" = clock_timestamp() + interval '400 milliseconds' WHERE \"id\"=$1",
      [tempLogin3.sessionId],
    );
    const holderSlotB = await ownerPool.connect();
    try {
      await holderSlotB.query('BEGIN');
      await holderSlotB.query('SELECT "id" FROM "Slot" WHERE "id"=$1 FOR UPDATE', [slot27b.id]);
      const holderPid = await getPid(holderSlotB);

      let waiterPid = 0;
      const pending27b = createCustomerBooking(
        runtimePool,
        { userId: customerLowId, sessionId: tempLogin3.sessionId },
        slot27b.id,
        {
          onLockStep: event => {
            if (event.phase === 'slot' && waiterPid === 0) {
              waiterPid = event.backendPid;
            }
          },
        },
      ).then(
        res => ({ ok: true as const, res }),
        (err: BookingError) => ({ ok: false as const, err }),
      );

      await expect.poll(() => waiterPid, { timeout: 5_000 }).toBeGreaterThan(0);
      await waitForBlockedBy(waiterPid, holderPid);
      await new Promise(resolve => setTimeout(resolve, 550));
      await holderSlotB.query('COMMIT');

      const out27b = await pending27b;
      expect(out27b.ok).toBe(false);
      if (!out27b.ok) {
        expect(out27b.err.status).toBe(401);
        expect(out27b.err.errorCode).toBe('UNAUTHENTICATED');
      }
    } finally {
      await holderSlotB.query('ROLLBACK').catch(() => {});
      holderSlotB.release();
    }

    // 4. BOOK-32: Missing Session row or owner mismatch returns 401 immediately on attempt 0 without consuming retry budget
    let missingSessionAttempts = 0;
    await expect(
      createCustomerBooking(
        runtimePool,
        { userId: customerLowId, sessionId: randomUUID() },
        slot26.id,
        {
          onLockStep: event => {
            if (event.phase === 'session') missingSessionAttempts++;
          },
        },
      ),
    ).rejects.toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
    expect(missingSessionAttempts).toBe(1);

    // Owner mismatch (Customer High's sessionId with Customer Low's userId) -> 401 immediately on attempt 0
    let mismatchAttempts = 0;
    await expect(
      createCustomerBooking(
        runtimePool,
        { userId: customerLowId, sessionId: authCustomerHigh.sessionId },
        slot26.id,
        {
          onLockStep: event => {
            if (event.phase === 'session') mismatchAttempts++;
          },
        },
      ),
    ).rejects.toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
    expect(mismatchAttempts).toBe(1);

    // Concurrent Session deletion reported as 40001 retries and then returns 401 UNAUTHENTICATED (never 503 TRANSACTION_RETRY_EXHAUSTED)
    const tempLogin4 = await loginBundle(authCustomerLow.email, customerLowId);
    const slot32 = await createSlot(tutorLowId);
    let session40001Attempts = 0;
    await expect(
      createCustomerBooking(
        runtimePool,
        { userId: customerLowId, sessionId: tempLogin4.sessionId },
        slot32.id,
        {
          onLockStep: async event => {
            if (event.phase === 'session') {
              session40001Attempts++;
              if (session40001Attempts === 1) {
                await ownerPool.query('DELETE FROM "Session" WHERE "id"=$1', [
                  tempLogin4.sessionId,
                ]);
                throw Object.assign(
                  new Error('Simulated 40001 on concurrent Session delete'),
                  { code: '40001' },
                );
              }
            }
          },
        },
      ),
    ).rejects.toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
    expect(session40001Attempts).toBe(2);
  }, 25_000);

  it('BOOK-30 / BOOK-31 enforces allowlisted 23505/23P01 reconciliation with fresh READ COMMITTED User->Session revalidation and fails closed (500) on non-allowlisted constraints', async () => {
    const slotA = await createSlot(tutorLowId);
    const committedA = await postBooking(app, authCustomerLow, { slotId: slotA.id });
    expect(committedA.status).toBe(201);
    const bookingAId = committedA.body.data.id as string;

    // Helper to exercise post-ROLLBACK reconciliation for a given allowlisted tuple
    const runReconcileCase = async (
      customerId: string,
      sessionId: string,
      targetSlotId: string,
      sqlState: '23505' | '23P01',
      constraint: string,
      mutateBeforeReconcile?: () => Promise<void>,
      lockEvents?: BookingLockEvent[],
    ) => {
      return createCustomerBooking(
        runtimePool,
        { userId: customerId, sessionId },
        targetSlotId,
        {
          onLockStep: async event => {
            lockEvents?.push(event);
            // Simulate SERIALIZABLE snapshot missing the concurrent commit and hitting the unique/exclusion constraint at INSERT
            if (event.phase === 'booking-replay') {
              throw Object.assign(new Error(`Simulated ${sqlState} / ${constraint}`), {
                code: sqlState,
                constraint,
              });
            }
          },
          beforeReconcile: async () => {
            if (mutateBeforeReconcile) await mutateBeforeReconcile();
          },
        },
      );
    };

    // 1. Live active-Customer / live-Session control for cause (a) 23505 / booking_one_active_per_slot on same-pair -> 200 with original Booking ID
    const reconcileTraceA: BookingLockEvent[] = [];
    const liveControlA = await runReconcileCase(
      customerLowId,
      authCustomerLow.sessionId,
      slotA.id,
      '23505',
      'booking_one_active_per_slot',
      undefined,
      reconcileTraceA,
    );
    expect(liveControlA.httpStatus).toBe(200);
    expect(liveControlA.data.id).toBe(bookingAId);
    // Verify User -> Session -> Booking-read order during reconciliation
    expect(
      reconcileTraceA
        .filter(e => e.phase.startsWith('reconcile-'))
        .map(e => `${e.phase}:${e.targetId}`),
    ).toEqual([
      `reconcile-user:${customerLowId}`,
      `reconcile-session:${authCustomerLow.sessionId}`,
      `reconcile-booking-read:${slotA.id}`,
    ]);

    // 2. Live active-Customer / live-Session control for cause (b) 23P01 / booked_customer_no_overlap on distinct overlapping Slot -> 409 CUSTOMER_OVERLAP
    const slotOverlapB = await createSlot(
      tutorHighId,
      new Date(slotA.startsAt.getTime() + 30 * 60_000),
    );
    await expect(
      runReconcileCase(
        customerLowId,
        authCustomerLow.sessionId,
        slotOverlapB.id,
        '23P01',
        'booked_customer_no_overlap',
      ),
    ).rejects.toMatchObject({ status: 409, errorCode: 'CUSTOMER_OVERLAP' });

    // 3. Interleaving (1..4) for both causes (a) and (b):
    const isoEmail = `book-ciso-${marker}@example.test`;
    const isoUserId = await createUser(isoEmail, 'Customer', true);
    const slotIsoA = await createSlot(tutorLowId);
    const slotIsoB = await createSlot(
      tutorHighId,
      new Date(slotIsoA.startsAt.getTime() + 30 * 60_000),
    );
    const isoAuth0 = await loginBundle(isoEmail, isoUserId);
    const isoCommit = await postBooking(app, isoAuth0, { slotId: slotIsoA.id });
    expect(isoCommit.status).toBe(201);

    for (const [sqlState, constraint, targetSlotId] of [
      ['23505', 'booking_one_active_per_slot', slotIsoA.id] as const,
      ['23P01', 'booked_customer_no_overlap', slotIsoB.id] as const,
    ]) {
      // (1) User deactivated before reconciliation -> 401 UNAUTHENTICATED, no Session/Booking read
      const traceDeact: BookingLockEvent[] = [];
      await expect(
        runReconcileCase(
          isoUserId,
          isoAuth0.sessionId,
          targetSlotId,
          sqlState,
          constraint,
          async () => {
            await ownerPool.query('UPDATE "User" SET "isActive"=false WHERE "id"=$1', [
              isoUserId,
            ]);
          },
          traceDeact,
        ),
      ).rejects.toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
      expect(traceDeact.some(e => e.phase === 'reconcile-session')).toBe(false);
      expect(traceDeact.some(e => e.phase === 'reconcile-booking-read')).toBe(false);
      await ownerPool.query('UPDATE "User" SET "isActive"=true WHERE "id"=$1', [isoUserId]);

      // (2) User role changed to Tutor before reconciliation -> 403 FORBIDDEN, no Session/Booking read
      const traceRole: BookingLockEvent[] = [];
      await expect(
        runReconcileCase(
          isoUserId,
          isoAuth0.sessionId,
          targetSlotId,
          sqlState,
          constraint,
          async () => {
            await ownerPool.query('UPDATE "User" SET "role"=\'Tutor\' WHERE "id"=$1', [
              isoUserId,
            ]);
          },
          traceRole,
        ),
      ).rejects.toMatchObject({ status: 403, errorCode: 'FORBIDDEN' });
      expect(traceRole.some(e => e.phase === 'reconcile-session')).toBe(false);
      expect(traceRole.some(e => e.phase === 'reconcile-booking-read')).toBe(false);
      await ownerPool.query('UPDATE "User" SET "role"=\'Customer\' WHERE "id"=$1', [isoUserId]);

      // (3) Exact Session revoked before reconciliation -> 401 UNAUTHENTICATED, no Booking read
      const sRevoke = await loginBundle(isoEmail, isoUserId);
      const traceRevoke: BookingLockEvent[] = [];
      await expect(
        runReconcileCase(
          isoUserId,
          sRevoke.sessionId,
          targetSlotId,
          sqlState,
          constraint,
          async () => {
            await ownerPool.query('UPDATE "Session" SET "revokedAt"=now() WHERE "id"=$1', [
              sRevoke.sessionId,
            ]);
          },
          traceRevoke,
        ),
      ).rejects.toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
      expect(traceRevoke.some(e => e.phase === 'reconcile-booking-read')).toBe(false);

      // (4) Exact Session expired before reconciliation -> 401 UNAUTHENTICATED, no Booking read
      const sExpire = await loginBundle(isoEmail, isoUserId);
      const traceExpire: BookingLockEvent[] = [];
      await expect(
        runReconcileCase(
          isoUserId,
          sExpire.sessionId,
          targetSlotId,
          sqlState,
          constraint,
          async () => {
            await ownerPool.query(
              "UPDATE \"Session\" SET \"createdAt\" = clock_timestamp() - interval '10 minutes', \"expiresAt\" = clock_timestamp() - interval '1 second' WHERE \"id\"=$1",
              [sExpire.sessionId],
            );
          },
          traceExpire,
        ),
      ).rejects.toMatchObject({ status: 401, errorCode: 'UNAUTHENTICATED' });
      expect(traceExpire.some(e => e.phase === 'reconcile-booking-read')).toBe(false);
    }

    // 4. BOOK-31 Negative controls: (c) 23505 on Booking_pkey, (d) 23P01 on unknown constraint, (e) missing constraint metadata -> 500 INTERNAL_ERROR without entering reconciliation
    for (const negErr of [
      Object.assign(new Error('PK collision'), { code: '23505', constraint: 'Booking_pkey' }),
      Object.assign(new Error('Other exclusion'), {
        code: '23P01',
        constraint: 'slot_tutor_no_overlap',
      }),
      Object.assign(new Error('Missing constraint'), { code: '23505' }),
      Object.assign(new Error('Forbidden DML'), { code: '0A000' }),
    ]) {
      const negTrace: BookingLockEvent[] = [];
      await expect(
        createCustomerBooking(
          runtimePool,
          { userId: customerLowId, sessionId: authCustomerLow.sessionId },
          slotA.id,
          {
            onLockStep: event => {
              negTrace.push(event);
              if (event.phase === 'booking-replay') throw negErr;
            },
          },
        ),
      ).rejects.toMatchObject({ status: 500, errorCode: 'INTERNAL_ERROR' });
      expect(negTrace.some(e => e.phase.startsWith('reconcile-'))).toBe(false);
    }
  }, 20_000);

  it('BOOK-19 / BDF-23 proves Option 1 canonical lock-order across all interleavings (1A, 1B, 1C, 1D) and (Part 2) comparative structural prerequisite and BOOK-25 in isolated disposable schema', async () => {
    const tempCustomerEmail = `book-c19-${marker}@example.test`;
    const tempCustomerId = await createUser(tempCustomerEmail, 'Customer');
    const tempCustomerAuth = await loginBundle(tempCustomerEmail, tempCustomerId);
    const otherCustomerId = await createUser(`book-c19-other-${marker}@example.test`, 'Customer');
    const tempTutorA = await createUser(`book-t19a-${marker}@example.test`, 'Tutor');
    const tempTutorB = await createUser(`book-t19b-${marker}@example.test`, 'Tutor');
    const tempTutor1B = await createUser(`book-t19-1b-${marker}@example.test`, 'Tutor');
    let adapterReverseBlockers1C: number[] = [];
    let rogue1CSqlState = '';
    let adapterReverseBlockers1C2: number[] = [];
    let staleCommitNotice1C2Ms = 0;

    // Part 1A (Canonical #33 Schema — Exclusion / same Customer, overlapping Slots: Rogue first, Adapter second):
    // Under the unaltered #33 schema, `booking_customer_fk` (`REFERENCES "User"("id")`) acquires `FOR KEY SHARE`
    // on the Customer `User` row during any `Booking` INSERT, and our adapter locks `User` with `FOR UPDATE`
    // (which conflicts with `FOR KEY SHARE`). Prove that an uncommitted direct-SQL `Booking` INSERT for `tempCustomerId`
    // blocks the adapter at Step 3 (`User` `FOR UPDATE`) BEFORE `booking_guard_s1()` ever samples `T_elig`!
    const nowRes1A = await ownerPool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
    const slot1A = await createSlot(
      tempTutorA,
      new Date(nowRes1A.rows[0].now.getTime() + 60 * 60_000 + 2_000),
    );
    const cutoff1A = new Date(slot1A.startsAt.getTime() - 60 * 60_000);
    const rogueSlot1A = await createSlot(
      tempTutorB,
      new Date(slot1A.startsAt.getTime() + 30 * 60_000),
    );

    const rogueClient = await ownerPool.connect();
    try {
      await rogueClient.query('BEGIN');
      await rogueClient.query(
        'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\')',
        [tempCustomerId, rogueSlot1A.id, rogueSlot1A.startsAt, rogueSlot1A.endsAt],
      );
      const roguePid = await getPid(rogueClient);

      let adapterUserPid = 0;
      const pendingAtUserLock = createCustomerBooking(
        runtimePool,
        { userId: tempCustomerId, sessionId: tempCustomerAuth.sessionId },
        slot1A.id,
        {
          onLockStep: async event => {
            if (event.phase === 'user' && event.targetId === tempCustomerId && adapterUserPid === 0) {
              adapterUserPid = event.backendPid;
            }
          },
        },
      ).then(
        res => ({ ok: true as const, res }),
        (err: BookingError) => ({ ok: false as const, err }),
      );

      await expect.poll(() => adapterUserPid, { timeout: 5_000 }).toBeGreaterThan(0);
      const userBlockers = await waitForBlockedBy(adapterUserPid, roguePid);
      expect(userBlockers).toContain(roguePid);

      // Hold the FK-induced User lock wait until DB clock crosses the 60-minute Q05 cutoff, then ROLLBACK rogueClient
      while (true) {
        const c = await ownerPool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
        if (c.rows[0].now.getTime() >= cutoff1A.getTime() + 150) break;
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      await rogueClient.query('ROLLBACK');

      const outPart1A = await pendingAtUserLock;
      expect(outPart1A.ok).toBe(false);
      if (!outPart1A.ok) {
        expect(outPart1A.err.status).toBe(422);
        expect(outPart1A.err.errorCode).toBe('BOOKING_NOT_ELIGIBLE');
      }

      // Part 1B (Canonical #33 Schema — Unique / same Slot, different Customer: Rogue first, Adapter second):
      // Under the unaltered #33 schema, any direct-SQL `Booking` INSERT for `otherCustomerId` on `slot1B`
      // invokes `booking_guard_s1()`, which acquires `FOR UPDATE` on `Slot(slot1B.id)` BEFORE checking unique/exclusion
      // indexes, and our adapter also locks `Slot(slot1B.id)` with `FOR UPDATE` at Step 4.
      // Prove that an uncommitted direct-SQL `Booking` INSERT by `otherCustomerId` on `slot1B` blocks the adapter
      // at Step 4 (`Slot` `FOR UPDATE`) BEFORE `booking_guard_s1()` ever runs for the adapter's transaction!
      const nowRes1B = await ownerPool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
      const slot1B = await createSlot(
        tempTutor1B,
        new Date(nowRes1B.rows[0].now.getTime() + 60 * 60_000 + 2_000),
      );
      const cutoff1B = new Date(slot1B.startsAt.getTime() - 60 * 60_000);

      await rogueClient.query('BEGIN');
      await rogueClient.query(
        'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\')',
        [otherCustomerId, slot1B.id, slot1B.startsAt, slot1B.endsAt],
      );

      let adapterSlotPid = 0;
      const pendingAtSlotLock = createCustomerBooking(
        runtimePool,
        { userId: tempCustomerId, sessionId: tempCustomerAuth.sessionId },
        slot1B.id,
        {
          onLockStep: async event => {
            if (event.phase === 'slot' && event.targetId === slot1B.id && adapterSlotPid === 0) {
              adapterSlotPid = event.backendPid;
            }
          },
        },
      ).then(
        res => ({ ok: true as const, res }),
        (err: BookingError) => ({ ok: false as const, err }),
      );

      await expect.poll(() => adapterSlotPid, { timeout: 5_000 }).toBeGreaterThan(0);
      const slotBlockers = await waitForBlockedBy(adapterSlotPid, roguePid);
      expect(slotBlockers).toContain(roguePid);

      // Hold the trigger/FK-induced Slot lock wait until DB clock crosses the 60-minute Q05 cutoff, then ROLLBACK rogueClient
      while (true) {
        const c = await ownerPool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
        if (c.rows[0].now.getTime() >= cutoff1B.getTime() + 150) break;
        await new Promise(resolve => setTimeout(resolve, 40));
      }
      await rogueClient.query('ROLLBACK');

      const outPart1B = await pendingAtSlotLock;
      expect(outPart1B.ok).toBe(false);
      if (!outPart1B.ok) {
        expect(outPart1B.err.status).toBe(422);
        expect(outPart1B.err.errorCode).toBe('BOOKING_NOT_ELIGIBLE');
      }

      // Part 1C (Canonical #33 Schema — Exclusion / same Customer, overlapping Slots: Adapter first, Rogue second):
      // Under the unaltered #33 schema, when Adapter locks Customer User at Step 3, direct-SQL Booking INSERT for the same
      // Customer is BLOCKED on the Customer User lock by `booking_customer_fk` (FOR KEY SHARE) BEFORE direct-SQL can place
      // an uncommitted row into the table or GiST index.
      // Therefore, direct-SQL cannot cause a post-T_elig GiST index wait on the Adapter.
      const nowRes1C = await ownerPool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
      const tempTutor1C = await createUser(`book-t19-1c-${marker}@example.test`, 'Tutor');
      const rogueTutor1C = await createUser(`book-t19-r1c-${marker}@example.test`, 'Tutor');
      const slot1C = await createSlot(
        tempTutor1C,
        new Date(nowRes1C.rows[0].now.getTime() + 60 * 60_000 + 5_000),
      );
      const rogueSlot1C = await createSlot(
        rogueTutor1C,
        new Date(slot1C.startsAt.getTime() + 15 * 60_000),
      );

      let notifyRogue1CStart!: () => void;
      const rogue1CStart = new Promise<void>(resolve => {
        notifyRogue1CStart = resolve;
      });
      let notifyAdapterCanCommit1C!: () => void;
      const adapterCanCommit1C = new Promise<void>(resolve => {
        notifyAdapterCanCommit1C = resolve;
      });

      let adapterPid1C = 0;
      const pendingAdapter1C = createCustomerBooking(
        runtimePool,
        { userId: tempCustomerId, sessionId: tempCustomerAuth.sessionId },
        slot1C.id,
        {
          beforeInsert: async ({ backendPid }) => {
            adapterPid1C = backendPid;
            notifyRogue1CStart();
            await adapterCanCommit1C;
          },
        },
      ).catch(err => {
        notifyRogue1CStart();
        throw err;
      });

      await rogue1CStart;
      expect(adapterPid1C).toBeGreaterThan(0);

      await rogueClient.query('BEGIN');
      const rogue1CPromise = rogueClient.query(
        'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\')',
        [tempCustomerId, rogueSlot1C.id, rogueSlot1C.startsAt, rogueSlot1C.endsAt],
      ).then(
        () => ({ ok: true as const }),
        (err: PgErrorLike) => ({ ok: false as const, err }),
      );

      const rogueBlockers1C = await waitForBlockedBy(roguePid, adapterPid1C);
      expect(rogueBlockers1C).toContain(adapterPid1C);

      notifyAdapterCanCommit1C();

      // Observe the reverse wait: Adapter's INSERT executes `booking_guard_s1()`, samples T_elig,
      // and then attempts to insert into `booked_customer_no_overlap` GiST index.
      // Because foreign key checks are AFTER ROW triggers, Rogue's uncommitted tuple is already in GiST,
      // causing Adapter to block on Rogue (`pg_blocking_pids(adapterPid1C)` contains `roguePid`)!
      adapterReverseBlockers1C = [];
      const deadlineReverse = Date.now() + 2_500;
      while (Date.now() < deadlineReverse) {
        const obs = await ownerPool.query<{ blockers: number[] }>(
          'SELECT pg_blocking_pids($1) AS blockers',
          [adapterPid1C],
        );
        if (obs.rows[0]?.blockers?.includes(roguePid)) {
          adapterReverseBlockers1C = obs.rows[0].blockers;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(adapterReverseBlockers1C).toContain(roguePid);

      const adapterRes1C = await pendingAdapter1C;
      expect(adapterRes1C.httpStatus).toBe(201);

      const rogue1COutcome = await rogue1CPromise;
      expect(rogue1COutcome.ok).toBe(false);
      rogue1CSqlState = !rogue1COutcome.ok ? (rogue1COutcome.err.code ?? 'UNKNOWN') : 'OK';
      expect(['23P01', '40P01']).toContain(rogue1CSqlState);
      await rogueClient.query('ROLLBACK');

      // Part 1C2 (Canonical #33 Schema — Reviewer specific Stop Gate check: Rogue cancels/rolls back before deadlock detection while holding past Q05):
      // On the canonical unaltered #33 schema, when Rogue is canceled/rolled back before PostgreSQL's deadlock detector fires,
      // after holding until remaining notice < 60m, Adapter's blocked INSERT unblocks from the GiST index and commits 201 Created
      // with a stale T_elig sampled prior to the GiST index wait.
      // This empirically disproves Option 1 on the canonical #33 schema and triggers the transaction-spec §5 Stop Gate.
      const tempCustomerEmail1C2 = `book-c19-1c2-${marker}@example.test`;
      const tempCustomer1C2 = await createUser(tempCustomerEmail1C2, 'Customer');
      const tempCustomerAuth1C2 = await loginBundle(tempCustomerEmail1C2, tempCustomer1C2);
      const tempTutor1C2 = await createUser(`book-t19-1c2-${marker}@example.test`, 'Tutor');
      const rogueTutor1C2 = await createUser(`book-t19-r1c2-${marker}@example.test`, 'Tutor');
      const nowRes1C2 = await ownerPool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
      const slot1C2 = await createSlot(
        tempTutor1C2,
        new Date(nowRes1C2.rows[0].now.getTime() + 60 * 60_000 + 700),
      );
      const rogueSlot1C2 = await createSlot(
        rogueTutor1C2,
        new Date(slot1C2.startsAt.getTime() + 15 * 60_000),
      );

      let notifyRogue1C2Start!: () => void;
      const rogue1C2Start = new Promise<void>(resolve => {
        notifyRogue1C2Start = resolve;
      });
      let notifyAdapterCanCommit1C2!: () => void;
      const adapterCanCommit1C2 = new Promise<void>(resolve => {
        notifyAdapterCanCommit1C2 = resolve;
      });

      let adapterPid1C2 = 0;
      const pendingAdapter1C2 = createCustomerBooking(
        runtimePool,
        { userId: tempCustomer1C2, sessionId: tempCustomerAuth1C2.sessionId },
        slot1C2.id,
        {
          beforeInsert: async ({ backendPid }) => {
            adapterPid1C2 = backendPid;
            notifyRogue1C2Start();
            await adapterCanCommit1C2;
          },
        },
      ).catch(err => {
        notifyRogue1C2Start();
        throw err;
      });

      await rogue1C2Start;
      expect(adapterPid1C2).toBeGreaterThan(0);

      await rogueClient.query('BEGIN');
      const rogue1C2Promise = rogueClient.query(
        'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\')',
        [tempCustomer1C2, rogueSlot1C2.id, rogueSlot1C2.startsAt, rogueSlot1C2.endsAt],
      ).then(
        () => ({ ok: true as const }),
        (err: PgErrorLike) => ({ ok: false as const, err }),
      );

      const rogueBlockers1C2 = await waitForBlockedBy(roguePid, adapterPid1C2);
      expect(rogueBlockers1C2).toContain(adapterPid1C2);

      notifyAdapterCanCommit1C2();

      adapterReverseBlockers1C2 = [];
      const deadlineReverse1C2 = Date.now() + 2_500;
      while (Date.now() < deadlineReverse1C2) {
        const obs = await ownerPool.query<{ blockers: number[] }>(
          'SELECT pg_blocking_pids($1) AS blockers',
          [adapterPid1C2],
        );
        if (obs.rows[0]?.blockers?.includes(roguePid)) {
          adapterReverseBlockers1C2 = obs.rows[0].blockers;
          break;
        }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      expect(adapterReverseBlockers1C2).toContain(roguePid);

      // Hold until time ticks past 60m cutoff (e.g. 800ms)
      await new Promise(resolve => setTimeout(resolve, 800));

      // Cancel Rogue query before deadlock detector fires
      await ownerPool.query('SELECT pg_cancel_backend($1)', [roguePid]);
      await rogue1C2Promise;
      await rogueClient.query('ROLLBACK');

      const adapterRes1C2 = await pendingAdapter1C2;
      expect(adapterRes1C2.httpStatus).toBe(201);
      staleCommitNotice1C2Ms = slot1C2.startsAt.getTime() - Date.now();
      expect(staleCommitNotice1C2Ms).toBeLessThan(60 * 60_000);

      // Part 1D (Canonical #33 Schema — Unique / same Slot, different Customer: Adapter first, Rogue second):
      // Under the unaltered #33 schema, when Adapter locks Slot at Step 4, direct-SQL Booking INSERT for a different
      // Customer on the same Slot invokes `booking_guard_s1()`, which attempts `SELECT ... FROM "Slot" FOR UPDATE`.
      // The direct-SQL writer is BLOCKED inside `booking_guard_s1()` on the Slot row lock held by Adapter BEFORE direct-SQL
      // can place an uncommitted row into the table or unique index.
      // Therefore, direct-SQL cannot cause a post-T_elig unique index wait on the Adapter.
      const tempTutor1D = await createUser(`book-t19-1d-${marker}@example.test`, 'Tutor');
      const slot1D = await createSlot(
        tempTutor1D,
        new Date(slot1C.endsAt.getTime() + 30 * 60_000),
      );

      let notifyRogue1DStart!: () => void;
      const rogue1DStart = new Promise<void>(resolve => {
        notifyRogue1DStart = resolve;
      });
      let notifyAdapterCanCommit1D!: () => void;
      const adapterCanCommit1D = new Promise<void>(resolve => {
        notifyAdapterCanCommit1D = resolve;
      });

      let adapterPid1D = 0;
      const pendingAdapter1D = createCustomerBooking(
        runtimePool,
        { userId: tempCustomerId, sessionId: tempCustomerAuth.sessionId },
        slot1D.id,
        {
          beforeInsert: async ({ backendPid }) => {
            adapterPid1D = backendPid;
            notifyRogue1DStart();
            await adapterCanCommit1D;
          },
        },
      ).catch(err => {
        notifyRogue1DStart();
        throw err;
      });

      await rogue1DStart;
      expect(adapterPid1D).toBeGreaterThan(0);

      await rogueClient.query('BEGIN');
      const rogue1DPromise = rogueClient.query(
        'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\')',
        [otherCustomerId, slot1D.id, slot1D.startsAt, slot1D.endsAt],
      ).then(
        () => ({ ok: true as const }),
        (err: PgErrorLike) => ({ ok: false as const, err }),
      );

      const rogueBlockers1D = await waitForBlockedBy(roguePid, adapterPid1D);
      expect(rogueBlockers1D).toContain(adapterPid1D);

      notifyAdapterCanCommit1D();
      const adapterRes1D = await pendingAdapter1D;
      expect(adapterRes1D.httpStatus).toBe(201);

      const rogue1DOutcome = await rogue1DPromise;
      expect(rogue1DOutcome.ok).toBe(false);
      if (!rogue1DOutcome.ok) {
        expect(['P0B01', '23505']).toContain(rogue1DOutcome.err.code);
      }
      await rogueClient.query('ROLLBACK');

      const canonicalCommitted = await ownerPool.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM "Booking" WHERE "currentSlotId" = ANY($1::uuid[])',
        [[slot1A.id, slot1B.id, rogueSlot1A.id, slot1C.id, slot1D.id, rogueSlot1C.id]],
      );
      // Exactly the two adapter-committed bookings (slot1C and slot1D) succeed; no rogue bookings commit
      expect(canonicalCommitted.rows[0].n).toBe(2);

      // Part 2 (Isolated Disposable-Schema Modified-Schema Stress Contrast & BOOK-25):
      // 1. Prove BOOK-25 end-to-end against a real Withdrawn Slot row inside the isolated disposable schema
      //    (where `booking_guard_s1()` itself raises `P0B01 / booking_slot_not_offered` -> 409 without touching shared tables).
      // 2. Demonstrate the comparative structural prerequisite: when `booking_customer_fk` is dropped in the isolated
      //    schema, rogue direct-SQL is NOT blocked at User lock (contrasting with Part 1C), allowing rogue to enter
      //    the GiST index and force a post-`T_elig` index wait on Adapter. This confirms that `booking_customer_fk`
      //    is the exact structural constraint that guarantees Option 1 in the canonical schema!
      const stressSchema = `nuttiew_bdf23_stress_${randomUUID().replaceAll('-', '').slice(0, 8)}`;
      await ownerPool.query(`CREATE SCHEMA "${stressSchema}"`);
      const stressPool = new Pool({
        connectionString: process.env.DATABASE_URL!,
        max: 6,
        options: `-c search_path=${stressSchema},public`,
      });
      try {
        const migrationsDir = existsSync(join(process.cwd(), 'prisma', 'migrations'))
          ? join(process.cwd(), 'prisma', 'migrations')
          : join(process.cwd(), 'apps', 'api', 'prisma', 'migrations');
        const migrationFiles = [
          join(migrationsDir, '20261104000000_auth', 'migration.sql'),
          join(migrationsDir, '20261105000000_tutor_slots', 'migration.sql'),
          join(migrationsDir, '20261107000000_booking_foundation', 'migration.sql'),
        ];
        for (const file of migrationFiles) {
          const rawSql = readFileSync(file, 'utf8')
            .replace(/CREATE EXTENSION IF NOT EXISTS\s+\w+\s*;/gi, '')
            .replace(
              'SET search_path = pg_catalog, public',
              `SET search_path = pg_catalog, "${stressSchema}", public`,
            )
            .replaceAll('public.booking_guard_s1()', `"${stressSchema}".booking_guard_s1()`)
            .replaceAll('public."Slot"', `"${stressSchema}"."Slot"`);
          await stressPool.query(rawSql);
        }

        // Seed isolated Customer, Session, two Tutors, and two overlapping Slots in the dedicated stress schema
        const stressCustomerId = randomUUID();
        const stressSessionId = randomUUID();
        const stressTutorC = randomUUID();
        const stressTutorD = randomUUID();
        await stressPool.query(
          'INSERT INTO "User"("id","email","passwordHash","role","isActive") VALUES ($1,$2,\'h\',\'Customer\',true),($3,$4,\'h\',\'Tutor\',true),($5,$6,\'h\',\'Tutor\',true)',
          [
            stressCustomerId,
            'stress-c@example.test',
            stressTutorC,
            'stress-tc@example.test',
            stressTutorD,
            'stress-td@example.test',
          ],
        );
        await stressPool.query(
          "INSERT INTO \"Session\"(\"id\",\"userId\",\"tokenDigest\",\"csrfNonce\",\"expiresAt\") VALUES ($1,$2,decode(repeat('aa',32),'hex'),decode(repeat('bb',32),'hex'),clock_timestamp() + interval '8 hours')",
          [stressSessionId, stressCustomerId],
        );

        const nowStress = await stressPool.query<{ now: Date }>('SELECT clock_timestamp() AS now');
        const slot2Start = new Date(nowStress.rows[0].now.getTime() + 60 * 60_000 + 2_000);
        const slot2End = new Date(slot2Start.getTime() + 3_600_000);
        const rogue2Start = new Date(slot2Start.getTime() + 30 * 60_000);
        const rogue2End = new Date(rogue2Start.getTime() + 3_600_000);

        const s2Res = await stressPool.query<{ id: string }>(
          'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES ($1,$2,$3,\'Offered\') RETURNING "id"',
          [stressTutorC, slot2Start, slot2End],
        );
        const r2Res = await stressPool.query<{ id: string }>(
          'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES ($1,$2,$3,\'Offered\') RETURNING "id"',
          [stressTutorD, rogue2Start, rogue2End],
        );
        const slot2Id = s2Res.rows[0].id;
        const rogueSlot2Id = r2Res.rows[0].id;

        // Also prove BOOK-25 end-to-end against a real Withdrawn Slot row inside the isolated disposable schema
        // (so `booking_guard_s1()` itself raises `P0B01 / booking_slot_not_offered` without touching shared `public` tables):
        await stressPool.query(`DROP TRIGGER slot_s1_insert_guard ON "${stressSchema}"."Slot"`);
        const withdrawnStart = new Date(slot2Start.getTime() + 180 * 60_000);
        const withdrawnEnd = new Date(withdrawnStart.getTime() + 3_600_000);
        const wRes = await stressPool.query<{ id: string }>(
          'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle","withdrawnAt") VALUES ($1,$2,$3,\'Withdrawn\',clock_timestamp()) RETURNING "id"',
          [stressTutorC, withdrawnStart, withdrawnEnd],
        );
        await expect(
          createCustomerBooking(
            stressPool,
            { userId: stressCustomerId, sessionId: stressSessionId },
            wRes.rows[0].id,
          ),
        ).rejects.toMatchObject({ status: 409, errorCode: 'SLOT_UNAVAILABLE' });

        // Drop booking_customer_fk ONLY inside the isolated disposable stress schema
        // to demonstrate the comparative structural prerequisite: without booking_customer_fk,
        // rogue direct-SQL is NOT blocked at User lock (unlike Part 1C), allowing rogue to enter GiST index
        // and force an unexpected index wait on Adapter after BEFORE INSERT trigger.
        await stressPool.query(`ALTER TABLE "${stressSchema}"."Booking" DROP CONSTRAINT booking_customer_fk`);

        const stressRogueClient = await stressPool.connect();
        try {
          const stressRoguePid = await getPid(stressRogueClient);
          let adapterInsertPid = 0;
          let notifyRogueReady!: () => void;
          const rogueReady = new Promise<void>(resolve => {
            notifyRogueReady = resolve;
          });

          const pendingAdapter2 = createCustomerBooking(
            stressPool,
            { userId: stressCustomerId, sessionId: stressSessionId },
            slot2Id,
            {
              beforeInsert: async ({ attempt, backendPid }) => {
                if (attempt === 0) {
                  adapterInsertPid = backendPid;
                  await stressRogueClient.query('BEGIN');
                  await stressRogueClient.query(
                    'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,\'Booked\')',
                    [stressCustomerId, rogueSlot2Id, rogue2Start, rogue2End],
                  );
                  notifyRogueReady();
                }
              },
            },
          ).then(
            res => ({ ok: true as const, res }),
            (err: BookingError) => ({ ok: false as const, err }),
          );

          await rogueReady;
          // Wait until adapterInsertPid is blocked on `booked_customer_no_overlap` GiST index by stressRoguePid
          const deadline = Date.now() + 7_500;
          let indexBlockers: number[] = [];
          while (Date.now() < deadline) {
            const obs = await stressPool.query<{ blockers: number[] }>(
              'SELECT pg_blocking_pids($1) AS blockers',
              [adapterInsertPid],
            );
            if (obs.rows[0]?.blockers?.includes(stressRoguePid)) {
              indexBlockers = obs.rows[0].blockers;
              break;
            }
            await new Promise(resolve => setTimeout(resolve, 25));
          }
          expect(indexBlockers).toContain(stressRoguePid);

          // Once the structural GiST index wait is proven, rollback stressRogueClient so Adapter unblocks and completes
          await stressRogueClient.query('ROLLBACK');

          const outcome = await pendingAdapter2;
          console.info(
            'BDF23_BOOK19_EVIDENCE',
            JSON.stringify({
              canonicalPart1A: { slotId: slot1A.id, roguePid, adapterUserPid, userBlockers, outcome: 'BOOKING_NOT_ELIGIBLE' },
              canonicalPart1B: { slotId: slot1B.id, roguePid, adapterSlotPid, slotBlockers, outcome: 'BOOKING_NOT_ELIGIBLE' },
              canonicalPart1C: { slotId: slot1C.id, roguePid, adapterPid1C, rogueBlockers1C, adapterReverseBlockers: adapterReverseBlockers1C, outcome: rogue1CSqlState },
              canonicalPart1CStaleCommit: { slotId: slot1C2.id, roguePid, adapterPid: adapterPid1C2, adapterReverseBlockers: adapterReverseBlockers1C2, staleCommitNoticeMs: staleCommitNotice1C2Ms, outcome: adapterRes1C2.httpStatus },
              canonicalPart1D: { slotId: slot1D.id, roguePid, adapterPid1D, rogueBlockers1D, outcome: rogue1DOutcome.ok ? 'UNEXPECTED' : rogue1DOutcome.err.code },
              isolatedStressPart2: {
                stressSchema,
                slotId: slot2Id,
                stressRoguePid,
                adapterInsertPid,
                indexBlockers,
                outcome: outcome.ok ? outcome.res.httpStatus : outcome.err.errorCode,
              },
            }),
          );

          expect(outcome.ok).toBe(true);
          if (outcome.ok) {
            expect(outcome.res.httpStatus).toBe(201);
          }

          const finalStressCount = await stressPool.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM "Booking"',
          );
          expect(finalStressCount.rows[0].n).toBe(1);
        } finally {
          await stressRogueClient.query('ROLLBACK').catch(() => {});
          stressRogueClient.release();
        }
      } finally {
        await stressPool.end();
        await ownerPool.query(`DROP SCHEMA IF EXISTS "${stressSchema}" CASCADE`).catch(() => {});
      }
    } finally {
      await rogueClient.query('ROLLBACK').catch(() => {});
      rogueClient.release();
    }
  }, 35_000);
});
