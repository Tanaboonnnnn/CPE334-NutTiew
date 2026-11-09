import type { Pool, PoolClient } from 'pg';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type BookingDto = {
  id: string;
  slotId: string;
  startsAt: string;
  endsAt: string;
  status: 'Booked';
};

export type BookingMutationResult = {
  httpStatus: 200 | 201;
  data: BookingDto;
};

type DiscoveredSlotRow = {
  id: string;
  tutorId: string;
};

type LockedUserRow = {
  id: string;
  role: string;
  isActive: boolean;
};

type LockedSlotRow = {
  id: string;
  tutorId: string;
  startsAt: Date;
  endsAt: Date;
  lifecycle: string;
};

type BookingRow = {
  id: string;
  currentSlotId: string;
  startsAt: Date;
  endsAt: Date;
  status: string;
};

type PgErrorLike = {
  code?: string;
  constraint?: string;
  message?: string;
};

class LockSetChangedError extends Error {
  readonly code = 'LOCK_SET_CHANGED';
  constructor(message = 'Lock set changed between discovery and locked re-read') {
    super(message);
  }
}

export class BookingError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string,
  ) {
    super(errorCode);
  }
}

export type BookingLockEvent = {
  attempt: number;
  phase: 'user' | 'slot' | 'session' | 'booking-replay' | 'booking-insert' | 'reconcile-user' | 'reconcile-session' | 'reconcile-booking-read';
  targetId: string;
  backendPid: number;
};

export type BookingAdapterHooks = {
  /** Optional override for the unlocked Slot discovery query (e.g., to test stale Tutor discovery in BOOK-24 without mutating immutable Slot rows). */
  overrideDiscoveredTutorId?: (ctx: { attempt: number; slotId: string; actualTutorId: string }) => Promise<string> | string;
  /** Called right after the unlocked Slot discovery query returns a row. */
  afterDiscovery?: (ctx: { attempt: number; slotId: string; discoveredTutorId: string }) => Promise<void> | void;
  /** Called before each explicit lock or Booking query step with the checked-out client and its backend PID. */
  onLockStep?: (event: BookingLockEvent, client: PoolClient) => Promise<void> | void;
  /** Called immediately before the guarded Booking INSERT so tests can inject errors or observe state. */
  beforeInsert?: (ctx: {
    attempt: number;
    client: PoolClient;
    backendPid: number;
    customerId: string;
    slotId: string;
    startsAt: Date;
    endsAt: Date;
  }) => Promise<void> | void;
  /** Called after the guarded Booking INSERT succeeds, before COMMIT. */
  beforeCommit?: (ctx: {
    attempt: number;
    client: PoolClient;
    backendPid: number;
    bookingId: string;
  }) => Promise<void> | void;
  /** Called immediately after COMMIT succeeds (e.g., to simulate lost HTTP response / ambiguous commit). */
  afterCommit?: (ctx: {
    attempt: number;
    bookingId: string;
    httpStatus: 200 | 201;
  }) => Promise<void> | void;
  /** Called after SERIALIZABLE rollback of an allowlisted 23505/23P01 conflict, before READ COMMITTED reconciliation begins. */
  beforeReconcile?: (ctx: {
    sqlState: string;
    constraint: string;
    customerId: string;
    sessionId: string;
    slotId: string;
  }) => Promise<void> | void;
};

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function projectBooking(row: BookingRow): BookingDto {
  return {
    id: row.id,
    slotId: row.currentSlotId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: 'Booked',
  };
}

function sameInterval(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() === bStart.getTime() && aEnd.getTime() === bEnd.getTime();
}

function isRetryableAbort(error: unknown): boolean {
  if (error instanceof LockSetChangedError) return true;
  const code = (error as PgErrorLike | null)?.code;
  return code === '40001' || code === '40P01' || code === 'P2034';
}

function allowlistedConflictCause(
  error: unknown,
): 'SLOT_UNAVAILABLE' | 'CUSTOMER_OVERLAP' | null {
  const pgErr = error as PgErrorLike | null;
  if (!pgErr || typeof pgErr.code !== 'string' || typeof pgErr.constraint !== 'string') {
    return null;
  }
  if (pgErr.code === '23505' && pgErr.constraint === 'booking_one_active_per_slot') {
    return 'SLOT_UNAVAILABLE';
  }
  if (pgErr.code === '23P01' && pgErr.constraint === 'booked_customer_no_overlap') {
    return 'CUSTOMER_OVERLAP';
  }
  return null;
}

function isUnrecognizedConstraintOrGuardError(error: unknown): boolean {
  const pgErr = error as PgErrorLike | null;
  if (!pgErr || typeof pgErr.code !== 'string') return false;
  if (pgErr.code === '0A000') return true;
  if (pgErr.code.startsWith('P0B')) return true;
  if (pgErr.code === '23505' || pgErr.code === '23P01') return true;
  return false;
}

async function backoffDelay(attempt: number): Promise<void> {
  const baseMs = 8 * (attempt + 1);
  const jitterMs = Math.floor(Math.random() * 8);
  await new Promise(resolve => setTimeout(resolve, baseMs + jitterMs));
}

async function reconcileAllowlistedConflict(
  pool: Pool,
  principal: { userId: string; sessionId: string },
  lockedSlotSnapshot: { id: string; startsAt: Date; endsAt: Date },
  conflictCode: 'SLOT_UNAVAILABLE' | 'CUSTOMER_OVERLAP',
  hooks?: BookingAdapterHooks,
): Promise<BookingMutationResult> {
  let client: PoolClient;
  try {
    client = await pool.connect();
  } catch {
    throw new BookingError(503, 'SERVICE_UNAVAILABLE');
  }

  let begun = false;
  try {
    const pidRes = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
    const backendPid = pidRes.rows[0]?.pid ?? 0;

    await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
    begun = true;

    // 1. Revalidate current User first (User -> Session -> Booking-read order)
    if (hooks?.onLockStep) {
      await hooks.onLockStep(
        { attempt: 0, phase: 'reconcile-user', targetId: principal.userId, backendPid },
        client,
      );
    }
    const userRes = await client.query<LockedUserRow>(
      'SELECT "id", "role", "isActive" FROM "User" WHERE "id" = $1 FOR UPDATE',
      [principal.userId],
    );
    if (userRes.rowCount !== 1 || !userRes.rows[0].isActive) {
      await client.query('ROLLBACK');
      begun = false;
      throw new BookingError(401, 'UNAUTHENTICATED');
    }
    if (userRes.rows[0].role !== 'Customer') {
      await client.query('ROLLBACK');
      begun = false;
      throw new BookingError(403, 'FORBIDDEN');
    }

    // 2. Revalidate exact authenticated Session with FOR UPDATE
    if (hooks?.onLockStep) {
      await hooks.onLockStep(
        { attempt: 0, phase: 'reconcile-session', targetId: principal.sessionId, backendPid },
        client,
      );
    }
    const sessionLockRes = await client.query<{ id: string }>(
      'SELECT "id" FROM "Session" WHERE "id" = $1 AND "userId" = $2 FOR UPDATE',
      [principal.sessionId, principal.userId],
    );
    if (sessionLockRes.rowCount !== 1) {
      await client.query('ROLLBACK');
      begun = false;
      throw new BookingError(401, 'UNAUTHENTICATED');
    }

    // 3. Revalidate live Session status using DB clock_timestamp() while holding lock
    const sessionLiveRes = await client.query(
      'SELECT 1 FROM "Session" WHERE "id" = $1 AND "userId" = $2 AND "revokedAt" IS NULL AND "expiresAt" > clock_timestamp()',
      [principal.sessionId, principal.userId],
    );
    if (sessionLiveRes.rowCount !== 1) {
      await client.query('ROLLBACK');
      begun = false;
      throw new BookingError(401, 'UNAUTHENTICATED');
    }

    // 4. Plain non-locking MVCC read for exact same-pair Booked row
    if (hooks?.onLockStep) {
      await hooks.onLockStep(
        { attempt: 0, phase: 'reconcile-booking-read', targetId: lockedSlotSnapshot.id, backendPid },
        client,
      );
    }
    const replayRes = await client.query<BookingRow>(
      'SELECT "id", "currentSlotId", "startsAt", "endsAt", "status" FROM "Booking" WHERE "customerId" = $1 AND "currentSlotId" = $2 AND "status" = \'Booked\'',
      [principal.userId, lockedSlotSnapshot.id],
    );
    if (
      replayRes.rowCount === 1 &&
      sameInterval(
        replayRes.rows[0].startsAt,
        replayRes.rows[0].endsAt,
        lockedSlotSnapshot.startsAt,
        lockedSlotSnapshot.endsAt,
      )
    ) {
      await client.query('COMMIT');
      begun = false;
      return {
        httpStatus: 200,
        data: projectBooking(replayRes.rows[0]),
      };
    }

    await client.query('COMMIT');
    begun = false;
    throw new BookingError(409, conflictCode);
  } catch (error) {
    if (begun) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore rollback failure */
      }
    }
    if (error instanceof BookingError) throw error;
    throw new BookingError(503, 'SERVICE_UNAVAILABLE');
  } finally {
    client.release();
  }
}

/**
 * F-S1-04 Customer Exclusive Booking transaction adapter.
 *
 * Enforces:
 * - Unlocked Slot discovery -> 404 SLOT_NOT_FOUND when absent
 * - Single checked-out PoolClient with BEGIN ISOLATION LEVEL SERIALIZABLE per attempt
 * - Global lock hierarchy: User (UUID asc) -> Slot (UUID asc) -> Session (auth sub-lock) -> Booking
 * - Post-wait Session revalidation against DB clock_timestamp()
 * - Natural-key replay (customerId, slotId) BEFORE new-claim Tutor eligibility and new-claim Q05/conflicts
 * - Guarded INSERT backed by #33 booking_guard_s1() and post-guard contention abort/retry check
 * - Allowlisted 23505/23P01 post-rollback READ COMMITTED reconciliation with User -> Session revalidation
 */
export async function createCustomerBooking(
  pool: Pool,
  principal: { userId: string; sessionId: string },
  slotId: string,
  hooks?: BookingAdapterHooks,
): Promise<BookingMutationResult> {
  const maxAttempts = 3;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Step 1: Unlocked read-only discovery query to determine the User lock set
    let discoveryRes;
    try {
      discoveryRes = await pool.query<DiscoveredSlotRow>(
        'SELECT "id", "tutorId" FROM "Slot" WHERE "id" = $1',
        [slotId],
      );
    } catch (error) {
      if (isRetryableAbort(error) && attempt < maxAttempts - 1) {
        await backoffDelay(attempt);
        continue;
      }
      if (isRetryableAbort(error)) {
        throw new BookingError(503, 'TRANSACTION_RETRY_EXHAUSTED');
      }
      throw new BookingError(503, 'SERVICE_UNAVAILABLE');
    }

    if (discoveryRes.rowCount !== 1) {
      throw new BookingError(404, 'SLOT_NOT_FOUND');
    }
    const actualTutorId = discoveryRes.rows[0].tutorId;
    const discoveredTutorId = hooks?.overrideDiscoveredTutorId
      ? await hooks.overrideDiscoveredTutorId({ attempt, slotId, actualTutorId })
      : actualTutorId;

    if (hooks?.afterDiscovery) {
      await hooks.afterDiscovery({ attempt, slotId, discoveredTutorId });
    }

    // Step 2: Check out one PoolClient and begin SERIALIZABLE transaction
    let client: PoolClient;
    try {
      client = await pool.connect();
    } catch {
      throw new BookingError(503, 'SERVICE_UNAVAILABLE');
    }

    let begun = false;
    let released = false;
    let lockedSlotRow: LockedSlotRow | null = null;
    try {
      const pidRes = await client.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
      const backendPid = pidRes.rows[0]?.pid ?? 0;

      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      begun = true;

      // Step 3: Lock affected User rows in ascending UUID order (deduplicated)
      const orderedUserIds = Array.from(new Set([principal.userId, discoveredTutorId])).sort((a, b) =>
        a.localeCompare(b),
      );
      const lockedUsers = new Map<string, LockedUserRow>();
      for (const uid of orderedUserIds) {
        if (hooks?.onLockStep) {
          await hooks.onLockStep({ attempt, phase: 'user', targetId: uid, backendPid }, client);
        }
        const uRes = await client.query<LockedUserRow>(
          'SELECT "id", "role", "isActive" FROM "User" WHERE "id" = $1 FOR UPDATE',
          [uid],
        );
        if (uRes.rowCount === 1) {
          lockedUsers.set(uid, uRes.rows[0]);
        }
      }

      // Immediately revalidate Customer User row
      const customerRow = lockedUsers.get(principal.userId);
      if (!customerRow || !customerRow.isActive) {
        await client.query('ROLLBACK');
        begun = false;
        throw new BookingError(401, 'UNAUTHENTICATED');
      }
      if (customerRow.role !== 'Customer') {
        await client.query('ROLLBACK');
        begun = false;
        throw new BookingError(403, 'FORBIDDEN');
      }

      const tutorRow = lockedUsers.get(discoveredTutorId);
      if (!tutorRow) {
        // Tutor disappeared between unlocked discovery and locked re-read (BOOK-24)
        throw new LockSetChangedError('Discovered Tutor missing on locked re-read');
      }

      // Step 4: Lock selected Slot row (ascending UUID order for Slot domain)
      if (hooks?.onLockStep) {
        await hooks.onLockStep({ attempt, phase: 'slot', targetId: slotId, backendPid }, client);
      }
      const slotRes = await client.query<LockedSlotRow>(
        'SELECT "id", "tutorId", "startsAt", "endsAt", "lifecycle" FROM "Slot" WHERE "id" = $1 FOR UPDATE',
        [slotId],
      );
      if (slotRes.rowCount !== 1 || slotRes.rows[0].tutorId !== discoveredTutorId) {
        // Slot disappeared or changed Tutor assignment after discovery (BOOK-24)
        throw new LockSetChangedError('Slot missing or Tutor assignment changed on locked re-read');
      }
      lockedSlotRow = slotRes.rows[0];

      // Step 5: Lock current Customer Session row AFTER all User and Slot waits (BOOK-26, BOOK-27, BOOK-32)
      if (hooks?.onLockStep) {
        await hooks.onLockStep(
          { attempt, phase: 'session', targetId: principal.sessionId, backendPid },
          client,
        );
      }
      const sessionLockRes = await client.query<{ id: string }>(
        'SELECT "id" FROM "Session" WHERE "id" = $1 AND "userId" = $2 FOR UPDATE',
        [principal.sessionId, principal.userId],
      );
      if (sessionLockRes.rowCount !== 1) {
        // Exact lookup returning no row or owner mismatch is terminal 401, not retryable (BOOK-32)
        await client.query('ROLLBACK');
        begun = false;
        throw new BookingError(401, 'UNAUTHENTICATED');
      }

      // Step 6: Revalidate Session live status using database clock_timestamp()
      const sessionLiveRes = await client.query(
        'SELECT 1 FROM "Session" WHERE "id" = $1 AND "userId" = $2 AND "revokedAt" IS NULL AND "expiresAt" > clock_timestamp()',
        [principal.sessionId, principal.userId],
      );
      if (sessionLiveRes.rowCount !== 1) {
        await client.query('ROLLBACK');
        begun = false;
        throw new BookingError(401, 'UNAUTHENTICATED');
      }

      // Step 7: Natural-key replay lookup FIRST (before new-claim Tutor eligibility, occupancy, and Q05) (BOOK-13, BOOK-33)
      if (hooks?.onLockStep) {
        await hooks.onLockStep(
          { attempt, phase: 'booking-replay', targetId: slotId, backendPid },
          client,
        );
      }
      const replayRes = await client.query<BookingRow>(
        'SELECT "id", "currentSlotId", "startsAt", "endsAt", "status" FROM "Booking" WHERE "customerId" = $1 AND "currentSlotId" = $2 AND "status" = \'Booked\'',
        [principal.userId, lockedSlotRow.id],
      );
      if (
        replayRes.rowCount === 1 &&
        sameInterval(
          replayRes.rows[0].startsAt,
          replayRes.rows[0].endsAt,
          lockedSlotRow.startsAt,
          lockedSlotRow.endsAt,
        )
      ) {
        await client.query('COMMIT');
        begun = false;
        const result: BookingMutationResult = {
          httpStatus: 200,
          data: projectBooking(replayRes.rows[0]),
        };
        if (hooks?.afterCommit) {
          await hooks.afterCommit({
            attempt,
            bookingId: result.data.id,
            httpStatus: 200,
          });
        }
        return result;
      }

      // Step 8: New-claim Tutor eligibility check (only when no same-pair replay exists) (BOOK-07, BOOK-33)
      if (!tutorRow.isActive || tutorRow.role !== 'Tutor') {
        await client.query('ROLLBACK');
        begun = false;
        throw new BookingError(409, 'SLOT_UNAVAILABLE');
      }

      // Step 9: New-claim application conflict checks before guarded INSERT
      const occupiedRes = await client.query<{ id: string }>(
        'SELECT "id" FROM "Booking" WHERE "currentSlotId" = $1 AND "status" = \'Booked\' LIMIT 1',
        [lockedSlotRow.id],
      );
      if (occupiedRes.rowCount && occupiedRes.rowCount > 0) {
        await client.query('ROLLBACK');
        begun = false;
        throw new BookingError(409, 'SLOT_UNAVAILABLE');
      }

      const overlapRes = await client.query<{ id: string }>(
        'SELECT "id" FROM "Booking" WHERE "customerId" = $1 AND "status" = \'Booked\' AND "startsAt" < $3 AND $2 < "endsAt" LIMIT 1',
        [principal.userId, lockedSlotRow.startsAt, lockedSlotRow.endsAt],
      );
      if (overlapRes.rowCount && overlapRes.rowCount > 0) {
        await client.query('ROLLBACK');
        begun = false;
        throw new BookingError(409, 'CUSTOMER_OVERLAP');
      }

      // Step 10: Guarded INSERT (#33 booking_guard_s1() enforces Offered lifecycle and Q05 at T_elig)
      if (hooks?.onLockStep) {
        await hooks.onLockStep(
          { attempt, phase: 'booking-insert', targetId: lockedSlotRow.id, backendPid },
          client,
        );
      }
      if (hooks?.beforeInsert) {
        await hooks.beforeInsert({
          attempt,
          client,
          backendPid,
          customerId: principal.userId,
          slotId: lockedSlotRow.id,
          startsAt: lockedSlotRow.startsAt,
          endsAt: lockedSlotRow.endsAt,
        });
      }

      const insertRes = await client.query<BookingRow>(
        'INSERT INTO "Booking" ("customerId", "currentSlotId", "startsAt", "endsAt", "status") VALUES ($1, $2, $3, $4, \'Booked\') RETURNING "id", "currentSlotId", "startsAt", "endsAt", "status"',
        [principal.userId, lockedSlotRow.id, lockedSlotRow.startsAt, lockedSlotRow.endsAt],
      );
      const inserted = insertRes.rows[0];

      if (hooks?.beforeCommit) {
        await hooks.beforeCommit({
          attempt,
          client,
          backendPid,
          bookingId: inserted.id,
        });
      }

      // Step 11: Commit before returning 201
      try {
        await client.query('COMMIT');
        begun = false;
      } catch (commitError) {
        begun = false;
        if (isRetryableAbort(commitError)) {
          throw commitError;
        }
        throw new BookingError(503, 'BOOKING_OUTCOME_UNKNOWN');
      }

      const result: BookingMutationResult = {
        httpStatus: 201,
        data: projectBooking(inserted),
      };
      if (hooks?.afterCommit) {
        await hooks.afterCommit({
          attempt,
          bookingId: result.data.id,
          httpStatus: 201,
        });
      }
      return result;
    } catch (error) {
      if (begun) {
        try {
          await client.query('ROLLBACK');
        } catch {
          /* ignore rollback failure on broken connection */
        }
        begun = false;
      }

      if (error instanceof BookingError) {
        throw error;
      }

      const pgErr = error as PgErrorLike | null;
      const sqlState = pgErr?.code;
      const constraint = pgErr?.constraint;

      // #33 Part F stable trigger diagnostics (BOOK-25)
      if (sqlState === 'P0B01' && constraint === 'booking_slot_not_offered') {
        throw new BookingError(409, 'SLOT_UNAVAILABLE');
      }
      if (sqlState === 'P0B02' && constraint === 'booking_q05_min_notice') {
        throw new BookingError(422, 'BOOKING_NOT_ELIGIBLE');
      }

      // Allowlisted unique/exclusion conflicts enter post-ROLLBACK READ COMMITTED reconciliation (BOOK-30, BOOK-31)
      const conflictCause = allowlistedConflictCause(error);
      if (conflictCause !== null && lockedSlotRow !== null) {
        // Release the SERIALIZABLE connection BEFORE running hooks or opening fresh READ COMMITTED reconciliation
        const snapshot = {
          id: lockedSlotRow.id,
          startsAt: lockedSlotRow.startsAt,
          endsAt: lockedSlotRow.endsAt,
        };
        client.release();
        released = true;
        if (hooks?.beforeReconcile) {
          await hooks.beforeReconcile({
            sqlState: sqlState!,
            constraint: constraint!,
            customerId: principal.userId,
            sessionId: principal.sessionId,
            slotId: snapshot.id,
          });
        }
        return await reconcileAllowlistedConflict(pool, principal, snapshot, conflictCause, hooks);
      }

      // Unrecognized/mismatched 23505, 23P01, 0A000, or unmapped P0B* fail closed as 500 INTERNAL_ERROR (BOOK-31)
      if (isUnrecognizedConstraintOrGuardError(error)) {
        throw new BookingError(500, 'INTERNAL_ERROR');
      }

      // Retryable transaction aborts: 40001, 40P01, P2034, or lock-set change (BOOK-18, BOOK-23, BOOK-24)
      if (isRetryableAbort(error)) {
        if (attempt < maxAttempts - 1) {
          await backoffDelay(attempt);
          continue;
        }
        throw new BookingError(503, 'TRANSACTION_RETRY_EXHAUSTED');
      }

      throw new BookingError(503, 'SERVICE_UNAVAILABLE');
    } finally {
      if (!released) {
        client.release();
      }
    }
  }

  throw new BookingError(503, 'TRANSACTION_RETRY_EXHAUSTED');
}
