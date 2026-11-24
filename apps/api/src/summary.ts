import type { Pool } from 'pg';

export type TutorSummaryPastBookingDto = {
  id: string;
  slotId: string;
  customerRef: string;
  startsAt: string;
  endsAt: string;
  status: 'Booked';
  displayStatus: 'Past';
  createdAt: string;
};

export type TutorSummaryDto = {
  pastBookedCount: number;
  pastBooked: TutorSummaryPastBookingDto[];
};

export type GetTutorSummaryResult = {
  data: TutorSummaryDto;
  evaluatedAt: string;
};

type TutorSummaryRow = {
  evaluatedAt: string;
  id: string | null;
  slotId: string | null;
  customerId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  status: string | null;
  createdAt: string | null;
};

/**
 * F-S3-01 (D2 Past Booked increment) — OD-009 single-snapshot, row-preserving
 * read-only PostgreSQL projection anchored on statement_timestamp().
 */
export async function getTutorPastSummary(
  pool: Pick<Pool, 'query'>,
  tutorId: string,
  evalClock?: string | Date,
): Promise<GetTutorSummaryResult> {
  const clockParam = evalClock instanceof Date ? evalClock.toISOString() : (evalClock ?? null);

  const res = await pool.query<TutorSummaryRow>(
    `WITH eval_snapshot AS (
       SELECT COALESCE($2::timestamptz, statement_timestamp()) AS evaluated_at
     )
     SELECT
       to_char(s_clock.evaluated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS "evaluatedAt",
       b."id",
       b."currentSlotId" AS "slotId",
       b."customerId",
       to_char(b."startsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",
       to_char(b."endsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
       b."status",
       to_char(b."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt"
     FROM eval_snapshot AS s_clock
     LEFT JOIN (
       SELECT b.*
       FROM "Booking" AS b
       INNER JOIN "Slot" AS s
         ON s."id" = b."currentSlotId"
       WHERE s."tutorId" = $1::uuid
         AND b."status" = 'Booked'
     ) AS b
       ON b."endsAt" <= s_clock.evaluated_at
     ORDER BY b."endsAt" DESC NULLS LAST, b."id" DESC NULLS LAST;`,
    [tutorId, clockParam],
  );

  const evaluatedAt = res.rows[0].evaluatedAt;

  const pastBooked: TutorSummaryPastBookingDto[] = [];
  for (const row of res.rows) {
    if (
      row.id === null ||
      row.slotId === null ||
      row.customerId === null ||
      row.startsAt === null ||
      row.endsAt === null ||
      row.createdAt === null
    ) {
      continue;
    }
    pastBooked.push({
      id: row.id,
      slotId: row.slotId,
      customerRef: 'CUST-' + row.customerId.slice(0, 8),
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      status: 'Booked',
      displayStatus: 'Past',
      createdAt: row.createdAt,
    });
  }

  return {
    data: {
      pastBookedCount: pastBooked.length,
      pastBooked,
    },
    evaluatedAt,
  };
}
