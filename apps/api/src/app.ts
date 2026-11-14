import { requireSession,requireRole,getPrincipal } from './guards.js';
import { clientIp } from './client-ip.js';
import { parseSlotStart } from './slot-time.js';
import { listOwnSlots, publishOwnSlot, SlotError } from './slots.js';
import { listCustomerAvailability } from './availability.js';
import { BookingError, createCustomerBooking, isValidUuid, type BookingAdapterHooks } from './bookings.js';
import { listCustomerBookings, getCustomerBookingDetail, listTutorScheduleBookings } from './retrieval.js';
import express, { type Request, type Response, type NextFunction, type RequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import type { Pool } from 'pg';
import { admit, csrf, digest, hmac, QuotaError, randomToken, safeTokenMatch, settle, verifyPassword } from './security.js';

type Config = { origin:string; csrfKey:Buffer; csrfKeyVersion?:string; previousCsrfKeys?:Record<string,Buffer>; rateKey:Buffer; production:boolean; trustedProxies?:string[]; credentialVerifier?:typeof verifyPassword; availabilityClock?:()=>Date|Promise<Date>; bookingHooks?:BookingAdapterHooks };
const messages:Record<string,string>={INVALID_INPUT:'Invalid request',LOGIN_FAILED:'Invalid credentials',UNAUTHENTICATED:'Authentication required',FORBIDDEN:'Access denied',NOT_FOUND:'Not found',SLOT_NOT_FOUND:'Slot not found',BOOKING_NOT_FOUND:'Booking not found',ORIGIN_DENIED:'Request origin denied',CSRF_DENIED:'CSRF verification failed',SESSION_BINDING_MISMATCH:'Session binding mismatch',RATE_LIMITED:'Too many login attempts',SLOT_INVALID_TIME:'Slot must start in the future',SLOT_OVERLAP:'Slot overlaps an existing offer',SLOT_UNAVAILABLE:'Selected slot is unavailable',CUSTOMER_OVERLAP:'Customer has an overlapping booking',BOOKING_NOT_ELIGIBLE:'Slot is no longer eligible for booking',TRANSACTION_RETRY_EXHAUSTED:'Transaction retry budget exhausted',BOOKING_OUTCOME_UNKNOWN:'Booking outcome could not be confirmed',SERVICE_UNAVAILABLE:'Service temporarily unavailable',INTERNAL_ERROR:'Request failed'};
const code=(res:Response,status:number,error:string)=>res.status(status).json({error:{code:error,message:messages[error]??'Request failed'},requestId:res.locals.requestId??randomUUID()});
const cookieName=(c:Config)=>c.production?'nuttiew_session':'nuttiew_session_dev';
const cookieOptions=(c:Config)=>({httpOnly:true,secure:c.production,sameSite:'lax' as const,path:'/' as const});
const canonical=(v:string)=>{try{return new URL(v).origin;}catch{return null;}};
function allowedOrigin(req:Request,c:Config) {if(req.headers['sec-fetch-site']==='cross-site')return false;const origin=req.headers.origin;if(origin!==undefined)return origin===c.origin;const referer=req.headers.referer;return typeof referer==='string' && canonical(referer)===c.origin;}
function sessionCsrfKey(c:Config,version:string):Buffer|null {return version===(c.csrfKeyVersion??'v1')?c.csrfKey:(c.previousCsrfKeys?.[version]??null);}
// Non-credential, per-session response binding for the same-origin UI.
// The HttpOnly token stays private; neither the Slot DTO nor its owner changes.
const sessionBinding=(userId:string,sessionId:string)=>createHash('sha256').update('nuttiew-ui-binding:v1\0'+userId+'\0'+sessionId).digest('base64url');
function identity(row:{id:string;role:string}){return {user:{id:row.id,role:row.role}};}
export async function createApp(pool:Pool, config:Config) {
 const app=express();app.disable('x-powered-by');app.use(cookieParser());
 app.use((req,res,next)=>{res.locals.requestId=randomUUID();res.setHeader('Cache-Control','no-store');next();});
 app.use(express.json({limit:'4kb',strict:true}));
 // Unauthenticated liveness/readiness for container-orchestrator probes. Runs a
 // harmless query against the injected runtime pool; never returns DB URLs,
 // passwords, SQL errors, stack traces or other internal infrastructure detail.
 app.get('/api/ready',async(_req,res)=>{try{await pool.query('SELECT 1');res.status(200).json({status:'ready'});}catch{code(res,503,'SERVICE_UNAVAILABLE');}});
 const dummy=await argon2.hash(randomToken(),{type:argon2.argon2id});
 const guard=requireSession(pool,cookieName(config),(res,status,error)=>{code(res,status,error);});
 const withSession=(handler:(req:Request,res:Response,s:{id:string;userId:string;role:'Customer'|'Tutor';csrfNonce:Buffer;csrfKeyVersion:string})=>Promise<void>):RequestHandler[]=>[
  guard,async(req:Request,res:Response)=>{const principal=getPrincipal(req);if(!principal)return void code(res,401,'UNAUTHENTICATED');try{await handler(req,res,{id:principal.sessionId,...principal});}catch{code(res,503,'SERVICE_UNAVAILABLE');}}
 ]; app.post('/api/v1/auth/login',async(req,res)=>{if(!allowedOrigin(req,config))return void code(res,403,'ORIGIN_DENIED');const body=req.body;const valid=body && typeof body==='object' && !Array.isArray(body) && Object.keys(body).sort().join(',')==='email,password' && typeof body.email==='string' && typeof body.password==='string';if(!valid)return void code(res,400,'INVALID_INPUT');const email=body.email.trim().toLowerCase(),password=body.password;const bytes=Buffer.byteLength(password,'utf8');if([...email].length<3||[...email].length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||bytes<1||bytes>128)return void code(res,400,'INVALID_INPUT');
 let reservation;try{reservation=await admit(pool,hmac(config.rateKey,'account',email),hmac(config.rateKey,'ip',clientIp(req,config.trustedProxies)));}catch(e){return void code(res,e instanceof QuotaError?429:503,e instanceof QuotaError?'RATE_LIMITED':'SERVICE_UNAVAILABLE');}
 try{const q=await pool.query('SELECT "id","role","passwordHash","isActive" FROM "User" WHERE "email"=$1',[email]);const user=q.rows[0];let matched=false;try{matched=await (config.credentialVerifier??verifyPassword)(password,user?.passwordHash??dummy);}catch{matched=false;}
 const good=matched && user?.isActive===true;const token=good?randomToken():null;const nonce=good?randomBytes(32):null;
 const accepted=await settle(pool,reservation,good?'success':'failed',good?async c=>{await c.query('INSERT INTO "Session"("userId","tokenDigest","csrfNonce","csrfKeyVersion","expiresAt") VALUES($1,$2,$3,$4,now()+interval \'8 hours\')',[user.id,digest(token!),nonce,config.csrfKeyVersion??'v1']);}:undefined);
 if(!good||!accepted)return void code(res,good?503:401,good?'SERVICE_UNAVAILABLE':'LOGIN_FAILED');
 res.cookie(cookieName(config),token!,{...cookieOptions(config),maxAge:28800000});res.status(200).json(identity(user));
 }catch{try{await settle(pool,reservation,'abandoned');}catch{}code(res,503,'SERVICE_UNAVAILABLE');}
 });
 app.get('/api/v1/auth/me',...withSession(async(_req,res,s)=>{res.setHeader('X-NutTiew-Session-Binding',sessionBinding(s.userId,s.id));res.json(identity({id:s.userId,role:s.role}));}));
 app.get('/api/v1/auth/csrf',...withSession(async(req,res,s)=>{if(req.headers['sec-fetch-site']==='cross-site')return void code(res,403,'ORIGIN_DENIED');const key=sessionCsrfKey(config,s.csrfKeyVersion);if(!key)return void code(res,503,'SERVICE_UNAVAILABLE');res.json({csrfToken:csrf(key,s.id,s.csrfNonce)});}));
 app.post('/api/v1/auth/logout',...withSession(async(req,res,s)=>{if(!allowedOrigin(req,config))return void code(res,403,'ORIGIN_DENIED');if(req.body && (typeof req.body!=='object' || Array.isArray(req.body) || Object.keys(req.body).length>0))return void code(res,400,'INVALID_INPUT');const key=sessionCsrfKey(config,s.csrfKeyVersion);if(!key)return void code(res,503,'SERVICE_UNAVAILABLE');if(!safeTokenMatch(req.headers['x-csrf-token'],csrf(key,s.id,s.csrfNonce)))return void code(res,403,'CSRF_DENIED');await pool.query('UPDATE "Session" SET "revokedAt"=now() WHERE "id"=$1 AND "revokedAt" IS NULL',[s.id]);res.clearCookie(cookieName(config),cookieOptions(config));res.status(204).end();}));
 // F-S1-02 only: the authenticated Tutor's own create/list projection.
 // The security and CSRF implementation is shared with Auth (no forked policy).
 const tutorRole=requireRole('Tutor',(res,status,error)=>{code(res,status,error);});
 const slotFailure=(res:Response,error:unknown)=>{
  if(error instanceof SlotError)return void code(res,error.status,error.errorCode);
  code(res,503,'SERVICE_UNAVAILABLE');
 };
 app.get('/api/v1/tutor/slots',guard,tutorRole,async(req,res)=>{
  if(Object.keys(req.query).length!==0)return void code(res,400,'INVALID_INPUT');
  const principal=getPrincipal(req);
  if(!principal)return void code(res,401,'UNAUTHENTICATED');
  try{const data=await listOwnSlots(pool,principal.userId);res.setHeader('X-NutTiew-Session-Binding',sessionBinding(principal.userId,principal.sessionId));res.json({data,meta:{requestId:res.locals.requestId}});}
  catch(error){slotFailure(res,error);}
 });
 app.post('/api/v1/tutor/slots',guard,tutorRole,async(req,res)=>{
  if(Object.keys(req.query).length!==0)return void code(res,400,'INVALID_INPUT');
  if(!allowedOrigin(req,config))return void code(res,403,'ORIGIN_DENIED');
  const principal=getPrincipal(req);
  if(!principal)return void code(res,401,'UNAUTHENTICATED');
  const expected=req.headers['x-nuttiew-expected-session-binding'];
  if(expected!==undefined && expected!==sessionBinding(principal.userId,principal.sessionId))return void code(res,403,'FORBIDDEN');
  const key=sessionCsrfKey(config,principal.csrfKeyVersion);
  if(!key)return void code(res,503,'SERVICE_UNAVAILABLE');
  if(!safeTokenMatch(req.headers['x-csrf-token'],csrf(key,principal.sessionId,principal.csrfNonce)))return void code(res,403,'CSRF_DENIED');
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!Object.hasOwn(body,'startsAt'))return void code(res,400,'INVALID_INPUT');
  const start=parseSlotStart(body.startsAt);
  if(!start)return void code(res,400,'INVALID_INPUT');
  try{
   const data=await publishOwnSlot(pool,{userId:principal.userId,sessionId:principal.sessionId},start);
   res.status(201).json({data,meta:{requestId:res.locals.requestId}});
  }catch(error){slotFailure(res,error);}
 });
 // F-S1-03 only: authenticated Customer read-only bookable availability projection.
 const customerRole=requireRole('Customer',(res,status,error)=>{code(res,status,error);});
 app.get('/api/v1/customer/availability',guard,customerRole,async(req,res)=>{
  if(Object.keys(req.query).length!==0)return void code(res,400,'INVALID_INPUT');
  const principal=getPrincipal(req);
  if(!principal)return void code(res,401,'UNAUTHENTICATED');
  try{
   const tView=config.availabilityClock?await config.availabilityClock():undefined;
   const result=await listCustomerAvailability(pool,principal.userId,tView);
   res.setHeader('X-NutTiew-Session-Binding',sessionBinding(principal.userId,principal.sessionId));
   res.json({data:result.data,meta:{requestId:res.locals.requestId,evaluatedAt:result.evaluatedAt}});
  }catch{
   code(res,503,'SERVICE_UNAVAILABLE');
  }
 });
 // F-S1-05: Customer-private Booking retrieval and authorized Tutor schedule inspection.
 app.get('/api/v1/customer/bookings', guard, customerRole, async (req, res) => {
  if (Object.keys(req.query).length !== 0) return void code(res, 400, 'INVALID_INPUT');
  const principal = getPrincipal(req);
  if (!principal) return void code(res, 401, 'UNAUTHENTICATED');
  try {
   const clock = config.availabilityClock ? await config.availabilityClock() : undefined;
   const result = await listCustomerBookings(pool, principal.userId, clock);
   res.setHeader('X-NutTiew-Session-Binding', sessionBinding(principal.userId, principal.sessionId));
   res.json({ data: result.data, meta: { requestId: res.locals.requestId, evaluatedAt: result.evaluatedAt } });
  } catch {
   code(res, 503, 'SERVICE_UNAVAILABLE');
  }
 });
 app.get('/api/v1/customer/bookings/:id', guard, customerRole, async (req, res) => {
  if (Object.keys(req.query).length !== 0) return void code(res, 400, 'INVALID_INPUT');
  const principal = getPrincipal(req);
  if (!principal) return void code(res, 401, 'UNAUTHENTICATED');
  const bookingId = req.params.id;
  if (typeof bookingId !== 'string' || !isValidUuid(bookingId)) return void code(res, 400, 'INVALID_INPUT');
  try {
   const clock = config.availabilityClock ? await config.availabilityClock() : undefined;
   const result = await getCustomerBookingDetail(pool, principal.userId, bookingId, clock);
   res.setHeader('X-NutTiew-Session-Binding', sessionBinding(principal.userId, principal.sessionId));
   res.json({ data: result.data, meta: { requestId: res.locals.requestId, evaluatedAt: result.evaluatedAt } });
  } catch (error) {
   if (error instanceof BookingError) return void code(res, error.status, error.errorCode);
   code(res, 503, 'SERVICE_UNAVAILABLE');
  }
 });
 app.get('/api/v1/tutor/bookings', guard, tutorRole, async (req, res) => {
  if (Object.keys(req.query).length !== 0) return void code(res, 400, 'INVALID_INPUT');
  const principal = getPrincipal(req);
  if (!principal) return void code(res, 401, 'UNAUTHENTICATED');
  try {
   const clock = config.availabilityClock ? await config.availabilityClock() : undefined;
   const result = await listTutorScheduleBookings(pool, principal.userId, clock);
   res.setHeader('X-NutTiew-Session-Binding', sessionBinding(principal.userId, principal.sessionId));
   res.json({ data: result.data, meta: { requestId: res.locals.requestId, evaluatedAt: result.evaluatedAt } });
  } catch {
   code(res, 503, 'SERVICE_UNAVAILABLE');
  }
 });
 // F-S1-04 only: authenticated Customer exclusive Booking confirmation.
 app.post('/api/v1/customer/bookings',guard,customerRole,async(req,res)=>{
  if(Object.keys(req.query).length!==0)return void code(res,400,'INVALID_INPUT');
  if(!allowedOrigin(req,config))return void code(res,403,'ORIGIN_DENIED');
  const principal=getPrincipal(req);
  if(!principal)return void code(res,401,'UNAUTHENTICATED');
  const expected=req.headers['x-nuttiew-expected-session-binding'];
  if(typeof expected!=='string'||expected!==sessionBinding(principal.userId,principal.sessionId))return void code(res,403,'SESSION_BINDING_MISMATCH');
  const key=sessionCsrfKey(config,principal.csrfKeyVersion);
  if(!key)return void code(res,503,'SERVICE_UNAVAILABLE');
  if(!safeTokenMatch(req.headers['x-csrf-token'],csrf(key,principal.sessionId,principal.csrfNonce)))return void code(res,403,'CSRF_DENIED');
  const body=req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!Object.hasOwn(body,'slotId')||!isValidUuid(body.slotId))return void code(res,400,'INVALID_INPUT');
  try{
   const outcome=await createCustomerBooking(pool,{userId:principal.userId,sessionId:principal.sessionId},body.slotId,config.bookingHooks);
   res.status(outcome.httpStatus).json({data:outcome.data,meta:{requestId:res.locals.requestId}});
  }catch(error){
   if(error instanceof BookingError)return void code(res,error.status,error.errorCode);
   code(res,503,'SERVICE_UNAVAILABLE');
  }
 });
 app.use((err:unknown,_req:Request,res:Response,_next:NextFunction)=>{if(res.headersSent)return;const e=err as {type?:string;status?:number};code(res,e.type==='entity.too.large'?413:e.status===400?400:500,e.type==='entity.too.large'?'INVALID_INPUT':e.status===400?'INVALID_INPUT':'INTERNAL_ERROR');});
 return app;
}
