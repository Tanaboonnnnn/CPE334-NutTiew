import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { Pool } from 'pg';
import type { Express } from 'express';
import { createPool, readKey } from '../src/config.js';
import { createApp } from '../src/app.js';

const origin = 'http://localhost:5173';
const baseConfig = { origin, csrfKey: readKey('AUTH_CSRF_HMAC_KEY'), rateKey: readKey('AUTH_RATE_KEY'), production: false };

// Deterministic, type-safe Pool test double for the failure path: query() always
// rejects with a controlled error containing marker values that must NEVER
// appear in a readiness response. No network or real database is contacted.
const failingDouble = (message: string) =>
  ({ query: async (): Promise<never> => { throw new Error(message); } }) as unknown as Pool;

let pool: Pool;
let app: Express;
beforeAll(async () => { pool = createPool(); app = await createApp(pool, baseConfig); });
afterAll(async () => { await pool.end(); });

describe('GH-01 /api/ready readiness probe', () => {
  // READY-01/02 are genuine PostgreSQL integration tests against createPool().
  it('READY-01 returns 200 {status:ready} with a reachable database pool', async () => {
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ready' });
  });

  it('READY-02 requires no credentials, session or cookie', async () => {
    // No Origin, cookie, CSRF or auth header is supplied; the endpoint is public.
    const res = await request(app).get('/api/ready');
    expect(res.status).toBe(200);
  });

  it('READY-03 fails closed with 503 SERVICE_UNAVAILABLE when the database is down', async () => {
    const offlineApp = await createApp(failingDouble('controlled DB query failure'), baseConfig);
    const res = await request(offlineApp).get('/api/ready');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('READY-04 never leaks DB URL, password, port or SQL error text on failure', async () => {
    const sensitiveMessage = [
      'connection error to postgresql://nuttiew_runtime_marker:supersecretpw@127.0.0.1:55419/nuttiew',
      'SQL query: SELECT 1',
      'at /srv/nuttiew/app.js:1:42',
    ].join('\n');
    const offlineApp = await createApp(failingDouble(sensitiveMessage), baseConfig);
    const res = await request(offlineApp).get('/api/ready');
    expect(res.status).toBe(503);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('nuttiew_runtime_marker');
    expect(text).not.toContain('supersecretpw');
    expect(text).not.toContain('55419');
    expect(text).not.toContain('SELECT');
    expect(text).not.toContain('/srv/nuttiew');
    expect(text).not.toContain('password');
    expect(res.body).not.toHaveProperty('stack');
    // Only the standard, minimal error envelope is returned.
    expect(Object.keys(res.body.error)).toEqual(['code', 'message']);
    expect(Object.keys(res.body)).toEqual(['error', 'requestId']);
  });
});