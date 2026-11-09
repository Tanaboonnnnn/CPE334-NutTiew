import type { Pool } from 'pg';
import { BookingError, isValidUuid } from './bookings.js';

export type CustomerBookingListItemDto = {
  id: string;
  slotId: string;
  tutorId: string;
  tutorRef: string;
  startsAt: string;
  endsAt: string;
  status: 'Booked';
  displayStatus: 'Booked' | 'Past';
  createdAt: string;
};

export type CustomerBookingDetailDto = CustomerBookingListItemDto & {
  updatedAt: string;
};

export type TutorScheduleBookingDto = {
  id: string;
  slotId: string;
  tutorId: string;
  customerRef: string;
  startsAt: string;
  endsAt: string;
  status: 'Booked';
  displayStatus: 'Booked' | 'Past';
  createdAt: string;
};

export type ListCustomerBookingsResult = {
  data: CustomerBookingListItemDto[];
  evaluatedAt: string;
};

export type ListTutorScheduleBookingsResult = {
  data: TutorScheduleBookingDto[];
  evaluatedAt: string;
};

type CustomerBookingRow = {
  id: string;
  slotId: string;
  tutorId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  createdAt: string;
  displayStatus: 'Booked' | 'Past';
  evaluatedAt: string;
};

type CustomerBookingDetailRow = CustomerBookingRow & {
  updatedAt: string;
};

type TutorScheduleRow = {
  id: string;
  slotId: string;
  tutorId: string;
  customerId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  createdAt: string;
  displayStatus: 'Booked' | 'Past';
  evaluatedAt: string;
};

async function getEvaluationTimestamp(pool: Pool, evalDate?: Date): Promise<string> {
  const res = await pool.query<{ evaluatedAt: string }>(
    'SELECT to_char(COALESCE($1::timestamptz, statement_timestamp()) AT TIME ZONE \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\') AS "evaluatedAt"',
    [evalDate ?? null],
  );
  return res.rows[0].evaluatedAt;
}

export async function listCustomerBookings(
  pool: Pool,
  customerId: string,
  evalDate?: Date,
): Promise<ListCustomerBookingsResult> {
  const res = await pool.query<CustomerBookingRow>(
    `WITH eval_snapshot AS (
       SELECT COALESCE($2::timestamptz, statement_timestamp()) AS evaluated_at
     )
     SELECT
       b."id",
       b."currentSlotId" AS "slotId",
       s."tutorId",
       to_char(b."startsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",
       to_char(b."endsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
       b."status",
       to_char(b."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
       CASE
         WHEN b."endsAt" <= s_clock.evaluated_at THEN 'Past'
         ELSE 'Booked'
       END AS "displayStatus",
       to_char(s_clock.evaluated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "evaluatedAt"
     FROM eval_snapshot AS s_clock
     CROSS JOIN "Booking" AS b
     INNER JOIN "Slot" AS s ON s."id" = b."currentSlotId"
     WHERE b."customerId" = $1
     ORDER BY b."startsAt" ASC, b."id" ASC;`,
    [customerId, evalDate ?? null],
  );

  const evaluatedAt = res.rows.length > 0 ? res.rows[0].evaluatedAt : await getEvaluationTimestamp(pool, evalDate);

  const data: CustomerBookingListItemDto[] = res.rows.map(row => ({
    id: row.id,
    slotId: row.slotId,
    tutorId: row.tutorId,
    tutorRef: 'TUTOR-' + row.tutorId.slice(0, 8),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: 'Booked',
    displayStatus: row.displayStatus,
    createdAt: row.createdAt,
  }));

  return { data, evaluatedAt };
}

export async function getCustomerBookingDetail(
  pool: Pool,
  customerId: string,
  bookingId: string,
  evalDate?: Date,
): Promise<{ data: CustomerBookingDetailDto; evaluatedAt: string }> {
  if (!isValidUuid(bookingId)) {
    throw new BookingError(400, 'INVALID_INPUT');
  }

  const res = await pool.query<CustomerBookingDetailRow>(
    `WITH eval_snapshot AS (
       SELECT COALESCE($3::timestamptz, statement_timestamp()) AS evaluated_at
     )
     SELECT
       b."id",
       b."currentSlotId" AS "slotId",
       s."tutorId",
       to_char(b."startsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",
       to_char(b."endsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
       b."status",
       to_char(b."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
       to_char(b."updatedAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "updatedAt",
       CASE
         WHEN b."endsAt" <= s_clock.evaluated_at THEN 'Past'
         ELSE 'Booked'
       END AS "displayStatus",
       to_char(s_clock.evaluated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "evaluatedAt"
     FROM eval_snapshot AS s_clock
     CROSS JOIN "Booking" AS b
     INNER JOIN "Slot" AS s ON s."id" = b."currentSlotId"
     WHERE b."id" = $1 AND b."customerId" = $2;`,
    [bookingId, customerId, evalDate ?? null],
  );

  if (res.rows.length === 0) {
    throw new BookingError(404, 'BOOKING_NOT_FOUND');
  }

  const row = res.rows[0];
  const data: CustomerBookingDetailDto = {
    id: row.id,
    slotId: row.slotId,
    tutorId: row.tutorId,
    tutorRef: 'TUTOR-' + row.tutorId.slice(0, 8),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: 'Booked',
    displayStatus: row.displayStatus,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };

  return { data, evaluatedAt: row.evaluatedAt };
}

export async function listTutorScheduleBookings(
  pool: Pool,
  tutorId: string,
  evalDate?: Date,
): Promise<ListTutorScheduleBookingsResult> {
  const res = await pool.query<TutorScheduleRow>(
    `WITH eval_snapshot AS (
       SELECT COALESCE($2::timestamptz, statement_timestamp()) AS evaluated_at
     )
     SELECT
       b."id",
       b."currentSlotId" AS "slotId",
       s."tutorId",
       b."customerId",
       to_char(b."startsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "startsAt",
       to_char(b."endsAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "endsAt",
       b."status",
       to_char(b."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "createdAt",
       CASE
         WHEN b."endsAt" <= s_clock.evaluated_at THEN 'Past'
         ELSE 'Booked'
       END AS "displayStatus",
       to_char(s_clock.evaluated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "evaluatedAt"
     FROM eval_snapshot AS s_clock
     CROSS JOIN "Booking" AS b
     INNER JOIN "Slot" AS s ON s."id" = b."currentSlotId"
     WHERE s."tutorId" = $1 AND b."status" = 'Booked'
     ORDER BY b."startsAt" ASC, b."id" ASC;`,
    [tutorId, evalDate ?? null],
  );

  const evaluatedAt = res.rows.length > 0 ? res.rows[0].evaluatedAt : await getEvaluationTimestamp(pool, evalDate);

  const data: TutorScheduleBookingDto[] = res.rows.map(row => ({
    id: row.id,
    slotId: row.slotId,
    tutorId: row.tutorId,
    customerRef: 'CUST-' + row.customerId.slice(0, 8),
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    status: 'Booked',
    displayStatus: row.displayStatus,
    createdAt: row.createdAt,
  }));

  return { data, evaluatedAt };
}
