import type { Pool } from 'pg';

type TutorSummaryBookingFields = {
  id: string;
  slotId: string;
  customerRef: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
};

export type TutorSummaryActiveBookingDto = TutorSummaryBookingFields & {
  status: 'Booked';
  displayStatus: 'Booked';
};

export type TutorSummaryPastBookingDto = TutorSummaryBookingFields & {
  status: 'Booked';
  displayStatus: 'Past';
};

export type TutorSummaryCancelledDto = TutorSummaryBookingFields & {
  status: 'Cancelled';
  displayStatus: 'Cancelled';
  cancellationActor: 'Customer' | 'Tutor';
  cancelledAt: string;
};

export type TutorSummaryDto = {
  upcomingBookedCount: number;
  upcomingBooked: TutorSummaryActiveBookingDto[];
  inProgressBookedCount: number;
  inProgressBooked: TutorSummaryActiveBookingDto[];
  pastBookedCount: number;
  pastBooked: TutorSummaryPastBookingDto[];
  cancelledCount: number;
  cancelled: TutorSummaryCancelledDto[];
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
  cancellationActor: 'Customer' | 'Tutor' | null;
  cancelledAt: string | null;
  bucket: 'upcoming' | 'in_progress' | 'past' | 'cancelled' | null;
};

/**
 * F-S3-01 (Upcoming Booked, In-Progress Booked per OD-006 Option 1, Past Booked,
 * and Cancelled) — OD-009 single-snapshot, row-preserving read-only PostgreSQL
 * projection anchored on statement_timestamp().
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
       to_char(b."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
       b."cancellationActor",
       to_char(b."cancelledAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "cancelledAt",
       CASE
         WHEN b."status" = 'Booked' AND b."startsAt" > s_clock.evaluated_at THEN 'upcoming'
         WHEN b."status" = 'Booked' AND b."startsAt" <= s_clock.evaluated_at AND b."endsAt" > s_clock.evaluated_at THEN 'in_progress'
         WHEN b."status" = 'Booked' AND b."endsAt" <= s_clock.evaluated_at THEN 'past'
         WHEN b."status" = 'Cancelled' THEN 'cancelled'
         ELSE NULL
       END AS "bucket"
     FROM eval_snapshot AS s_clock
     LEFT JOIN (
       "Booking" AS b
       INNER JOIN "Slot" AS s ON s."id" = b."currentSlotId"
     ) ON s."tutorId" = $1::uuid
       AND b."status" IN ('Booked', 'Cancelled')
     ORDER BY
       CASE
         WHEN b."status" = 'Booked' AND b."startsAt" > s_clock.evaluated_at THEN 1
         WHEN b."status" = 'Booked' AND b."startsAt" <= s_clock.evaluated_at AND b."endsAt" > s_clock.evaluated_at THEN 2
         WHEN b."status" = 'Booked' AND b."endsAt" <= s_clock.evaluated_at THEN 3
         WHEN b."status" = 'Cancelled' THEN 4
         ELSE 5
       END ASC,
       CASE WHEN b."status" = 'Booked' AND b."endsAt" > s_clock.evaluated_at THEN b."startsAt" END ASC NULLS LAST,
       CASE WHEN b."status" = 'Booked' AND b."endsAt" > s_clock.evaluated_at THEN b."id" END ASC NULLS LAST,
       CASE WHEN b."status" = 'Booked' AND b."endsAt" <= s_clock.evaluated_at THEN b."endsAt" END DESC NULLS LAST,
       CASE WHEN b."status" = 'Cancelled' THEN b."cancelledAt" END DESC NULLS LAST,
       b."id" DESC NULLS LAST;`,
    [tutorId, clockParam],
  );

  const evaluatedAt = res.rows[0].evaluatedAt;

  const upcomingBooked: TutorSummaryActiveBookingDto[] = [];
  const inProgressBooked: TutorSummaryActiveBookingDto[] = [];
  const pastBooked: TutorSummaryPastBookingDto[] = [];
  const cancelled: TutorSummaryCancelledDto[] = [];
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
    const item: TutorSummaryBookingFields = {
      id: row.id,
      slotId: row.slotId,
      customerRef: 'CUST-' + row.customerId.slice(0, 8),
      startsAt: row.startsAt,
      endsAt: row.endsAt,
      createdAt: row.createdAt,
    };
    if (row.bucket === 'upcoming') {
      upcomingBooked.push({ ...item, status: 'Booked', displayStatus: 'Booked' });
    } else if (row.bucket === 'in_progress') {
      inProgressBooked.push({ ...item, status: 'Booked', displayStatus: 'Booked' });
    } else if (row.bucket === 'past') {
      pastBooked.push({ ...item, status: 'Booked', displayStatus: 'Past' });
    } else if (row.bucket === 'cancelled' && row.cancellationActor !== null && row.cancelledAt !== null) {
      cancelled.push({
        ...item,
        status: 'Cancelled',
        displayStatus: 'Cancelled',
        cancellationActor: row.cancellationActor,
        cancelledAt: row.cancelledAt,
      });
    }
  }

  return {
    data: {
      upcomingBookedCount: upcomingBooked.length,
      upcomingBooked,
      inProgressBookedCount: inProgressBooked.length,
      inProgressBooked,
      pastBookedCount: pastBooked.length,
      pastBooked,
      cancelledCount: cancelled.length,
      cancelled,
    },
    evaluatedAt,
  };
}

export const getTutorSummary = getTutorPastSummary;
