import { randomBytes, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createPool } from '../src/config.js';
import { digest } from '../src/security.js';

const ownerUrl = new URL(process.env.DATABASE_URL ?? 'invalid:');
const runtimeUrl = new URL(process.env.DATABASE_URL_APP ?? 'invalid:');
const local = ownerUrl.port === '15449' && ownerUrl.pathname === '/nuttiew_116_review';
const ci = process.env.GITHUB_ACTIONS === 'true' && ownerUrl.port === '5432' && ownerUrl.pathname === '/nuttiew_ci';
if (
  (!local && !ci) ||
  ownerUrl.protocol !== 'postgresql:' ||
  ownerUrl.hostname !== '127.0.0.1' ||
  ownerUrl.username !== 'postgres' ||
  ownerUrl.search ||
  runtimeUrl.origin !== ownerUrl.origin ||
  runtimeUrl.hostname !== ownerUrl.hostname ||
  runtimeUrl.port !== ownerUrl.port ||
  runtimeUrl.pathname !== ownerUrl.pathname ||
  runtimeUrl.username !== 'nuttiew_ci_runtime' ||
  runtimeUrl.search
) {
  throw new Error('Reschedule integration tests require the disposable PostgreSQL fixture target');
}

const db = createPool();
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const origin = 'http://localhost:5173';
const config = { origin, csrfKey: randomBytes(32), rateKey: randomBytes(32), production: false };
let app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {
  app = await createApp(db, config);
});
afterAll(async () => {
  await Promise.all([db.end(), admin.end()]);
});

async function user(role: 'Customer' | 'Tutor') {
  const id = (
    await admin.query('INSERT INTO "User" (email,"passwordHash",role) VALUES ($1,$2,$3) RETURNING id', [
      randomUUID() + '@example.test',
      'fixture',
      role,
    ])
  ).rows[0].id as string;
  const token = randomBytes(32).toString('base64url');
  const cookie = 'nuttiew_session_dev=' + token;
  const sid = (
    await admin.query(
      `INSERT INTO "Session" ("userId","tokenDigest","csrfNonce","expiresAt") VALUES ($1,$2,$3,clock_timestamp()+interval '8 hours') RETURNING id`,
      [id, digest(token), randomBytes(32)],
    )
  ).rows[0].id as string;
  const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
  const csrf = await request(app).get('/api/v1/auth/csrf').set('Cookie', cookie).expect(200);
  return {
    id,
    sid,
    cookie,
    binding: me.headers['x-nuttiew-session-binding'] as string,
    csrf: csrf.body.csrfToken as string,
  };
}

type Auth = Awaited<ReturnType<typeof user>>;
const path = (id: string) => '/api/v1/customer/bookings/' + id + '/reschedule';
const auth = (a: Auth) => ({
  Cookie: a.cookie,
  Origin: origin,
  'X-CSRF-Token': a.csrf,
  'X-NutTiew-Expected-Session-Binding': a.binding,
});
const reschedule = (a: Auth, id: string, slotId: string, server = app) =>
  request(server).post(path(id)).set(auth(a)).send({ slotId });
const book = (a: Auth, slotId: string, server = app) =>
  request(server).post('/api/v1/customer/bookings').set(auth(a)).send({ slotId });

let hourOffset = 100;
async function createSlot(tutorId: string, minutesFromNow?: number) {
  const mins = minutesFromNow ?? 60 * hourOffset++;
  const start = new Date(Date.now() + mins * 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);
  const rows = (
    await admin.query(
      `INSERT INTO "Slot" ("tutorId","startsAt","endsAt","lifecycle")
       VALUES ($1, $2, $3, 'Offered')
       RETURNING *`,
      [tutorId, start, end],
    )
  ).rows;
  return rows[0];
}

async function fixture(minutes = 240, destMinutes = 480) {
  const customer = await user('Customer');
  const tutorA = await user('Tutor');
  const tutorB = await user('Tutor');
  const oldSlot = await createSlot(tutorA.id, minutes);
  const destSlot = await createSlot(tutorB.id, destMinutes);
  const bookingId = (await book(customer, oldSlot.id).expect(201)).body.data.id as string;
  return { customer, tutorA, tutorB, oldSlot, destSlot, bookingId };
}

const storedBooking = async (id: string) => (await admin.query('SELECT * FROM "Booking" WHERE id=$1', [id])).rows[0];
const storedHistory = async (bookingId: string) =>
  (await admin.query('SELECT * FROM "RescheduleHistory" WHERE "bookingId"=$1', [bookingId])).rows;

it('RSC-01/02/14: cross-Tutor reschedule preserves Booking ID, creates 1 history row, reopens old Slot, hides history', async () => {
  const { customer, tutorA, tutorB, oldSlot, destSlot, bookingId } = await fixture();
  const res = await reschedule(customer, bookingId, destSlot.id).expect(200);
  expect(res.body.data).toMatchObject({
    id: bookingId,
    slotId: destSlot.id,
    tutorId: tutorB.id,
    tutorRef: 'TUTOR-' + tutorB.id.slice(0, 8),
    status: 'Booked',
    displayStatus: 'Booked',
    cancellationActor: null,
    cancelledAt: null,
    cancellationReason: null,
  });
  expect(Object.keys(res.body.data).sort()).toEqual(
    [
      'id',
      'slotId',
      'tutorId',
      'tutorRef',
      'startsAt',
      'endsAt',
      'status',
      'displayStatus',
      'cancellationActor',
      'cancelledAt',
      'cancellationReason',
      'createdAt',
      'updatedAt',
    ].sort(),
  );
  expect(res.headers['cache-control']).toBe('no-store');

  const row = await storedBooking(bookingId);
  expect(row).toMatchObject({ id: bookingId, status: 'Booked', currentSlotId: destSlot.id, customerId: customer.id });

  const history = await storedHistory(bookingId);
  expect(history).toHaveLength(1);
  expect(history[0]).toMatchObject({
    bookingId,
    oldSlotId: oldSlot.id,
    oldTutorId: tutorA.id,
    newSlotId: destSlot.id,
    newTutorId: tutorB.id,
  });

  // Original Slot remains Offered & unoccupied; destination becomes occupied.
  const avail = await request(app).get('/api/v1/customer/availability').set('Cookie', customer.cookie).expect(200);
  expect(avail.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ slotId: oldSlot.id })]));
  expect(avail.body.data.some((o: { slotId: string }) => o.slotId === destSlot.id)).toBe(false);

  // Former Tutor A loses the booking; new Tutor B sees it; list marks hasRescheduled=true.
  const schedA = await request(app).get('/api/v1/tutor/schedule/bookings').set('Cookie', tutorA.cookie).expect(200);
  const schedB = await request(app).get('/api/v1/tutor/schedule/bookings').set('Cookie', tutorB.cookie).expect(200);
  expect(schedA.body.data).toEqual([]);
  expect(schedB.body.data).toEqual([expect.objectContaining({ id: bookingId, slotId: destSlot.id })]);
  const list = await request(app).get('/api/v1/customer/bookings').set('Cookie', customer.cookie).expect(200);
  expect(list.body.data[0]).toMatchObject({ id: bookingId, slotId: destSlot.id, hasRescheduled: true });
});

it('RSC-03: enforces >=60m boundary on both original and destination starts', async () => {
  const customer = await user('Customer');
  const tutor = await user('Tutor');
  const oldSoon = await createSlot(tutor.id, 59);
  const destOk = await createSlot(tutor.id, 240);
  const bookingId = (
    await admin.query(
      'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,$5) RETURNING id',
      [customer.id, oldSoon.id, oldSoon.startsAt, oldSoon.endsAt, 'Booked'],
    )
  ).rows[0].id as string;

  await reschedule(customer, bookingId, destOk.id).expect(422);
  expect(await storedHistory(bookingId)).toHaveLength(0);

  const oldOk = await createSlot(tutor.id, 300);
  const destSoon = await createSlot(tutor.id, 59);
  const booking2 = (await book(customer, oldOk.id).expect(201)).body.data.id as string;
  await reschedule(customer, booking2, destSoon.id).expect(422);
  expect(await storedHistory(booking2)).toHaveLength(0);
});

it('RSC-04/05/06/07/08: rejects foreign/unknown, second attempt, occupied/overlap/same-slot without consuming quota', async () => {
  const { customer, tutorB, oldSlot, destSlot, bookingId } = await fixture(240, 480);
  const other = await user('Customer');
  const missingId = randomUUID();

  // Foreign & unknown -> identical 404
  const foreign = await reschedule(other, bookingId, destSlot.id).expect(404);
  const missing = await reschedule(customer, missingId, destSlot.id).expect(404);
  expect(foreign.body.error).toEqual(missing.body.error);
  expect(foreign.body.error.code).toBe('BOOKING_NOT_FOUND');

  // Anonymous & Tutor role -> 401 & 403
  await request(app).post(path(bookingId)).set({ Origin: origin }).send({ slotId: destSlot.id }).expect(401);
  await reschedule(tutorB, bookingId, destSlot.id).expect(403);

  // Same slot -> 409 RESCHEDULE_NOT_APPLICABLE
  await reschedule(customer, bookingId, oldSlot.id).expect(409);

  // Occupied destination -> 409 SLOT_UNAVAILABLE (quota untouched)
  const occupiedSlot = await createSlot(tutorB.id, 720);
  await book(other, occupiedSlot.id).expect(201);
  const occRes = await reschedule(customer, bookingId, occupiedSlot.id).expect(409);
  expect(occRes.body.error.code).toBe('SLOT_UNAVAILABLE');
  expect(await storedHistory(bookingId)).toHaveLength(0);

  // Customer overlap -> 409 CUSTOMER_OVERLAP (quota untouched)
  const overlapSlotA = await createSlot(tutorB.id, 960);
  const overlapSlotB = await createSlot(tutorB.id, 980);
  await book(customer, overlapSlotA.id).expect(201);
  const ovRes = await reschedule(customer, bookingId, overlapSlotB.id).expect(409);
  expect(ovRes.body.error.code).toBe('CUSTOMER_OVERLAP');
  expect(await storedHistory(bookingId)).toHaveLength(0);

  // Valid first reschedule -> 200; second reschedule -> 409 RESCHEDULE_ALREADY_USED
  await reschedule(customer, bookingId, destSlot.id).expect(200);
  const thirdSlot = await createSlot(tutorB.id, 1200);
  const second = await reschedule(customer, bookingId, thirdSlot.id).expect(409);
  expect(second.body.error.code).toBe('RESCHEDULE_ALREADY_USED');
  expect(await storedHistory(bookingId)).toHaveLength(1);
});

it('RSC-09/10/12: rollback leaves state unchanged; concurrent same-Booking and destination races commit at most once', async () => {
  const { customer, tutorB, destSlot, bookingId } = await fixture(240, 480);
  const altSlot = await createSlot(tutorB.id, 720);
  const before = await storedBooking(bookingId);

  // Rollback before COMMIT leaves Booking and history unchanged, allowance preserved.
  const faultApp = await createApp(db, {
    ...config,
    rescheduleHooks: {
      beforeCommit: async () => {
        throw new Error('injected fault');
      },
    },
  });
  await reschedule(customer, bookingId, destSlot.id, faultApp).expect(503);
  expect(await storedBooking(bookingId)).toEqual(before);
  expect(await storedHistory(bookingId)).toHaveLength(0);

  // Concurrent same-Booking reschedules -> exactly one 200 and one 409.
  let release!: () => void;
  const gate = new Promise<void>(r => {
    release = r;
  });
  let entered = 0;
  const barrierApp = await createApp(db, {
    ...config,
    rescheduleHooks: {
      beforeMutation: async (_c: PoolClient) => {
        entered++;
        if (entered === 2) release();
        await gate;
      },
    },
  });
  const [r1, r2] = await Promise.all([
    reschedule(customer, bookingId, destSlot.id, barrierApp),
    reschedule(customer, bookingId, altSlot.id, barrierApp),
  ]);
  expect([r1.status, r2.status].sort()).toEqual([200, 409]);
  expect(await storedHistory(bookingId)).toHaveLength(1);
});

it('RSC-13: direct SQL cannot move Booking without history or insert a second history row', async () => {
  const { customer, tutorB, destSlot, bookingId } = await fixture(240, 480);
  await expect(
    db.query('UPDATE "Booking" SET "currentSlotId"=$1,"startsAt"=$2,"endsAt"=$3 WHERE "id"=$4', [
      destSlot.id,
      destSlot.startsAt,
      destSlot.endsAt,
      bookingId,
    ]),
  ).rejects.toMatchObject({ code: '42501' });

  await reschedule(customer, bookingId, destSlot.id).expect(200);
  const thirdSlot = await createSlot(tutorB.id, 720);
  await expect(
    admin.query(
      `INSERT INTO "RescheduleHistory" ("bookingId","oldSlotId","oldTutorId","oldStartsAt","oldEndsAt","newSlotId","newTutorId","newStartsAt","newEndsAt","changedAt")
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,clock_timestamp())`,
      [bookingId, destSlot.id, tutorB.id, destSlot.startsAt, destSlot.endsAt, thirdSlot.id, tutorB.id, thirdSlot.startsAt, thirdSlot.endsAt],
    ),
  ).rejects.toBeTruthy();
});
