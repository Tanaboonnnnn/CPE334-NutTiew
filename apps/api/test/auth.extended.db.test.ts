import { afterAll,beforeAll,beforeEach,describe,expect,it } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import type { Express } from 'express';
import { createPool,readKey } from '../src/config.js';
import { createApp } from '../src/app.js';
import { admit,hmac,reapExpired,settle,QuotaError,windowStart } from '../src/security.js';
const pool=createPool(),origin='http://localhost:5173',id=randomBytes(6).toString('hex');
const email=`extended-${id}@example.test`,password='ValidPassword#1234';let app:Express;let currentIp='198.51.100.1';beforeEach(()=>{currentIp='198.51.100.'+(randomBytes(1)[0]%254+1);});
const auth=()=>request(app).post('/api/v1/auth/login').set('X-Forwarded-For',currentIp).set('Origin',origin).send({email,password});
beforeAll(async()=>{await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3)',[email,await argon2.hash(password),'Tutor']);app=await createApp(pool,{origin,csrfKey:readKey('AUTH_CSRF_HMAC_KEY'),rateKey:readKey('AUTH_RATE_KEY'),production:false,trustedProxies:["::ffff:127.0.0.1","127.0.0.1","::1"]});},30000);
afterAll(async()=>{await pool.query('DELETE FROM "User" WHERE "email"=$1',[email]);await pool.end();});
describe('additional real PostgreSQL acceptance evidence',()=>{
 it('AUTH-02 unknown and inactive account generic 401 without cookie',async()=>{const unknown=await request(app).post('/api/v1/auth/login').set('X-Forwarded-For',currentIp).set('Origin',origin).send({email:`missing-${id}@example.test`,password});const bad=await request(app).post('/api/v1/auth/login').set('X-Forwarded-For',currentIp).set('Origin',origin).send({email,password:'invalid'});expect(unknown.status).toBe(401);expect(bad.status).toBe(401);expect(unknown.body.error).toEqual(bad.body.error);expect(unknown.body.requestId).toMatch(/^[0-9a-f-]{36}$/);expect(unknown.headers['set-cookie']).toBeUndefined();expect(bad.headers['set-cookie']).toBeUndefined();await pool.query('UPDATE "User" SET "isActive"=false WHERE "email"=$1',[email]);const inactive=await auth();expect(inactive.status).toBe(401);expect(inactive.body.error).toEqual(bad.body.error);await pool.query('UPDATE "User" SET "isActive"=true WHERE "email"=$1',[email]);},30000);
 it('AUTH-03/05/06 server-derived role, A logout does not revoke B, inactive/expired sessions denied',async()=>{const a=await auth(),b=await auth();expect(a.status).toBe(200);expect(b.status).toBe(200);const ca=a.headers['set-cookie'],cb=b.headers['set-cookie'];const forged=await request(app).get('/api/v1/auth/me?role=Customer&userId=bogus').set('role','Customer').set('Cookie',ca);expect(forged.status).toBe(200);expect(forged.body.user.role).toBe('Tutor');const token=await request(app).get('/api/v1/auth/csrf').set('Cookie',ca);const logout=await request(app).post('/api/v1/auth/logout').set('Origin',origin).set('Cookie',ca).set('X-CSRF-Token',token.body.csrfToken);expect(logout.status).toBe(204);expect((await request(app).get('/api/v1/auth/me').set('Cookie',ca)).status).toBe(401);expect((await request(app).get('/api/v1/auth/me').set('Cookie',cb)).status).toBe(200);await pool.query('UPDATE "User" SET "isActive"=false WHERE "email"=$1',[email]);expect((await request(app).get('/api/v1/auth/me').set('Cookie',cb)).status).toBe(401);await pool.query('UPDATE "User" SET "isActive"=true WHERE "email"=$1',[email]);await pool.query('UPDATE "Session" SET "expiresAt"=now() WHERE "userId"=(SELECT "id" FROM "User" WHERE "email"=$1)',[email]);expect((await request(app).get('/api/v1/auth/me').set('Cookie',cb)).status).toBe(401);},30000);
 it('AUTH-13/17/18 repeat CSRF GET is stable, cross-site denied, referer fallback and wrong CSRF rejected',async()=>{const a=await auth();expect(a.status).toBe(200);const cookie=a.headers['set-cookie'];const tokens=await Promise.all(Array.from({length:10},()=>request(app).get('/api/v1/auth/csrf').set('Cookie',cookie)));expect(new Set(tokens.map(x=>x.body.csrfToken)).size).toBe(1);expect(tokens.every(x=>x.status===200 && !x.headers['set-cookie'] && x.headers['cache-control']==='no-store')).toBe(true);expect((await request(app).get('/api/v1/auth/csrf').set('Cookie',cookie).set('Sec-Fetch-Site','cross-site')).status).toBe(403);expect((await request(app).get('/api/v1/auth/csrf')).status).toBe(401);const missing=await request(app).post('/api/v1/auth/logout').set('Cookie',cookie).set('X-CSRF-Token',tokens[0].body.csrfToken);expect(missing.status).toBe(403);const hostile=await request(app).post('/api/v1/auth/logout').set('Origin','null').set('Cookie',cookie).set('X-CSRF-Token',tokens[0].body.csrfToken);expect(hostile.status).toBe(403);const wrong=await request(app).post('/api/v1/auth/logout').set('Origin',origin).set('Cookie',cookie).set('X-CSRF-Token','bad');expect(wrong.status).toBe(403);const good=await request(app).post('/api/v1/auth/logout').set('Referer',origin+'/login').set('Cookie',cookie).set('X-CSRF-Token',tokens[0].body.csrfToken);expect(good.status).toBe(204);},30000);
 it('AUTH-22 concurrent admissions across independent pools and reaper lease cleanup',async()=>{const key=readKey('AUTH_RATE_KEY'),account=hmac(key,'account','stress-'+id),ip=hmac(key,'ip','stress-'+id);const second=createPool();try{const results=await Promise.allSettled(Array.from({length:40},(_,i)=>admit(i%2?pool:second,account,ip)));const accepted=results.filter(x=>x.status==='fulfilled').map(x=>(x as PromiseFulfilledResult<Awaited<ReturnType<typeof admit>>>).value);expect(accepted.length).toBe(5);expect(results.filter(x=>x.status==='rejected').every(x=>(x as PromiseRejectedResult).reason instanceof QuotaError)).toBe(true);const before=await pool.query('SELECT "failed","inFlight" FROM "AuthAttemptBucket" WHERE "kind"=$1 AND "keyDigest"=$2',['account',account]);expect(before.rows[0]).toMatchObject({failed:0,inFlight:5});await pool.query('UPDATE "AuthAttemptReservation" SET "leaseUntil"=now()-interval \'1 second\' WHERE "id"=ANY($1)',[accepted.map(x=>x.id)]);await reapExpired(second);const after=await pool.query('SELECT "failed","inFlight" FROM "AuthAttemptBucket" WHERE "kind"=$1 AND "keyDigest"=$2',['account',account]);expect(after.rows[0]).toMatchObject({failed:0,inFlight:0});const states=await pool.query('SELECT "state" FROM "AuthAttemptReservation" WHERE "id"=ANY($1)',[accepted.map(x=>x.id)]);expect(states.rows.every(x=>x.state==='abandoned')).toBe(true);}finally{await second.end();}},30000);
 it('AUTH-20 exact UTC window rollover',async()=>{const key=readKey('AUTH_RATE_KEY'),account=hmac(key,'account','window-'+id),ip=hmac(key,'ip','window-'+id);const t=new Date('2026-11-04T10:14:59Z'),next=new Date('2026-11-04T10:15:00Z');const first=await admit(pool,account,ip,t);expect(first.start.toISOString()).toBe(windowStart(t).toISOString());await settle(pool,first,'success');const second=await admit(pool,account,ip,next);expect(second.start.toISOString()).not.toBe(first.start.toISOString());await settle(pool,second,'abandoned');},30000);
 it('AUTH-20 input boundaries and failure counts after successes',async()=>{const localEmail=`bounds-${id}@example.test`,pw='p',hash=await argon2.hash(pw);await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3)',[localEmail,hash,'Customer']);try{for(let i=0;i<3;i++){const r=await request(app).post('/api/v1/auth/login').set('X-Forwarded-For',currentIp).set('Origin',origin).send({email:localEmail,password:pw});expect(r.status).toBe(200);}for(let i=0;i<5;i++){const r=await request(app).post('/api/v1/auth/login').set('X-Forwarded-For',currentIp).set('Origin',origin).send({email:localEmail,password:'wrong'});expect(r.status).toBe(401);}expect((await request(app).post('/api/v1/auth/login').set('X-Forwarded-For',currentIp).set('Origin',origin).send({email:localEmail,password:pw})).status).toBe(429);const account=hmac(readKey('AUTH_RATE_KEY'),'account',localEmail);const q=await pool.query('SELECT "failed","inFlight" FROM "AuthAttemptBucket" WHERE "kind"=$1 AND "keyDigest"=$2',['account',account]);expect(q.rows[0]).toMatchObject({failed:5,inFlight:0});const variants=[{email:localEmail,password:''},{email:localEmail,password:'z'.repeat(129)},{email:'a@b',password:pw},{email:'a'.repeat(252)+'@b.c',password:pw}];for(const body of variants){const r=await request(app).post('/api/v1/auth/login').set('X-Forwarded-For',currentIp).set('Origin',origin).send(body);expect(r.status).toBe(400);} }finally{await pool.query('DELETE FROM "User" WHERE "email"=$1',[localEmail]);}},30000);
 it('AUTH-19 session expires at 8h boundary and never refreshes on me',async()=>{const login=await auth();expect(login.status).toBe(200);const cookie=login.headers['set-cookie'];const user=await pool.query('SELECT "id" FROM "User" WHERE "email"=$1',[email]);const sessions=await pool.query('SELECT "id","createdAt","expiresAt" FROM "Session" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1',[user.rows[0].id]);const sid=sessions.rows[0].id;expect(new Date(sessions.rows[0].expiresAt).getTime()-new Date(sessions.rows[0].createdAt).getTime()).toBe(28800000);expect((await request(app).get('/api/v1/auth/me').set('Cookie',cookie)).status).toBe(200);const again=await pool.query('SELECT "expiresAt" FROM "Session" WHERE "id"=$1',[sid]);expect(new Date(again.rows[0].expiresAt).getTime()).toBe(new Date(sessions.rows[0].expiresAt).getTime());await pool.query('UPDATE "Session" SET "expiresAt"=now() WHERE "id"=$1',[sid]);expect((await request(app).get('/api/v1/auth/me').set('Cookie',cookie)).status).toBe(401);},30000); it('AUTH-21 rotated CSRF key accepts previous session but rejects cross-version token',async()=>{const old=readKey('AUTH_CSRF_HMAC_KEY'),fresh=randomBytes(32);const oldApp=await createApp(pool,{origin,csrfKey:old,csrfKeyVersion:'v1',rateKey:readKey('AUTH_RATE_KEY'),production:false,trustedProxies:['::ffff:127.0.0.1','127.0.0.1','::1']});const a=await request(oldApp).post('/api/v1/auth/login').set('X-Forwarded-For',currentIp).set('Origin',origin).send({email,password});expect(a.status).toBe(200);const cookie=a.headers['set-cookie'];const rotated=await createApp(pool,{origin,csrfKey:fresh,csrfKeyVersion:'v2',previousCsrfKeys:{v1:old},rateKey:readKey('AUTH_RATE_KEY'),production:false});const token=await request(rotated).get('/api/v1/auth/csrf').set('Cookie',cookie);expect(token.status).toBe(200);const before=await request(oldApp).get('/api/v1/auth/csrf').set('Cookie',cookie);expect(token.body.csrfToken).toBe(before.body.csrfToken);const logout=await request(rotated).post('/api/v1/auth/logout').set('Origin',origin).set('Cookie',cookie).set('X-CSRF-Token',token.body.csrfToken);expect(logout.status).toBe(204);const noPrior=await createApp(pool,{origin,csrfKey:fresh,csrfKeyVersion:'v2',rateKey:readKey('AUTH_RATE_KEY'),production:false});const b=await request(oldApp).post('/api/v1/auth/login').set('X-Forwarded-For',currentIp).set('Origin',origin).send({email,password});expect(b.status).toBe(200);expect((await request(noPrior).get('/api/v1/auth/csrf').set('Cookie',b.headers['set-cookie'])).status).toBe(503);},30000);
 it('AUTH-12 database failure on session INSERT returns 503 with no cookie',async()=>{
  // Fault injection must own its own Pool: replacing query on a shared
  // pg.PoolClient and returning it without restoration poisoned later tests.
  // This tests the identical Auth failure path without contaminating
  // unrelated AUTH-19/CSRF/logout cases that borrow the shared test Pool.
  const faultPool=createPool();
  const brokenPool={
    query:(...args:unknown[])=>faultPool.query(...(args as Parameters<typeof faultPool.query>)),
    connect:async()=>{
      const client=await faultPool.connect();
      const original=client.query.bind(client);
      client.query=((...args:unknown[])=>{
        if(typeof args[0]==='string'&&args[0].includes('INSERT INTO "Session"'))
          throw new Error('SIMULATED_SESSION_INSERT_FAILURE');
        return (original as (...x:unknown[])=>unknown)(...args);
      }) as typeof client.query;
      return client;
    }
  } as unknown as typeof pool;
  try {
    const broken=await createApp(brokenPool,{origin,csrfKey:readKey('AUTH_CSRF_HMAC_KEY'),rateKey:readKey('AUTH_RATE_KEY'),production:false});
    const r=await request(broken).post('/api/v1/auth/login').set('X-Forwarded-For',currentIp).set('Origin',origin).send({email,password});
    expect(r.status).toBe(503);
    expect(r.headers['set-cookie']).toBeUndefined();
  } finally {
    await faultPool.end(); // Discard the deliberately patched connection.
  }
  // Regression: a fault injected in one app must never affect real Auth.
  const subsequent=await auth();
  expect(subsequent.status).toBe(200);
},30000); it('AUTH-22 expired lease immediately reconciles on next admission and late settlement cannot create a Session',async()=>{const key=readKey('AUTH_RATE_KEY'),account=hmac(key,'account','admit-repair-'+id),ip=hmac(key,'ip','admit-repair-'+id);const pending=await Promise.all(Array.from({length:5},()=>admit(pool,account,ip)));await pool.query('UPDATE "AuthAttemptReservation" SET "leaseUntil"=now()-interval \'1 second\' WHERE "id"=ANY($1)',[pending.map(x=>x.id)]);const next=await admit(pool,account,ip);expect(next.id).toBeTruthy();const check=await pool.query('SELECT "failed","inFlight" FROM "AuthAttemptBucket" WHERE "kind"=$1 AND "keyDigest"=$2',['account',account]);expect(check.rows[0]).toMatchObject({failed:0,inFlight:1});let created=false;const late=await settle(pool,pending[0],'success',async()=>{created=true;});expect(late).toBe(false);expect(created).toBe(false);await settle(pool,next,'success');},30000); it('AUTH-12 database failure on logout UPDATE yields 503 and preserves session cookie',async()=>{const fresh=await auth();expect(fresh.status).toBe(200);const cookie=fresh.headers['set-cookie'];const token=await request(app).get('/api/v1/auth/csrf').set('Cookie',cookie);const broken={query:async(...args:unknown[])=>{if(typeof args[0]==='string'&&args[0].includes('UPDATE "Session" SET "revokedAt"'))throw new Error('SIMULATED_PRIVATE_SQL_FAILURE');return pool.query(...(args as Parameters<typeof pool.query>));},connect:pool.connect.bind(pool)} as unknown as typeof pool;const brokenApp=await createApp(broken,{origin,csrfKey:readKey('AUTH_CSRF_HMAC_KEY'),rateKey:readKey('AUTH_RATE_KEY'),production:false});const result=await request(brokenApp).post('/api/v1/auth/logout').set('Cookie',cookie).set('Origin',origin).set('X-CSRF-Token',token.body.csrfToken);expect(result.status).toBe(503);expect(result.headers['set-cookie']).toBeUndefined();expect(JSON.stringify(result.body)).not.toContain('SIMULATED_PRIVATE_SQL_FAILURE');expect((await request(app).get('/api/v1/auth/me').set('Cookie',cookie)).status).toBe(200);},30000);
 it('AUTH-20 sanitized error envelope includes stable fields but no sensitive content',async()=>{const a=await request(app).post('/api/v1/auth/login').set('Origin','https://attacker.invalid').send({email,password});expect(a.status).toBe(403);expect(Object.keys(a.body).sort()).toEqual(['error','requestId']);expect(Object.keys(a.body.error).sort()).toEqual(['code','message']);expect(a.body.error.code).toBe('ORIGIN_DENIED');expect(a.body.requestId).toMatch(/^[0-9a-f-]{36}$/);expect(JSON.stringify(a.body)).not.toContain(password);},30000);
 it('AUTH-17/21 CSRF concurrent reads have no DB mutations and work after app restart',async()=>{
  const login=await auth();expect(login.status).toBe(200);
  const cookie=login.headers['set-cookie'];
  const q=await pool.query('SELECT "id" FROM "User" WHERE "email"=$1',[email]);const uid=q.rows[0].id;
  const before=await pool.query('SELECT "id","csrfNonce","csrfKeyVersion","expiresAt","revokedAt" FROM "Session" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1',[uid]);
  const restarted=await createApp(pool,{origin,csrfKey:readKey('AUTH_CSRF_HMAC_KEY'),rateKey:readKey('AUTH_RATE_KEY'),production:false});
  const tokens=await Promise.all(Array.from({length:20},(_,i)=>request(i%2?app:restarted).get('/api/v1/auth/csrf').set('Cookie',cookie)));
  expect(tokens.every(x=>x.status===200&&!x.headers['set-cookie'])).toBe(true);
  expect(new Set(tokens.map(x=>x.body.csrfToken)).size).toBe(1);
  const after=await pool.query('SELECT "id","csrfNonce","csrfKeyVersion","expiresAt","revokedAt" FROM "Session" WHERE "id"=$1',[before.rows[0].id]);
  expect(after.rows).toEqual(before.rows);
  const good=await request(restarted).post('/api/v1/auth/logout').set('Cookie',cookie).set('Origin',origin).set('X-CSRF-Token',tokens[0].body.csrfToken);
  expect(good.status).toBe(204);
 },30000);
 it('AUTH-04/14 concurrent logout only revokes the presented session, replay denied',async()=>{
  const first=await auth(),second=await auth();expect(first.status).toBe(200);expect(second.status).toBe(200);
  const a=first.headers['set-cookie'],b=second.headers['set-cookie'];
  const csrfA=await request(app).get('/api/v1/auth/csrf').set('Cookie',a);
  const outcomes=await Promise.all(Array.from({length:12},()=>request(app).post('/api/v1/auth/logout').set('Cookie',a).set('Origin',origin).set('X-CSRF-Token',csrfA.body.csrfToken)));
  expect(outcomes.some(x=>x.status===204)).toBe(true);
  expect(outcomes.every(x=>x.status===204||x.status===401)).toBe(true);
  expect((await request(app).get('/api/v1/auth/me').set('Cookie',a)).status).toBe(401);
  expect((await request(app).get('/api/v1/auth/me').set('Cookie',b)).status).toBe(200);
  const own=await pool.query('SELECT count(*)::int AS count FROM "Session" WHERE "userId"=(SELECT "id" FROM "User" WHERE "email"=$1) AND "revokedAt" IS NOT NULL',[email]);
  expect(own.rows[0].count).toBeGreaterThanOrEqual(1);
 },30000);

 it('AUTH-19 expired sessions fail at exact boundary and never slide expiry',async()=>{
  const login=await auth();expect(login.status).toBe(200);
  const cookie=login.headers['set-cookie'];
  const user=await pool.query('SELECT "id" FROM "User" WHERE "email"=$1',[email]);
  const latest=await pool.query('SELECT "id" FROM "Session" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1',[user.rows[0].id]);
  const sessionId=latest.rows[0].id;
  // DB-time probes around the elapsed-age labels. A 30-second margin avoids nondeterministic response latency; this does NOT prove exact 28,800-second boundary behavior.
  const boundaryOffsets=[{seconds:28799,margin:30,expected:200},{seconds:28800,margin:-30,expected:401},{seconds:28801,margin:-30,expected:401}];
  for(const edge of boundaryOffsets){
    await pool.query('UPDATE "Session" SET "createdAt"=now()-($2::int * interval \'1 second\'),"expiresAt"=now()+($3::int * interval \'1 second\') WHERE "id"=$1',[sessionId,edge.seconds,edge.margin]);
    const result=await request(app).get('/api/v1/auth/me').set('Cookie',cookie);
    expect(result.status).toBe(edge.expected);
  }
 },30000);

 it('AUTH-20 accepts boundary-shaped Unicode emails/password bytes without bypassing strict validation',async()=>{
  const base='unicode-'+id;
  const email254=base+'a'.repeat(254-base.length-'@example.test'.length)+'@example.test';
  const email255=base+'a'.repeat(255-base.length-'@example.test'.length)+'@example.test';
  const cases=[
   {email:'a@b',password:'x',expected:400},
   {email:email255,password:'x',expected:400},
   {email, password:'',expected:400},
   {email,password:'é'.repeat(65),expected:400},
   {email,password:'😀'.repeat(33),expected:400},
   {email, password:'z'.repeat(129),expected:400}
  ];
  for(const testCase of cases){
    const result=await request(app).post('/api/v1/auth/login').set('Origin',origin).send({email:testCase.email,password:testCase.password});
    expect(result.status).toBe(testCase.expected);
    expect(result.headers['set-cookie']).toBeUndefined();
  }
  const accepted=await request(app).post('/api/v1/auth/login').set('X-Forwarded-For',currentIp).set('Origin',origin).send({email:email254,password:'é'.repeat(64)});
  expect(accepted.status).toBe(401); // 128 UTF-8 bytes passes syntax but nonexistent account
 },30000);
});
