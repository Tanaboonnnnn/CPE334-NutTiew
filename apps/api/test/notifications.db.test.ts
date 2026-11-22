import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool, type PoolClient } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { createPool } from '../src/config.js';
import { getCustomerNotificationDetail, listCustomerNotifications } from '../src/notifications.js';
import { digest } from '../src/security.js';

const ownerUrl = new URL(process.env.DATABASE_URL ?? 'invalid:');
const runtimeUrl = new URL(process.env.DATABASE_URL_APP ?? 'invalid:');
const local = ownerUrl.port === '15449' && ownerUrl.pathname === '/nuttiew_118_review';
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
  throw new Error('Notification integration tests require the disposable PostgreSQL fixture target');
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
      randomUUID() + '@notif-test.example.test',
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
const auth = (a: Auth) => ({
  Cookie: a.cookie,
  Origin: origin,
  'X-CSRF-Token': a.csrf,
  'X-NutTiew-Expected-Session-Binding': a.binding,
});
const readPath = (id: string) => '/api/v1/customer/notifications/' + id + '/read';
const markRead = (a: Auth, id: string, server = app) =>
  request(server).post(readPath(id)).set(auth(a)).send({});

let slotCounter = 200;
async function createSlot(tutorId: string, minutesFromNow?: number) {
  const mins = minutesFromNow ?? 60 * slotCounter++;
  const start = new Date(Date.now() + mins * 60_000);
  const end = new Date(start.getTime() + 60 * 60_000);
  return (
    await admin.query(
      `INSERT INTO "Slot" ("tutorId","startsAt","endsAt","lifecycle") VALUES ($1,$2,$3,'Offered') RETURNING *`,
      [tutorId, start, end],
    )
  ).rows[0];
}

async function createTutorCancelledFixture(reason = 'ผู้สอนติดประชุมด่วนครับ', existingCustomer?: Auth) {
  const customer = existingCustomer ?? (await user('Customer'));
  const tutor = await user('Tutor');
  const slot = await createSlot(tutor.id);
  const booked = await request(app)
    .post('/api/v1/customer/bookings')
    .set(auth(customer))
    .send({ slotId: slot.id })
    .expect(201);
  const bookingId = booked.body.data.id as string;
  const cancelled = await request(app)
    .post('/api/v1/tutor/bookings/' + bookingId + '/cancel')
    .set(auth(tutor))
    .send({ reason })
    .expect(200);
  const notifRow = (
    await admin.query('SELECT * FROM "Notification" WHERE "bookingId"=$1', [bookingId])
  ).rows[0];
  return { customer, tutor, slot, bookingId, cancelledAt: cancelled.body.data.cancelledAt as string, notifRow, reason };
}

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

it('NTF-01/02/05/10: owner lists, reads, marks read idempotently, rereads, and reason matches Booking detail', async () => {
  const { customer, tutor, slot, bookingId, cancelledAt, notifRow, reason } = await createTutorCancelledFixture();
  const other = await user('Customer');

  const list = await request(app).get('/api/v1/customer/notifications').set('Cookie', customer.cookie).expect(200);
  expect(list.headers['cache-control']).toBe('no-store');
  expect(list.headers['x-nuttiew-session-binding']).toBe(customer.binding);
  expect(list.body.data).toHaveLength(1);
  expect(list.body.data[0]).toEqual({
    id: notifRow.id,
    kind: 'TutorCancelled',
    createdAt: cancelledAt,
    readAt: null,
    reason,
    booking: {
      id: bookingId,
      slotId: slot.id,
      tutorRef: 'TUTOR-' + tutor.id.slice(0, 8),
      startsAt: slot.startsAt.toISOString(),
      endsAt: slot.endsAt.toISOString(),
      status: 'Cancelled',
      cancelledAt,
    },
  });
  // NTF-10: no tutor email, credentials, or third-party identity
  expect(list.text).not.toContain('@notif-test.example.test');

  // NTF-02: mark read sets readAt; second mark-read returns identical readAt; notice remains readable.
  const firstRead = await markRead(customer, notifRow.id).expect(200);
  expect(firstRead.headers['x-nuttiew-session-binding']).toBe(customer.binding);
  expect(typeof firstRead.body.data.readAt).toBe('string');
  const readAt = firstRead.body.data.readAt as string;

  const secondRead = await markRead(customer, notifRow.id).expect(200);
  expect(secondRead.body.data.readAt).toBe(readAt);
  expect(secondRead.body.data.reason).toBe(reason);

  const detail = await request(app)
    .get('/api/v1/customer/notifications/' + notifRow.id)
    .set('Cookie', customer.cookie)
    .expect(200);
  expect(detail.body.data).toEqual(firstRead.body.data);

  const listAfter = await request(app).get('/api/v1/customer/notifications').set('Cookie', customer.cookie).expect(200);
  expect(listAfter.body.data).toEqual([firstRead.body.data]);

  // NTF-05: owner's cancelled Booking detail shows the same reason; foreign Customer gets 404 without reason.
  const bookingDetail = await request(app)
    .get('/api/v1/customer/bookings/' + bookingId)
    .set('Cookie', customer.cookie)
    .expect(200);
  expect(bookingDetail.body.data.cancellationReason).toBe(reason);
  const foreignDetail = await request(app)
    .get('/api/v1/customer/bookings/' + bookingId)
    .set('Cookie', other.cookie)
    .expect(404);
  expect(foreignDetail.text).not.toContain(reason);
});

it('NTF-03/10: rejects foreign/unknown with identical 404, 401/403/400 and CSRF/Origin/Session-binding failures', async () => {
  const secretReason = 'เหตุผลลับเฉพาะลูกค้า-' + randomUUID();
  const logSpies = [
    vi.spyOn(console, 'log'),
    vi.spyOn(console, 'warn'),
    vi.spyOn(console, 'error'),
  ];
  try {
  const { customer, tutor, notifRow, reason } = await createTutorCancelledFixture(secretReason);
  const other = await user('Customer');
  const unknownId = randomUUID();

  // Foreign & unknown GET detail -> identical 404 NOTIFICATION_NOT_FOUND
  const foreignGet = await request(app)
    .get('/api/v1/customer/notifications/' + notifRow.id)
    .set('Cookie', other.cookie)
    .expect(404);
  const missingGet = await request(app)
    .get('/api/v1/customer/notifications/' + unknownId)
    .set('Cookie', other.cookie)
    .expect(404);
  expect(foreignGet.body.error).toEqual(missingGet.body.error);
  expect(foreignGet.body.error.code).toBe('NOTIFICATION_NOT_FOUND');
  expect(foreignGet.text).not.toContain(reason);

  // Foreign & unknown POST read -> identical 404 NOTIFICATION_NOT_FOUND
  const foreignPost = await markRead(other, notifRow.id).expect(404);
  const missingPost = await markRead(other, unknownId).expect(404);
  expect(foreignPost.body.error).toEqual(missingPost.body.error);
  expect(foreignPost.body.error.code).toBe('NOTIFICATION_NOT_FOUND');
  expect(foreignPost.text).not.toContain(reason);

  // Anonymous -> 401; Tutor -> 403
  await request(app).get('/api/v1/customer/notifications').expect(401);
  await request(app).get('/api/v1/customer/notifications/' + notifRow.id).expect(401);
  await request(app).post(readPath(notifRow.id)).set({ Origin: origin }).send({}).expect(401);
  await request(app).get('/api/v1/customer/notifications').set('Cookie', tutor.cookie).expect(403);
  await markRead(tutor, notifRow.id).expect(403);

  // Malformed UUID, non-empty query, non-empty body, CSRF/Origin/binding errors
  await request(app).get('/api/v1/customer/notifications?page=1').set('Cookie', customer.cookie).expect(400);
  await request(app).get('/api/v1/customer/notifications/not-a-uuid').set('Cookie', customer.cookie).expect(400);
  await request(app).post(readPath(notifRow.id)).set(auth(customer)).send({ extra: true }).expect(400);
  await request(app).post(readPath(notifRow.id) + '?probe=1').set(auth(customer)).send({}).expect(400);
  await request(app).post(readPath(notifRow.id)).set(auth(customer)).set('Origin', 'https://evil.invalid').send({}).expect(403);
  await request(app).post(readPath(notifRow.id)).set(auth(customer)).set('X-CSRF-Token', other.csrf).send({}).expect(403);
  await request(app)
    .post(readPath(notifRow.id))
    .set(auth(customer))
    .set('X-NutTiew-Expected-Session-Binding', other.binding)
    .send({})
    .expect(403);

  // Unread state still intact
  const row = (await admin.query('SELECT "readAt" FROM "Notification" WHERE id=$1', [notifRow.id])).rows[0];
  expect(row.readAt).toBeNull();

  // NTF-10: verify secret cancellation reason was never logged to console sinks.
  const logged = logSpies.flatMap(spy => spy.mock.calls.flat().map(String)).join('\n');
  expect(logged).not.toContain(secretReason);
  } finally {
    logSpies.forEach(spy => spy.mockRestore());
  }
});

it('NTF-04: notice remains retrievable after a long simulated elapsed interval (no expiry predicate)', async () => {
  const customer = await user('Customer');
  const tutor = await user('Tutor');
  const slot = await createSlot(tutor.id);
  const booked = await request(app)
    .post('/api/v1/customer/bookings')
    .set(auth(customer))
    .send({ slotId: slot.id })
    .expect(201);
  const bookingId = booked.body.data.id as string;

  // Simulate a 400-day-old Tutor cancellation + read inside a rolled-back transaction using s2_mutate clock override.
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
    const oldCreated = new Date(Date.now() - 400 * 24 * 60 * 60_000).toISOString();
    await client.query(definition.replace(anchor, `decision := TIMESTAMPTZ '${oldCreated}';`));
    await client.query("SELECT public.s2_mutate('TutorCancel',$1,$2,$3,NULL,$4)", [
      tutor.id,
      tutor.sid,
      bookingId,
      'เหตุผลเก่ากว่า 1 ปี',
    ]);
    const notifId = (
      await client.query<{ id: string }>('SELECT id FROM "Notification" WHERE "bookingId"=$1', [bookingId])
    ).rows[0].id;
    const oldRead = new Date(Date.now() - 399 * 24 * 60 * 60_000).toISOString();
    await client.query('UPDATE "Notification" SET "readAt"=$1::timestamptz WHERE id=$2', [oldRead, notifId]);

    const listed = await listCustomerNotifications(client, customer.id);
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({ id: notifId, reason: 'เหตุผลเก่ากว่า 1 ปี' });
    expect(listed[0].readAt).toBeTruthy();

    const fetched = await getCustomerNotificationDetail(client, customer.id, notifId);
    expect(fetched).toEqual(listed[0]);
  } finally {
    try {
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }
  }
});

it('NTF-06: concurrent mark-read requests are idempotent and return one persisted readAt', async () => {
  const { customer, notifRow } = await createTutorCancelledFixture();
  const holder = deferred<number>();
  const waiter = deferred<number>();
  const release = deferred<void>();
  const server1 = await createApp(db, {
    ...config,
    notificationHooks: {
      beforeCommit: async c => {
        holder.resolve(await pid(c));
        await release.promise;
      },
    },
  });
  const server2 = await createApp(db, {
    ...config,
    notificationHooks: {
      beforeMutation: async c => {
        waiter.resolve(await pid(c));
      },
    },
  });

  const p1 = markRead(customer, notifRow.id, server1).then(r => r);
  let p2: Promise<request.Response> | undefined;
  try {
    const heldPid = await holder.promise;
    p2 = markRead(customer, notifRow.id, server2).then(r => r);
    await blocked(await waiter.promise, heldPid);
  } finally {
    release.resolve();
    await Promise.allSettled([p1, p2]);
  }

  const r1 = await p1;
  const r2 = await p2!;
  expect(r1.status).toBe(200);
  expect(r2.status).toBe(200);
  expect(r1.body.data.readAt).toBeTruthy();
  expect(r2.body.data.readAt).toBe(r1.body.data.readAt);

  const stored = (await admin.query('SELECT "readAt" FROM "Notification" WHERE id=$1', [notifRow.id])).rows[0];
  expect(stored.readAt.toISOString()).toBe(r1.body.data.readAt);
}, 15_000);

it('NTF-07: Customer cancellation and Customer reschedule create zero notifications', async () => {
  const customer = await user('Customer');
  const tutorA = await user('Tutor');
  const tutorB = await user('Tutor');
  const slot1 = await createSlot(tutorA.id);
  const slot2 = await createSlot(tutorA.id);
  const slot3 = await createSlot(tutorB.id);

  const b1 = (await request(app).post('/api/v1/customer/bookings').set(auth(customer)).send({ slotId: slot1.id }).expect(201)).body.data.id as string;
  await request(app).post('/api/v1/customer/bookings/' + b1 + '/cancel').set(auth(customer)).send({}).expect(200);

  const b2 = (await request(app).post('/api/v1/customer/bookings').set(auth(customer)).send({ slotId: slot2.id }).expect(201)).body.data.id as string;
  await request(app).post('/api/v1/customer/bookings/' + b2 + '/reschedule').set(auth(customer)).send({ slotId: slot3.id }).expect(200);

  const list = await request(app).get('/api/v1/customer/notifications').set('Cookie', customer.cookie).expect(200);
  expect(list.body.data).toEqual([]);
});

it('NTF-08/09: direct SQL guards reject immutable changes, deletes, duplicates, and invalid readAt transitions', async () => {
  const { customer, notifRow } = await createTutorCancelledFixture();
  await markRead(customer, notifRow.id).expect(200);
  const before = (await admin.query('SELECT * FROM "Notification" WHERE id=$1', [notifRow.id])).rows[0];

  // NTF-08: runtime cannot UPDATE/DELETE/TRUNCATE; owner cannot alter immutable columns, delete, or duplicate.
  await expect(db.query('UPDATE "Notification" SET "readAt"=NULL WHERE id=$1', [notifRow.id])).rejects.toMatchObject({ code: '42501' });
  await expect(db.query('DELETE FROM "Notification" WHERE id=$1', [notifRow.id])).rejects.toMatchObject({ code: '42501' });
  for (const sql of [
    'UPDATE "Notification" SET "recipientCustomerId"=gen_random_uuid() WHERE id=$1',
    'UPDATE "Notification" SET "bookingId"=gen_random_uuid() WHERE id=$1',
    'UPDATE "Notification" SET kind=$$Other$$ WHERE id=$1',
    'UPDATE "Notification" SET "createdAt"="createdAt"-interval \'1 minute\' WHERE id=$1',
    'DELETE FROM "Notification" WHERE id=$1',
    // NTF-09: cannot clear readAt or set it to an earlier timestamp after read
    'UPDATE "Notification" SET "readAt"=NULL WHERE id=$1',
    'UPDATE "Notification" SET "readAt"="createdAt"-interval \'1 minute\' WHERE id=$1',
    'UPDATE "Notification" SET "readAt"="readAt"-interval \'1 second\' WHERE id=$1',
  ]) {
    await expect(admin.query(sql, [notifRow.id])).rejects.toHaveProperty('code');
  }
  const trunc = await admin.connect();
  try {
    await trunc.query('BEGIN');
    await expect(trunc.query('TRUNCATE "Notification"')).rejects.toHaveProperty('code');
  } finally {
    try {
      await trunc.query('ROLLBACK');
    } finally {
      trunc.release();
    }
  }
  await expect(
    admin.query(
      'INSERT INTO "Notification" ("bookingId","recipientCustomerId",kind,"createdAt") SELECT id,"customerId",$$TutorCancelled$$,"cancelledAt" FROM "Booking" WHERE id=$1',
      [before.bookingId],
    ),
  ).rejects.toMatchObject({ code: '23505' });

  const after = (await admin.query('SELECT * FROM "Notification" WHERE id=$1', [notifRow.id])).rows[0];
  expect(after).toEqual(before);
});

it('NTF-11: multi-customer scoping and newest-first stable ordering', async () => {
  const customerA = await user('Customer');
  const customerB = await user('Customer');
  const firstA = await createTutorCancelledFixture('เหตุผลที่ 1', customerA);
  await new Promise(r => setTimeout(r, 15));
  const secondA = await createTutorCancelledFixture('เหตุผลที่ 2', customerA);
  const onlyB = await createTutorCancelledFixture('เหตุผลของลูกค้า B', customerB);

  const listA = await request(app).get('/api/v1/customer/notifications').set('Cookie', customerA.cookie).expect(200);
  expect(listA.body.data.map((n: { id: string }) => n.id)).toEqual([secondA.notifRow.id, firstA.notifRow.id]);

  const listB = await request(app).get('/api/v1/customer/notifications').set('Cookie', customerB.cookie).expect(200);
  expect(listB.body.data.map((n: { id: string }) => n.id)).toEqual([onlyB.notifRow.id]);
});

it('NTF-12: read state and notice content survive an actual API process restart', async () => {
  const { customer, notifRow, reason } = await createTutorCancelledFixture('เหตุผลทดสอบหลังรีสตาร์ท');
  const source = `
    import { createApp } from './src/app.ts';
    import { createPool } from './src/config.ts';
    const app = await createApp(createPool(), {
      origin: process.env.AUTH_CANONICAL_ORIGIN,
      production: false,
      csrfKey: Buffer.from(process.env.NOTIF_TEST_CSRF, 'hex'), rateKey: Buffer.alloc(32),
    });
    const server = app.listen(0, '127.0.0.1', () => console.log('READY ' + server.address().port));
  `;
  async function inProcess<T>(work: (base: string) => Promise<T>) {
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', source], {
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
      env: { ...process.env, AUTH_CANONICAL_ORIGIN: origin, NOTIF_TEST_CSRF: config.csrfKey.toString('hex') },
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

  const readDto = await inProcess(async base => {
    const res = await fetch(base + readPath(notifRow.id), {
      method: 'POST',
      headers: { ...auth(customer), 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(5000),
    });
    expect(res.status).toBe(200);
    return (await res.json()).data;
  });
  expect(readDto.readAt).toBeTruthy();

  await inProcess(async base => {
    const listRes = await fetch(base + '/api/v1/customer/notifications', {
      headers: { Cookie: customer.cookie },
      signal: AbortSignal.timeout(5000),
    });
    expect(listRes.status).toBe(200);
    const items = (await listRes.json()).data;
    expect(items).toEqual([readDto]);
    expect(items[0].reason).toBe(reason);
  });
}, 30_000);
