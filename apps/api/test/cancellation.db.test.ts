import { randomBytes, randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import request from 'supertest';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createPool } from '../src/config.js';
import { digest } from '../src/security.js';

// These tests use owner-only transactional fixture DDL. Refuse any target that
// isn't the dedicated loopback review database or the hosted CI service.
const ownerUrl = new URL(process.env.DATABASE_URL ?? 'invalid:');
const runtimeUrl = new URL(process.env.DATABASE_URL_APP ?? 'invalid:');
const local = ownerUrl.port === '15449' && ownerUrl.pathname === '/nuttiew_115_review';
const ci = process.env.GITHUB_ACTIONS === 'true' && ownerUrl.port === '5432' && ownerUrl.pathname === '/nuttiew_ci';
if ((!local && !ci) || ownerUrl.protocol !== 'postgresql:' || ownerUrl.hostname !== '127.0.0.1' ||
    ownerUrl.username !== 'postgres' || ownerUrl.search || runtimeUrl.origin !== ownerUrl.origin ||
    runtimeUrl.hostname !== ownerUrl.hostname || runtimeUrl.port !== ownerUrl.port ||
    runtimeUrl.pathname !== ownerUrl.pathname || runtimeUrl.username !== 'nuttiew_ci_runtime' || runtimeUrl.search) {
  throw new Error('Cancellation integration tests require the disposable PostgreSQL fixture target');
}
const db = createPool();
const admin = new Pool({ connectionString: process.env.DATABASE_URL });
const origin = 'http://localhost:5173';
const config = { origin, csrfKey: randomBytes(32), rateKey: randomBytes(32), production: false };
let app: Awaited<ReturnType<typeof createApp>>;
beforeAll(async () => { app = await createApp(db, config); });
afterAll(async () => { await Promise.all([db.end(), admin.end()]); });

async function user(role: 'Customer' | 'Tutor') {
  const id = (await admin.query('INSERT INTO "User" (email,"passwordHash",role) VALUES ($1,$2,$3) RETURNING id', [randomUUID()+'@example.test','fixture',role])).rows[0].id as string;
  const token = randomBytes(32).toString('base64url');
  const cookie = 'nuttiew_session_dev='+token;
  const sid = (await admin.query(`INSERT INTO "Session" ("userId","tokenDigest","csrfNonce","expiresAt") VALUES ($1,$2,$3,clock_timestamp()+interval '8 hours') RETURNING id`,[id,digest(token),randomBytes(32)])).rows[0].id as string;
  const me = await request(app).get('/api/v1/auth/me').set('Cookie',cookie).expect(200);
  const csrf = await request(app).get('/api/v1/auth/csrf').set('Cookie',cookie).expect(200);
  return {id,sid,cookie,binding:me.headers['x-nuttiew-session-binding'] as string,csrf:csrf.body.csrfToken as string};
}
type Auth = Awaited<ReturnType<typeof user>>;
const path = (id:string) => '/api/v1/customer/bookings/'+id+'/cancel';
const auth = (a:Auth) => ({ Cookie:a.cookie, Origin:origin, 'X-CSRF-Token':a.csrf, 'X-NutTiew-Expected-Session-Binding':a.binding });
const cancel = (a:Auth,id:string,server=app) => request(server).post(path(id)).set(auth(a)).send({});
const book = (a:Auth,slotId:string,server=app) => request(server).post('/api/v1/customer/bookings').set(auth(a)).send({slotId});
async function fixture(minutes=180) {
  const customer = await user('Customer'); const tutor = await user('Tutor');
  const slot = (await admin.query(`WITH t AS (SELECT date_trunc('milliseconds',clock_timestamp())+$2*interval '1 minute' AS starts)
    INSERT INTO "Slot" ("tutorId","startsAt","endsAt") SELECT $1,starts,starts+interval '1 hour' FROM t RETURNING *`,[tutor.id,minutes])).rows[0];
  if (minutes >= 61) {
    const booking = await book(customer,slot.id).expect(201);
    return { customer,tutor,slot,id:booking.body.data.id as string };
  }
  // Synthetic appointment whose original Q05 window has already elapsed.
  // Only the disposable owner may seed it; the guard is restored in the same
  // transaction, so no other connection can observe it disabled.
  const client = await admin.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE "Booking" DISABLE TRIGGER booking_s2_row_guard');
    const { rows } = await client.query<{id:string}>('INSERT INTO "Booking" ("customerId","currentSlotId","startsAt","endsAt") VALUES ($1,$2,$3,$4) RETURNING id',[customer.id,slot.id,slot.startsAt,slot.endsAt]);
    await client.query('ALTER TABLE "Booking" ENABLE TRIGGER booking_s2_row_guard');
    await client.query('COMMIT');
    return {customer,tutor,slot,id:rows[0].id};
  } finally { try { await client.query('ROLLBACK'); } finally { client.release(); } }
}
const stored = async (id:string) => (await admin.query('SELECT * FROM "Booking" WHERE id=$1',[id])).rows[0];

it('CAN-01/04/05: commits one cancellation and releases occupancy',async()=>{
  const {customer,tutor,slot,id}=await fixture();
  const before=await stored(id);
  const done=await cancel(customer,id).expect(200);
  expect(done.body.data).toMatchObject({id,slotId:slot.id,status:'Cancelled',displayStatus:'Cancelled',cancellationActor:'Customer',cancellationReason:null});
  expect(done.body.data.cancelledAt).toBe(done.body.data.updatedAt);
  expect(Object.keys(done.body.data).sort()).toEqual([
    'id','slotId','tutorId','tutorRef','startsAt','endsAt','status','displayStatus',
    'cancellationActor','cancelledAt','cancellationReason','createdAt','updatedAt',
  ].sort());
  expect(done.headers['cache-control']).toBe('no-store');
  const row=await stored(id);
  expect(row).toMatchObject({id,status:'Cancelled',customerId:customer.id,currentSlotId:slot.id,startsAt:before.startsAt,endsAt:before.endsAt,updatedAt:row.cancelledAt,tutorCancellationReason:null});
  expect((await admin.query('SELECT * FROM "Slot" WHERE id=$1',[slot.id])).rows[0]).toEqual(slot);
  for (const table of ['Notification','RescheduleHistory']) expect((await admin.query('SELECT 1 FROM "'+table+'" WHERE "bookingId"=$1',[id])).rowCount).toBe(0);
  expect((await cancel(customer,id).expect(409)).body.error.code).toBe('BOOKING_NOT_CANCELLABLE');
  expect(await stored(id)).toEqual(row);
  const restarted=await createApp(db,config);
  const own=await request(restarted).get('/api/v1/customer/bookings/'+id).set('Cookie',customer.cookie).expect(200);
  expect(own.body.data).toEqual(done.body.data);
  const availability=await request(restarted).get('/api/v1/customer/availability').set('Cookie',customer.cookie).expect(200);
  expect(availability.body.data).toEqual(expect.arrayContaining([expect.objectContaining({slotId:slot.id})]));
  const schedule=await request(restarted).get('/api/v1/tutor/bookings').set('Cookie',tutor.cookie).expect(200);
  expect(schedule.body.data).toEqual([]);
});

it('CAN-14: cancellation and the reopened offer survive an actual API process restart', async () => {
  const f = await fixture();
  // Start the real app with its own runtime pool, on a kernel-selected loopback
  // port. Stop that process and repeat with a completely new pool and PID.
  const source = `
    import { createApp } from './src/app.ts';
    import { createPool } from './src/config.ts';
    const app = await createApp(createPool(), {
      origin: process.env.AUTH_CANONICAL_ORIGIN,
      production: false,
      csrfKey: Buffer.from(process.env.CANCEL_TEST_CSRF, 'hex'), rateKey: Buffer.alloc(32),
    });
    const server = app.listen(0, '127.0.0.1', () => console.log('READY ' + server.address().port));
  `;
  async function inProcess<T>(work: (base: string) => Promise<T>) {
    const child = spawn(process.execPath, ['--import','tsx','--input-type=module','-e',source], {
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), '..'),
      env: {...process.env, AUTH_CANONICAL_ORIGIN: origin, CANCEL_TEST_CSRF: config.csrfKey.toString('hex')},
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide:true,
    });
    const exited = once(child, 'exit');
    let output = '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const port = await new Promise<string>((ok, fail) => {
        child.stdout.on('data', chunk => {
          output += String(chunk);
          const match = /READY (\d+)/.exec(output);
          if (match) ok(match[1]);
        });
        child.stderr.resume();
        child.once('error', fail);
        child.once('exit', () => fail(new Error('Test API exited before readiness')));
        controller.signal.addEventListener('abort', () => fail(new Error('API start timeout')), {once:true});
      });
      return await work('http://127.0.0.1:' + port);
    } finally {
      clearTimeout(timeout);
      if (child.exitCode === null) child.kill();
      await exited;
    }
  }
  const committed = await inProcess(async base => {
    const result = await fetch(base + path(f.id), {method:'POST', headers:{...auth(f.customer),'Content-Type':'application/json'}, body:'{}', signal:AbortSignal.timeout(5000)});
    expect(result.status).toBe(200);
    return (await result.json()).data;
  });
  await inProcess(async base => {
    const get = (path: string) => fetch(base + '/api/v1/customer/' + path,{headers:{Cookie:f.customer.cookie},signal:AbortSignal.timeout(5000)});
    const detail = await get('bookings/' + f.id);
    expect(detail.status).toBe(200);
    expect((await detail.json()).data).toEqual(committed);
    const availability = await get('availability');
    expect(availability.status).toBe(200);
    expect((await availability.json()).data).toEqual(expect.arrayContaining([expect.objectContaining({slotId:f.slot.id})]));
  });
},30000);

it('CAN-03/12: denies foreign, malformed, wrong role, unauthenticated and cross-session requests',async()=>{
  const {customer,tutor,id}=await fixture(); const other=await user('Customer');
  const foreign=await cancel(other,id).expect(404);
  const missing=await cancel(other,randomUUID()).expect(404);
  expect(foreign.body.error).toEqual(missing.body.error);
  expect(foreign.body.error).toEqual({code:'BOOKING_NOT_FOUND',message:'Booking not found'});
  await cancel(tutor,id).expect(403);
  await request(app).post(path(id)).send({}).expect(401);
  await cancel(customer,'not-uuid').expect(400);
  await request(app).post(path(id)+'?probe=1').set(auth(customer)).send({}).expect(400);
  await request(app).post(path(id)).set(auth(customer)).send({customerId:other.id}).expect(400);
  await request(app).post(path(id)).set(auth(customer)).expect(400);
  await request(app).post(path(id)).set(auth(customer)).type('json').set('Content-Length','0').expect(400);
  await request(app).post(path(id)).set(auth(customer)).type('json').set('Transfer-Encoding','chunked').expect(400);
  await request(app).post(path(id)).set(auth(customer)).type('json').send('{').expect(400);
  await request(app).post(path(id)).set(auth(customer)).send({padding:'x'.repeat(4500)}).expect(400);
  await request(app).post(path(id)).set({...auth(customer),'Sec-Fetch-Site':'cross-site'}).send({}).expect(403);
  await request(app).post(path(id)).set({...auth(customer),Origin:'https://other.example.test'}).send({}).expect(403);
  await request(app).post(path(id)).set({...auth(customer),'X-CSRF-Token':other.csrf}).send({}).expect(403);
  await request(app).post(path(id)).set({...auth(customer),'X-NutTiew-Expected-Session-Binding':other.binding}).send({}).expect(403);
  expect((await stored(id)).status).toBe('Booked');
});

async function pid(client:PoolClient) {
  return (await client.query<{pid:number}>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
}
async function blocked(waiter:number,holder:number) {
  const until = Date.now()+6500;
  while(Date.now()<until) {
    const {rows} = await admin.query<{blockers:number[]}>('SELECT pg_blocking_pids($1) AS blockers',[waiter]);
    if(rows[0].blockers.includes(holder)) return;
    await delay(20);
  }
  throw new Error('PostgreSQL lock barrier not observed');
}
const active = async (slotId:string) => (await admin.query('SELECT id FROM "Booking" WHERE "currentSlotId"=$1 AND status=$2',[slotId,'Booked'])).rows;
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

it('CAN-02: uses the exact foundation predicate at equality and one millisecond below',async()=>{
  const f=await fixture(); const client=await admin.connect();
  try {
    await client.query('BEGIN');
    const {rows:[{definition}]}=await client.query<{definition:string}>("SELECT pg_get_functiondef('public.s2_mutate(text,uuid,uuid,uuid,uuid,text)'::regprocedure) AS definition");
    // Override only the decision clock in an uncommitted, disposable test
    // transaction. The approved migration and production adapter stay unchanged.
    const installClock = async (milliseconds:number) => {
      const anchor='decision := clock_timestamp();';
      expect(definition.split(anchor)).toHaveLength(2);
      const stamp=new Date(f.slot.startsAt.getTime()-30*60_000+milliseconds).toISOString();
      await client.query(definition.replace(anchor,"decision := TIMESTAMPTZ '"+stamp+"';"));
    };
    const invoke=()=>client.query("SELECT public.s2_mutate('CustomerCancel',$1,$2,$3)",[f.customer.id,f.customer.sid,f.id]);
    await installClock(1);
    await client.query('SAVEPOINT too_late');
    await expect(invoke()).rejects.toMatchObject({code:'P0B05'});
    await client.query('ROLLBACK TO SAVEPOINT too_late');
    expect((await client.query('SELECT status FROM "Booking" WHERE id=$1',[f.id])).rows[0].status).toBe('Booked');
    await installClock(0);
    await invoke();
    const {rows:[row]}=await client.query(`SELECT status, "startsAt"-"cancelledAt"=interval '30 minutes' AS exact FROM "Booking" WHERE id=$1`,[f.id]);
    expect(row).toEqual({status:'Cancelled',exact:true});
  } finally { try { await client.query('ROLLBACK'); } finally { client.release(); } }
});

it('CAN-06/07: cancellation inside Q05 releases occupancy without allowing a new booking',async()=>{
  const f=await fixture(45); const other=await user('Customer');
  const reached=deferred<number>(), release=deferred<void>(), waiting=deferred<number>();
  const server=await createApp(db,{...config,cancellationHooks:{beforeCommit:async client=>{reached.resolve(await pid(client));await release.promise;}},
    bookingHooks:{onLockStep:async event=>{if(event.phase==='user') waiting.resolve(event.backendPid);}}});
  const cancellation=cancel(f.customer,f.id,server).then(r=>r);
  let contender: Promise<request.Response> | undefined;
  try {
    const holder=await reached.promise;
    contender=book(other,f.slot.id,server).then(r=>r);
    await blocked(await waiting.promise,holder);
    expect((await active(f.slot.id)).map(r=>r.id)).toEqual([f.id]);
  } finally { release.resolve(); await Promise.allSettled([cancellation,contender]); }
  expect((await cancellation).status).toBe(200);
  const overlap = await contender;
  expect([409,422]).toContain(overlap?.status);
  expect(overlap?.body.error.code).toBe(overlap?.status === 409 ? 'SLOT_UNAVAILABLE' : 'BOOKING_NOT_ELIGIBLE');
  expect(await book(other,f.slot.id).expect(422)).toMatchObject({body:{error:{code:'BOOKING_NOT_ELIGIBLE'}}});
  expect(await active(f.slot.id)).toEqual([]);
  const available=await request(app).get('/api/v1/customer/availability').set('Cookie',other.cookie).expect(200);
  expect(available.body.data.some((s:{slotId:string})=>s.slotId===f.slot.id)).toBe(false);
},15000);

it.each(['cancel first','book first'])('CAN-07: %s on the same eligible Slot', async order=>{
  const f=await fixture(); const other=await user('Customer');
  const first=deferred<number>(), second=deferred<number>(), release=deferred<void>();
  const cancelFirst=order==='cancel first';
  const server=await createApp(db,{...config,
    cancellationHooks:cancelFirst?{beforeCommit:async c=>{first.resolve(await pid(c));await release.promise;}}:{beforeMutation:async c=>{second.resolve(await pid(c));}},
    bookingHooks:{onLockStep:async (e,c)=>{
      if(cancelFirst && e.phase==='user') second.resolve(e.backendPid);
      if(!cancelFirst && e.phase==='booking-replay'){first.resolve(await pid(c));await release.promise;}
    }},
  });
  const startCancel=()=>cancel(f.customer,f.id,server).then(r=>r);
  const startBook=()=>book(other,f.slot.id,server).then(r=>r);
  const winner=(cancelFirst?startCancel:startBook)();
  let waiter:Promise<request.Response>|undefined;
  try {
    const holder=await first.promise;
    waiter=(cancelFirst?startBook:startCancel)();
    await blocked(await second.promise,holder);
    expect((await active(f.slot.id)).map(r=>r.id)).toEqual([f.id]);
  } finally { release.resolve(); await Promise.allSettled([winner,waiter]); }
  expect((await winner).status).toBe(cancelFirst?200:409);
  const overlap = await waiter;
  expect((await stored(f.id)).status).toBe('Cancelled');
  if (cancelFirst) {
    // Depending on the UUID lock order, the contender can acquire its first
    // snapshot before cancellation commits or retry with a fresh snapshot.
    expect([409,201]).toContain(overlap?.status);
    if (overlap?.status === 409) {
      expect(overlap.body.error.code).toBe('SLOT_UNAVAILABLE');
      expect(await active(f.slot.id)).toEqual([]);
    }
    const fresh = await book(other,f.slot.id).expect(overlap?.status === 201 ? 200 : 201);
    expect(await active(f.slot.id)).toEqual([{id:fresh.body.data.id}]);
  } else {
    expect(overlap?.status).toBe(200);
    expect(await active(f.slot.id)).toEqual([]);
  }
},15000);

it('CAN-08: simultaneous cancels yield exactly one committed transition',async()=>{
  const f=await fixture();const hold=deferred<void>(), first=deferred<number>(), second=deferred<number>();
  const server=await createApp(db,{...config,cancellationHooks:{beforeCommit:async c=>{first.resolve(await pid(c));await hold.promise;}}});
  const otherServer=await createApp(db,{...config,cancellationHooks:{beforeMutation:async c=>{second.resolve(await pid(c));}}});
  const a=cancel(f.customer,f.id,server).then(r=>r);let b:Promise<request.Response>|undefined;
  try { const holder=await first.promise; b=cancel(f.customer,f.id,otherServer).then(r=>r); await blocked(await second.promise,holder); }
  finally {hold.resolve();await Promise.allSettled([a,b]);}
  expect((await a).status).toBe(200);
  expect(await b).toMatchObject({status:409,body:{error:{code:'BOOKING_NOT_CANCELLABLE'}}});
  expect((await stored(f.id)).cancelledAt.toISOString()).toBe((await a).body.data.cancelledAt);
  expect(await active(f.slot.id)).toEqual([]);
},15000);

it('CAN-09: failure after mutation rolls back, serialization exhausts, lost acknowledgement requires re-read',async()=>{
  const f=await fixture();const before=await stored(f.id);
  const failing=await createApp(db,{...config,cancellationHooks:{beforeCommit:async c=>{await c.query('SELECT 1/0');}}});
  const rollback=await cancel(f.customer,f.id,failing).expect(503);
  expect(rollback.body.error.code).toBe('SERVICE_UNAVAILABLE');
  expect(rollback.text).not.toMatch(/division|SELECT|stack/i);
  expect(await stored(f.id)).toEqual(before);
  expect(await active(f.slot.id)).toEqual([{id:f.id}]);
  let attempts=0;
  const retry=await createApp(db,{...config,cancellationHooks:{beforeCommit:async c=>{
    attempts++; await c.query("DO $$ BEGIN RAISE EXCEPTION 'test retry' USING ERRCODE='40001'; END $$");
  }}});
  expect((await cancel(f.customer,f.id,retry).expect(503)).body.error.code).toBe('TRANSACTION_RETRY_EXHAUSTED');
  expect(attempts).toBe(3);expect(await stored(f.id)).toEqual(before);
  const uncertain=await createApp(db,{...config,cancellationHooks:{afterCommit:async()=>{throw Error('lost acknowledgement');}}});
  expect((await cancel(f.customer,f.id,uncertain).expect(503)).body.error.code).toBe('MUTATION_OUTCOME_UNKNOWN');
  const read=await request(app).get('/api/v1/customer/bookings/'+f.id).set('Cookie',f.customer.cookie).expect(200);
  expect(read.body.data.status).toBe('Cancelled');
  await cancel(f.customer,f.id).expect(409);
},15000);

it.each(['revocation','cutoff'])('CAN-10/11: revalidates %s after a real lock wait', async scenario=>{
  const f=await fixture(scenario==='revocation'?180:30.12);
  const holder=await admin.connect();const started=deferred<number>();
  const server=await createApp(db,{...config,cancellationHooks:{beforeMutation:async c=>{started.resolve(await pid(c));}}});
  let result:Promise<request.Response>|undefined;
  try {
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',[f.customer.id]);
    if (scenario==='cutoff') expect((await admin.query("SELECT clock_timestamp() < $1::timestamptz-interval '30 minutes' AS eligible",[f.slot.startsAt])).rows[0].eligible).toBe(true);
    result=cancel(f.customer,f.id,server).then(r=>r);
    await blocked(await started.promise,await pid(holder));
    if(scenario==='revocation') await admin.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[f.customer.sid]);
    else await admin.query("SELECT pg_sleep(greatest(0, extract(epoch FROM ($1::timestamptz - interval '30 minutes' - clock_timestamp()))) + 0.05)",[f.slot.startsAt]);
    await holder.query('COMMIT');
  } finally {try{await holder.query('ROLLBACK');await result;}finally{holder.release();}}
  expect(await result).toMatchObject(scenario==='revocation'?{status:401,body:{error:{code:'UNAUTHENTICATED'}}}:{status:422,body:{error:{code:'CANCELLATION_WINDOW_CLOSED'}}});
  expect((await stored(f.id)).status).toBe('Booked');
  expect(await active(f.slot.id)).toEqual([{id:f.id}]);
},20000);

it('CAN-13: runtime cannot bypass the cancellation function or lower guard protection',async()=>{
  const f=await fixture(); await cancel(f.customer,f.id).expect(200); const row=await stored(f.id);
  for(const sql of [
    'UPDATE "Booking" SET status=$$Booked$$ WHERE id=$1',
    'UPDATE "Booking" SET "customerId"=gen_random_uuid() WHERE id=$1',
    'UPDATE "Booking" SET "currentSlotId"=gen_random_uuid() WHERE id=$1',
    'UPDATE "Booking" SET "startsAt"=clock_timestamp() WHERE id=$1',
    'DELETE FROM "Booking" WHERE id=$1',
  ]) await expect(db.query(sql,[f.id])).rejects.toMatchObject({code:'42501'});
  await expect(db.query('ALTER TABLE "Booking" DISABLE TRIGGER booking_s2_row_guard')).rejects.toMatchObject({code:'42501'});
  await expect(db.query('TRUNCATE "Booking"')).rejects.toMatchObject({code:'42501'});
  expect(await stored(f.id)).toEqual(row);
});
