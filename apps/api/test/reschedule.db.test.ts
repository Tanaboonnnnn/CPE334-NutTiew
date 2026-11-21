import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
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
const storedSlot = async (id: string) => (await admin.query('SELECT * FROM "Slot" WHERE id=$1', [id])).rows[0];
const storedHistory = async (bookingId: string) =>
  (await admin.query('SELECT * FROM "RescheduleHistory" WHERE "bookingId"=$1', [bookingId])).rows;
const storedNotifications = async (bookingId: string) =>
  (await admin.query('SELECT * FROM "Notification" WHERE "bookingId"=$1', [bookingId])).rows;
const activeOnSlot = async (slotId: string) =>
  (await admin.query(`SELECT id FROM "Booking" WHERE "currentSlotId"=$1 AND status='Booked'`, [slotId])).rows;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(r => {
    resolve = r;
  });
  return { promise, resolve };
}

const pid = async (c: PoolClient) => (await c.query<{ p: number }>('SELECT pg_backend_pid() AS p')).rows[0].p;
async function blocked(waiterPid: number, holderPid: number) {
  for (let i = 0; i < 80; i++) {
    const { rows } = await admin.query<{ ok: boolean }>(
      'SELECT $2::int = ANY(pg_blocking_pids($1::int)) AS ok',
      [waiterPid, holderPid],
    );
    if (rows[0]?.ok) return;
    await new Promise(r => setTimeout(r, 25));
  }
  throw new Error(`Waiter ${waiterPid} did not block on holder ${holderPid}`);
}

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
  const schedA = await request(app).get('/api/v1/tutor/bookings').set('Cookie', tutorA.cookie).expect(200);
  const schedB = await request(app).get('/api/v1/tutor/bookings').set('Cookie', tutorB.cookie).expect(200);
  expect(schedA.body.data).toEqual([]);
  expect(schedB.body.data).toEqual([expect.objectContaining({ id: bookingId, slotId: destSlot.id })]);
  const list = await request(app).get('/api/v1/customer/bookings').set('Cookie', customer.cookie).expect(200);
  expect(list.body.data[0]).toMatchObject({ id: bookingId, slotId: destSlot.id, hasRescheduled: true });
});

it('RSC-03: enforces >=60m boundary on both original and destination starts', async () => {
  const { customer, tutorB, oldSlot, destSlot, bookingId } = await fixture(240, 480);

  // HTTP 422 when destination starts <60m away
  const destSoon = await createSlot(tutorB.id, 55);
  const tooSoonHttp = await reschedule(customer, bookingId, destSoon.id).expect(422);
  expect(tooSoonHttp.body.error.code).toBe('RESCHEDULE_WINDOW_CLOSED');
  expect(await storedHistory(bookingId)).toHaveLength(0);

  // Exact 60:00 vs 59:59.999 boundary on original start via rolled-back decision clock override
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    const {
      rows: [{ definition }],
    } = await client.query<{ definition: string }>(
      "SELECT pg_get_functiondef('public.s2_mutate(text,uuid,uuid,uuid,uuid,text)'::regprocedure) AS definition",
    );
    const anchor = 'decision := clock_timestamp();';
    expect(definition.split(anchor)).toHaveLength(2);
    const installClock = async (base: Date, deltaMs: number) => {
      const stamp = new Date(base.getTime() - 60 * 60_000 + deltaMs).toISOString();
      await client.query(definition.replace(anchor, "decision := TIMESTAMPTZ '" + stamp + "';"));
    };
    const invoke = () =>
      client.query("SELECT public.s2_mutate('Reschedule',$1,$2,$3,$4)", [
        customer.id,
        customer.sid,
        bookingId,
        destSlot.id,
      ]);

    await installClock(oldSlot.startsAt, 1);
    await client.query('SAVEPOINT too_late');
    await expect(invoke()).rejects.toMatchObject({ code: 'P0B05' });
    await client.query('ROLLBACK TO SAVEPOINT too_late');

    await installClock(oldSlot.startsAt, 0);
    await invoke();
    const { rows: [moved] } = await client.query('SELECT "currentSlotId" FROM "Booking" WHERE id=$1', [bookingId]);
    expect(moved.currentSlotId).toBe(destSlot.id);
  } finally {
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }
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
  const tutorC = await user('Tutor');
  const overlapSlotA = await createSlot(tutorB.id, 960);
  const overlapSlotB = await createSlot(tutorC.id, 980);
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

it('RSC-options: same-time cross-Tutor offer is returned by /reschedule/options while excluded from S1 /availability', async () => {
  const { customer, tutorB, oldSlot, bookingId } = await fixture(240, 480);
  const other = await user('Customer');

  // Create a destination offer on Tutor B at the EXACT same startsAt/endsAt as oldSlot.
  const sameTimeSlot = (
    await admin.query(
      `INSERT INTO "Slot" ("tutorId","startsAt","endsAt","lifecycle")
       VALUES ($1, $2, $3, 'Offered')
       RETURNING *`,
      [tutorB.id, oldSlot.startsAt, oldSlot.endsAt],
    )
  ).rows[0];

  // Sprint 1 availability still excludes sameTimeSlot because customer has an overlapping active Booking.
  const s1Avail = await request(app).get('/api/v1/customer/availability').set('Cookie', customer.cookie).expect(200);
  expect(s1Avail.body.data.some((o: { slotId: string }) => o.slotId === sameTimeSlot.id)).toBe(false);

  // Reschedule options excludes the moving Booking from overlap checks, so sameTimeSlot IS returned (and oldSlot is not).
  const opts = await request(app)
    .get(`/api/v1/customer/bookings/${bookingId}/reschedule/options`)
    .set('Cookie', customer.cookie)
    .expect(200);
  expect(opts.headers['x-nuttiew-session-binding']).toBe(customer.binding);
  expect(opts.body.data).toEqual(expect.arrayContaining([expect.objectContaining({ slotId: sameTimeSlot.id })]));
  expect(opts.body.data.some((o: { slotId: string }) => o.slotId === oldSlot.id)).toBe(false);

  // Foreign and unknown booking IDs return identical 404 BOOKING_NOT_FOUND.
  const foreign = await request(app)
    .get(`/api/v1/customer/bookings/${bookingId}/reschedule/options`)
    .set('Cookie', other.cookie)
    .expect(404);
  const missing = await request(app)
    .get(`/api/v1/customer/bookings/${randomUUID()}/reschedule/options`)
    .set('Cookie', customer.cookie)
    .expect(404);
  expect(foreign.body.error).toEqual(missing.body.error);
  expect(foreign.body.error.code).toBe('BOOKING_NOT_FOUND');

  // Rescheduling to the same-time cross-Tutor slot succeeds atomically.
  const moved = await reschedule(customer, bookingId, sameTimeSlot.id).expect(200);
  expect(moved.body.data).toMatchObject({ id: bookingId, slotId: sameTimeSlot.id, tutorId: tutorB.id, status: 'Booked' });
  expect(await storedHistory(bookingId)).toHaveLength(1);
});

it('RSC-09/10: rollback leaves state unchanged; concurrent same-Booking reschedules commit at most once', async () => {
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

it.each(['reschedule first', 'book first'] as const)(
  'RSC-12: reschedule vs new Booking for same destination (%s)',
  async order => {
    const { customer, oldSlot, destSlot, bookingId } = await fixture(240, 480);
    const other = await user('Customer');
    const first = deferred<number>();
    const second = deferred<number>();
    const release = deferred<void>();
    const rescheduleFirst = order === 'reschedule first';

    const server = await createApp(db, {
      ...config,
      rescheduleHooks: rescheduleFirst
        ? {
            beforeCommit: async c => {
              first.resolve(await pid(c));
              await release.promise;
            },
          }
        : {
            beforeMutation: async c => {
              second.resolve(await pid(c));
            },
          },
      bookingHooks: rescheduleFirst
        ? {
            onLockStep: async e => {
              if (e.phase === 'user') second.resolve(e.backendPid);
            },
          }
        : {
            beforeCommit: async ctx => {
              first.resolve(ctx.backendPid);
              await release.promise;
            },
          },
    });

    const startReschedule = () => reschedule(customer, bookingId, destSlot.id, server).then(r => r);
    const startBook = () => book(other, destSlot.id, server).then(r => r);
    const winner = (rescheduleFirst ? startReschedule : startBook)();
    let waiter: Promise<request.Response> | undefined;
    try {
      const holder = await first.promise;
      waiter = (rescheduleFirst ? startBook : startReschedule)();
      await blocked(await second.promise, holder);
    } finally {
      release.resolve();
      await Promise.allSettled([winner, waiter]);
    }

    const winRes = await winner;
    const loseRes = await waiter!;
    if (rescheduleFirst) {
      expect(winRes.status).toBe(200);
      expect(loseRes.status).toBe(409);
      expect(loseRes.body.error.code).toBe('SLOT_UNAVAILABLE');
      expect((await storedBooking(bookingId)).currentSlotId).toBe(destSlot.id);
      expect(await storedHistory(bookingId)).toHaveLength(1);
      expect((await activeOnSlot(destSlot.id)).map(r => r.id)).toEqual([bookingId]);
    } else {
      expect(winRes.status).toBe(201);
      expect(loseRes.status).toBe(409);
      expect(loseRes.body.error.code).toBe('SLOT_UNAVAILABLE');
      expect((await storedBooking(bookingId)).currentSlotId).toBe(oldSlot.id);
      expect(await storedHistory(bookingId)).toHaveLength(0);
      expect((await activeOnSlot(destSlot.id)).map(r => r.id)).toEqual([winRes.body.data.id]);
    }
  },
  15_000,
);

it.each(['tutor cancel first', 'reschedule first'] as const)(
  'RSC-11: TutorCancel vs Customer Reschedule race (%s)',
  async order => {
    const { customer, tutorA, oldSlot, destSlot, bookingId } = await fixture(240, 480);
    const tutorFirst = order === 'tutor cancel first';
    const first = deferred<number>();
    const second = deferred<number>();
    const release = deferred<void>();

    const server = await createApp(db, {
      ...config,
      rescheduleHooks: tutorFirst
        ? {
            beforeMutation: async c => {
              second.resolve(await pid(c));
            },
          }
        : {
            beforeCommit: async c => {
              first.resolve(await pid(c));
              await release.promise;
            },
          },
    });

    const runTutorCancel = async (holdBeforeCommit: boolean) => {
      const client = await db.connect();
      try {
        await client.query('BEGIN');
        if (!holdBeforeCommit) second.resolve(await pid(client));
        await client.query("SELECT public.s2_mutate('TutorCancel',$1,$2,$3,NULL,$4)", [
          tutorA.id,
          tutorA.sid,
          bookingId,
          'Tutor emergency',
        ]);
        if (holdBeforeCommit) {
          first.resolve(await pid(client));
          await release.promise;
        }
        await client.query('COMMIT');
        return { ok: true as const };
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        return { ok: false as const, code: (err as { code?: string })?.code };
      } finally {
        client.release();
      }
    };

    const startReschedule = () => reschedule(customer, bookingId, destSlot.id, server).then(r => r);

    if (tutorFirst) {
      const tutorTx = runTutorCancel(true);
      let reschPromise: Promise<request.Response> | undefined;
      try {
        const holder = await first.promise;
        reschPromise = startReschedule();
        await blocked(await second.promise, holder);
      } finally {
        release.resolve();
        await Promise.allSettled([tutorTx, reschPromise]);
      }
      expect(await tutorTx).toEqual({ ok: true });
      const reschRes = await reschPromise!;
      expect(reschRes.status).toBe(409);
      expect(reschRes.body.error.code).toBe('RESCHEDULE_NOT_APPLICABLE');
      expect(await storedBooking(bookingId)).toMatchObject({
        status: 'Cancelled',
        cancellationActor: 'Tutor',
        currentSlotId: oldSlot.id,
      });
      expect((await storedSlot(oldSlot.id)).lifecycle).toBe('Withdrawn');
      expect(await storedHistory(bookingId)).toHaveLength(0);
      expect(await storedNotifications(bookingId)).toHaveLength(1);
    } else {
      const reschPromise = startReschedule();
      let tutorTx: Promise<{ ok: true } | { ok: false; code: string | undefined }> | undefined;
      try {
        const holder = await first.promise;
        tutorTx = runTutorCancel(false);
        await blocked(await second.promise, holder);
      } finally {
        release.resolve();
        await Promise.allSettled([reschPromise, tutorTx]);
      }
      expect((await reschPromise).status).toBe(200);
      const tutorResult = await tutorTx!;
      expect(tutorResult.ok).toBe(false);
      expect(['40001', 'P0002']).toContain(tutorResult.ok ? '' : tutorResult.code);
      // Fresh retry by former Tutor A is definitively rejected with P0002.
      const retryTutor = await runTutorCancel(false);
      expect(retryTutor).toEqual({ ok: false, code: 'P0002' });
      expect(await storedBooking(bookingId)).toMatchObject({ status: 'Booked', currentSlotId: destSlot.id });
      expect((await storedSlot(oldSlot.id)).lifecycle).toBe('Offered');
      expect(await storedHistory(bookingId)).toHaveLength(1);
      expect(await storedNotifications(bookingId)).toHaveLength(0);
    }
  },
  15_000,
);

it('RSC-15: lost COMMIT acknowledgement returns 503 MUTATION_OUTCOME_UNKNOWN; re-read shows moved booking and retry returns 409', async () => {
  const { customer, tutorB, destSlot, bookingId } = await fixture(240, 480);
  const thirdSlot = await createSlot(tutorB.id, 720);
  const uncertainApp = await createApp(db, {
    ...config,
    rescheduleHooks: {
      afterCommit: async () => {
        throw new Error('lost acknowledgement');
      },
    },
  });

  const lost = await reschedule(customer, bookingId, destSlot.id, uncertainApp).expect(503);
  expect(lost.body.error.code).toBe('MUTATION_OUTCOME_UNKNOWN');

  // Re-reading booking detail shows the committed move.
  const detail = await request(app)
    .get(`/api/v1/customer/bookings/${bookingId}`)
    .set('Cookie', customer.cookie)
    .expect(200);
  expect(detail.body.data).toMatchObject({ id: bookingId, slotId: destSlot.id, status: 'Booked' });

  // Retrying reschedule does not create a second move or history row.
  const retry = await reschedule(customer, bookingId, thirdSlot.id).expect(409);
  expect(retry.body.error.code).toBe('RESCHEDULE_ALREADY_USED');
  expect(await storedHistory(bookingId)).toHaveLength(1);
});

it('RSC-16: committed reschedule, reopened old Slot, and history survive an actual API process restart', async () => {
  const { customer, oldSlot, destSlot, bookingId } = await fixture(240, 480);
  const source = `
    import { createApp } from './src/app.ts';
    import { createPool } from './src/config.ts';
    const app = await createApp(createPool(), {
      origin: process.env.AUTH_CANONICAL_ORIGIN,
      production: false,
      csrfKey: Buffer.from(process.env.RESCHEDULE_TEST_CSRF, 'hex'), rateKey: Buffer.alloc(32),
    });
    const server = app.listen(0, '127.0.0.1', () => console.log('READY ' + server.address().port));
  `;
  async function inProcess<T>(work: (base: string) => Promise<T>) {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
      env: { ...process.env, AUTH_CANONICAL_ORIGIN: origin, RESCHEDULE_TEST_CSRF: config.csrfKey.toString('hex') },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const exited = once(child, 'exit');
    let output = '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const port = await new Promise<string>((ok, fail) => {
        child.stdout.on('data', chunk => {
          output += String(chunk);
          const match = /READY (\d+)/.exec(output);
          if (match) ok(match[1]);
        });
        child.stderr.resume();
        child.once('error', fail);
        child.once('exit', () => fail(new Error('Test API exited before readiness')));
        controller.signal.addEventListener('abort', () => fail(new Error('API start timeout')), { once: true });
      });
      return await work('http://127.0.0.1:' + port);
    } finally {
      clearTimeout(timeout);
      if (child.exitCode === null) child.kill();
      await exited;
    }
  }

  const committed = await inProcess(async base => {
    const res = await fetch(base + path(bookingId), {
      method: 'POST',
      headers: { ...auth(customer), 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId: destSlot.id }),
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(200);
    return (await res.json()).data;
  });

  await inProcess(async base => {
    const get = (p: string) =>
      fetch(base + '/api/v1/customer/' + p, { headers: { Cookie: customer.cookie }, signal: AbortSignal.timeout(5000) });
    const detail = await get('bookings/' + bookingId);
    expect(detail.status).toBe(200);
    expect((await detail.json()).data).toEqual(committed);
    const list = await get('bookings');
    expect(list.status).toBe(200);
    expect((await list.json()).data[0]).toMatchObject({ id: bookingId, slotId: destSlot.id, hasRescheduled: true });
    const availability = await get('availability');
    expect(availability.status).toBe(200);
    expect((await availability.json()).data).toEqual(
      expect.arrayContaining([expect.objectContaining({ slotId: oldSlot.id })]),
    );
  });

  expect(await storedHistory(bookingId)).toHaveLength(1);
}, 30_000);

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
