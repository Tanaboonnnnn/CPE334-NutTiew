import { config as loadEnv } from 'dotenv';
loadEnv({path:new URL('../../../.env',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,'')});
import { Pool } from 'pg';
export function readKey(name:string):Buffer {const raw=process.env[name];if(!raw || !/^[a-fA-F0-9]{64,}$/.test(raw) || raw.length%2)throw new Error(name+' must be >=32 bytes hex');return Buffer.from(raw,'hex');}
/** Migrations use DATABASE_URL; a separately granted runtime account is preferred. */
export function createPool() {const url=process.env.DATABASE_URL_APP??process.env.DATABASE_URL;if(!url)throw new Error('DATABASE_URL or DATABASE_URL_APP required');return new Pool({connectionString:url,max:12});}
