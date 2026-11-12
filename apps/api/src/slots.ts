import type { Pool } from 'pg';

/** Own-schedule DTO: deliberately excludes any Tutor/Customer or Booking identity. */
export type SlotDto = {
  id: string;
  startsAt: string;
  endsAt: string;
  lifecycle: 'Offered';
  occupancy: 'Occupied' | 'Unoccupied';
};

type SlotRow = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  lifecycle: 'Offered';
  occupancy?: 'Occupied' | 'Unoccupied';
};

function project(row: SlotRow): SlotDto {
  return {
    id: row.id,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    lifecycle: row.lifecycle,
    occupancy: row.occupancy ?? 'Unoccupied',
  };
}

export class SlotError extends Error {
  constructor(readonly status: number, readonly errorCode: string) {
    super(errorCode);
  }
}

export async function listOwnSlots(pool: Pool, userId: string): Promise<SlotDto[]> {
  const result = await pool.query<SlotRow>(
    'SELECT s."id",s."startsAt",s."endsAt",s."lifecycle",CASE WHEN b."id" IS NOT NULL THEN \'Occupied\' ELSE \'Unoccupied\' END AS "occupancy" FROM "Slot" AS s LEFT JOIN "Booking" AS b ON b."currentSlotId" = s."id" AND b."status" = \'Booked\' WHERE s."tutorId"=$1 ORDER BY s."startsAt" ASC,s."id" ASC',
    [userId],
  );
  return result.rows.map(project);
}

/**
 * Atomic Tutor Slot publication: ONE pg client and transaction per attempt.
 * Principal lock is always first; live eligibility time comes AFTER the lock.
 * The GiST exclusion is the final race protection, even for other DB writers.
 */
export async function publishOwnSlot(
  pool: Pool,
  principal: { userId: string; sessionId: string },
  start: Date,
): Promise<SlotDto> {
  const end = new Date(start.getTime() + 3_600_000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const connection = await pool.connect();
    let begun = false;
    try {
      await connection.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      begun = true;
      const user = await connection.query<{ role: string; isActive: boolean }>(
        'SELECT "role","isActive" FROM "User" WHERE "id"=$1 FOR UPDATE',
        [principal.userId],
      );
      if (user.rowCount !== 1 || !user.rows[0].isActive || user.rows[0].role !== 'Tutor') {
        throw new SlotError(403, 'FORBIDDEN');
      }
      // A Session may be revoked or expire while this transaction was waiting.
      // FOR UPDATE is intentional. Under SERIALIZABLE, a plain SELECT can
      // see a stale snapshot after a User-row wait and accept a session that
      // was revoked during the wait. The lock makes that update a serialization
      // conflict; a fresh transaction retry then sees the revoked Session.
      const session = await connection.query(
        'SELECT "id" FROM "Session" WHERE "id"=$1 AND "userId"=$2 AND "revokedAt" IS NULL AND "expiresAt">clock_timestamp() FOR UPDATE',
        [principal.sessionId, principal.userId],
      );
      if (session.rowCount !== 1) throw new SlotError(401, 'UNAUTHENTICATED');
      const current = await connection.query<{ now: Date }>('SELECT clock_timestamp() AS now');
      if (start.getTime() <= current.rows[0].now.getTime()) {
        throw new SlotError(422, 'SLOT_INVALID_TIME');
      }
      const inserted = await connection.query<SlotRow>(
        'INSERT INTO "Slot"("tutorId","startsAt","endsAt","lifecycle") VALUES($1,$2,$3,$4) RETURNING "id","startsAt","endsAt","lifecycle"',
        [principal.userId, start, end, 'Offered'],
      );
      await connection.query('COMMIT');
      begun = false;
      return project(inserted.rows[0]);
    } catch (error) {
      if (begun) {
        try { await connection.query('ROLLBACK'); } catch { /* connection failure maps to 503 */ }
      }
      const sqlState = (error as { code?: string }).code;
      if (sqlState === '23P01') throw new SlotError(409, 'SLOT_OVERLAP');
      if ((sqlState === '40001' || sqlState === '40P01') && attempt < 2) continue;
      if (sqlState === '40001' || sqlState === '40P01') throw new SlotError(503, 'SERVICE_UNAVAILABLE');
      throw error;
    } finally {
      connection.release();
    }
  }
  throw new SlotError(503, 'SERVICE_UNAVAILABLE');
}
