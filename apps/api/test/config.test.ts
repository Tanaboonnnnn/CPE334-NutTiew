import { afterEach, describe, expect, it, vi } from 'vitest';

const originalApp = process.env.DATABASE_URL_APP;
const originalAdmin = process.env.DATABASE_URL;
afterEach(() => {
  if (originalApp === undefined) delete process.env.DATABASE_URL_APP;
  else process.env.DATABASE_URL_APP = originalApp;
  if (originalAdmin === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalAdmin;
  vi.resetModules();
});

describe('API database runtime credential boundary', () => {
  it('fails closed when DATABASE_URL_APP is unset even if migration DATABASE_URL exists', async () => {
    delete process.env.DATABASE_URL_APP;
    process.env.DATABASE_URL = 'postgresql://migration-owner@localhost/db';
    const { createPool } = await import('../src/config.js');
    expect(() => createPool()).toThrow(/DATABASE_URL_APP is required/);
  });
  it('rejects DATABASE_URL_APP falling back to the migration/admin credential', async () => {
    process.env.DATABASE_URL = 'postgresql://migration-owner@localhost/db';
    process.env.DATABASE_URL_APP = process.env.DATABASE_URL;
    const { createPool } = await import('../src/config.js');
    expect(() => createPool()).toThrow(/must not use the migration\/admin credential/);
  });
  it('creates the API pool only from an explicit separate runtime credential', async () => {
    process.env.DATABASE_URL = 'postgresql://migration-owner@localhost/db';
    process.env.DATABASE_URL_APP = 'postgresql://runtime@localhost/db';
    const { createPool } = await import('../src/config.js');
    const pool = createPool();
    expect(pool.options.connectionString).toBe(process.env.DATABASE_URL_APP);
    await pool.end();
  });
});
