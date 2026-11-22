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
const local = ownerUrl.port === '15449' && ['/nuttiew_115_review', '/nuttiew_117_review', '/nuttiew_119_review'].includes(ownerUrl.pathname);
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

async function withCancellationApiProcess<T>(work: (base: string) => Promise<T>) {
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

it('CAN-14: cancellation and the reopened offer survive an actual API process restart', async () => {
  const f = await fixture();
  // Start the real app with its own runtime pool, on a kernel-selected loopback
  // port. Stop that process and repeat with a completely new pool and PID.
  const committed = await withCancellationApiProcess(async base => {
    const result = await fetch(base + path(f.id), {method:'POST', headers:{...auth(f.customer),'Content-Type':'application/json'}, body:'{}', signal:AbortSignal.timeout(5000)});
    expect(result.status).toBe(200);
    return (await result.json()).data;
  });
  await withCancellationApiProcess(async base => {
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

const tutorCancelPath = (id: string) => '/api/v1/tutor/bookings/' + id + '/cancel';
const tutorCancel = (a: Auth, id: string, reason: string, server = app) =>
  request(server).post(tutorCancelPath(id)).set(auth(a)).send({ reason });
const tutorReason = 'ติดธุระช่วงเวลานี้ครับ 📚';
const slotRow = async (id: string) => (await admin.query('SELECT * FROM "Slot" WHERE id=$1', [id])).rows[0];
const notices = async (id: string) => (await admin.query('SELECT * FROM "Notification" WHERE "bookingId"=$1', [id])).rows;
const tutorSnapshot = async (f: Awaited<ReturnType<typeof fixture>>) => ({
  booking: await stored(f.id), slot: await slotRow(f.slot.id), notices: await notices(f.id),
});

it('TCAN-01/05/09/11: commits cancellation, withdrawal and exactly one private notice', async () => {
  const f = await fixture();
  const before = await tutorSnapshot(f);
  const done = await tutorCancel(f.tutor, f.id, '  ' + tutorReason + '  ').expect(200);
  expect(done.headers['x-nuttiew-session-binding']).toBe(f.tutor.binding);
  expect(done.headers['cache-control']).toBe('no-store');
  const row = await tutorSnapshot(f);
  expect(done.body.data).toEqual({
    id:f.id, slotId:f.slot.id, status:'Cancelled',
    startsAt:f.slot.startsAt.toISOString(), endsAt:f.slot.endsAt.toISOString(),
    cancelledAt:row.booking.cancelledAt.toISOString(),
  });
  expect(done.text).not.toContain(tutorReason);
  expect(row.booking).toEqual({
    ...before.booking, status:'Cancelled', cancellationActor:'Tutor', tutorCancellationReason:tutorReason,
    cancelledAt:row.booking.cancelledAt, updatedAt:row.booking.cancelledAt,
  });
  expect(row.slot).toEqual({...before.slot, lifecycle:'Withdrawn', withdrawnAt:row.booking.cancelledAt});
  expect(row.notices).toEqual([expect.objectContaining({
    bookingId:f.id, recipientCustomerId:f.customer.id, kind:'TutorCancelled', createdAt:row.booking.cancelledAt, readAt:null,
  })]);
  expect((await tutorCancel(f.tutor, f.id, 'เหตุผลใหม่').expect(409)).body.error.code).toBe('BOOKING_NOT_CANCELLABLE');
  expect(await tutorSnapshot(f)).toEqual(row);
  for (const endpoint of ['/api/v1/tutor/bookings','/api/v1/tutor/slots']) {
    const own = await request(app).get(endpoint).set('Cookie', f.tutor.cookie).expect(200);
    expect(own.body.data).toEqual(endpoint.endsWith('/slots')?[{
      id:f.slot.id,startsAt:f.slot.startsAt.toISOString(),endsAt:f.slot.endsAt.toISOString(),
      lifecycle:'Withdrawn',withdrawnAt:row.slot.withdrawnAt.toISOString(),occupancy:'Unoccupied',
    }]:[]);
    expect(own.text).not.toContain(tutorReason);
  }
  const owner = await request(app).get('/api/v1/customer/bookings/'+f.id).set('Cookie',f.customer.cookie).expect(200);
  expect(owner.body.data).toMatchObject({status:'Cancelled',cancellationActor:'Tutor',cancellationReason:tutorReason});
  const other = await user('Customer');
  const foreign = await request(app).get('/api/v1/customer/bookings/'+f.id).set('Cookie',other.cookie).expect(404);
  expect(foreign.text).not.toContain(tutorReason);
  const available = await request(app).get('/api/v1/customer/availability').set('Cookie',other.cookie).expect(200);
  expect(available.body.data.some((s:{slotId:string})=>s.slotId===f.slot.id)).toBe(false);
  await book(other,f.slot.id).expect(409);
  expect(await tutorSnapshot(f)).toEqual(row);
  // Withdrawal preserves the historical row but does not reserve this interval forever.
  const replacement = await admin.query('INSERT INTO "Slot" ("tutorId","startsAt","endsAt") VALUES ($1,$2,$3) RETURNING id',
    [f.tutor.id,f.slot.startsAt,f.slot.endsAt]);
  expect(replacement.rows[0].id).not.toBe(f.slot.id);
});

it('TCAN-03/04: authorization and transport deny safely, and Unicode validation leaves rows unchanged', async () => {
  const f=await fixture();
  const initial=await tutorSnapshot(f);
  const other=await user('Tutor');
  const foreign=await tutorCancel(other,f.id,tutorReason).expect(404);
  const missing=await tutorCancel(other,randomUUID(),tutorReason).expect(404);
  expect(foreign.body.error).toEqual(missing.body.error);
  expect(foreign.text).not.toContain(tutorReason);
  await request(app).post(tutorCancelPath(f.id)).send({reason:tutorReason}).expect(401);
  await tutorCancel(f.customer,f.id,tutorReason).expect(403);
  await tutorCancel(f.tutor,'not-a-uuid',tutorReason).expect(400);
  await request(app).post(tutorCancelPath(f.id)+'?extra=1').set(auth(f.tutor)).send({reason:tutorReason}).expect(400);
  const authenticated = () => request(app).post(tutorCancelPath(f.id)).set(auth(f.tutor));
  await authenticated().set('Origin','https://example.invalid').send({reason:tutorReason}).expect(403);
  await authenticated().set('X-CSRF-Token',other.csrf).send({reason:tutorReason}).expect(403);
  await authenticated().set('X-NutTiew-Expected-Session-Binding',other.binding).send({reason:tutorReason}).expect(403);
  for (const body of [{},{reason:null},{reason:1},{reason:tutorReason,extra:true},{reason:''},{reason:' \t\n '},
    {reason:'...'},{reason:'😀'},{reason:'๑๒๓'},{reason:'\u200b'},{reason:'ไทย\0'},{reason:'ไทย\ud800'},
    {reason:'A'+'😀'.repeat(500)},{reason:'A'.repeat(9000)}]) {
    expect((await authenticated().send(body).expect(400)).body.error.code).toBe('INVALID_INPUT');
  }
  await authenticated().type('json').send('{').expect(400);
  expect(await tutorSnapshot(f)).toEqual(initial);
  const escaped = '{"reason":"A'+'\\ud83d\\ude00'.repeat(499)+'"}';
  await authenticated().type('json').send(escaped).expect(200);
  expect((await stored(f.id)).tutorCancellationReason).toBe('A'+'😀'.repeat(499));
});

it('TCAN-02: DB cutoff allows exact equality and rejects one millisecond below; HTTP rejects late cancellation',async()=>{
  const late=await fixture(59);
  const initial=await tutorSnapshot(late);
  expect((await tutorCancel(late.tutor,late.id,tutorReason).expect(422)).body.error.code).toBe('CANCELLATION_WINDOW_CLOSED');
  expect(await tutorSnapshot(late)).toEqual(initial);
  const f=await fixture();const c=await admin.connect();
  try {
    await c.query('BEGIN');
    const {rows:[{definition}]}=await c.query<{definition:string}>("SELECT pg_get_functiondef('public.s2_mutate(text,uuid,uuid,uuid,uuid,text)'::regprocedure) AS definition");
    const anchor='decision := clock_timestamp();';
    expect(definition.split(anchor)).toHaveLength(2);
    const clock=async (delta:number)=>c.query(definition.replace(anchor,
      "decision := TIMESTAMPTZ '"+new Date(f.slot.startsAt.getTime()-60*60_000+delta).toISOString()+"';"));
    const run=()=>c.query("SELECT public.s2_mutate('TutorCancel',$1,$2,$3,NULL,$4)",[f.tutor.id,f.tutor.sid,f.id,tutorReason]);
    await clock(1);
    await c.query('SAVEPOINT late');
    await expect(run()).rejects.toMatchObject({code:'P0B05'});
    await c.query('ROLLBACK TO SAVEPOINT late');
    expect((await c.query('SELECT status FROM "Booking" WHERE id=$1',[f.id])).rows[0].status).toBe('Booked');
    await clock(0);
    await run();
    expect((await c.query('SELECT status, "startsAt"-"cancelledAt"=interval \'60 minutes\' AS exact FROM "Booking" WHERE id=$1',[f.id])).rows[0]).toEqual({status:'Cancelled',exact:true});
  } finally {try{await c.query('ROLLBACK');}finally{c.release();}}
  expect((await stored(f.id)).status).toBe('Booked');
});

it('TCAN-06: failure after each DB write leaves all three records unchanged',async()=>{
  const f=await fixture();
  const before=await tutorSnapshot(f);
  await admin.query("CREATE FUNCTION public.tcan_fixture_fault() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF current_setting('nuttiew.tcan_fault', true)=TG_TABLE_NAME THEN RAISE EXCEPTION 'TCAN synthetic fault'; END IF; RETURN NEW; END $$");
  const triggers = [['Booking','UPDATE'],['Slot','UPDATE'],['Notification','INSERT']] as const;
  try {
    for (const [table,event] of triggers) {
      await admin.query('CREATE TRIGGER tcan_fixture_fault AFTER '+event+' ON public."'+table+'" FOR EACH ROW EXECUTE FUNCTION public.tcan_fixture_fault()');
    }
    for (const [table] of triggers) {
      const server=await createApp(db,{...config,tutorCancellationHooks:{beforeMutation:async c=>{
        await c.query("SELECT set_config('nuttiew.tcan_fault',$1,true)",[table]);
      }}});
      const failed=await tutorCancel(f.tutor,f.id,tutorReason,server).expect(503);
      expect(failed.body.error.code).toBe('SERVICE_UNAVAILABLE');
      expect(failed.text).not.toMatch(/TCAN synthetic fault|stack/);
      expect(await tutorSnapshot(f)).toEqual(before);
    }
  } finally {
    for (const [table] of triggers) await admin.query('DROP TRIGGER IF EXISTS tcan_fixture_fault ON public."'+table+'"');
    await admin.query('DROP FUNCTION public.tcan_fixture_fault()');
  }
});

it.each(['Tutor','Customer'] as const)('TCAN-07: %s wins a blocked cancellation race',async winner=>{
  const f=await fixture();
  const holder=deferred<number>(), waiter=deferred<number>(), release=deferred<void>();
  const first={beforeCommit:async(c:PoolClient)=>{ holder.resolve(await pid(c)); await release.promise; }};
  const second={beforeMutation:async(c:PoolClient)=>{ waiter.resolve(await pid(c)); }};
  const server=await createApp(db,{...config,tutorCancellationHooks:winner==='Tutor'?first:second,
    cancellationHooks:winner==='Customer'?first:second});
  const runTutor=()=>tutorCancel(f.tutor,f.id,tutorReason,server).then(r=>r);
  const runCustomer=()=>cancel(f.customer,f.id,server).then(r=>r);
  const a=(winner==='Tutor'?runTutor:runCustomer)();
  let b:Promise<request.Response>|undefined;
  try {
    const held=await Promise.race([holder.promise,a.then(r=>{throw new Error('First request did not hold: '+r.status);})]);
    b=(winner==='Tutor'?runCustomer:runTutor)();
    await blocked(await Promise.race([waiter.promise,b.then(r=>{throw new Error('Second request did not wait: '+r.status);})]),held);
    expect((await stored(f.id)).status).toBe('Booked');
  } finally {release.resolve();await Promise.allSettled([a,b]);}
  expect((await a).status).toBe(200);
  expect(await b).toMatchObject({status:409,body:{error:{code:'BOOKING_NOT_CANCELLABLE'}}});
  const final=await tutorSnapshot(f);
  expect(final.booking).toMatchObject({status:'Cancelled',cancellationActor:winner});
  expect(final.slot.lifecycle).toBe(winner==='Tutor'?'Withdrawn':'Offered');
  expect(final.notices).toHaveLength(winner==='Tutor'?1:0);
},15000);

it('TCAN-12: revocation during the real lock wait prevents all writes',async()=>{
  const f=await fixture(); const before=await tutorSnapshot(f);
  const holder=await admin.connect(); const waiting=deferred<number>();
  const server=await createApp(db,{...config,tutorCancellationHooks:{beforeMutation:async c=>waiting.resolve(await pid(c))}});
  let res:Promise<request.Response>|undefined;
  try {
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM "User" WHERE id=$1 FOR UPDATE',[f.tutor.id]);
    res=tutorCancel(f.tutor,f.id,tutorReason,server).then(r=>r);
    await blocked(await Promise.race([waiting.promise,res.then(r=>{throw new Error('Cancellation did not wait: '+r.status);})]),await pid(holder));
    await admin.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE id=$1',[f.tutor.sid]);
    await holder.query('COMMIT');
  } finally {try{await holder.query('ROLLBACK');await res;}finally{holder.release();}}
  expect(await res).toMatchObject({status:401,body:{error:{code:'UNAUTHENTICATED'}}});
  expect(await tutorSnapshot(f)).toEqual(before);
},15000);

it('TCAN-06/14: lost acknowledgement reconciles from a fresh app and independent DB connection',async()=>{
  const f=await fixture();
  const uncertain=await createApp(db,{...config,tutorCancellationHooks:{afterCommit:async()=>{throw new Error('fixture lost acknowledgement');}}});
  expect((await tutorCancel(f.tutor,f.id,tutorReason,uncertain).expect(503)).body.error.code).toBe('MUTATION_OUTCOME_UNKNOWN');
  await withCancellationApiProcess(async base => {
    const detail=await fetch(base+'/api/v1/customer/bookings/'+f.id,{headers:{Cookie:f.customer.cookie},signal:AbortSignal.timeout(5000)});
    expect(detail.status).toBe(200);
    expect((await detail.json()).data).toMatchObject({status:'Cancelled',cancellationReason:tutorReason});
    expect((await tutorSnapshot(f)).slot.lifecycle).toBe('Withdrawn');
    expect(await notices(f.id)).toHaveLength(1);
    const retry=await fetch(base+tutorCancelPath(f.id),{method:'POST',headers:{...auth(f.tutor),'Content-Type':'application/json'},
      body:JSON.stringify({reason:tutorReason}),signal:AbortSignal.timeout(5000)});
    expect(retry.status).toBe(409);
  });
});

it.each(['cancel','reschedule'] as const)('TCAN-08: %s wins an HTTP race against the other mutation',async winner=>{
  const f=await fixture();
  const inbound=await user('Tutor');
  const dest=(await admin.query<{id:string}>(
    'INSERT INTO "Slot" ("tutorId","startsAt","endsAt") VALUES ($1,$2,$3) RETURNING id',
    [inbound.id,new Date(f.slot.startsAt.getTime()+3*60*60_000),new Date(f.slot.endsAt.getTime()+3*60*60_000)]
  )).rows[0].id;
  const holder=deferred<number>(), waiter=deferred<number>(), release=deferred<void>();
  const first={beforeCommit:async(c:PoolClient)=>{holder.resolve(await pid(c));await release.promise;}};
  const second={beforeMutation:async(c:PoolClient)=>{waiter.resolve(await pid(c));}};
  const server=await createApp(db,{...config,tutorCancellationHooks:winner==='cancel'?first:second,
    rescheduleHooks:winner==='reschedule'?first:second});
  const doCancel=()=>tutorCancel(f.tutor,f.id,tutorReason,server).then(r=>r);
  const doReschedule=()=>request(server).post('/api/v1/customer/bookings/'+f.id+'/reschedule')
    .set(auth(f.customer)).send({slotId:dest}).then(r=>r);
  const a=(winner==='cancel'?doCancel:doReschedule)();
  let b:Promise<request.Response>|undefined;
  try {
    const held=await Promise.race([holder.promise,a.then(r=>{throw new Error('First request did not hold: '+r.status);})]);
    b=(winner==='cancel'?doReschedule:doCancel)();
    await blocked(await Promise.race([waiter.promise,b.then(r=>{throw new Error('Second request did not wait: '+r.status);})]),held);
  } finally {release.resolve();await Promise.allSettled([a,b]);}
  expect((await a).status).toBe(200);
  expect(await b).toMatchObject(winner==='cancel'?{status:409,body:{error:{code:'RESCHEDULE_NOT_APPLICABLE'}}}
    :{status:404,body:{error:{code:'BOOKING_NOT_FOUND'}}});
  const history=await admin.query('SELECT * FROM "RescheduleHistory" WHERE "bookingId"=$1',[f.id]);
  const final=await tutorSnapshot(f);
  expect(final.booking).toMatchObject(winner==='cancel'?{status:'Cancelled',currentSlotId:f.slot.id}
    :{status:'Booked',currentSlotId:dest});
  expect(final.slot.lifecycle).toBe(winner==='cancel'?'Withdrawn':'Offered');
  expect(final.notices).toHaveLength(winner==='cancel'?1:0);
  expect(history.rows).toHaveLength(winner==='cancel'?0:1);
},15000);

it('TCAN-09/10/13: database backstops enforce immutable Slot/notice history and reject invalid Booking inserts',async()=>{
  const f=await fixture();
  const before=await tutorSnapshot(f);
  await expect(admin.query('UPDATE "Slot" SET lifecycle=$$Withdrawn$$, "withdrawnAt"=clock_timestamp() WHERE id=$1',[f.slot.id])).rejects.toHaveProperty('code');
  await expect(admin.query('INSERT INTO "Booking" ("customerId","currentSlotId","startsAt","endsAt",status) VALUES ($1,$2,$3,$4,$$Cancelled$$)',
    [f.customer.id,f.slot.id,f.slot.startsAt,f.slot.endsAt])).rejects.toHaveProperty('code');
  expect(await tutorSnapshot(f)).toEqual(before);
  await tutorCancel(f.tutor,f.id,tutorReason).expect(200);
  const committed=await tutorSnapshot(f);
  for (const sql of [
    'UPDATE "Slot" SET lifecycle=$$Offered$$, "withdrawnAt"=NULL WHERE id=$1',
    'UPDATE "Slot" SET "tutorId"=gen_random_uuid() WHERE id=$1',
    'UPDATE "Slot" SET id=gen_random_uuid() WHERE id=$1',
    'UPDATE "Slot" SET "startsAt"="startsAt"+interval \'1 minute\' WHERE id=$1',
    'DELETE FROM "Slot" WHERE id=$1',
  ]) await expect(admin.query(sql,[f.slot.id])).rejects.toHaveProperty('code');
  const destructiveProbe=await admin.connect();
  try {
    await destructiveProbe.query('BEGIN');
    await expect(destructiveProbe.query('TRUNCATE "Slot" CASCADE')).rejects.toHaveProperty('code');
  } finally {try{await destructiveProbe.query('ROLLBACK');}finally{destructiveProbe.release();}}
  await expect(admin.query('INSERT INTO "Notification" ("bookingId","recipientCustomerId",kind,"createdAt") SELECT id,"customerId",$$TutorCancelled$$,"cancelledAt" FROM "Booking" WHERE id=$1',[f.id])).rejects.toMatchObject({code:'23505'});
  expect(await tutorSnapshot(f)).toEqual(committed);
});
