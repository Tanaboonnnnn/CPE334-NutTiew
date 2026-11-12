import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import type { Express } from 'express';
import { createPool, readKey } from '../src/config.js';
import { createApp } from '../src/app.js';
import { Pool } from 'pg';

const pool = createPool();
const origin = 'http://localhost:5173';
const headers = { Origin: origin };
const marker = randomUUID().slice(0, 12);
const ipHex = randomUUID().replaceAll('-', '');
const rateTestIp = '2001:db8:' + ipHex.slice(0, 4) + ':' + ipHex.slice(4, 8) + ':' + ipHex.slice(8, 12) + '::2';
const password = 'SlotTestPassword!2026';
const emails = ['slot-t1-' + marker + '@example.test', 'slot-t2-' + marker + '@example.test', 'slot-c-' + marker + '@example.test'];
const ids: string[] = [];
let app: Express;
let tutor1: { cookie: string; csrf: string };
let tutor2: { cookie: string; csrf: string };
let customer: { cookie: string; csrf: string };
let seed = 0;
const nextStart = (): Date => {
  const d = new Date(Date.now() + (7 + seed++) * 86_400_000);
  d.setUTCMinutes(17, 0, 0);
  return d;
};
const newOffer = (start: Date, auth = tutor1) =>
  request(app).post('/api/v1/tutor/slots').set(headers).set('Cookie', auth.cookie)
    .set('X-CSRF-Token', auth.csrf).send({ startsAt: start.toISOString() });
const ownList = (auth = tutor1) => request(app).get('/api/v1/tutor/slots').set('Cookie', auth.cookie);
const login = async (email: string) => {
  const signedIn = await request(app).post('/api/v1/auth/login').set(headers).set('X-Forwarded-For', rateTestIp).send({ email, password });
  expect(signedIn.status).toBe(200);
  const cookie = signedIn.headers['set-cookie'][0] as string;
  const token = await request(app).get('/api/v1/auth/csrf').set('Cookie', cookie);
  expect(token.status).toBe(200);
  return { cookie, csrf: token.body.csrfToken as string };
};

beforeAll(async () => {
  const passwordHash = await argon2.hash(password);
  for (let i = 0; i < emails.length; i++) {
    const created = await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3) RETURNING "id"', [emails[i], passwordHash, i < 2 ? 'Tutor' : 'Customer']);
    ids.push(created.rows[0].id);
  }
  app = await createApp(pool, { origin, csrfKey: readKey('AUTH_CSRF_HMAC_KEY'), rateKey: readKey('AUTH_RATE_KEY'), production: false, trustedProxies: ['::ffff:127.0.0.1', '127.0.0.1', '::1'] });
  tutor1 = await login(emails[0]);
  tutor2 = await login(emails[1]);
  customer = await login(emails[2]);
}, 30_000);
afterAll(async () => { await pool.end(); });

describe('F-S1-02 real PostgreSQL Tutor Slots HTTP and persistence', () => {
  it('SLOT-01/02/14 creates a future 60-minute offer and reads same committed row from own list', async () => {
    const start = nextStart();
    const created = await newOffer(start);
    expect(created.status).toBe(201);
    expect(Object.keys(created.body.data).sort()).toEqual(['endsAt', 'id', 'lifecycle', 'occupancy', 'startsAt']);
    expect(created.body.data).toMatchObject({
      startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 3_600_000).toISOString(),
      lifecycle: 'Offered', occupancy: 'Unoccupied',
    });
    const db = await pool.query('SELECT "id","tutorId","startsAt","endsAt" FROM "Slot" WHERE "id"=$1', [created.body.data.id]);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].tutorId).toBe(ids[0]);
    expect(db.rows[0].endsAt.getTime() - db.rows[0].startsAt.getTime()).toBe(3_600_000);
    const list = await ownList();
    expect(list.status).toBe(200);
    expect(list.body.data).toContainEqual(created.body.data);
  });

  it('SLOT-03/04/05 rejects overlapping same-Tutor offers, allows adjacency and different Tutors', async () => {
    const start = nextStart();
    expect((await newOffer(start)).status).toBe(201);
    const overlapping = await newOffer(new Date(start.getTime() + 30 * 60_000));
    expect(overlapping.status).toBe(409);
    expect(overlapping.body.error.code).toBe('SLOT_OVERLAP');
    expect((await newOffer(new Date(start.getTime() + 3_600_000))).status).toBe(201);
    expect((await newOffer(start, tutor2)).status).toBe(201);
    const result = await pool.query('SELECT "tutorId","startsAt","endsAt" FROM "Slot" WHERE "startsAt" >= $1 AND "startsAt" <= $2 ORDER BY "startsAt"', [start, new Date(start.getTime() + 3_600_000)]);
    const a = result.rows.filter(r => r.tutorId === ids[0]);
    const b = result.rows.filter(r => r.tutorId === ids[1]);
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(1);
  });

  it('SLOT-07/08 denies anonymous/Customer roles, spoofed owner and unknown list filters', async () => {
    const start = nextStart();
    expect((await request(app).get('/api/v1/tutor/slots')).status).toBe(401);
    expect((await request(app).post('/api/v1/tutor/slots').set(headers).send({ startsAt: start.toISOString() })).status).toBe(401);
    expect((await newOffer(start, customer)).status).toBe(403);
    expect((await ownList(customer)).status).toBe(403);
    const forged = await request(app).post('/api/v1/tutor/slots').set(headers).set('Cookie', tutor1.cookie)
      .set('X-CSRF-Token', tutor1.csrf).send({ startsAt: start.toISOString(), tutorId: ids[1] });
    expect(forged.status).toBe(400);
    const foreignQuery = await request(app).get('/api/v1/tutor/slots?tutorId=' + ids[1]).set('Cookie', tutor1.cookie);
    expect(foreignQuery.status).toBe(400);
    const filterQuery = await request(app).get('/api/v1/tutor/slots?page=1').set('Cookie', tutor1.cookie);
    expect(filterQuery.status).toBe(400);
    const t1 = await ownList();
    expect(t1.status).toBe(200);
    expect((await ownList(tutor2)).body.data).not.toEqual(t1.body.data);
    expect((await request(app).get('/api/v1/tutor/slots/' + randomUUID()).set('Cookie', tutor1.cookie)).status).toBe(404);
  });

  it('SLOT-06/13/19 rejects past/malformed/nonzero second starts, Origin and CSRF errors without insertion', async () => {
    const start = nextStart();
    for (const input of [undefined, null, 17, {}, '2026-02-30T13:00:00+07:00', '2026-11-06T13:00:30+07:00',
      '2026-11-06T13:00:00.500+07:00', '2026-11-06T13:00+07:00', '2026-11-06T13:00:00']) {
      const r = await request(app).post('/api/v1/tutor/slots').set(headers).set('Cookie', tutor1.cookie)
        .set('X-CSRF-Token', tutor1.csrf).send({ startsAt: input });
      expect(r.status).toBe(400);
    }
    const past = new Date(Date.now() - 86_400_000); past.setUTCSeconds(0, 0);
    expect((await newOffer(past)).status).toBe(422);
    expect((await request(app).post('/api/v1/tutor/slots').set('Origin', 'https://attacker.invalid')
      .set('Cookie', tutor1.cookie).set('X-CSRF-Token', tutor1.csrf).send({ startsAt: start.toISOString() })).status).toBe(403);
    expect((await request(app).post('/api/v1/tutor/slots').set(headers)
      .set('Cookie', tutor1.cookie).send({ startsAt: start.toISOString() })).status).toBe(403);
    expect((await request(app).post('/api/v1/tutor/slots').set(headers)
      .set('Cookie', tutor2.cookie).set('X-CSRF-Token', tutor1.csrf).send({ startsAt: start.toISOString() })).status).toBe(403);
    expect((await pool.query('SELECT "id" FROM "Slot" WHERE "tutorId"=$1 AND "startsAt"=$2', [ids[0], start])).rowCount).toBe(0);
  });

  it('SLOT-12 a real SQL error after INSERT rolls back the entire uncommitted Slot transaction', async () => {
    const start = nextStart();
    const connection = await pool.connect();
    try {
      await connection.query('BEGIN');
      await connection.query('INSERT INTO "Slot"("tutorId","startsAt","endsAt") VALUES($1,$2,$3)', [
        ids[0], start, new Date(start.getTime() + 3_600_000),
      ]);
      await expect(connection.query('SELECT 1/0')).rejects.toMatchObject({ code: '22012' });
      await connection.query('ROLLBACK');
    } finally { connection.release(); }
    const persisted = await pool.query('SELECT "id" FROM "Slot" WHERE "tutorId"=$1 AND "startsAt"=$2', [ids[0], start]);
    expect(persisted.rowCount).toBe(0);
  });

  it('SLOT-12 unavailable PostgreSQL returns a safe 503 with no false 201 or committed Slot', async () => {
    const start = nextStart();
    const unreachable = new URL(process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL!);
    unreachable.port = '55419'; // Deliberately unused local test port.
    const offlinePool = new Pool({ connectionString: unreachable.toString(), connectionTimeoutMillis: 500 });
    try {
      const offlineApp = await createApp(offlinePool, {
        origin, csrfKey: readKey('AUTH_CSRF_HMAC_KEY'), rateKey: readKey('AUTH_RATE_KEY'), production: false,
      });
      const response = await request(offlineApp).post('/api/v1/tutor/slots').set(headers)
        .set('Cookie', tutor1.cookie).set('X-CSRF-Token', tutor1.csrf).send({ startsAt: start.toISOString() });
      expect(response.status).toBe(503);
      expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    } finally { await offlinePool.end(); }
    const persisted = await pool.query('SELECT "id" FROM "Slot" WHERE "tutorId"=$1 AND "startsAt"=$2', [ids[0], start]);
    expect(persisted.rowCount).toBe(0);
  });
});
