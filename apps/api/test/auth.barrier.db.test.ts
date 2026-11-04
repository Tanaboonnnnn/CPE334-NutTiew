import { beforeAll, afterAll, it, expect } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { createPool,readKey } from '../src/config.js';
import { createApp } from '../src/app.js';
import { hmac } from '../src/security.js';
const pool=createPool(),id=randomBytes(7).toString('hex'),email=`barrier-http-${id}@example.test`,password='VerifiedPassword#2026',origin='http://localhost:5173';
const ip='192.0.2.'+(parseInt(id.slice(0,2),16)%240+1);
beforeAll(async()=>{await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3)',[email,await argon2.hash(password),'Customer']);});
afterAll(async()=>{await pool.query('DELETE FROM "User" WHERE "email"=$1',[email]);await pool.end();});
it('AUTH-22: five live HTTP Argon2 checks held, sixth correct 429, manual retry succeeds',async()=>{
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 let count=0,hold=true,entered!:()=>void;const five=new Promise<void>(resolve=>{entered=resolve;});
 const credentialVerifier=async(value:string,hash:string)=>{if(hold){count++;if(count===5)entered();await gate;}return argon2.verify(hash,value);};
 const config={origin,csrfKey:readKey('AUTH_CSRF_HMAC_KEY'),rateKey:readKey('AUTH_RATE_KEY'),production:false,trustedProxies:['127.0.0.1','::1'],credentialVerifier};
 const appA=await createApp(pool,config),appB=await createApp(pool,config);
 const login=(i:number)=>request(i%2?appA:appB).post('/api/v1/auth/login').set('Origin',origin).set('X-Forwarded-For',ip).send({email,password});
 const requests=Array.from({length:5},(_,i)=>login(i).then(x=>x));
 try{
  await Promise.race([five,new Promise((_,reject)=>setTimeout(()=>reject(new Error('barrier never reached')),12000))]);
  const key=readKey('AUTH_RATE_KEY'),account=hmac(key,'account',email),address=hmac(key,'ip',ip);
  const state=async()=>({a:(await pool.query('SELECT "failed","inFlight" FROM "AuthAttemptBucket" WHERE "kind"=$1 AND "keyDigest"=$2 ORDER BY "windowStart" DESC LIMIT 1',['account',account])).rows[0],i:(await pool.query('SELECT "attempts" FROM "AuthAttemptBucket" WHERE "kind"=$1 AND "keyDigest"=$2 ORDER BY "windowStart" DESC LIMIT 1',['ip',address])).rows[0]});
  const before=await state();expect(before.a).toMatchObject({failed:0,inFlight:5});expect(before.i.attempts).toBe(5);
  const sixth=await login(6);expect(sixth.status).toBe(429);expect(sixth.headers['set-cookie']).toBeUndefined();
  const during=await state();expect(during.a).toMatchObject({failed:0,inFlight:5});expect(during.i.attempts).toBe(5);
  hold=false;release();const done=await Promise.all(requests);expect(done.every(x=>x.status===200&&x.headers['set-cookie'])).toBe(true);
  const after=await state();expect(after.a).toMatchObject({failed:0,inFlight:0});expect(after.i.attempts).toBe(5);
  const retry=await login(6);expect(retry.status).toBe(200);expect(retry.headers['set-cookie']).toBeDefined();
  const final=await state();expect(final.a).toMatchObject({failed:0,inFlight:0});expect(final.i.attempts).toBe(6);
 }finally{hold=false;release();await Promise.allSettled(requests);}
},30000);
