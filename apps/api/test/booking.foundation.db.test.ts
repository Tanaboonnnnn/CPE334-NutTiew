import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';

const owner = new Pool({ connectionString: process.env.DATABASE_URL!, max: 8 });
const runtimeUrl = process.env.DATABASE_URL_APP;
const probeUrl = process.env.DATABASE_URL_BOOKING_PROBE;
const runtime = runtimeUrl ? new Pool({ connectionString: runtimeUrl, max: 2 }) : null;
const probe = probeUrl ? new Pool({ connectionString: probeUrl, max: 4 }) : null;

type Fixture = { customerId: string; tutorId: string; slotId: string; startsAt: Date; endsAt: Date };
const future = (minutes = 180) => new Date(Date.now() + minutes * 60_000);
async function user(role: 'Customer' | 'Tutor' = 'Customer') {
  const email = `bdf-${role.toLowerCase()}-${randomUUID()}@example.test`;
  const r = await owner.query<{ id: string }>(
    'INSERT INTO "User"("email","passwordHash","role") VALUES($1,$2,$3) RETURNING "id"',
    [email, 'test-only-not-a-real-password-hash', role],
  );
  return r.rows[0].id;
}
async function fixture(start = future()) : Promise<Fixture> {
  const customerId = await user('Customer');
  const tutorId = await user('Tutor');
  const endsAt = new Date(start.getTime() + 60 * 60_000);
  const r = await owner.query<{ id: string }>(
    'INSERT INTO "Slot"("tutorId","startsAt","endsAt") VALUES($1,$2,$3) RETURNING "id"',
    [tutorId, start, endsAt],
  );
  return { customerId, tutorId, slotId: r.rows[0].id, startsAt: start, endsAt };
}
async function insertBooking(f: Fixture, status = 'Booked', pool: Pool = owner) {
  return pool.query<{ id: string }>(
    'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt","status") VALUES($1,$2,$3,$4,$5) RETURNING "id"',
    [f.customerId, f.slotId, f.startsAt, f.endsAt, status],
  );
}
async function blockedBy(waiter: number, blocker: number) {
  const deadline = Date.now() + 7_000;
  while (Date.now() < deadline) {
    const r = await owner.query<{ blockers: number[] }>(
      'SELECT pg_blocking_pids($1) AS blockers', [waiter],
    );
    if (r.rows[0].blockers.includes(blocker)) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(`BDF barrier did not observe backend ${waiter} blocked by ${blocker}`);
}
async function pid(client: PoolClient) {
  return (await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0].pid;
}

beforeAll(async () => {
  const required = await owner.query<{ version: string }>('SELECT version()');
  console.info('BDF_POSTGRES_VERSION', required.rows[0].version);
  const extension = await owner.query<{ extversion: string }>(
    "SELECT extversion FROM pg_extension WHERE extname='btree_gist'",
  );
  expect(extension.rowCount).toBe(1);
  console.info('BDF_BTREE_GIST_VERSION', extension.rows[0].extversion);
});
afterAll(async () => {
  await Promise.all([owner.end(), runtime?.end(), probe?.end()]);
});

describe('D1-08A / BDF-01..BDF-26 — real PostgreSQL foundation', () => {
  it('BDF-01 fresh migration installed canonical table, constraints and indexes', async () => {
    const r = await owner.query<{ name: string }>(
      `SELECT conname AS name FROM pg_constraint WHERE conrelid='"Booking"'::regclass
       UNION ALL SELECT indexname FROM pg_indexes WHERE tablename='Booking'`,
    );
    const names = new Set(r.rows.map(x => x.name));
    for (const name of [
      'booking_status_check','booking_positive_interval','booking_customer_fk',
      'booking_current_slot_window_fk','booked_customer_no_overlap',
      'Booking_customerId_idx','Booking_currentSlotId_idx','booking_one_active_per_slot',
    ]) expect(names.has(name)).toBe(true);
    const slotWindow = await owner.query(
      `SELECT 1 FROM pg_constraint WHERE conrelid='"Slot"'::regclass AND conname='slot_id_window_unique'`,
    );
    expect(slotWindow.rowCount).toBe(1);
    const triggers = await owner.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger WHERE tgrelid='"Booking"'::regclass AND NOT tgisinternal ORDER BY tgname`,
    );
    expect(triggers.rows.map(x => x.tgname)).toEqual(['booking_s1_row_guard','booking_s1_truncate_guard']);
  });

  it('BDF-03 preserves existing Auth and Slot schema objects after migration', async () => {
    const tables = await owner.query<{ name: string }>(
      `SELECT tablename AS name FROM pg_tables WHERE schemaname='public'`,
    );
    for (const name of ['User','Session','AuthAttemptBucket','AuthAttemptReservation','Slot','Booking'])
      expect(tables.rows.some(x => x.name === name)).toBe(true);
    const slotTriggers = await owner.query<{ tgname: string }>(
      `SELECT tgname FROM pg_trigger WHERE tgrelid='"Slot"'::regclass AND NOT tgisinternal`,
    );
    expect(slotTriggers.rows.map(x => x.tgname).sort()).toEqual([
      'slot_s1_insert_guard','slot_s1_truncate_guard','slot_s1_update_delete_guard',
    ]);
  });

  it('BDF-04 persists Booked and Cancelled as distinct stored statuses', async () => {
    const a = await fixture();
    const booked = await insertBooking(a);
    const b = await fixture(new Date(a.endsAt.getTime() + 2 * 60 * 60_000));
    const cancelled = await insertBooking(b, 'Cancelled');
    const rows = await owner.query<{ id: string; status: string }>(
      'SELECT "id","status" FROM "Booking" WHERE "id" = ANY($1::uuid[]) ORDER BY "status"',
      [[booked.rows[0].id, cancelled.rows[0].id]],
    );
    expect(rows.rows.map(x => x.status).sort()).toEqual(['Booked','Cancelled']);
  });

  it('BDF-05 rejects zero and negative intervals', async () => {
    const f = await fixture();
    for (const [start,end] of [[f.startsAt,f.startsAt],[f.endsAt,f.startsAt]]) {
      await expect(owner.query(
        'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt") VALUES($1,$2,$3,$4)',
        [f.customerId,f.slotId,start,end],
      )).rejects.toMatchObject({ code:'23514', constraint:'booking_positive_interval' });
    }
  });

  it('BDF-06 rejects unsupported status', async () => {
    const f = await fixture();
    await expect(insertBooking(f,'Completed')).rejects.toMatchObject({
      code:'23514', constraint:'booking_status_check',
    });
  });

  it('BDF-07 rejects an unknown Customer', async () => {
    const f = await fixture();
    await expect(owner.query(
      'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt") VALUES($1,$2,$3,$4)',
      [randomUUID(),f.slotId,f.startsAt,f.endsAt],
    )).rejects.toMatchObject({ code:'23503', constraint:'booking_customer_fk' });
  });

  it('BDF-08 rejects an unknown Slot', async () => {
    const f = await fixture();
    await expect(owner.query(
      'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt") VALUES($1,$2,$3,$4)',
      [f.customerId,randomUUID(),f.startsAt,f.endsAt],
    )).rejects.toMatchObject({ code:'23503', constraint:'booking_current_slot_window_fk' });
  });

  it('BDF-09 rejects a Booking snapshot that differs from the referenced Slot', async () => {
    const f = await fixture();
    await expect(owner.query(
      'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt") VALUES($1,$2,$3,$4)',
      [f.customerId,f.slotId,new Date(f.startsAt.getTime()+1_000),f.endsAt],
    )).rejects.toMatchObject({ code:'23503', constraint:'booking_current_slot_window_fk' });
  });

  it('BDF-10 enforces one active Booking per Slot', async () => {
    const f = await fixture();
    await insertBooking(f);
    const other = { ...f, customerId: await user('Customer') };
    await expect(insertBooking(other)).rejects.toMatchObject({
      code:'23505', constraint:'booking_one_active_per_slot',
    });
  });

  it('BDF-11 serializes concurrent same-Slot claims to one committed row', async () => {
    const f = await fixture();
    const other = { ...f, customerId: await user('Customer') };
    const a = await owner.connect(), b = await owner.connect();
    try {
      await a.query('BEGIN'); await b.query('BEGIN');
      await a.query(
        'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt") VALUES($1,$2,$3,$4)',
        [f.customerId,f.slotId,f.startsAt,f.endsAt],
      );
      const bPid = await pid(b), aPid = await pid(a);
      const pending = b.query(
        'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt") VALUES($1,$2,$3,$4)',
        [other.customerId,f.slotId,f.startsAt,f.endsAt],
      ).then(() => 'COMMITTED').catch((e: { code: string }) => e.code);
      await blockedBy(bPid,aPid);
      await a.query('COMMIT');
      expect(await pending).toBe('23505');
      await b.query('ROLLBACK');
      const count = await owner.query('SELECT count(*)::int AS n FROM "Booking" WHERE "currentSlotId"=$1 AND "status"=\'Booked\'', [f.slotId]);
      expect(count.rows[0].n).toBe(1);
    } finally { await a.query('ROLLBACK').catch(()=>{}); await b.query('ROLLBACK').catch(()=>{}); a.release(); b.release(); }
  });

  it('BDF-12 rejects overlapping active intervals for one Customer across Tutors', async () => {
    const a = await fixture();
    const b = await fixture(new Date(a.startsAt.getTime()+30*60_000));
    b.customerId = a.customerId;
    await insertBooking(a);
    await expect(insertBooking(b)).rejects.toMatchObject({
      code:'23P01', constraint:'booked_customer_no_overlap',
    });
  });

  it('BDF-13 serializes concurrent cross-Tutor overlapping claims', async () => {
    const aFixture = await fixture();
    const bFixture = await fixture(new Date(aFixture.startsAt.getTime()+30*60_000));
    bFixture.customerId = aFixture.customerId;
    const a = await owner.connect(), b = await owner.connect();
    try {
      await a.query('BEGIN'); await b.query('BEGIN');
      await a.query(
        'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt") VALUES($1,$2,$3,$4)',
        [aFixture.customerId,aFixture.slotId,aFixture.startsAt,aFixture.endsAt],
      );
      const bPid = await pid(b), aPid = await pid(a);
      const pending = b.query(
        'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt") VALUES($1,$2,$3,$4)',
        [bFixture.customerId,bFixture.slotId,bFixture.startsAt,bFixture.endsAt],
      ).then(() => 'COMMITTED').catch((e: { code: string }) => e.code);
      await blockedBy(bPid,aPid);
      await a.query('COMMIT');
      expect(await pending).toBe('23P01');
      await b.query('ROLLBACK');
      const rows = await owner.query(
        'SELECT count(*)::int AS n FROM "Booking" WHERE "customerId"=$1 AND "status"=\'Booked\' AND tstzrange("startsAt","endsAt",\'[)\') && tstzrange($2,$3,\'[)\')',
        [aFixture.customerId,bFixture.startsAt,bFixture.endsAt],
      );
      expect(rows.rows[0].n).toBe(1);
    } finally { await a.query('ROLLBACK').catch(()=>{}); await b.query('ROLLBACK').catch(()=>{}); a.release(); b.release(); }
  });

  it('BDF-14 permits adjacent half-open intervals for one Customer', async () => {
    const a = await fixture();
    const b = await fixture(a.endsAt);
    b.customerId = a.customerId;
    await insertBooking(a); await insertBooking(b);
    const r = await owner.query(
      'SELECT count(*)::int AS n FROM "Booking" WHERE "customerId"=$1 AND "status"=\'Booked\'',[a.customerId],
    );
    expect(r.rows[0].n).toBe(2);
  });

  it('BDF-15 Cancelled rows do not occupy a Slot or overlap a Customer', async () => {
    const a = await fixture();
    await insertBooking(a,'Cancelled');
    await insertBooking({ ...a, customerId: await user('Customer') });
    const c = await fixture(new Date(a.startsAt.getTime()+30*60_000));
    c.customerId = a.customerId;
    await insertBooking(c,'Cancelled');
    const d = await fixture(new Date(a.startsAt.getTime()+30*60_000));
    d.customerId = a.customerId;
    await insertBooking(d);
  });

  it('BDF-16 restricts parent deletion and Slot window mutation', async () => {
    const f = await fixture();
    await insertBooking(f);
    await expect(owner.query('DELETE FROM "User" WHERE "id"=$1',[f.customerId]))
      .rejects.toMatchObject({ code:'23001', constraint:'booking_customer_fk' });
    await expect(owner.query('UPDATE "User" SET "id"=$2 WHERE "id"=$1',[f.customerId,randomUUID()]))
      .rejects.toMatchObject({ code:'23001', constraint:'booking_customer_fk' });
    await expect(owner.query('DELETE FROM "Slot" WHERE "id"=$1',[f.slotId]))
      .rejects.toMatchObject({ code:'23514', constraint:'slot_s1_immutable' });
    await expect(owner.query('UPDATE "Slot" SET "startsAt"="startsAt"+interval \'1 minute\' WHERE "id"=$1',[f.slotId]))
      .rejects.toMatchObject({ code:'23514', constraint:'slot_s1_immutable' });
  });

  it('BDF-17 derives occupied Slot and Customer overlap from committed Booking rows', async () => {
    const f = await fixture();
    await insertBooking(f);
    const occupied = await owner.query(
      'SELECT EXISTS(SELECT 1 FROM "Booking" WHERE "currentSlotId"=$1 AND "status"=\'Booked\') AS occupied',[f.slotId],
    );
    const overlap = await owner.query(
      'SELECT EXISTS(SELECT 1 FROM "Booking" WHERE "customerId"=$1 AND "status"=\'Booked\' AND "startsAt"<$3 AND $2<"endsAt") AS overlaps',
      [f.customerId,f.startsAt,f.endsAt],
    );
    expect(occupied.rows[0].occupied).toBe(true);
    expect(overlap.rows[0].overlaps).toBe(true);
  });

  it('BDF-18 records the installed btree_gist version', async () => {
    const r = await owner.query<{ extversion: string }>(
      "SELECT extversion FROM pg_extension WHERE extname='btree_gist'",
    );
    expect(r.rows[0].extversion).toBeTruthy();
    console.info('BDF_EXTENSION_EVIDENCE',r.rows[0].extversion);
  });

  it('BDF-19 Prisma-facing relations and SQL-only partial/exclusion objects agree', async () => {
    const r = await owner.query<{ definition: string; predicate: string | null }>(
      `SELECT pg_get_indexdef(i.indexrelid) AS definition,
              pg_get_expr(i.indpred,i.indrelid) AS predicate
       FROM pg_index i WHERE i.indrelid='"Booking"'::regclass`,
    );
    expect(r.rows.some(x => x.definition.includes('booking_one_active_per_slot')
      && x.predicate?.includes('Booked'))).toBe(true);
    const fk = await owner.query(
      `SELECT conname FROM pg_constraint WHERE conrelid='"Booking"'::regclass AND contype='f'`,
    );
    expect(fk.rows.map(x => x.conname).sort()).toEqual([
      'booking_current_slot_window_fk','booking_customer_fk',
    ]);
  });

  it('BDF-20 rejects non-Offered Booked INSERT and every UPDATE/DELETE with 0A000', async () => {
    const f = await fixture();
    await owner.query('ALTER TABLE "Slot" DISABLE TRIGGER slot_s1_insert_guard');
    try {
      await owner.query(
        'INSERT INTO "Slot"("id","tutorId","startsAt","endsAt","lifecycle","withdrawnAt") VALUES($1,$2,$3,$4,\'Withdrawn\',now())',
        [randomUUID(),f.tutorId,f.startsAt,f.endsAt],
      );
    } finally { await owner.query('ALTER TABLE "Slot" ENABLE TRIGGER slot_s1_insert_guard'); }
    const withdrawn = await owner.query<{ id: string }>(
      'SELECT "id" FROM "Slot" WHERE "tutorId"=$1 AND "lifecycle"=\'Withdrawn\' AND "startsAt"=$2',[f.tutorId,f.startsAt],
    );
    await expect(probe!.query(
      'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt") VALUES($1,$2,$3,$4)',
      [f.customerId,withdrawn.rows[0].id,f.startsAt,f.endsAt],
    )).rejects.toMatchObject({ code:'23514', constraint:'booking_slot_offered_guard' });
    const cancelled = await insertBooking(f,'Cancelled');
    const another = await fixture(future(240));
    const booked = await insertBooking(another);
    const otherCustomer = await user('Customer');
    const mutations: Array<[string, unknown[]]> = [
      ['UPDATE "Booking" SET "status"=\'Booked\' WHERE "id"=$1',[cancelled.rows[0].id]],
      ['UPDATE "Booking" SET "status"=\'Cancelled\' WHERE "id"=$1',[booked.rows[0].id]],
      ['UPDATE "Booking" SET "currentSlotId"=$2 WHERE "id"=$1',[booked.rows[0].id,withdrawn.rows[0].id]],
      ['UPDATE "Booking" SET "customerId"=$2 WHERE "id"=$1',[booked.rows[0].id,otherCustomer]],
      ['UPDATE "Booking" SET "id"=gen_random_uuid() WHERE "id"=$1',[booked.rows[0].id]],
      ['UPDATE "Booking" SET "startsAt"="startsAt"+interval \'1 minute\' WHERE "id"=$1',[booked.rows[0].id]],
      ['UPDATE "Booking" SET "updatedAt"=clock_timestamp() WHERE "id"=$1',[booked.rows[0].id]],
      ['DELETE FROM "Booking" WHERE "id"=$1',[cancelled.rows[0].id]],
      ['DELETE FROM "Booking" WHERE "id"=$1',[booked.rows[0].id]],
    ];
    for (const [sql,params] of mutations) {
      await expect(probe!.query(sql,params)).rejects.toMatchObject({ code:'0A000' });
    }
  });

  it('BDF-21 enforces exact Q05 arithmetic and real trigger cutoff', async () => {
    const exact = await owner.query<{ allowed: boolean; tooLate: boolean }>(
      `SELECT ($1::timestamptz - $2::timestamptz >= interval '60 minutes') AS allowed,
              ($3::timestamptz - $2::timestamptz >= interval '60 minutes') AS "tooLate"`,
      [new Date('2030-01-01T01:00:00Z'),new Date('2030-01-01T00:00:00Z'),new Date('2030-01-01T00:59:59Z')],
    );
    expect(exact.rows[0].allowed).toBe(true);
    expect(exact.rows[0].tooLate).toBe(false);
    const pass = await fixture(future(61));
    await insertBooking(pass);
    const fail = await fixture(future(59));
    await expect(insertBooking(fail)).rejects.toMatchObject({
      code:'23514', constraint:'booking_q05_guard',
    });
  });

  it('BDF-22 waits for Slot lock, then samples fresh clock and rejects after cutoff', async () => {
    const start = future(60.04);
    const f = await fixture(start);
    const holder = await owner.connect();
    try {
      await holder.query('BEGIN');
      await holder.query('SELECT "id" FROM "Slot" WHERE "id"=$1 FOR UPDATE',[f.slotId]);
      const holderPid = await pid(holder);
      const waiter = await probe!.connect();
      try {
        const waiterPid = await pid(waiter);
        const pending = waiter.query(
          'INSERT INTO "Booking"("customerId","currentSlotId","startsAt","endsAt") VALUES($1,$2,$3,$4)',
          [f.customerId,f.slotId,f.startsAt,f.endsAt],
        ).then(() => 'COMMITTED').catch((e: { code: string; constraint?: string }) => e);
        await blockedBy(waiterPid,holderPid);
        await new Promise(resolve => setTimeout(resolve,3_000));
        await holder.query('COMMIT');
        const result = await pending;
        expect(result).not.toBe('COMMITTED');
        expect(result).toMatchObject({ code:'23514', constraint:'booking_q05_guard' });
        const rows = await owner.query('SELECT count(*)::int AS n FROM "Booking" WHERE "currentSlotId"=$1',[f.slotId]);
        expect(rows.rows[0].n).toBe(0);
      } finally { waiter.release(); }
    } finally { await holder.query('ROLLBACK').catch(()=>{}); holder.release(); }
  },15_000);

  it('BDF-24 runtime DELETE is privilege-denied; guard probe DELETE is rejected and occupancy remains', async () => {
    expect(runtime).not.toBeNull(); expect(probe).not.toBeNull();
    const f = await fixture(); const booking = await insertBooking(f);
    await expect(runtime!.query('DELETE FROM "Booking" WHERE "id"=$1',[booking.rows[0].id]))
      .rejects.toMatchObject({ code:'42501' });
    await expect(probe!.query('DELETE FROM "Booking" WHERE "id"=$1',[booking.rows[0].id]))
      .rejects.toMatchObject({ code:'0A000' });
    const persisted = await owner.query(
      'SELECT count(*)::int AS n FROM "Booking" WHERE "id"=$1 AND "status"=\'Booked\'',[booking.rows[0].id],
    );
    expect(persisted.rows[0].n).toBe(1);
  });

  it('BDF-25 runtime TRUNCATE is privilege-denied; guard probe TRUNCATE is rejected', async () => {
    expect(runtime).not.toBeNull(); expect(probe).not.toBeNull();
    const f = await fixture(); const booking = await insertBooking(f);
    await expect(runtime!.query('TRUNCATE TABLE "Booking"')).rejects.toMatchObject({ code:'42501' });
    await expect(probe!.query('TRUNCATE TABLE "Booking"')).rejects.toMatchObject({ code:'0A000' });
    const persisted = await owner.query(
      'SELECT count(*)::int AS n FROM "Booking" WHERE "id"=$1',[booking.rows[0].id],
    );
    expect(persisted.rows[0].n).toBe(1);
  });

  it('BDF-26 runtime role is non-owner/non-superuser and cannot bypass guards', async () => {
    expect(runtime).not.toBeNull();
    const r = await runtime!.query<{ role: string; superuser: boolean; owner: string; selectOk: boolean; insertOk: boolean; updateOk: boolean; deleteOk: boolean; truncateOk: boolean }>(
      `SELECT current_user AS role, rolsuper AS superuser,
        pg_get_userbyid(c.relowner) AS owner,
        has_table_privilege(current_user,'"Booking"','SELECT') AS "selectOk",
        has_table_privilege(current_user,'"Booking"','INSERT') AS "insertOk",
        has_table_privilege(current_user,'"Booking"','UPDATE') AS "updateOk",
        has_table_privilege(current_user,'"Booking"','DELETE') AS "deleteOk",
        has_table_privilege(current_user,'"Booking"','TRUNCATE') AS "truncateOk"
       FROM pg_roles CROSS JOIN pg_class c WHERE rolname=current_user AND c.relname='Booking'`,
    );
    expect(r.rows[0].superuser).toBe(false);
    expect(r.rows[0].role).not.toBe(r.rows[0].owner);
    expect(r.rows[0].selectOk).toBe(true); expect(r.rows[0].insertOk).toBe(true);
    expect(r.rows[0].updateOk).toBe(false); expect(r.rows[0].deleteOk).toBe(false);
    expect(r.rows[0].truncateOk).toBe(false);
    await expect(runtime!.query('ALTER TABLE "Booking" DISABLE TRIGGER ALL'))
      .rejects.toMatchObject({ code:'42501' });
    await expect(runtime!.query("SET session_replication_role = replica"))
      .rejects.toMatchObject({ code:'42501' });
    const memberships = await runtime!.query(
      `SELECT count(*)::int AS n FROM pg_auth_members m
       JOIN pg_roles granted ON granted.oid=m.roleid
       WHERE m.member=(SELECT oid FROM pg_roles WHERE rolname=current_user)`,
    );
    expect(memberships.rows[0].n).toBe(0);
  });
});
