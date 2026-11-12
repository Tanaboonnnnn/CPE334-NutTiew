import { Pool } from 'pg';
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT_ENV = resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env');

/** Load the documented repo-root .env deterministically, independent of npm workspace CWD. */
export function loadRootEnv(path: string = REPO_ROOT_ENV): void {
  dotenv.config({ path, override: false });
}

// Both the API process and Prisma seed import this module before reading config.
loadRootEnv();

export function readKey(name:string):Buffer {const raw=process.env[name];if(!raw || !/^[a-fA-F0-9]{64,}$/.test(raw) || raw.length%2)throw new Error(name+' must be >=32 bytes hex');return Buffer.from(raw,'hex');}

/** API runtime must always use an explicitly provisioned non-owner credential. */
export function createPool() {
  const url=process.env.DATABASE_URL_APP;
  if(!url) throw new Error('DATABASE_URL_APP is required for API runtime; DATABASE_URL is reserved for migrations/admin');
  if(url===process.env.DATABASE_URL) throw new Error('DATABASE_URL_APP must not use the migration/admin credential');
  return new Pool({connectionString:url,max:12});
}
