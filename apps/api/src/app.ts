import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import type { Pool } from 'pg';
import { admit, csrf, digest, hmac, QuotaError, randomToken, safeTokenMatch, settle, verifyPassword } from './security.js';

type Config = { origin:string; csrfKey:Buffer; rateKey:Buffer; production:boolean; trustedProxies?:string[] };
const code=(res:Response,status:number,error:string)=>res.status(status).json({error:{code:error}});
const cookieName=(c:Config)=>c.production?'nuttiew_session':'nuttiew_session_dev';
const cookieOptions=(c:Config)=>({httpOnly:true,secure:c.production,sameSite:'lax' as const,path:'/' as const});
const canonical=(v:string)=>{try{return new URL(v).origin;}catch{return null;}};
function allowedOrigin(req:Request,c:Config) {if(req.headers['sec-fetch-site']==='cross-site')return false;const origin=req.headers.origin;if(origin!==undefined)return origin===c.origin;const referer=req.headers.referer;return typeof referer==='string' && canonical(referer)===c.origin;}
function ipFor(req:Request,c:Config) { // express req.ip is remote socket unless the remote peer is on the explicit allowlist
 const remote=req.socket.remoteAddress??'unknown';const forwarded=req.headers['x-forwarded-for'];if(c.trustedProxies?.includes(remote) && typeof forwarded==='string'){const first=forwarded.split(',')[0]?.trim();if(first && first.length<100)return first;}return remote;
}
function identity(row:{id:string;role:string}){return {user:{id:row.id,role:row.role}};}
export async function createApp(pool:Pool, config:Config) {
 const app=express();app.disable('x-powered-by');app.use(cookieParser());
 app.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
 app.use(express.json({limit:'4kb',strict:true}));
 const dummy=await argon2.hash(randomToken(),{type:argon2.argon2id});
 type SessionRow={id:string;role:string;userId:string;csrfNonce:Buffer;csrfKeyVersion:string;expiresAt:Date};
 async function principal(req:Request):Promise<SessionRow|null>{const raw=req.cookies?.[cookieName(config)];if(typeof raw!=='string'||!/^[a-zA-Z0-9_-]{43}$/.test(raw))return null;const q=await pool.query('SELECT s."id",s."userId",s."csrfNonce",s."csrfKeyVersion",s."expiresAt",u."role" FROM "Session" s JOIN "User" u ON u."id"=s."userId" WHERE s."tokenDigest"=$1 AND s."revokedAt" IS NULL AND s."expiresAt">now() AND u."isActive"=true',[digest(raw)]);return q.rows[0]??null;}
 const withSession=(handler:(req:Request,res:Response,session:SessionRow)=>Promise<void>)=>async(req:Request,res:Response)=>{try{const s=await principal(req);if(!s)return void code(res,401,'UNAUTHENTICATED');await handler(req,res,s);}catch{code(res,503,'SERVICE_UNAVAILABLE');}};
 app.post('/api/v1/auth/login',async(req,res)=>{if(!allowedOrigin(req,config))return void code(res,403,'ORIGIN_DENIED');const body=req.body;const valid=body && typeof body==='object' && !Array.isArray(body) && Object.keys(body).sort().join(',')==='email,password' && typeof body.email==='string' && typeof body.password==='string';if(!valid)return void code(res,400,'INVALID_INPUT');const email=body.email.trim().toLowerCase(),password=body.password;const bytes=Buffer.byteLength(password,'utf8');if([...email].length<3||[...email].length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||bytes<1||bytes>128)return void code(res,400,'INVALID_INPUT');
 let reservation;try{reservation=await admit(pool,hmac(config.rateKey,'account',email),hmac(config.rateKey,'ip',ipFor(req,config)));}catch(e){return void code(res,e instanceof QuotaError?429:503,e instanceof QuotaError?'RATE_LIMITED':'SERVICE_UNAVAILABLE');}
 try{const q=await pool.query('SELECT "id","role","passwordHash","isActive" FROM "User" WHERE "email"=$1',[email]);const user=q.rows[0];let matched=false;try{matched=await verifyPassword(password,user?.passwordHash??dummy);}catch{matched=false;}
 const good=matched && user?.isActive===true;const token=good?randomToken():null;const nonce=good?randomBytes(32):null;
 const accepted=await settle(pool,reservation,good?'success':'failed',good?async c=>{await c.query('INSERT INTO "Session"("userId","tokenDigest","csrfNonce","csrfKeyVersion","expiresAt") VALUES($1,$2,$3,$4,now()+interval \'8 hours\')',[user.id,digest(token!),nonce,'v1']);}:undefined);
 if(!good||!accepted)return void code(res,good?503:401,good?'SERVICE_UNAVAILABLE':'LOGIN_FAILED');
 res.cookie(cookieName(config),token!,{...cookieOptions(config),maxAge:28800000});res.status(200).json(identity(user));
 }catch{try{await settle(pool,reservation,'abandoned');}catch{}code(res,503,'SERVICE_UNAVAILABLE');}
 });
 app.get('/api/v1/auth/me',withSession(async(_req,res,s)=>{res.json(identity({id:s.userId,role:s.role}));}));
 app.get('/api/v1/auth/csrf',withSession(async(req,res,s)=>{if(req.headers['sec-fetch-site']==='cross-site')return void code(res,403,'ORIGIN_DENIED');if(s.csrfKeyVersion!=='v1')return void code(res,503,'SERVICE_UNAVAILABLE');res.json({csrfToken:csrf(config.csrfKey,s.id,s.csrfNonce)});}));
 app.post('/api/v1/auth/logout',withSession(async(req,res,s)=>{if(!allowedOrigin(req,config))return void code(res,403,'ORIGIN_DENIED');if(req.body && (typeof req.body!=='object' || Array.isArray(req.body) || Object.keys(req.body).length>0))return void code(res,400,'INVALID_INPUT');if(!safeTokenMatch(req.headers['x-csrf-token'],csrf(config.csrfKey,s.id,s.csrfNonce)))return void code(res,403,'CSRF_DENIED');await pool.query('UPDATE "Session" SET "revokedAt"=now() WHERE "id"=$1 AND "revokedAt" IS NULL',[s.id]);res.clearCookie(cookieName(config),cookieOptions(config));res.status(204).end();}));
 app.use((err:unknown,_req:Request,res:Response,_next:NextFunction)=>{if(res.headersSent)return;const e=err as {type?:string;status?:number};code(res,e.type==='entity.too.large'?413:e.status===400?400:500,e.type==='entity.too.large'?'INVALID_INPUT':e.status===400?'INVALID_INPUT':'INTERNAL_ERROR');});
 return app;
}
