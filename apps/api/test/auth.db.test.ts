import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { createPool,readKey } from '../src/config.js';
import { createApp } from '../src/app.js';
import { admit, hmac, QuotaError, settle } from '../src/security.js';
import type { Express } from 'express';
const pool=createPool();let app:Express;const key=randomBytes(8).toString('hex');const email=`integration-${key}@example.test`,other=`integration-other-${key}@example.test`,password='CorrectPassword#1234',origin='http://localhost:5173';
const headers={Origin:origin};const ipHeader='192.0.2.'+(parseInt(key.slice(0,2),16)%254+1);
beforeAll(async()=>{await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3),($4,$5,$6)',[email,await argon2.hash(password),'Customer',other,await argon2.hash(password),'Tutor']);app=await createApp(pool,{origin,csrfKey:readKey('AUTH_CSRF_HMAC_KEY'),rateKey:readKey('AUTH_RATE_KEY'),production:false,trustedProxies:["::ffff:127.0.0.1","127.0.0.1","::1"]});},30000);
afterAll(async()=>{await pool.query('DELETE FROM "User" WHERE "email"=ANY($1)',[[email,other]]);await pool.end();});
describe('PostgreSQL-backed auth integration',()=>{
 it('rejects invalid input and forged Origin without creating a Session',async()=>{const a=await request(app).post('/api/v1/auth/login').set('X-Forwarded-For',ipHeader).set(headers).send({email,password,role:'Tutor'});expect(a.status).toBe(400);const b=await request(app).post('/api/v1/auth/login').set('X-Forwarded-For',ipHeader).set('Origin','https://evil.invalid').send({email,password});expect(b.status).toBe(403);});
 it('logs in, exposes only own identity, derives stable CSRF and revokes only presented Session',async()=>{const login=await request(app).post('/api/v1/auth/login').set('X-Forwarded-For',ipHeader).set(headers).send({email,password});expect(login.status).toBe(200);expect(login.body.user.role).toBe('Customer');expect(login.body.user.email).toBeUndefined();const cookie=login.headers['set-cookie'];expect(cookie).toBeDefined();const me=await request(app).get('/api/v1/auth/me').set('X-Forwarded-For',ipHeader).set('Cookie',cookie);expect(me.status).toBe(200);const token=await request(app).get('/api/v1/auth/csrf').set('X-Forwarded-For',ipHeader).set('Cookie',cookie);const again=await request(app).get('/api/v1/auth/csrf').set('X-Forwarded-For',ipHeader).set('Cookie',cookie);expect(token.body.csrfToken).toBe(again.body.csrfToken);const denied=await request(app).post('/api/v1/auth/logout').set('X-Forwarded-For',ipHeader).set(headers).set('Cookie',cookie);expect(denied.status).toBe(403);const logout=await request(app).post('/api/v1/auth/logout').set('X-Forwarded-For',ipHeader).set(headers).set('Cookie',cookie).set('X-CSRF-Token',token.body.csrfToken);expect(logout.status).toBe(204);const replay=await request(app).get('/api/v1/auth/me').set('X-Forwarded-For',ipHeader).set('Cookie',cookie);expect(replay.status).toBe(401);},30000);
 it('counts failures but not successful login in account failed bucket',async()=>{for(let i=0;i<5;i++){const result=await request(app).post('/api/v1/auth/login').set('X-Forwarded-For',ipHeader).set(headers).send({email:other,password:'wrong'});expect(result.status).toBe(401);}const last=await request(app).post('/api/v1/auth/login').set('X-Forwarded-For',ipHeader).set(headers).send({email:other,password});expect(last.status).toBe(429);const q=await pool.query('SELECT "failed","inFlight" FROM "AuthAttemptBucket" WHERE "kind"=$1 ORDER BY "failed" DESC LIMIT 1',['account']);expect(q.rows[0].failed).toBe(5);expect(q.rows[0].inFlight).toBe(0);},30000);
 it('enforces five concurrent all-correct permits and admits manual retry after successful settlement',async()=>{const rate=readKey('AUTH_RATE_KEY'),account=hmac(rate,'account','barrier-'+key),ip=hmac(rate,'ip','barrier-'+key);const pending=await Promise.all(Array.from({length:5},()=>admit(pool,account,ip)));await expect(admit(pool,account,ip)).rejects.toBeInstanceOf(QuotaError);const q1=await pool.query('SELECT "failed","inFlight" FROM "AuthAttemptBucket" WHERE "kind"=$1 AND "keyDigest"=$2',['account',account]);expect(q1.rows[0]).toMatchObject({failed:0,inFlight:5});await Promise.all(pending.map(x=>settle(pool,x,'success')));const q2=await pool.query('SELECT "failed","inFlight" FROM "AuthAttemptBucket" WHERE "kind"=$1 AND "keyDigest"=$2',['account',account]);expect(q2.rows[0]).toMatchObject({failed:0,inFlight:0});const retry=await admit(pool,account,ip);expect(await settle(pool,retry,'success')).toBe(true);},30000);
 it('enforces 20 total admitted attempts per IP across separate accounts',async()=>{const rate=readKey('AUTH_RATE_KEY'),ip=hmac(rate,'ip','shared-'+key);const reservations=await Promise.all(Array.from({length:20},(_,i)=>admit(pool,hmac(rate,'account',`distinct-${key}-${i}`),ip)));await expect(admit(pool,hmac(rate,'account','overflow-'+key),ip)).rejects.toBeInstanceOf(QuotaError);await Promise.all(reservations.map(x=>settle(pool,x,'success')));const q=await pool.query('SELECT "attempts" FROM "AuthAttemptBucket" WHERE "kind"=$1 AND "keyDigest"=$2',['ip',ip]);expect(q.rows[0].attempts).toBe(20);},30000); it('rejects oversize payload and does not allow CSRF token from another Session',async()=>{const oversize=await request(app).post('/api/v1/auth/login').set('X-Forwarded-For',ipHeader).set(headers).set('Content-Type','application/json').send(JSON.stringify({email,password:'x'.repeat(5000)}));expect(oversize.status).toBe(413);const a=await request(app).post('/api/v1/auth/login').set('X-Forwarded-For',ipHeader).set(headers).send({email,password});const b=await request(app).post('/api/v1/auth/login').set('X-Forwarded-For',ipHeader).set(headers).send({email,password});expect(a.status).toBe(200);expect(b.status).toBe(200);const tokenA=await request(app).get('/api/v1/auth/csrf').set('X-Forwarded-For',ipHeader).set('Cookie',a.headers['set-cookie']);const cross=await request(app).post('/api/v1/auth/logout').set('X-Forwarded-For',ipHeader).set(headers).set('Cookie',b.headers['set-cookie']).set('X-CSRF-Token',tokenA.body.csrfToken);expect(cross.status).toBe(403);expect((await request(app).get('/api/v1/auth/me').set('X-Forwarded-For',ipHeader).set('Cookie',b.headers['set-cookie'])).status).toBe(200);},30000);
 it('enforces 20 admitted attempts across equivalent IPv6 addresses (HTTP + PostgreSQL)',async()=>{
  const suffix=key.slice(0,4);const addr=[`2001:db8::${suffix}`,`2001:0DB8:0:0:0:0:0:${suffix}`,`2001:DB8::${suffix.toUpperCase()}`];
  const uniqueEmail=(n:number)=>`ipv6-${key}-${n}@example.test`;
  for(let n=0;n<20;n++){
   const result=await request(app).post('/api/v1/auth/login')
    .set('X-Forwarded-For',addr[n%addr.length]).set(headers)
    .send({email:uniqueEmail(n),password:'wrong'});
   expect(result.status).toBe(401);
  }
  const blocked=await request(app).post('/api/v1/auth/login')
   .set('X-Forwarded-For',addr[1]).set(headers)
   .send({email:uniqueEmail(20),password:'wrong'});
  expect(blocked.status).toBe(429);
  expect(blocked.body.error.code).toBe('RATE_LIMITED');
  const rate=readKey('AUTH_RATE_KEY');
  const bucket=hmac(rate,'ip','20010db800000000000000000000'+suffix.padStart(4,'0'));
  const found=await pool.query('SELECT "attempts" FROM "AuthAttemptBucket" WHERE "kind"=$1 AND "keyDigest"=$2',['ip',bucket]);
  expect(found.rows[0]?.attempts).toBe(20);
 },30000);
});
