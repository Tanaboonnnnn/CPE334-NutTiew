import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { Pool, type PoolClient } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createPool } from '../src/config.js';
import { digest } from '../src/security.js';

const owner = new URL(process.env.DATABASE_URL ?? 'invalid:');
const runtime = new URL(process.env.DATABASE_URL_APP ?? 'invalid:');
const local = owner.port === '15449' && owner.pathname === '/nuttiew_119_review';
const hosted = process.env.GITHUB_ACTIONS === 'true' && owner.port === '5432' && owner.pathname === '/nuttiew_ci';
if ((!local && !hosted) || owner.protocol !== 'postgresql:' || owner.hostname !== '127.0.0.1' || owner.username !== 'postgres' ||
    owner.search || runtime.protocol !== owner.protocol || runtime.host !== owner.host || runtime.pathname !== owner.pathname ||
    runtime.username !== 'nuttiew_ci_runtime' || runtime.search) {
  throw new Error('Withdrawal integration tests require the disposable PostgreSQL fixture target');
}
const db = createPool();
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const origin = 'http://localhost:5173';
const config = { origin, csrfKey:randomBytes(32),rateKey:randomBytes(32),production:false };
let app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => {app = await createApp(db,config);});
afterAll(async () => {await Promise.all([admin.end(),db.end()]);});
async function account(role:'Tutor'|'Customer') {
  const id = (await admin.query<{id:string}>('INSERT INTO "User" (email,"passwordHash",role) VALUES ($1,$2,$3) RETURNING id',
    [randomUUID()+'@withdraw.example.test','fixture',role])).rows[0].id;
  const token=randomBytes(32).toString('base64url'), cookie='nuttiew_session_dev='+token;
  const sid=(await admin.query<{id:string}>('INSERT INTO "Session" ("userId","tokenDigest","csrfNonce","expiresAt") VALUES ($1,$2,$3,clock_timestamp()+interval \'8 hours\') RETURNING id',
    [id,digest(token),randomBytes(32)])).rows[0].id;
  const me=await request(app).get('/api/v1/auth/me').set('Cookie',cookie).expect(200);
  const csrf=await request(app).get('/api/v1/auth/csrf').set('Cookie',cookie).expect(200);
  return {id,sid,cookie,binding:String(me.headers['x-nuttiew-session-binding']),csrf:String(csrf.body.csrfToken)};
}
type Account=Awaited<ReturnType<typeof account>>;
const headers=(a:Account)=>({Cookie:a.cookie,Origin:origin,'X-CSRF-Token':a.csrf,'X-NutTiew-Expected-Session-Binding':a.binding});
const withdrawPath=(id:string)=>'/api/v1/tutor/slots/'+id+'/withdraw';
const withdraw=(a:Account,id:string,server=app)=>request(server).post(withdrawPath(id)).set(headers(a)).send({});
const book=(a:Account,slotId:string,server=app)=>request(server).post('/api/v1/customer/bookings').set(headers(a)).send({slotId});
const own=(a:Account,server=app)=>request(server).get('/api/v1/tutor/slots').set('Cookie',a.cookie);
const stored=async(id:string)=>(await admin.query('SELECT * FROM "Slot" WHERE id=$1',[id])).rows[0];
const bookings=async(id:string)=>(await admin.query('SELECT * FROM "Booking" WHERE "currentSlotId"=$1',[id])).rows;
async function fixture() {
  const tutor=await account('Tutor');
  const start = new Date(Math.ceil((Date.now()+3*60*60_000)/3_600_000)*3_600_000);
  const end = new Date(start.getTime()+60*60_000);
  const row=(await admin.query('INSERT INTO "Slot" ("tutorId","startsAt","endsAt") VALUES ($1,$2,$3) RETURNING *',[tutor.id,start,end])).rows[0];
  return {tutor,slot:row,start,end};
}
function latch<T>() {
  let resolve!: (v:T)=>void;
  const promise=new Promise<T>(done=>{resolve=done;});
  return {promise,resolve};
}
const pid=async (c:PoolClient)=>(await c.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
async function blocked(waiter:number,holder:number) {
  const until=Date.now()+5000;
  while (Date.now()<until) {
    if((await admin.query('SELECT $2::int=ANY(pg_blocking_pids($1)) AS held',[waiter,holder])).rows[0].held) return;
    await delay(20);
  }
  throw Error('No PostgreSQL lock barrier observed');
}

it('WDR-01/05/06/14: withdraws one offer, preserves own history, and permits a new distinct offer',async()=>{
  const {tutor,slot,start,end}=await fixture();
  const customer=await account('Customer');
  const other=await account('Tutor');
  const eligible=await request(app).get('/api/v1/customer/availability').set('Cookie',customer.cookie).expect(200);
  expect(eligible.body.data.some((s:{slotId:string})=>s.slotId===slot.id)).toBe(true);
  const result=await withdraw(tutor,slot.id).expect(200);
  const saved=await stored(slot.id);
  const dto={id:slot.id,lifecycle:'Withdrawn',occupancy:'Unoccupied',startsAt:start.toISOString(),endsAt:end.toISOString(),
    withdrawnAt:saved.withdrawnAt.toISOString()};
  expect(result.body.data).toEqual(dto);
  expect(result.headers['x-nuttiew-session-binding']).toBe(tutor.binding);
  expect(saved).toEqual({...slot,lifecycle:'Withdrawn',withdrawnAt:saved.withdrawnAt});
  expect((await own(tutor).expect(200)).body.data).toEqual([dto]);
  expect((await own(other).expect(200)).body.data).toEqual([]);
  const availability=await request(app).get('/api/v1/customer/availability').set('Cookie',customer.cookie).expect(200);
  expect(availability.body.data.some((s:{slotId:string})=>s.slotId===slot.id)).toBe(false);
  expect((await withdraw(tutor,slot.id).expect(409)).body.error.code).toBe('SLOT_ALREADY_WITHDRAWN');
  expect(await stored(slot.id)).toEqual(saved);
  const replacement=await request(app).post('/api/v1/tutor/slots').set(headers(tutor)).send({startsAt:start.toISOString()}).expect(201);
  expect(replacement.body.data.id).not.toBe(slot.id);
  expect((await own(tutor).expect(200)).body.data).toEqual(expect.arrayContaining([dto,expect.objectContaining({
    id:replacement.body.data.id,lifecycle:'Offered',withdrawnAt:null
  })]));
  expect(await bookings(slot.id)).toEqual([]);
});

it('WDR-02/03: foreign, malformed, wrong-role or occupied requests leave committed rows unchanged',async()=>{
  const {tutor,slot}=await fixture();
  const customer=await account('Customer'), other=await account('Tutor');
  const start=await stored(slot.id);
  const foreign=await withdraw(other,slot.id).expect(404);
  expect(foreign.body.error).toEqual((await withdraw(other,randomUUID()).expect(404)).body.error);
  await withdraw(customer,slot.id).expect(403);
  await request(app).post(withdrawPath(slot.id)).send({}).expect(401);
  await withdraw(tutor,'bad-uuid').expect(400);
  await request(app).post(withdrawPath(slot.id)+'?override=1').set(headers(tutor)).send({}).expect(400);
  for(const body of [{owner:tutor.id},{x:'A'.repeat(5000)}]) {
    await request(app).post(withdrawPath(slot.id)).set(headers(tutor)).send(body).expect(400);
  }
  await request(app).post(withdrawPath(slot.id)).set(headers(tutor)).expect(400);
  await request(app).post(withdrawPath(slot.id)).set(headers(tutor)).type('json').send('{').expect(400);
  for(const override of [{Origin:'https://other.example.test'},{'X-CSRF-Token':other.csrf},{'X-NutTiew-Expected-Session-Binding':other.binding}]){
    await request(app).post(withdrawPath(slot.id)).set({...headers(tutor),...override}).send({}).expect(403);
  }
  await book(customer,slot.id).expect(201);
  const before=await bookings(slot.id);
  const denied=await withdraw(tutor,slot.id).expect(409);
  expect(denied.body.error.code).toBe('SLOT_OCCUPIED');
  expect(denied.text).not.toContain(customer.id);
  expect(await stored(slot.id)).toEqual(start);
  expect(await bookings(slot.id)).toEqual(before);
});

it('WDR-04: exact start and past are rejected by the DB clock',async()=>{
  const f=await fixture();
  const c=await admin.connect();
  try{
    await c.query('BEGIN');
    const {rows:[{definition}]}=await c.query<{definition:string}>("SELECT pg_get_functiondef('public.s2_mutate(text,uuid,uuid,uuid,uuid,text)'::regprocedure) AS definition");
    const anchor='decision := clock_timestamp();';
    expect(definition.split(anchor)).toHaveLength(2);
    for(const delta of [0,1,-1]){
      await c.query('SAVEPOINT wdr_clock');
      const time=new Date(f.start.getTime()+delta).toISOString();
      await c.query(definition.replace(anchor,"decision := TIMESTAMPTZ '"+time+"';"));
      const operation=c.query("SELECT public.s2_mutate('Withdraw',$1,$2,$3)",[f.tutor.id,f.tutor.sid,f.slot.id]);
      if(delta<0)await operation;
      else await expect(operation).rejects.toMatchObject({code:'P0B05'});
      await c.query('ROLLBACK TO SAVEPOINT wdr_clock');
    }
  }finally{try{await c.query('ROLLBACK');}finally{c.release();}}
  expect(await stored(f.slot.id)).toEqual(f.slot);
});

it.each(['withdraw','book'] as const)('WDR-07: the %s wins under a real DB lock barrier',async winner=>{
  const {tutor,slot}=await fixture();
  const customer=await account('Customer');
  const holding=latch<number>(), waiting=latch<number>(), release=latch<void>();
  const held=async(c:PoolClient)=>{holding.resolve(await pid(c));await release.promise;};
  const waits=async(c:PoolClient)=>{waiting.resolve(await pid(c));};
  const server=await createApp(db,{...config,withdrawalHooks:winner==='withdraw'?{beforeCommit:held}:{beforeMutation:waits},
    bookingHooks:winner==='book'?{beforeCommit:({client})=>held(client)}:{
      onLockStep:(e)=>{if(e.phase==='user'&&e.targetId===tutor.id) waiting.resolve(e.backendPid);},
    }});
  const doWithdraw=()=>withdraw(tutor,slot.id,server).then(r=>r);
  const doBook=()=>book(customer,slot.id,server).then(r=>r);
  const a=(winner==='withdraw'?doWithdraw:doBook)();
  let b:Promise<request.Response>|undefined;
  try {
    const holder=await Promise.race([holding.promise,a.then(r=>{throw Error('Holder exited: '+r.status);})]);
    b=(winner==='withdraw'?doBook:doWithdraw)();
    await blocked(await Promise.race([waiting.promise,b.then(r=>{throw Error('Waiter exited: '+r.status);})]),holder);
    expect((await stored(slot.id)).lifecycle).toBe('Offered');
    expect(await bookings(slot.id)).toHaveLength(0);
  }finally{release.resolve();await Promise.allSettled([a,b]);}
  expect((await a).status).toBe(winner==='withdraw'?200:201);
  expect(await b).toMatchObject({status:409,body:{error:{code:winner==='withdraw'?'SLOT_UNAVAILABLE':'SLOT_OCCUPIED'}}});
  expect((await stored(slot.id)).lifecycle).toBe(winner==='withdraw'?'Withdrawn':'Offered');
  expect(await bookings(slot.id)).toHaveLength(winner==='withdraw'?0:1);
},15000);

it('WDR-08: occupied withdrawal cannot replace Tutor cancellation or create a notice',async()=>{
  const f=await fixture();
  const c=await account('Customer');
  const created=await book(c,f.slot.id).expect(201);
  const id=created.body.data.id;
  expect((await withdraw(f.tutor,f.slot.id).expect(409)).body.error.code).toBe('SLOT_OCCUPIED');
  expect((await admin.query('SELECT id FROM "Notification" WHERE "bookingId"=$1',[id])).rows).toHaveLength(0);
  await request(app).post('/api/v1/tutor/bookings/'+id+'/cancel').set(headers(f.tutor)).send({reason:'ติดธุระ'}).expect(200);
  expect((await withdraw(f.tutor,f.slot.id).expect(409)).body.error.code).toBe('SLOT_ALREADY_WITHDRAWN');
  expect((await admin.query('SELECT kind FROM "Notification" WHERE "bookingId"=$1',[id])).rows).toEqual([{kind:'TutorCancelled'}]);
  expect((await bookings(f.slot.id))[0]).toMatchObject({status:'Cancelled',cancellationActor:'Tutor'});
});

it('WDR-09: rollback and lost acknowledgement preserve transactional outcome',async()=>{
  const f=await fixture();
  const rollback=await createApp(db,{...config,withdrawalHooks:{beforeCommit:async c=>{await c.query('SELECT 1/0');}}});
  expect((await withdraw(f.tutor,f.slot.id,rollback).expect(503)).body.error.code).toBe('SERVICE_UNAVAILABLE');
  expect(await stored(f.slot.id)).toEqual(f.slot);
  const uncertain=await createApp(db,{...config,withdrawalHooks:{afterCommit:async()=>{throw Error('lost fixture ACK');}}});
  expect((await withdraw(f.tutor,f.slot.id,uncertain).expect(503)).body.error.code).toBe('MUTATION_OUTCOME_UNKNOWN');
  expect((await own(f.tutor).expect(200)).body.data[0]).toMatchObject({id:f.slot.id,lifecycle:'Withdrawn',occupancy:'Unoccupied'});
  expect(await bookings(f.slot.id)).toEqual([]);
});

it('WDR-10: SQL enforces slot history and runtime cannot bypass row triggers', async()=>{
  const f=await fixture();
  const occupied=await fixture();
  await book(await account('Customer'),occupied.slot.id).expect(201);
  await expect(admin.query('UPDATE "Slot" SET lifecycle=$$Withdrawn$$,"withdrawnAt"=clock_timestamp() WHERE id=$1',[occupied.slot.id]))
    .rejects.toMatchObject({code:'P0B03'});
  await withdraw(f.tutor,f.slot.id).expect(200);
  const retired=await stored(f.slot.id);
  await expect(admin.query('UPDATE "Slot" SET lifecycle=$$Offered$$,"withdrawnAt"=NULL WHERE id=$1',[f.slot.id]))
    .rejects.toMatchObject({code:'P0B04'});
  for(const sql of ['UPDATE "Slot" SET "tutorId"=gen_random_uuid() WHERE id=$1','UPDATE "Slot" SET "startsAt"=clock_timestamp() WHERE id=$1','DELETE FROM "Slot" WHERE id=$1']){
    await expect(admin.query(sql,[f.slot.id])).rejects.toHaveProperty('code');
  }
  await expect(db.query('ALTER TABLE "Slot" DISABLE TRIGGER ALL')).rejects.toMatchObject({code:'42501'});
  await expect(db.query('TRUNCATE "Slot"')).rejects.toMatchObject({code:'42501'});
  expect(await stored(f.slot.id)).toEqual(retired);
});

it('WDR-11: exact Session revocation during lock wait prevents the update',async()=>{
  const f=await fixture();
  const holder=await admin.connect();
  const seen=latch<number>();
  const server=await createApp(db,{...config,withdrawalHooks:{beforeMutation:async c=>seen.resolve(await pid(c))}});
  let response:Promise<request.Response>|undefined;
  try{
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',[f.tutor.id]);
    response=withdraw(f.tutor,f.slot.id,server).then(r=>r);
    await blocked(await Promise.race([seen.promise,response.then(r=>{throw Error('No Session lock wait: '+r.status);})]),await pid(holder));
    await admin.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[f.tutor.sid]);
    await holder.query('COMMIT');
  }finally{try{await holder.query('ROLLBACK');await response;}finally{holder.release();}}
  expect(await response).toMatchObject({status:401,body:{error:{code:'UNAUTHENTICATED'}}});
  expect(await stored(f.slot.id)).toEqual(f.slot);
},15000);

it.each(['withdraw','reschedule'] as const)('WDR-13: %s wins the destination race under a DB lock barrier',async winner=>{
  const f=await fixture();
  const source=await fixture();
  const customer=await account('Customer');
  const original=await book(customer,source.slot.id).expect(201);
  const bookingId=original.body.data.id;
  const holding=latch<number>(), waiting=latch<number>(), release=latch<void>();
  const hold={beforeCommit:async(c:PoolClient)=>{holding.resolve(await pid(c));await release.promise;}};
  const wait={beforeMutation:async(c:PoolClient)=>{waiting.resolve(await pid(c));}};
  const server=await createApp(db,{...config,withdrawalHooks:winner==='withdraw'?hold:wait,rescheduleHooks:winner==='reschedule'?hold:wait});
  const doWithdraw=()=>withdraw(f.tutor,f.slot.id,server).then(r=>r);
  const doReschedule=()=>request(server).post('/api/v1/customer/bookings/'+bookingId+'/reschedule').set(headers(customer))
    .send({slotId:f.slot.id}).then(r=>r);
  const a=(winner==='withdraw'?doWithdraw:doReschedule)();
  let b:Promise<request.Response>|undefined;
  try{
    const holder=await Promise.race([holding.promise,a.then(r=>{throw Error('Holder exited: '+r.status);})]);
    b=(winner==='withdraw'?doReschedule:doWithdraw)();
    await blocked(await Promise.race([waiting.promise,b.then(r=>{throw Error('Waiter exited: '+r.status);})]),holder);
  }finally{release.resolve();await Promise.allSettled([a,b]);}
  expect((await a).status).toBe(200);
  expect(await b).toMatchObject({status:409,body:{error:{code:winner==='withdraw'?'SLOT_UNAVAILABLE':'SLOT_OCCUPIED'}}});
  const retired=winner==='withdraw';
  expect((await stored(f.slot.id)).lifecycle).toBe(retired?'Withdrawn':'Offered');
  expect((await bookings(f.slot.id)).map(row=>row.id)).toEqual(retired?[]:[bookingId]);
  const {rows}=await admin.query('SELECT "currentSlotId",status FROM "Booking" WHERE id=$1',[bookingId]);
  expect(rows).toEqual([{currentSlotId:retired?source.slot.id:f.slot.id,status:'Booked'}]);
  expect((await admin.query('SELECT id FROM "RescheduleHistory" WHERE "bookingId"=$1',[bookingId])).rows)
    .toHaveLength(retired?0:1);
},15000);

async function withApiProcess<T>(work:(origin:string)=>Promise<T>):Promise<T>{
  const moduleSource=[
    "import {createApp} from './src/app.ts';",
    "import {createPool} from './src/config.ts';",
    "const app=await createApp(createPool(),{origin:process.env.WDR_ORIGIN,csrfKey:Buffer.from(process.env.WDR_CSRF,'hex'),rateKey:Buffer.alloc(32),production:false});",
    "const server=app.listen(0,'127.0.0.1',()=>console.log('WDR_READY '+server.address().port));",
  ].join('\n');
  const child=spawn(process.execPath,['--import','tsx','--input-type=module','-e',moduleSource],{
    cwd:fileURLToPath(new URL('../',import.meta.url)),
    env:{...process.env,WDR_ORIGIN:origin,WDR_CSRF:config.csrfKey.toString('hex')},
    stdio:['ignore','pipe','pipe'],windowsHide:true,
  });
  child.stderr.resume();
  const stopped=once(child,'exit');
  const timer=AbortSignal.timeout(8000);
  try {
    let output='';
    const port=await new Promise<string>((resolve,reject)=>{
      child.stdout.on('data',chunk=>{
        output+=String(chunk);
        const match=/WDR_READY (\d+)/.exec(output);
        if(match)resolve(match[1]);
      });
      child.once('error',reject);
      child.once('exit',()=>reject(Error('Fixture API exited before readiness')));
      timer.addEventListener('abort',()=>reject(Error('Fixture API readiness timed out')),{once:true});
    });
    return await work('http://127.0.0.1:'+port);
  }finally{
    if(child.exitCode===null&&child.signalCode===null)child.kill();
    await stopped.catch(()=>undefined);
  }
}

it('WDR-12: independent API restart preserves owner history and excludes the offer',async()=>{
  const f=await fixture();
  const customer=await account('Customer');
  const done=await withApiProcess(async base=>{
    const result=await fetch(base+withdrawPath(f.slot.id),{method:'POST',headers:{...headers(f.tutor),'Content-Type':'application/json'},
      body:'{}',signal:AbortSignal.timeout(5000)});
    expect(result.status).toBe(200);
    return (await result.json()).data;
  });
  await withApiProcess(async base=>{
    const get=async(path:string,cookie:string)=>fetch(base+path,{headers:{Cookie:cookie},signal:AbortSignal.timeout(5000)});
    const history=await get('/api/v1/tutor/slots',f.tutor.cookie);
    expect(history.status).toBe(200);
    expect((await history.json()).data).toEqual([done]);
    const offers=await get('/api/v1/customer/availability',customer.cookie);
    expect(offers.status).toBe(200);
    expect((await offers.json()).data.some((s:{slotId:string})=>s.slotId===f.slot.id)).toBe(false);
  });
},20000);
