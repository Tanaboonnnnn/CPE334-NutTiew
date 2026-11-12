import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import { createPool } from '../src/config.js';

// A real API OS process restart is different from a browser page refresh.
// The test-only server binds an ephemeral localhost port and uses the same
// disposable Postgres database before/after its process is terminated.
const pool = createPool();
const origin = 'http://localhost:5173';
const email = 'slot-process-' + randomUUID().slice(0, 12) + '@example.test';
const password = 'SlotRestart#2026';
const ipHex = randomUUID().replaceAll('-', '');
const testIp = '2001:db8:' + ipHex.slice(0, 4) + ':' + ipHex.slice(4, 8) + '::7';
let server: ChildProcess | undefined;

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
    } catch { /* Expected while Node initializes the Express API process. */ }
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
  await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3)',
    [email, await argon2.hash(password), 'Tutor']);
}, 30_000);
afterAll(async () => {
  await stopServer();
  await pool.end();
});

describe('SLOT-02/14 real API process restart with committed PostgreSQL persistence', () => {
  it('committed Slot survives a terminated and freshly started Node API process', async () => {
    const port = await unusedPort();
    const base = await startServer(port);
    const login = await fetch(base + '/api/v1/auth/login', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Forwarded-For': testIp },
      body: JSON.stringify({ email, password }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toBeTruthy();
    const csrfResponse = await fetch(base + '/api/v1/auth/csrf', { headers: { Cookie: cookie! } });
    expect(csrfResponse.status).toBe(200);
    const { csrfToken } = await csrfResponse.json() as { csrfToken: string };
    const future = new Date(Date.now() + 40 * 86_400_000);
    future.setUTCMinutes(17, 0, 0);
    const created = await fetch(base + '/api/v1/tutor/slots', {
      method: 'POST',
      headers: { Origin: origin, Cookie: cookie!, 'X-CSRF-Token': csrfToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startsAt: future.toISOString() }),
    });
    expect(created.status).toBe(201);
    const { data: slot } = await created.json() as { data: { id: string; startsAt: string; endsAt: string } };
    const committed = await pool.query<{ id: string }>('SELECT "id" FROM "Slot" WHERE "id"=$1', [slot.id]);
    expect(committed.rows).toHaveLength(1);
    await stopServer(); // Actual OS-process exit, not an HTTP request or page reload.
    const restarted = await startServer(port);
    const listed = await fetch(restarted + '/api/v1/tutor/slots', { headers: { Cookie: cookie! } });
    expect(listed.status).toBe(200);
    const { data: slots } = await listed.json() as { data: Array<{ id: string; startsAt: string; endsAt: string }> };
    expect(slots).toContainEqual(expect.objectContaining({
      id: slot.id, startsAt: slot.startsAt, endsAt: slot.endsAt,
    }));
    console.info('SLOT_API_RESTART_PERSISTENCE', JSON.stringify({ slotId: slot.id, beforeAndAfterSameDb: true }));
  }, 45_000);
});
