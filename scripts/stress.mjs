import { spawn } from 'node:child_process';
import { randomBytes, createHmac } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { config as loadEnv } from 'dotenv';
import pg from 'pg';
import argon2 from 'argon2';
loadEnv({path:'.env',quiet:true});
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
const tag=randomBytes(8).toString('hex');const password='StressPassword#1234';
const origin=process.env.AUTH_CANONICAL_ORIGIN??'http://localhost:5173';
const children=[];const ports=[3091,3092];
const hmac=(kind,value)=>createHmac('sha256',Buffer.from(process.env.AUTH_RATE_KEY,'hex')).update(kind+':'+value).digest();
async function wait(port){for(let i=0;i<60;i++){try{const r=await fetch(`http://127.0.0.1:${port}/api/v1/auth/me`);if(r.status===401)return;}catch{}await delay(250);}throw new Error(`API ${port} failed to start`);}
async function scenario(name,valid){const email=`stress-${name}-${tag}@example.test`;await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3)',[email,await argon2.hash(password),'Customer']);const calls=Array.from({length:40},(_,i)=>fetch(`http://127.0.0.1:${ports[i%2]}/api/v1/auth/login`,{method:'POST',headers:{'Origin':origin,'Content-Type':'application/json'},body:JSON.stringify({email,password:valid?password:'incorrect'})}));const results=await Promise.all(calls);const counts=results.reduce((m,r)=>(m[r.status]=(m[r.status]??0)+1,m),{});const q=await pool.query('SELECT "failed","inFlight" FROM "AuthAttemptBucket" WHERE "kind"=$1 AND "keyDigest"=$2 ORDER BY "windowStart" DESC LIMIT 1',['account',hmac('account',email)]);const s=await pool.query('SELECT count(*)::int AS count FROM "Session" WHERE "userId"=(SELECT "id" FROM "User" WHERE "email"=$1)',[email]);console.log(JSON.stringify({scenario:name,processes:2,requests:40,status:counts,account:q.rows[0],sessions:s.rows[0].count}));if((counts[valid?200:401]??0)!==5||(counts[429]??0)!==35||q.rows[0].failed!==(valid?0:5)||q.rows[0].inFlight!==0||s.rows[0].count!==(valid?5:0))throw new Error(name+' invariants violated');}
try{for(const port of ports){const p=spawn(process.execPath,['--import','tsx','apps/api/src/server.ts'],{cwd:process.cwd(),env:{...process.env,PORT:String(port)},stdio:'ignore',windowsHide:true});children.push(p);}await Promise.all(ports.map(wait));await scenario('all-wrong',false);await scenario('all-correct',true);console.log('MULTI_PROCESS_STRESS_PASS');}finally{for(const child of children)child.kill();await pool.query('DELETE FROM "User" WHERE "email" LIKE $1',[`stress-%-${tag}@example.test`]).catch(()=>{});await pool.end();}
