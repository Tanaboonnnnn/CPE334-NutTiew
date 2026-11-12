import {beforeAll,afterAll,expect,it} from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import {randomBytes} from 'node:crypto';
import type {Pool} from 'pg';
import {createPool,readKey} from '../src/config.js';
import {createApp} from '../src/app.js';
import {digest} from '../src/security.js';

const pool=createPool();
const id=randomBytes(8).toString('hex');
const email=`clock-${id}@example.test`,password='ClockBoundaryPassword#2026',origin='http://localhost:5173';
beforeAll(async()=>{await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3)',[email,await argon2.hash(password),'Customer']);});
afterAll(async()=>{await pool.query('DELETE FROM "User" WHERE "email"=$1',[email]);await pool.end();});

it('AUTH-19 HTTP /me responds 200/401/401 at exactly 28799/28800/28801s using injected authoritative PostgreSQL time',async()=>{
 const config={origin,csrfKey:readKey('AUTH_CSRF_HMAC_KEY'),rateKey:readKey('AUTH_RATE_KEY'),production:false,trustedProxies:['127.0.0.1','::1']};
 const live=await createApp(pool,config);
 const login=await request(live).post('/api/v1/auth/login').set('Origin',origin).set('X-Forwarded-For',`198.18.${parseInt(id.slice(0,2),16)}.${parseInt(id.slice(2,4),16)}`).send({email,password});
 expect(login.status).toBe(200);
 const cookie=login.headers['set-cookie'];
 const raw=/nuttiew_session_dev=([^;]+)/.exec(cookie[0]);expect(raw).not.toBeNull();
 let currentDbTime='',hits=0;
 // Test-only DB adapter: ONLY the Session guard's server-side now() is replaced
 // with a DB timestamp parameter; the real SQL role/revocation/user predicates run unchanged.
 // The production application code is not modified for this test.
 const clockPool={
  query:(sql:string,values?:unknown[])=>{
   if(sql.includes('SELECT s."id",s."userId"')&&sql.includes('s."expiresAt">now()')){
    hits++;
    return pool.query(sql.replace('s."expiresAt">now()','s."expiresAt">$2::timestamptz'),[...(values??[]),currentDbTime]);
   }
   return pool.query(sql,values);
  },
  connect:pool.connect.bind(pool)
 } as unknown as Pool;
 const app=await createApp(clockPool,config);
 for(const [elapsed,expected] of [[28799,200],[28800,401],[28801,401]] as const){
  // Format at PostgreSQL microsecond precision; never round-trip through JS Date.
  const time=await pool.query(
   'SELECT to_char(("expiresAt"+($2::int-28800)*interval \'1 second\') AT TIME ZONE \'UTC\',\'YYYY-MM-DD"T"HH24:MI:SS.US"Z"\') AS t FROM "Session" WHERE "tokenDigest"=$1',
   [digest(raw![1]),elapsed]
  );
  expect(time.rowCount).toBe(1);
  currentDbTime=time.rows[0].t;
  const response=await request(app).get('/api/v1/auth/me').set('Cookie',cookie);
  expect(response.status).toBe(expected);
  if(expected===200)expect(response.body.user.role).toBe('Customer');
  else expect(response.body.error.code).toBe('UNAUTHENTICATED');
 }
 expect(hits).toBe(3);
},30000);
