import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { readKey } from '../src/config.js';
import { createApp } from '../src/app.js';

const url = process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL!;
// Disposable-migration owner tests native triggers; production API pools use
// the separate, least-privileged runtime role when DATABASE_URL_APP is set.
const owner = new Pool({ connectionString: process.env.DATABASE_URL! });
const appPoolA = new Pool({ connectionString: url, max: 1 });
const appPoolB = new Pool({ connectionString: url, max: 1 });
const observer = new Pool({ connectionString: url, max: 2 });
const origin = 'http://localhost:5173';
const ipHex = randomUUID().replaceAll('-', '');
const rateTestIp = '2001:db8:' + ipHex.slice(0, 4) + ':' + ipHex.slice(4, 8) + ':' + ipHex.slice(8, 12) + '::1';
let id: string;
let email: string;
let session: { cookie: string; csrf: string };
let appA: Awaited<ReturnType<typeof createApp>>;
let appB: Awaited<ReturnType<typeof createApp>>;
let dayOffset = 20;
const fresh = () => {
  const instant = new Date(Date.now() + dayOffset++ * 86_400_000);
  instant.setUTCMinutes(17, 0, 0);
  return instant;
};
const doPost = (app: typeof appA, startsAt: Date) =>
  request(app).post('/api/v1/tutor/slots').set('Origin', origin).set('Cookie', session.cookie)
    .set('X-CSRF-Token', session.csrf).send({ startsAt: startsAt.toISOString() });
async function pid(pool: Pool) {
  return (await pool.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
}
async function observeBlocking(waiterIds: number[], expectedBlocker: number) {
  const deadline = Date.now() + 7_500;
  let last: { waiter: number; blockers: number[] }[] = [];
  while (Date.now() < deadline) {
    const observed = await observer.query<{ waiter: number; blockers: number[] }>(
      'SELECT pid AS waiter, pg_blocking_pids(pid) AS blockers FROM unnest($1::integer[]) AS waiting(pid)',
      [[...waiterIds, expectedBlocker]],
    );
    last = observed.rows;
    const graph = new Map(observed.rows.map(row => [row.waiter, row.blockers]));
    const reaches = (waiter: number, seen = new Set<number>()): boolean => {
      if (seen.has(waiter)) return false;
      seen.add(waiter);
      return (graph.get(waiter) ?? []).some(blocker => blocker === expectedBlocker || reaches(blocker, seen));
    };
    // PostgreSQL may report soft blockers: B queues behind A, which waits on
    // holder. Both waiters must have a verified chain to the held Tutor lock.
    if (waiterIds.every(waiter => reaches(waiter))) return observed.rows;
    await new Promise(resolve => setTimeout(resolve, 40));
  }
  throw new Error('Race A invalid: no observed pg_blocking_pids lock chain: ' + JSON.stringify(last));
}

beforeAll(async () => {
  email = 'slot-race-' + randomUUID().slice(0, 12) + '@example.test';
  id = (await owner.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3) RETURNING "id"',
    [email, await argon2.hash('RacePassword#2026'), 'Tutor'])).rows[0].id;
  const conf = { origin, csrfKey: readKey('AUTH_CSRF_HMAC_KEY'), rateKey: readKey('AUTH_RATE_KEY'), production: false, trustedProxies: ['::ffff:127.0.0.1', '127.0.0.1', '::1'] };
  appA = await createApp(appPoolA, conf);
  appB = await createApp(appPoolB, conf);
  const login = await request(appA).post('/api/v1/auth/login').set('Origin', origin).set('X-Forwarded-For', rateTestIp).send({ email, password: 'RacePassword#2026' });
  expect(login.status).toBe(200);
  const cookie = login.headers['set-cookie'][0] as string;
  const token = await request(appA).get('/api/v1/auth/csrf').set('Cookie', cookie);
  session = { cookie, csrf: token.body.csrfToken };
}, 30_000);
afterAll(async () => {
  await Promise.all([owner.end(), appPoolA.end(), appPoolB.end(), observer.end()]);
});

describe('F-S1-02 SLOT-10/11/16/17 — real SQL and deterministic Race A', () => {
  for (const first of ['A', 'B'] as const) it('SLOT-10 two real API requests race with '+first+' first; exactly one conflicting Offered row commits', async () => {
    const start = fresh();
    const holder = await owner.connect();
    let committed = false;
    try {
      await holder.query('BEGIN');
      const holderPid = (await holder.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await holder.query('SELECT "id" FROM "User" WHERE "id"=$1 FOR UPDATE', [id]);
      const [aPid, bPid] = await Promise.all([pid(appPoolA), pid(appPoolB)]);
      const firstApp = first === 'A' ? appA : appB;
      const secondApp = first === 'A' ? appB : appA;
      const firstPid = first === 'A' ? aPid : bPid;
      const secondPid = first === 'A' ? bPid : aPid;
      const firstStart = first === 'A' ? start : new Date(start.getTime() + 30 * 60_000);
      const secondStart = first === 'A' ? new Date(start.getTime() + 30 * 60_000) : start;
      const pFirst = doPost(firstApp, firstStart).then(response => response);
      await observeBlocking([firstPid], holderPid); // Prove queue ordering; never rely on sleep.
      const pSecond = doPost(secondApp, secondStart).then(response => response);
      const blocked = await observeBlocking([aPid, bPid], holderPid);
      expect(blocked.length).toBeGreaterThanOrEqual(2);
      await holder.query('COMMIT');
      committed = true;
      const [winner, loser] = await Promise.all([pFirst, pSecond]);
      expect(winner.status).toBe(201);
      expect(loser.status).toBe(409);
      const rows = (await owner.query('SELECT "id","startsAt","endsAt","lifecycle" FROM "Slot" WHERE "tutorId"=$1 AND "startsAt" >= $2 AND "startsAt" <= $3', [id, start, new Date(start.getTime() + 30 * 60_000)])).rows;
      expect(rows).toHaveLength(1);
      expect(rows[0].lifecycle).toBe('Offered');
      console.info('RACE_A_OBSERVED', JSON.stringify({ first, holderPid, aPid, bPid, statuses: [winner.status, loser.status], committed: rows.map(row => row.id) }));
    } finally {
      if (!committed) await holder.query('ROLLBACK').catch(() => {});
      holder.release();
    }
  }, 30_000);

  it('SLOT-11 direct SQL overlapping writers block on GiST and losing insert throws SQLSTATE 23P01', async () => {
    const start = fresh();
    const a = await owner.connect();
    const b = await owner.connect();
    let committed = false;
    try {
      await a.query('BEGIN');
      const aPid = (await a.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await a.query('INSERT INTO "Slot"("tutorId","startsAt","endsAt") VALUES($1,$2,$3)', [id, start, new Date(start.getTime() + 3_600_000)]);
      const bPid = (await b.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      const pending = b.query('INSERT INTO "Slot"("tutorId","startsAt","endsAt") VALUES($1,$2,$3)',
        [id, new Date(start.getTime() + 30 * 60_000), new Date(start.getTime() + 90 * 60_000)])
        .then(() => ({ code: 'NONE' })).catch((error: { code: string }) => ({ code: error.code }));
      const blocked = await observeBlocking([bPid], aPid);
      expect(blocked.length).toBeGreaterThanOrEqual(1);
      await a.query('COMMIT');
      committed = true;
      expect((await pending).code).toBe('23P01');
      expect((await owner.query('SELECT "id" FROM "Slot" WHERE "tutorId"=$1 AND "startsAt"=$2', [id, start])).rowCount).toBe(1);
      console.info('RACE_A_DIRECT_SQL_OBSERVED', JSON.stringify({ aPid, bPid, loserSQLSTATE: '23P01' }));
    } finally {
      if (!committed) await a.query('ROLLBACK').catch(() => {});
      a.release();
      b.release();
    }
  }, 30_000);

  it('SLOT-16/17 rejects 59-minute inserts, direct Offered mutation/delete/truncate and S2 Withdrawn fabrication', async () => {
    const start = fresh();
    const original = await owner.query<{ id: string }>('INSERT INTO "Slot"("tutorId","startsAt","endsAt") VALUES($1,$2,$3) RETURNING "id"',
      [id, start, new Date(start.getTime() + 3_600_000)]);
    const slotId = original.rows[0].id;
    const attempt = async (sql: string, params: unknown[], code: string, constraint?: string) => {
      await expect(owner.query(sql, params)).rejects.toMatchObject({ code, ...(constraint ? { constraint } : {}) });
    };
    const invalidDurationStart = fresh();
    await attempt('INSERT INTO "Slot"("tutorId","startsAt","endsAt") VALUES($1,$2,$3)',
      [id, invalidDurationStart, new Date(invalidDurationStart.getTime() + 59 * 60_000)], '23514');
    const withdrawnStart = fresh();
    await attempt('INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle","withdrawnAt") VALUES($1,$2,$3,$4,now())',
      [id, withdrawnStart, new Date(withdrawnStart.getTime() + 3_600_000), 'Withdrawn'], '23514', 'slot_s1_insert_lifecycle');
    for (const sql of [
      'UPDATE "Slot" SET "id"=gen_random_uuid() WHERE "id"=$1',
      'UPDATE "Slot" SET "tutorId"=$2 WHERE "id"=$1',
      'UPDATE "Slot" SET "startsAt"=now() WHERE "id"=$1',
      'UPDATE "Slot" SET "endsAt"=now() WHERE "id"=$1',
      'UPDATE "Slot" SET "lifecycle"=$2 WHERE "id"=$1',
      'UPDATE "Slot" SET "withdrawnAt"=now() WHERE "id"=$1',
      'UPDATE "Slot" SET "id"="id" WHERE "id"=$1',
      'DELETE FROM "Slot" WHERE "id"=$1',
    ]) {
      await attempt(sql, sql.includes('$2') ? [slotId, sql.includes('tutorId') ? randomUUID() : 'Withdrawn'] : [slotId], '23514', 'slot_s1_immutable');
    }
    await attempt('TRUNCATE "Slot"', [], '23514', 'slot_s1_immutable');
    const db = await owner.query('SELECT "id","tutorId","startsAt","endsAt","lifecycle" FROM "Slot" WHERE "id"=$1', [slotId]);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ id: slotId, tutorId: id, lifecycle: 'Offered' });
    expect(db.rows[0].startsAt.toISOString()).toBe(start.toISOString());
    expect(db.rows[0].endsAt.getTime() - db.rows[0].startsAt.getTime()).toBe(3_600_000);
  }, 30_000);

  it('SLOT-13 rejects an authenticated Slot write if its Session is revoked while blocked on the Tutor row', async () => {
    const start = fresh();
    const freshLogin = await request(appA).post('/api/v1/auth/login').set('Origin', origin).set('X-Forwarded-For', rateTestIp)
      .send({ email, password: 'RacePassword#2026' });
    expect(freshLogin.status).toBe(200);
    const cookie = freshLogin.headers['set-cookie'][0] as string;
    const csrf = (await request(appA).get('/api/v1/auth/csrf').set('Cookie', cookie)).body.csrfToken as string;
    const holder = await owner.connect();
    let finished = false;
    try {
      await holder.query('BEGIN');
      const holderPid = (await holder.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await holder.query('SELECT "id" FROM "User" WHERE "id"=$1 FOR UPDATE', [id]);
      const bPid = await pid(appPoolB);
      const pending = request(appB).post('/api/v1/tutor/slots').set('Origin', origin)
        .set('Cookie', cookie).set('X-CSRF-Token', csrf).send({ startsAt: start.toISOString() }).then(response => response);
      await observeBlocking([bPid], holderPid);
      const logout = await request(appA).post('/api/v1/auth/logout').set('Origin', origin)
        .set('Cookie', cookie).set('X-CSRF-Token', csrf).send({});
      expect(logout.status).toBe(204);
      await holder.query('COMMIT');
      finished = true;
      const response = await pending;
      expect(response.status).toBe(401);
      expect((await owner.query('SELECT "id" FROM "Slot" WHERE "tutorId"=$1 AND "startsAt"=$2', [id, start])).rowCount).toBe(0);
    } finally {
      if (!finished) await holder.query('ROLLBACK').catch(() => {});
      holder.release();
    }
  }, 30_000);

  it.skipIf(!process.env.DATABASE_URL_APP)('SLOT-17 the separate runtime database role can read/create Slot but cannot update/delete/truncate or disable triggers', async () => {
    const runtime = new Pool({ connectionString: process.env.DATABASE_URL_APP });
    try {
      const rights = await runtime.query<{
        username: string; canSelect: boolean; canInsert: boolean; canUpdate: boolean; canDelete: boolean; canTruncate: boolean;
      }>('SELECT current_user AS username, has_table_privilege(current_user, $1, $2) AS "canSelect", has_table_privilege(current_user, $1, $3) AS "canInsert", has_table_privilege(current_user, $1, $4) AS "canUpdate", has_table_privilege(current_user, $1, $5) AS "canDelete", has_table_privilege(current_user, $1, $6) AS "canTruncate"',
        ['"Slot"', 'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']);
      expect(rights.rows[0].canSelect).toBe(true);
      expect(rights.rows[0].canInsert).toBe(true);
      expect(rights.rows[0].canUpdate).toBe(false);
      expect(rights.rows[0].canDelete).toBe(false);
      expect(rights.rows[0].canTruncate).toBe(false);
      await expect(runtime.query('ALTER TABLE "Slot" DISABLE TRIGGER slot_s1_update_delete_guard'))
        .rejects.toMatchObject({ code: '42501' });
      console.info('SLOT_RUNTIME_LEAST_PRIVILEGE', JSON.stringify({ role: rights.rows[0].username, canAlterSlot: false }));
    } finally {
      await runtime.end();
    }
  });
});
