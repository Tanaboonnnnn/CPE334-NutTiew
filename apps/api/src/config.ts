import { config as loadEnv } from 'dotenv';
loadEnv({path:new URL('../../../.env',import.meta.url).pathname.replace(/^\/(?=[A-Za-z]:)/,'')});
import { Pool } from 'pg';
export function readKey(name:string):Buffer {const raw=process.env[name];if(!raw || !/^[a-fA-F0-9]{64,}$/.test(raw) || raw.length%2)throw new Error(name+' must be >=32 bytes hex');return Buffer.from(raw,'hex');}
export function createPool() {if(!process.env.DATABASE_URL)throw new Error('DATABASE_URL required');return new Pool({connectionString:process.env.DATABASE_URL,max:12});}
