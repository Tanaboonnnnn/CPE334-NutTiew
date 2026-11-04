import { createHmac, createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';
import type { Pool, PoolClient } from 'pg';

export const digest = (token: Buffer | string) => createHash('sha256').update(token).digest();
export const hmac = (key: Buffer, kind: string, value: string) => createHmac('sha256', key).update(kind + ':' + value).digest();
export const windowStart = (date = new Date()) => new Date(Math.floor(date.getTime() / 900000) * 900000);
export const randomToken = () => randomBytes(32).toString('base64url');
export const csrf = (key: Buffer, id: string, nonce: Buffer) => createHmac('sha256', key).update('NutTiew-CSRF-v1').update(Buffer.from([0])).update(Buffer.from(id.replaceAll('-', ''), 'hex')).update(nonce).digest('base64url');
export const safeTokenMatch = (actual: unknown, expected: string) => { if (typeof actual !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(actual)) return false; const a = Buffer.from(actual, 'base64url'); const b = Buffer.from(expected, 'base64url'); return a.length === b.length && timingSafeEqual(a,b); };
export type Reservation = { id: string; account: Buffer; ip: Buffer; start: Date };
export class QuotaError extends Error { constructor() { super('RATE_LIMITED'); } }
export async function transaction<T>(pool: Pool, fn: (c: PoolClient)=>Promise<T>):Promise<T> { const c=await pool.connect();try {await c.query('BEGIN');const value=await fn(c);await c.query('COMMIT');return value;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();} }
// All instances lock the same account row before the IP row; no locks span Argon2.
export async function admit(pool:Pool, account:Buffer, ip:Buffer, now=new Date()):Promise<Reservation> { const start=windowStart(now); return transaction(pool,async c=>{
 for(const [kind,key] of [['account',account],['ip',ip]] as const) await c.query('INSERT INTO "AuthAttemptBucket"("kind","keyDigest","windowStart") VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[kind,key,start]);
 const a=await c.query('SELECT "failed","inFlight" FROM "AuthAttemptBucket" WHERE "kind"=$1 AND "keyDigest"=$2 AND "windowStart"=$3 FOR UPDATE',['account',account,start]);
 const i=await c.query('SELECT "attempts" FROM "AuthAttemptBucket" WHERE "kind"=$1 AND "keyDigest"=$2 AND "windowStart"=$3 FOR UPDATE',['ip',ip,start]);
 if(a.rows[0].failed+a.rows[0].inFlight>=5 || i.rows[0].attempts>=20) throw new QuotaError();
 await c.query('UPDATE "AuthAttemptBucket" SET "inFlight"="inFlight"+1 WHERE "kind"=$1 AND "keyDigest"=$2 AND "windowStart"=$3',['account',account,start]);
 await c.query('UPDATE "AuthAttemptBucket" SET "attempts"="attempts"+1 WHERE "kind"=$1 AND "keyDigest"=$2 AND "windowStart"=$3',['ip',ip,start]);
 const out=await c.query('INSERT INTO "AuthAttemptReservation"("accountKeyDigest","ipKeyDigest","windowStart","leaseUntil") VALUES($1,$2,$3,$4) RETURNING "id"',[account,ip,start,new Date(now.getTime()+60000)]);
 return {id:out.rows[0].id,account,ip,start};
 }); }
export async function settle(pool:Pool, reservation:Reservation, outcome:'success'|'failed'|'abandoned', onSuccess?: (c:PoolClient)=>Promise<void>):Promise<boolean> { return transaction(pool,async c=>{
 const q=await c.query('SELECT "state","leaseUntil" FROM "AuthAttemptReservation" WHERE "id"=$1 FOR UPDATE',[reservation.id]);
 if(q.rowCount!==1 || q.rows[0].state!=='pending') return false;
 const actual=Date.now()>new Date(q.rows[0].leaseUntil).getTime()?'abandoned':outcome;
 // Serialize with admission on the same account row; the reservation row prevents duplicate settlement.
 const b=await c.query('UPDATE "AuthAttemptBucket" SET "inFlight"="inFlight"-1,"failed"="failed"+$4 WHERE "kind"=$1 AND "keyDigest"=$2 AND "windowStart"=$3 AND "inFlight">0 RETURNING "inFlight"',['account',reservation.account,reservation.start,actual==='failed'?1:0]);
 if(b.rowCount!==1) throw new Error('RESERVATION_COUNTER_INVARIANT');
 await c.query('UPDATE "AuthAttemptReservation" SET "state"=$2,"settledAt"=now() WHERE "id"=$1',[reservation.id,actual]);
 if(actual==='success' && onSuccess) await onSuccess(c);
 return actual==='success';
 }); }
export async function reapExpired(pool:Pool):Promise<number> { const q=await pool.query('SELECT "id","accountKeyDigest","ipKeyDigest","windowStart" FROM "AuthAttemptReservation" WHERE "state"=$1 AND "leaseUntil"<now() ORDER BY "leaseUntil" LIMIT 100',['pending']);let count=0;for(const row of q.rows){const result=await settle(pool,{id:row.id,account:row.accountKeyDigest,ip:row.ipKeyDigest,start:row.windowStart},'abandoned');void result;count++;}return count;}
export async function verifyPassword(password:string,hash:string) {return argon2.verify(hash,password);}
