#!/usr/bin/env node
// NutTiew local Compose one-shot DB initialization (GH-02, Issue #61).
// Runs in the `migrate` container as the migration/admin role (DATABASE_URL).
//   1. waits for the database to accept connections
//   2. applies the forward-only Prisma migrations (prisma migrate deploy)
//   3. grants the least-privilege runtime role the exact NutTiew table rights
//
// The runtime role is granted ONLY the permissions the API uses; Slot/Booking
// receive no broad UPDATE/DELETE/TRUNCATE, and no trigger/constraint is bypassed.
import { spawnSync } from 'node:child_process';
import pg from 'pg';

const ownerUrl = process.env.DATABASE_URL;
if (!ownerUrl) {
  console.error('DATABASE_URL (migration/admin) is required for the migrate step.');
  process.exit(1);
}

const maxTries = 30;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Waits for the database using a SINGLE pool. pg reclaims a failed connection
// internally, so retrying the same pool genuinely reconnects after a transient
// outage - do not pool.end() between attempts (that closed pool could never
// reconnect). The pool is closed exactly once in the finally block.
async function waitForDb() {
  const pool = new pg.Pool({ connectionString: ownerUrl, connectionTimeoutMillis: 2000, max: 1 });
  let closed = false;
  const closePool = async () => {
    if (!closed) {
      closed = true;
      await pool.end();
    }
  };
  try {
    for (let i = 0; i < maxTries; i++) {
      try {
        await pool.query('SELECT 1');
        console.log('Database is reachable.');
        return;
      } catch (err) {
        console.log(`Waiting for database (${i + 1}/${maxTries})...`);
        await sleep(2000);
      }
    }
    // Exhausted retries: signal failure so the caller stops (non-zero exit).
    throw new Error('Database not reachable after retries.');
  } finally {
    await closePool();
  }
}

function runMigrations() {
  const res = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: '/app/apps/api',
    stdio: 'inherit',
    env: process.env,
  });
  if (res.error || res.status !== 0) {
    console.error(`prisma migrate deploy failed (status=${res.status}).`);
    process.exit(1);
  }
  console.log('Prisma migrations applied.');
}

async function applyGrants() {
  // Authenticated as the owner; grants tables that the migration just created.
  const pool = new pg.Pool({ connectionString: ownerUrl, max: 1 });
  try {
    const grants = [
      'GRANT CONNECT ON DATABASE nuttiew TO nuttiew_runtime',
      'GRANT USAGE ON SCHEMA public TO nuttiew_runtime',
      'GRANT SELECT, INSERT, UPDATE, DELETE ON "User", "Session", "AuthAttemptBucket", "AuthAttemptReservation" TO nuttiew_runtime',
      'GRANT SELECT, INSERT ON "Slot", "Booking" TO nuttiew_runtime',
      // Column-level UPDATE(id) on Slot lets runtime acquire SELECT ... FOR UPDATE
      // row locks; the slot_s1 trigger still rejects every Slot UPDATE/DELETE.
      'GRANT UPDATE ("id") ON "Slot" TO nuttiew_runtime',
    ];
    for (const sql of grants) {
      await pool.query(sql);
    }
    console.log('Least-privilege runtime grants applied.');
  } finally {
    await pool.end();
  }
}

async function main() {
  try {
    await waitForDb();
    runMigrations();
    await applyGrants();
    console.log('NutTiew database initialization complete.');
  } catch (err) {
    console.error(String(err && err.message ? err.message : err));
    process.exit(1);
  }
}

await main();