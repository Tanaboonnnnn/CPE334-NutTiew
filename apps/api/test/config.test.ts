import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Import once before mutating process.env. config.ts may load the real repo-root
// .env here; tests then control the environment explicitly and restore it.
import { createPool, loadRootEnv } from '../src/config.js';

const originalApp = process.env.DATABASE_URL_APP;
const originalAdmin = process.env.DATABASE_URL;
const originalHmac = process.env.AUTH_CSRF_HMAC_KEY;

afterEach(() => {
  for (const [key,value] of Object.entries({
    DATABASE_URL_APP:originalApp,
    DATABASE_URL:originalAdmin,
    AUTH_CSRF_HMAC_KEY:originalHmac,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key]=value;
  }
});

describe('API database runtime credential boundary', () => {
  it('fails closed when DATABASE_URL_APP is unset even if migration DATABASE_URL exists', () => {
    delete process.env.DATABASE_URL_APP;
    process.env.DATABASE_URL = 'postgresql://migration-owner@localhost/db';
    expect(() => createPool()).toThrow(/DATABASE_URL_APP is required/);
  });

  it('rejects DATABASE_URL_APP falling back to the migration/admin credential', () => {
    process.env.DATABASE_URL = 'postgresql://migration-owner@localhost/db';
    process.env.DATABASE_URL_APP = process.env.DATABASE_URL;
    expect(() => createPool()).toThrow(/must not use the migration\\/admin credential/);
  });

  it('creates the API pool only from an explicit separate runtime credential', async () => {
    process.env.DATABASE_URL = 'postgresql://migration-owner@localhost/db';
    process.env.DATABASE_URL_APP = 'postgresql://runtime@localhost/db';
    const pool = createPool();
    expect(pool.options.connectionString).toBe(process.env.DATABASE_URL_APP);
    await pool.end();
  });

  it('loads a root .env fixture independent of workspace CWD without overriding exported env', () => {
    delete process.env.DATABASE_URL_APP;
    delete process.env.AUTH_CSRF_HMAC_KEY;
    const root = mkdtempSync(join(tmpdir(),'nuttiew-root-env-'));
    const envPath = join(root,'.env');
    writeFileSync(envPath,[
      'DATABASE_URL_APP=postgresql://runtime-from-root@localhost/db',
      'AUTH_CSRF_HMAC_KEY='+'a'.repeat(64),
      '',
    ].join('\\n'));
    try {
      loadRootEnv(envPath);
      expect(process.env.DATABASE_URL_APP).toBe('postgresql://runtime-from-root@localhost/db');
      expect(process.env.AUTH_CSRF_HMAC_KEY).toBe('a'.repeat(64));
      process.env.DATABASE_URL_APP='postgresql://explicit-shell@localhost/db';
      loadRootEnv(envPath);
      expect(process.env.DATABASE_URL_APP).toBe('postgresql://explicit-shell@localhost/db');
    } finally {
      rmSync(root,{recursive:true,force:true});
    }
  });
});
