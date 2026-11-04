import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import argon2 from 'argon2';
import request from 'supertest';
import { randomBytes } from 'node:crypto';
import type { Express } from 'express';
import { createApp } from '../src/app.js';
import { createPool, readKey } from '../src/config.js';
import { hmac,admit,settle } from '../src/security.js';
const pool=createPool(),tag=randomBytes(7).toString('hex'),password='ManualRetryPassword#2026',email=`barrier-${tag}@example.test`,origin='http://localhost:5173',ip='203.0.113.'+(parseInt(tag.slice(0,2),16)%254+1);
let app:Express;
beforeAll(async()=>{await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3)',[email,await argon2.hash(password),'Customer']);app=await createApp(pool,{origin,csrfKey:readKey('AUTH_CSRF_HMAC_KEY'),rateKey:readKey('AUTH_RATE_KEY'),production:false,trustedProxies:['127.0.0.1','::1']});},30000);
afterAll(async()=>{await pool.query('DELETE FROM "User" WHERE "email"=$1',[email]);await pool.end();});
const login=(pw=password)=>request(app).post('/api/v1/auth/login').set('Origin',origin).set('X-Forwarded-For',ip).send({email,password:pw});
describe('AUTH-19/22 additional deterministic DB boundary and rate-limit probes',()=>{
 it('AUTH-19 checks the exact 8h boundary against PostgreSQL authoritative timestamps',async()=>{
  const ok=await login();expect(ok.status).toBe(200);
  const q=await pool.query('SELECT "id","createdAt","expiresAt" FROM "Session" WHERE "userId"=(SELECT "id" FROM "User" WHERE "email"=$1) ORDER BY "createdAt" DESC LIMIT 1',[email]);
  const row=q.rows[0];expect(new Date(row.expiresAt).getTime()-new Date(row.createdAt).getTime()).toBe(28800000);
  // The DB computes both operands at full microsecond precision. Converting to JS Date
  // drops PostgreSQL sub-millisecond precision, which misclassifies exact expiry.
  for(const [offset,expected] of [[28799,true],[28800,false],[28801,false]] as const){
   const result=await pool.query('SELECT EXISTS(SELECT 1 FROM "Session" s JOIN "User" u ON s."userId"=u."id" WHERE s."id"=$1 AND s."expiresAt">s."createdAt" + $2::int * interval \'1 second\' AND s."revokedAt" IS NULL AND u."isActive"=true) AS live',[row.id,offset]);
   expect(result.rows[0].live).toBe(expected);
  }
 },30000);
 it('AUTH-22 deterministic five reserved all-correct permits, sixth HTTP 429 and retry after settlement',async()=>{const rate=readKey('AUTH_RATE_KEY'),account=hmac(rate,'account',email),ipDigest=hmac(rate,'ip',ip);const reservations=await Promise.all(Array.from({length:5},()=>admit(pool,account,ipDigest)));const bucket=()=>pool.query('SELECT "failed","inFlight" FROM "AuthAttemptBucket" WHERE "kind"=$1 AND "keyDigest"=$2 ORDER BY "windowStart" DESC LIMIT 1',['account',account]);const before=await bucket();expect(before.rows[0]).toMatchObject({failed:0,inFlight:5});const sixth=await login();expect(sixth.status).toBe(429);expect(sixth.body.error.code).toBe('RATE_LIMITED');expect(sixth.headers['set-cookie']).toBeUndefined();const during=await bucket();expect(during.rows[0]).toMatchObject({failed:0,inFlight:5});await Promise.all(reservations.map(x=>settle(pool,x,'success')));const after=await bucket();expect(after.rows[0]).toMatchObject({failed:0,inFlight:0});const retried=await login();expect(retried.status).toBe(200);expect(retried.headers['set-cookie']).toBeDefined();},30000);
});
