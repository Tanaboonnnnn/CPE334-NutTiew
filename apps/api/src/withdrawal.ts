import { DatabaseError, type Pool, type PoolClient } from 'pg';
import { setTimeout as delay } from 'node:timers/promises';
import { SlotError, type SlotDto } from './slots.js';

export type WithdrawalHooks = {
  beforeMutation?: (client: PoolClient) => Promise<void>;
  beforeCommit?: (client: PoolClient) => Promise<void>;
  afterCommit?: () => Promise<void>;
};

function mapWithdrawalError(error: DatabaseError | undefined): SlotError {
  if (error?.code === '28000') return new SlotError(401, 'UNAUTHENTICATED');
  if (error?.code === '42501' && error.message === 'Wrong role') return new SlotError(403, 'FORBIDDEN');
  if (error?.code === 'P0002') return new SlotError(404, 'SLOT_NOT_FOUND');
  if (error?.code === 'P0B03') return new SlotError(409, 'SLOT_OCCUPIED');
  if (error?.code === 'P0B04') return new SlotError(409, 'SLOT_ALREADY_WITHDRAWN');
  if (error?.code === 'P0B05') return new SlotError(422, 'SLOT_NOT_WITHDRAWABLE');
  return new SlotError(503, 'SERVICE_UNAVAILABLE');
}

export async function withdrawOwnSlot(
  pool:Pool, principal:{userId:string;sessionId:string}, id:string, hooks?:WithdrawalHooks,
):Promise<SlotDto> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const client = await pool.connect().catch(() => { throw new SlotError(503, 'SERVICE_UNAVAILABLE'); });
    let phase:'begin'|'mutation'|'projection'|'commit'|'acknowledged' = 'begin';
    let discard = false;
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
      phase = 'mutation';
      await hooks?.beforeMutation?.(client);
      // The reviewed S2 function owns lock ordering, Session liveness, time
      // and occupancy. No app-side pre-lock or out-of-transaction UPDATE.
      await client.query("SELECT public.s2_mutate('Withdraw', $1::uuid, $2::uuid, $3::uuid)",
        [principal.userId, principal.sessionId, id]);
      phase = 'projection';
      const { rows:[row] } = await client.query<{ id:string;startsAt:Date;endsAt:Date;withdrawnAt:Date }>(
        "SELECT id,\"startsAt\",\"endsAt\",\"withdrawnAt\" FROM \"Slot\" WHERE id=$1 AND \"tutorId\"=$2 AND lifecycle='Withdrawn'",
        [id, principal.userId],
      );
      if (!row?.withdrawnAt) throw new Error('Missing withdrawal projection');
      const result:SlotDto = {
        id:row.id, startsAt:row.startsAt.toISOString(), endsAt:row.endsAt.toISOString(),
        lifecycle:'Withdrawn', withdrawnAt:row.withdrawnAt.toISOString(), occupancy:'Unoccupied',
      };
      await hooks?.beforeCommit?.(client);
      phase = 'commit';
      const commit = await client.query('COMMIT');
      if (commit.command !== 'COMMIT') throw new Error('Commit not acknowledged');
      phase = 'acknowledged';
      await hooks?.afterCommit?.();
      return result;
    } catch (error) {
      const sql = error instanceof DatabaseError ? error : undefined;
      const retryable = sql?.code === '40001' || sql?.code === '40P01';
      if (phase === 'acknowledged' || (phase === 'commit' && !retryable && !sql?.code?.startsWith('23'))) {
        discard = true;
        throw new SlotError(503, 'MUTATION_OUTCOME_UNKNOWN');
      }
      try { await client.query('ROLLBACK'); } catch { discard = true; }
      if (!retryable) throw phase === 'mutation' ? mapWithdrawalError(sql) : new SlotError(503, 'SERVICE_UNAVAILABLE');
      if (attempt === 2) throw new SlotError(503, 'TRANSACTION_RETRY_EXHAUSTED');
    } finally {
      client.release(discard);
    }
    await delay(8 * (attempt + 1) + Math.floor(Math.random() * 8));
  }
  throw new SlotError(503, 'TRANSACTION_RETRY_EXHAUSTED');
}
