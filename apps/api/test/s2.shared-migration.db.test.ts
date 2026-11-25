import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

const db = new Pool({ connectionString: process.env.S2_REVIEW_DATABASE_URL, max: 8, connectionTimeoutMillis: 5000 });
const marker = randomUUID().slice(0, 8);
let customer: string;
const admin = new Pool({ connectionString: process.env.S2_PROBE_DATABASE_URL, max: 2, connectionTimeoutMillis: 5000 });
async function session(user: string) {
  return (await db.query<{ id: string }>(
    'INSERT INTO "Session" ("userId","tokenDigest","csrfNonce","expiresAt") VALUES ($1,decode($2,$3),decode($4,$3),clock_timestamp()+interval \'1 hour\') RETURNING "id"',
    [user,randomUUID().replaceAll('-','').repeat(2),'hex',randomUUID().replaceAll('-','').repeat(2)],
  )).rows[0].id;
}
async function actorFor(id: string) {
  const actor = (await db.query<{customerId:string}>('SELECT "customerId" FROM "Booking" WHERE "id"=$1',[id])).rows[0].customerId;
  return [actor, await session(actor)] as const;
}
async function mutate(c: Pool | PoolClient, op: string, user: string, sid: string, target: string, dest?: string, reason?: string) {
  return (await c.query<{t:Date}>('SELECT public.s2_mutate($1,$2,$3,$4,$5,$6) AS t',[op,user,sid,target,dest??null,reason??null])).rows[0].t;
}

async function slot(minutes = 180) {
  const start = new Date(Date.now() + minutes * 60_000);
  const id = randomUUID();
  const slotTutor = (await db.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3) RETURNING "id"', [randomUUID()+'@tutor.test.invalid','fixture','Tutor'])).rows[0].id as string;
  await db.query('INSERT INTO "Slot"("id","tutorId","startsAt","endsAt") VALUES($1,$2,$3,$4)', [id, slotTutor, start, new Date(start.getTime() + 3_600_000)]);
  return { id, tutor: slotTutor, start, end: new Date(start.getTime() + 3_600_000) };
}
async function booking(s: { id: string; start: Date; end: Date }, customerId?: string) {
  const id = randomUUID();
  const ownerId = customerId ?? (await db.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3) RETURNING "id"', [randomUUID()+'@customer.test.invalid','fixture','Customer'])).rows[0].id as string;
  await db.query('INSERT INTO "Booking"("id","customerId","currentSlotId","startsAt","endsAt") VALUES($1,$2,$3,$4,$5)', [id, ownerId, s.id, s.start, s.end]);
  return id;
}
async function rejected(action: () => Promise<unknown>, expected: string) {
  let failure: { code?: string } | undefined;
  try { await action(); } catch (error) { failure = error as { code?: string }; }
  expect(failure?.code).toBe(expected);
}
async function waitBlocked(waiterPid: number, blockerPid: number) {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const result = await db.query('SELECT pg_blocking_pids($1) AS blockers', [waiterPid]);
    if ((result.rows[0].blockers as number[]).includes(blockerPid)) return;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Expected independent PostgreSQL backend to be blocked by barrier holder');
}

async function transaction(work: (client: PoolClient) => Promise<void>, finish: 'COMMIT' | 'ROLLBACK', verify: (observer: PoolClient) => Promise<void>) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await work(client);
    await client.query(finish);
    const observer = await db.connect();
    try {
      const pid = 'SELECT pg_backend_pid() AS pid';
      expect((await observer.query(pid)).rows[0].pid).not.toBe((await client.query(pid)).rows[0].pid);
      await verify(observer);
    } finally { observer.release(); }
  } finally {
    try { await client.query('ROLLBACK'); } finally { client.release(); }
  }
}

describe('Sprint 2 shared migration and Booking/Slot guards on isolated PostgreSQL 18', () => {
  beforeAll(async () => {
    const url = new URL(process.env.S2_REVIEW_DATABASE_URL ?? 'invalid:');
    const instance = process.env.S2_REVIEW_INSTANCE;
    const dbName = process.env.S2_REVIEW_DB_NAME ?? '';
    const githubCi = process.env.CI === 'true' && process.env.GITHUB_ACTIONS === 'true';
    const expectedPort = githubCi ? '5432' : '15439';
    const expectedDb = githubCi ? dbName === 'nuttiew_ci' : /^nuttiew_s2_pair_final(?:_[a-z0-9]+)?$/.test(dbName);
    const expectedProbeRole = githubCi ? 'nuttiew_ci_booking_probe' : 's2_review_probe';
    if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== expectedPort ||
        !expectedDb || url.pathname !== '/' + dbName || url.username !== 'nuttiew_ci_runtime' || url.search || !instance ||
        (githubCi && process.env.S2_REGRESSION_SCHEMA !== 'candidate')) {
      throw new Error('Expected the dedicated loopback S2 review database and runtime role');
    }
    const result = await db.query("SELECT current_database() AS db, current_user AS role, session_user AS login, inet_server_port() AS port, current_setting('server_version_num')::int / 10000 AS major, current_setting('nuttiew.review_instance', true) AS instance");
    expect(result.rows[0]).toEqual({ db: dbName, role: 'nuttiew_ci_runtime', login: 'nuttiew_ci_runtime', port: 5432, major: 18, instance });
    customer = (await db.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3) RETURNING "id"', [marker + '-c@example.test', 'fixture', 'Customer'])).rows[0].id;
    const probeUrl = new URL(process.env.S2_PROBE_DATABASE_URL ?? 'invalid:');
    expect([probeUrl.protocol,probeUrl.hostname,probeUrl.port,probeUrl.pathname,probeUrl.username,probeUrl.search]).toEqual(['postgresql:','127.0.0.1',expectedPort,url.pathname,expectedProbeRole,'']);
    expect((await admin.query("SELECT current_database() db, current_user AS role, current_setting('nuttiew.review_instance', true) AS instance")).rows[0]).toEqual({db:dbName,role:expectedProbeRole,instance});
  }, 120_000);
  afterAll(async () => { await Promise.all([db.end(),admin.end()]); }, 60_000);

  it('enforces inherited Lab 7 Q05 90-minute cutoff through the S2 Booking guard', async () => {
    const exactArithmetic = await db.query<{ exactPass: boolean; belowFails: boolean }>(
      `SELECT ($1::timestamptz - $2::timestamptz >= interval '90 minutes') AS "exactPass",
              ($3::timestamptz - $2::timestamptz >= interval '90 minutes') AS "belowFails"`,
      ['2030-01-01T01:30:00Z', new Date('2030-01-01T00:00:00.000Z'), '2030-01-01T01:29:59.999999Z'],
    );
    expect(exactArithmetic.rows[0]).toEqual({ exactPass: true, belowFails: false });

    const valid = await slot(120);
    await expect(booking(valid)).resolves.toBeTruthy();
    // 89 minutes would still pass the old 60-minute S2 guard; it must now fail Q05.
    const tooLate = await slot(89);
    await rejected(() => booking(tooLate), 'P0B02');
  });

  it('cancels a Customer Booking without changing Slot and rejects Cancelled-to-Booked', async () => {
    const s = await slot(); const id = await booking(s); const before = (await db.query('SELECT * FROM "Slot" WHERE "id"=$1', [s.id])).rows[0];
    const t = await mutate(db,'CustomerCancel',...await actorFor(id),id);
    expect((await db.query('SELECT "status","cancellationActor","cancelledAt","updatedAt" FROM "Booking" WHERE "id"=$1', [id])).rows[0]).toMatchObject({ status: 'Cancelled', cancellationActor: 'Customer', cancelledAt: t, updatedAt: t });
    expect((await db.query('SELECT * FROM "Slot" WHERE "id"=$1', [s.id])).rows[0]).toEqual(before);
    expect((await db.query('SELECT count(*)::int AS n FROM "Booking" WHERE "currentSlotId"=$1 AND "status"=$2', [s.id, 'Booked'])).rows[0].n).toBe(0);
    await rejected(() => admin.query('UPDATE "Booking" SET "status"=$2 WHERE "id"=$1', [id, 'Booked']), '23514');
  });

  it('rejects cancellation without metadata, reschedule without history, occupied withdrawal and reactivation', async () => {
    const s = await slot(); const id = await booking(s);
    await rejected(() => admin.query('UPDATE "Booking" SET "status"=$2 WHERE "id"=$1', [id, 'Cancelled']), '23514');
    const dst = await slot(240);
    await rejected(() => admin.query('UPDATE "Booking" SET "currentSlotId"=$2,"startsAt"=$3,"endsAt"=$4 WHERE "id"=$1', [id,dst.id,dst.start,dst.end]), '23514');
    const sid = await session(s.tutor);
    await rejected(() => mutate(db,'Withdraw',s.tutor,sid,s.id),'P0B03');
    await mutate(db,'CustomerCancel',...await actorFor(id),id);
    await mutate(db,'Withdraw',s.tutor,sid,s.id);
    await rejected(() => admin.query('UPDATE "Slot" SET "lifecycle"=$2,"withdrawnAt"=NULL WHERE "id"=$1', [s.id,'Offered']), 'P0B04');
  });

  it('accepts exactly one matching history row and persists the same Booking assignment atomically', async () => {
    const old = await slot(); const next = await slot(240); const id = await booking(old);
    const [owner,sid] = await actorFor(id);
    let changedAt: Date;
    await transaction(async client => {
      changedAt = await mutate(client,'Reschedule',owner,sid,id,next.id);
    }, 'COMMIT', async observer => {
      expect((await observer.query('SELECT "customerId","currentSlotId","updatedAt" FROM "Booking" WHERE "id"=$1', [id])).rows[0]).toMatchObject({ customerId: owner, currentSlotId: next.id, updatedAt: changedAt });
      expect((await observer.query('SELECT count(*)::int AS n FROM "RescheduleHistory" WHERE "bookingId"=$1', [id])).rows[0].n).toBe(1);
    });
  });

  it('rolls back history INSERT if the paired Booking move is not committed', async () => {
    const old = await slot(); const next = await slot(240); const id = await booking(old);
    const auth = await actorFor(id);
    await transaction(async client => {
      await mutate(client,'Reschedule',...auth,id,next.id);
    }, 'ROLLBACK', async observer => {
      expect((await observer.query('SELECT "currentSlotId" FROM "Booking" WHERE "id"=$1', [id])).rows[0].currentSlotId).toBe(old.id);
      expect((await observer.query('SELECT count(*)::int AS n FROM "RescheduleHistory" WHERE "bookingId"=$1', [id])).rows[0].n).toBe(0);
    });
  });

  for (const isolation of ['READ COMMITTED', 'REPEATABLE READ', 'SERIALIZABLE']) {
    for (const operation of ['insert', 'move-in', 'move-out']) {
      for (const withdrawalFirst of [false, true]) {
        it(isolation + ' / ' + operation + ' / withdrawal first=' + withdrawalFirst, async () => {
          const target = await slot();
          const other = await slot(300);
          const src = operation === 'move-out' ? target : other;
          const dst = operation === 'move-out' ? other : target;
          const id = operation === 'insert' ? randomUUID() : await booking(src);
          const raceOwner = (await db.query('INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3) RETURNING "id"', [randomUUID() + '@race.test.invalid', 'fixture', 'Customer'])).rows[0].id;
          const withdrawSid = await session(target.tutor);
          const moveAuth = operation === 'insert' ? null : await actorFor(id);
          const holder = await db.connect();
          const contender = await db.connect();
          let pending: Promise<string> | undefined;
          async function raceWrite(client: PoolClient, withdraw: boolean) {
            if (withdraw) {
              await mutate(client,'Withdraw',target.tutor,withdrawSid,target.id);
            } else if (operation === 'insert') {
              await client.query('INSERT INTO "Booking"("id","customerId","currentSlotId","startsAt","endsAt") VALUES($1,$2,$3,$4,$5)', [id, raceOwner, dst.id, dst.start, dst.end]);
            } else {
              await mutate(client,'Reschedule',...moveAuth!,id,dst.id);
            }
          }
          try {
            for (const c of [holder, contender]) {
              await c.query('BEGIN ISOLATION LEVEL ' + isolation);
              await c.query("SET LOCAL statement_timeout = '7s'");
              await c.query('SELECT count(*) FROM "Booking" WHERE "currentSlotId"=$1', [target.id]);
            }
            const run = async (client: PoolClient, withdraw: boolean) => {
              await raceWrite(client, withdraw);
              await client.query('COMMIT');
              return 'committed';
            };
            if (withdrawalFirst && operation === 'move-out') {
              await rejected(() => raceWrite(holder, true), 'P0B03');
              await holder.query('ROLLBACK');
              expect(await run(contender, false)).toBe('committed');
            } else {
              await raceWrite(holder, withdrawalFirst);
              const pid = async (c: PoolClient) => Number((await c.query('SELECT pg_backend_pid() AS pid')).rows[0].pid);
              const [waiter, blocker] = await Promise.all([pid(contender), pid(holder)]);
              pending = run(contender, !withdrawalFirst).catch((e: {code?: string}) => e.code ?? 'unexpected');
              await waitBlocked(waiter, blocker);
              await holder.query('COMMIT');
              const outcome = await pending;
              if (withdrawalFirst) expect(['P0B01','23514','40001']).toContain(outcome);
              else if (operation === 'move-out') expect(isolation === 'READ COMMITTED' ? ['committed'] : ['40001']).toContain(outcome);
              else expect(isolation === 'READ COMMITTED' ? ['P0B03'] : ['40001']).toContain(outcome);
            }
            const state = (await db.query('SELECT s."lifecycle",(SELECT count(*)::int FROM "Booking" b WHERE b."currentSlotId"=s."id" AND b."status"=$2) AS active FROM "Slot" s WHERE s."id"=$1', [target.id, 'Booked'])).rows[0];
            expect(state).toEqual(withdrawalFirst && operation !== 'move-out' || !withdrawalFirst && operation === 'move-out' && isolation === 'READ COMMITTED' ? { lifecycle: 'Withdrawn', active: 0 } : { lifecycle: 'Offered', active: operation === 'move-out' ? 0 : 1 });
          } finally {
            try { await holder.query('ROLLBACK'); await pending; await contender.query('ROLLBACK'); }
            finally { holder.release(); contender.release(); }
          }
        }, 12_000);
      }
    }
  }

  it('creates exactly one Tutor cancellation notice atomically and protects its content', async () => {
    const s = await slot(); const id = await booking(s); const sid = await session(s.tutor);
    await transaction(async client => {
      await mutate(client,'TutorCancel',s.tutor,sid,id,undefined,'schedule changed');
    }, 'COMMIT', async observer => {
      const notice = (await observer.query('SELECT "id" FROM "Notification" WHERE "bookingId"=$1', [id])).rows[0].id;
      await rejected(() => observer.query('UPDATE "Notification" SET "kind"=$2 WHERE "id"=$1', [notice, 'Other']), '42501');
      expect((await observer.query('SELECT count(*)::int AS n FROM "Notification" WHERE "bookingId"=$1', [id])).rows[0].n).toBe(1);
    });
  });

  it('marks a notice only for its recipient and keeps its first read timestamp', async () => {
    const s = await slot(); const id = await booking(s);
    const auth = await actorFor(id);
    await mutate(db, 'TutorCancel', s.tutor, await session(s.tutor), id, undefined, 'fixture reason');
    const notice = (await db.query('SELECT "id" FROM "Notification" WHERE "bookingId"=$1', [id])).rows[0].id;
    const foreignSid = await session(customer);
    await rejected(() => mutate(db, 'MarkRead', customer, foreignSid, notice), 'P0002');
    await rejected(() => mutate(db, 'MarkRead', auth[0], foreignSid, notice), '28000');
    const first = await mutate(db, 'MarkRead', ...auth, notice);
    const tuple = async () => (await db.query('SELECT ctid::text AS tuple FROM "Notification" WHERE "id"=$1', [notice])).rows[0].tuple;
    const beforeRepeat = await tuple();
    expect(await mutate(db, 'MarkRead', ...auth, notice)).toEqual(first);
    expect(await tuple()).toBe(beforeRepeat);
    expect((await db.query('SELECT "readAt" FROM "Notification" WHERE "id"=$1', [notice])).rows[0].readAt).toEqual(first);
  });

  it('rejects foreign and unknown targets without waiting on foreign domain locks', async () => {
    const s = await slot(); const id = await booking(s);
    const dst = await slot(240);
    const [owner, ownerSid] = await actorFor(id);
    const otherCustomerSid = await session(customer);
    const otherTutor = dst.tutor;
    const otherTutorSid = await session(otherTutor);
    const holder = await db.connect();
    const outsider = await db.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT "id" FROM "User" WHERE "id" IN ($1,$2) ORDER BY "id" FOR UPDATE', [owner,s.tutor]);
      await holder.query('SELECT "id" FROM "Slot" WHERE "id"=$1 FOR UPDATE', [s.id]);
      await outsider.query("SET statement_timeout = '1s'");
      for (const target of [id, randomUUID()]) {
        await rejected(() => mutate(outsider,'CustomerCancel',customer,otherCustomerSid,target),'P0002');
        await rejected(() => mutate(outsider,'Reschedule',customer,otherCustomerSid,target,dst.id),'P0002');
        await rejected(() => mutate(outsider,'TutorCancel',otherTutor,otherTutorSid,target,undefined,'fixture'),'P0002');
      }
      for (const target of [s.id, randomUUID()]) {
        await rejected(() => mutate(outsider,'Withdraw',otherTutor,otherTutorSid,target),'P0002');
      }
    } finally {
      try { await holder.query('ROLLBACK'); } finally { holder.release(); }
      try { await outsider.query('RESET statement_timeout'); } finally { outsider.release(); }
    }
    const tutorSid = await session(s.tutor);
    await rejected(() => mutate(db,'CustomerCancel',s.tutor,tutorSid,id),'42501');
    await rejected(() => mutate(db,'TutorCancel',owner,ownerSid,id,undefined,'fixture'),'42501');
    await db.query('UPDATE "Session" SET "revokedAt"=clock_timestamp() WHERE "id"=$1',[ownerSid]);
    await rejected(() => mutate(db,'CustomerCancel',owner,ownerSid,id),'28000');
    await db.query('UPDATE "User" SET "isActive"=false WHERE "id"=$1',[s.tutor]);
    await rejected(() => mutate(db,'Withdraw',s.tutor,tutorSid,s.id),'28000');
    expect((await db.query(`SELECT b."status",b."currentSlotId",s."lifecycle",
      EXISTS (SELECT 1 FROM "RescheduleHistory" WHERE "bookingId"=b."id") AS moved,
      EXISTS (SELECT 1 FROM "Notification" WHERE "bookingId"=b."id") AS notified
      FROM "Booking" b JOIN "Slot" s ON s."id"=b."currentSlotId" WHERE b."id"=$1`,[id])).rows)
      .toEqual([{status:'Booked',currentSlotId:s.id,lifecycle:'Offered',moved:false,notified:false}]);
  });

  it('refuses a destination inside the notice window without consuming the quota', async () => {
    const s = await slot(); const id = await booking(s); const dst = await slot(45);
    const auth = await actorFor(id);
    await rejected(() => mutate(db, 'Reschedule', ...auth, id, dst.id), 'P0B05');
    expect((await db.query('SELECT "currentSlotId" FROM "Booking" WHERE "id"=$1', [id])).rows[0].currentSlotId).toBe(s.id);
    expect((await db.query('SELECT 1 FROM "RescheduleHistory" WHERE "bookingId"=$1', [id])).rowCount).toBe(0);
  });

  it('rejects incomplete Tutor cancellation at COMMIT and rolls back all rows', async () => {
    const s = await slot(); const id = await booking(s);
    const c = await admin.connect();
    try {
      await c.query('BEGIN');
      const t = (await c.query('SELECT clock_timestamp()::text AS t')).rows[0].t;
      await c.query('UPDATE "Booking" SET "status"=$2,"cancellationActor"=$3,"tutorCancellationReason"=$4,"cancelledAt"=$5,"updatedAt"=$5 WHERE "id"=$1', [id, 'Cancelled', 'Tutor', 'fixture reason', t]);
      await rejected(() => c.query('COMMIT'), '23514');
      const observed = await db.query('SELECT b."status",s."lifecycle",n."id" AS notice FROM "Booking" b JOIN "Slot" s ON s."id"=b."currentSlotId" LEFT JOIN "Notification" n ON n."bookingId"=b."id" WHERE b."id"=$1', [id]);
      expect(observed.rows).toEqual([{status:'Booked',lifecycle:'Offered',notice:null}]);
    } finally { try { await c.query('ROLLBACK'); } finally { c.release(); } }
  });

  it('rejects a well-formed synthetic cancellation from the runtime login', async () => {
    const s = await slot();
    await rejected(() => db.query('INSERT INTO "Booking" ("customerId","currentSlotId","startsAt","endsAt","status","cancellationActor","cancelledAt") VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp())', [customer,s.id,s.start,s.end,'Cancelled','Customer']), '42501');
  });

  it('reserves S2 domain writes for the SQL interface', async () => {
    const s = await slot(); const id = await booking(s);
    await rejected(() => db.query('UPDATE "Booking" SET "status"=$2 WHERE "id"=$1', [id, 'Cancelled']), '42501');
    await rejected(() => db.query('UPDATE "Slot" SET "lifecycle"=$2 WHERE "id"=$1', [s.id, 'Withdrawn']), '42501');
    await rejected(() => db.query('INSERT INTO "RescheduleHistory" DEFAULT VALUES'), '42501');
    await rejected(() => db.query('INSERT INTO "Notification" ("bookingId","recipientCustomerId","kind","createdAt") VALUES ($1,$2,$3,clock_timestamp())', [id,customer,'TutorCancelled']), '42501');
  });

  it('denies runtime trigger control and direct writes to guard rows', async () => {
    await rejected(() => db.query('ALTER TABLE "Booking" DISABLE TRIGGER booking_s2_row_guard'), '42501');
    await rejected(() => db.query('UPDATE public.s2_slot_guard SET version=0'), '42501');
  });

  it('rolls back a pre-COMMIT cancellation and leaves the original Booking active', async () => {
    const s = await slot(); const id = await booking(s); const auth = await actorFor(id);
    await transaction(async client => {
      await mutate(client,'CustomerCancel',...auth,id);
    }, 'ROLLBACK', async observer => {
      expect((await observer.query('SELECT "status" FROM "Booking" WHERE "id"=$1', [id])).rows[0].status).toBe('Booked');
      expect((await observer.query('SELECT count(*)::int AS n FROM "Booking" WHERE "currentSlotId"=$1 AND "status"=$2', [s.id, 'Booked'])).rows[0].n).toBe(1);
    });
  });
});
