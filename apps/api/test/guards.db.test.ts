import { afterAll,beforeAll,describe,expect,it } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { createPool } from '../src/config.js';
import { requireSession,requireRole,requireOwnedResource,getPrincipal } from '../src/guards.js';
import { createApp } from '../src/app.js';
const pool=createPool(),suffix=randomBytes(5).toString('hex'),pw='GuardPassword#123';
const users=[`guard-c-${suffix}@example.test`,`guard-t-${suffix}@example.test`,`guard-t2-${suffix}@example.test`];
const ids=new Map<string,string>();let cookieC:string,cookieT:string;
const fail=(res:express.Response,status:number,code:string)=>{res.status(status).json({error:{code}});};
beforeAll(async()=>{for(const [i,email] of users.entries()){const q=await pool.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3) RETURNING "id"',[email,await argon2.hash(pw),i===0?'Customer':'Tutor']);ids.set(email,q.rows[0].id);}const app=await createApp(pool,{origin:'http://localhost:5173',csrfKey:randomBytes(32),rateKey:randomBytes(32),production:false});for(const [email,store] of [[users[0],'customer'],[users[1],'tutor']] as const){const r=await request(app).post('/api/v1/auth/login').set('Origin','http://localhost:5173').send({email,password:pw});expect(r.status).toBe(200);if(store==='customer')cookieC=r.headers['set-cookie'][0];else cookieT=r.headers['set-cookie'][0];}},30000);
afterAll(async()=>{await pool.query('DELETE FROM "User" WHERE "email"=ANY($1)',[users]);await pool.end();});
describe('reusable Part F server-trusted guards; no Slot/Booking feature created',()=>{
 it('requires authenticated DB principal before trusted Tutor role',async()=>{const app=express();app.use(cookieParser());app.get('/test',requireSession(pool,'nuttiew_session_dev',fail),requireRole('Tutor',fail),(req,res)=>res.json({id:getPrincipal(req)?.userId}));expect((await request(app).get('/test').set('role','Tutor')).status).toBe(401);expect((await request(app).get('/test').set('Cookie',cookieC).set('role','Tutor')).status).toBe(403);const tutor=await request(app).get('/test').set('Cookie',cookieT).set('role','Customer');expect(tutor.status).toBe(200);expect(tutor.body.id).toBe(ids.get(users[1]));});
 it('uses a DB owner-filtered predicate; foreign and missing both 404',async()=>{const app=express();app.use(cookieParser());app.get('/owned/:id',requireSession(pool,'nuttiew_session_dev',fail),requireRole('Tutor',fail),requireOwnedResource(async(principal,req)=>{const q=await pool.query('SELECT "id" FROM "User" WHERE "id"=$1 AND "id"=$2 AND "role"=$3',[req.params.id,principal.userId,'Tutor']);return q.rows[0]??null;},fail,(req,value)=>{(req as express.Request & {owned:{id:string}}).owned=value;}),(req,res)=>res.json({id:(req as express.Request & {owned:{id:string}}).owned.id}));const own=ids.get(users[1])!,foreign=ids.get(users[2])!;expect((await request(app).get('/owned/'+own).set('Cookie',cookieT).set('userId',foreign)).status).toBe(200);const a=await request(app).get('/owned/'+foreign).set('Cookie',cookieT).set('userId',foreign);const b=await request(app).get('/owned/00000000-0000-4000-8000-000000000000').set('Cookie',cookieT);expect(a.status).toBe(404);expect(a.body).toEqual(b.body);});
});
