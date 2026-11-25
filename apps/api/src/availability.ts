import type { Pool, PoolClient } from 'pg';
import { BookingError } from './bookings.js';

/**
 * Customer-specific bookable-only offer projection (F-S1-03 / OD-AV-01..05, OD-002).
 * Deliberately excludes Customer/Booking identities, credentials, and unapproved
 * Tutor profile fields (tutorDisplayName remains gated under OD-AV-02).
 */
export type AvailabilityOfferDto = {
  slotId: string;
  tutorRef: string;
  startsAt: string;
  endsAt: string;
};

export type AvailabilityResultDto = {
  data: AvailabilityOfferDto[];
  evaluatedAt: string;
};

type Queryable = Pick<Pool | PoolClient, 'query'>;

type AvailabilityAggregateRow = {
  data: AvailabilityOfferDto[];
  evaluatedAt: string;
};

const AVAILABILITY_SQL = `
WITH view_clock AS MATERIALIZED (
  SELECT COALESCE($2::timestamptz, clock_timestamp()) AS evaluated_at
),
eligible_slots AS MATERIALIZED (
  SELECT
    s."id" AS "slotId",
    s."tutorId" AS "tutorRef",
    s."startsAt" AS "startsAt",
    s."endsAt" AS "endsAt"
  FROM "Slot" AS s
  JOIN "User" AS tutor
    ON tutor."id" = s."tutorId"
   AND tutor."role" = 'Tutor'
   AND tutor."isActive" = TRUE
  CROSS JOIN view_clock
  WHERE s."lifecycle" = 'Offered'
    AND s."startsAt" >= view_clock.evaluated_at + INTERVAL '90 minutes'
    AND s."startsAt" <= view_clock.evaluated_at + INTERVAL '60 days'
    AND NOT EXISTS (
      SELECT 1
      FROM "Booking" AS occupied
      WHERE occupied."currentSlotId" = s."id"
        AND occupied."status" = 'Booked'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "Booking" AS customer_conflict
      WHERE customer_conflict."customerId" = $1
        AND customer_conflict."status" = 'Booked'
        AND customer_conflict."startsAt" < s."endsAt"
        AND s."startsAt" < customer_conflict."endsAt"
    )
)
SELECT
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'slotId', eligible_slots."slotId",
        'tutorRef', eligible_slots."tutorRef",
        'startsAt', to_char(
          eligible_slots."startsAt" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'endsAt', to_char(
          eligible_slots."endsAt" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      )
      ORDER BY eligible_slots."startsAt" ASC,
               eligible_slots."tutorRef" ASC,
               eligible_slots."slotId" ASC
    ) FILTER (WHERE eligible_slots."slotId" IS NOT NULL),
    '[]'::jsonb
  ) AS "data",
  to_char(
    view_clock.evaluated_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) AS "evaluatedAt"
FROM view_clock
LEFT JOIN eligible_slots ON TRUE
GROUP BY view_clock.evaluated_at;
`;

function projectOffer(raw: AvailabilityOfferDto): AvailabilityOfferDto {
  return {
    slotId: String(raw.slotId),
    tutorRef: String(raw.tutorRef),
    startsAt: String(raw.startsAt),
    endsAt: String(raw.endsAt),
  };
}

/**
 * Evaluates Customer-specific bookable availability at a single PostgreSQL T_view
 * (clock_timestamp() in production; controlledTView is for deterministic boundary tests only).
 * Read-only consumer of persisted Slot and Booking rows.
 */
export async function listCustomerAvailability(
  db: Queryable,
  customerId: string,
  controlledTView?: Date,
): Promise<AvailabilityResultDto> {
  const result = await db.query<AvailabilityAggregateRow>(AVAILABILITY_SQL, [
    customerId,
    controlledTView ?? null,
  ]);
  if (result.rowCount !== 1 || !result.rows[0]?.evaluatedAt || !Array.isArray(result.rows[0]?.data)) {
    throw new Error('AVAILABILITY_QUERY_FAILED');
  }
  return {
    data: result.rows[0].data.map(projectOffer),
    evaluatedAt: String(result.rows[0].evaluatedAt),
  };
}

const RESCHEDULE_AVAILABILITY_SQL = `
WITH view_clock AS MATERIALIZED (
  SELECT COALESCE($4::timestamptz, clock_timestamp()) AS evaluated_at
),
eligible_slots AS MATERIALIZED (
  SELECT
    s."id" AS "slotId",
    s."tutorId" AS "tutorRef",
    s."startsAt" AS "startsAt",
    s."endsAt" AS "endsAt"
  FROM "Slot" AS s
  JOIN "User" AS tutor
    ON tutor."id" = s."tutorId"
   AND tutor."role" = 'Tutor'
   AND tutor."isActive" = TRUE
  CROSS JOIN view_clock
  WHERE s."lifecycle" = 'Offered'
    AND s."id" <> $3::uuid
    AND s."startsAt" >= view_clock.evaluated_at + INTERVAL '60 minutes'
    AND s."startsAt" <= view_clock.evaluated_at + INTERVAL '60 days'
    AND NOT EXISTS (
      SELECT 1
      FROM "Booking" AS occupied
      WHERE occupied."currentSlotId" = s."id"
        AND occupied."status" = 'Booked'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM "Booking" AS customer_conflict
      WHERE customer_conflict."customerId" = $1::uuid
        AND customer_conflict."id" <> $2::uuid
        AND customer_conflict."status" = 'Booked'
        AND customer_conflict."startsAt" < s."endsAt"
        AND s."startsAt" < customer_conflict."endsAt"
    )
)
SELECT
  COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'slotId', eligible_slots."slotId",
        'tutorRef', eligible_slots."tutorRef",
        'startsAt', to_char(
          eligible_slots."startsAt" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        ),
        'endsAt', to_char(
          eligible_slots."endsAt" AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
        )
      )
      ORDER BY eligible_slots."startsAt" ASC,
               eligible_slots."tutorRef" ASC,
               eligible_slots."slotId" ASC
    ) FILTER (WHERE eligible_slots."slotId" IS NOT NULL),
    '[]'::jsonb
  ) AS "data",
  to_char(
    view_clock.evaluated_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
  ) AS "evaluatedAt"
FROM view_clock
LEFT JOIN eligible_slots ON TRUE
GROUP BY view_clock.evaluated_at;
`;

/**
 * Owner-scoped reschedule candidate projection (F-S2-02).
 * Excludes the moving Booking from the Customer's overlap check so same-time
 * cross-Tutor replacements are offered while preserving S1 availability untouched.
 */
export async function listRescheduleAvailability(
  db: Queryable,
  customerId: string,
  bookingId: string,
  controlledTView?: Date,
): Promise<AvailabilityResultDto> {
  const owned = await db.query<{ currentSlotId: string }>(
    'SELECT "currentSlotId" FROM "Booking" WHERE "id" = $1::uuid AND "customerId" = $2::uuid AND "status" = \'Booked\'',
    [bookingId, customerId],
  );
  if (owned.rowCount !== 1) {
    throw new BookingError(404, 'BOOKING_NOT_FOUND');
  }
  const result = await db.query<AvailabilityAggregateRow>(RESCHEDULE_AVAILABILITY_SQL, [
    customerId,
    bookingId,
    owned.rows[0].currentSlotId,
    controlledTView ?? null,
  ]);
  if (result.rowCount !== 1 || !result.rows[0]?.evaluatedAt || !Array.isArray(result.rows[0]?.data)) {
    throw new Error('AVAILABILITY_QUERY_FAILED');
  }
  return {
    data: result.rows[0].data.map(projectOffer),
    evaluatedAt: String(result.rows[0].evaluatedAt),
  };
}
