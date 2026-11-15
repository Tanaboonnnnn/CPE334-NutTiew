import { describe, expect, it } from 'vitest';
import { computeTutorKpis, selectNextTutorLesson, type TutorBookingSummary } from '../src/tutor-metrics.js';
import type { OfferedSlot } from '../src/tutor-calendar.js';

function makeSlot(id: string, startsAt: string, occupancy: 'Available' | 'Occupied' = 'Available'): OfferedSlot {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + 3_600_000);
  return {
    id,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    lifecycle: 'Offered',
    occupancy,
  };
}

function makeBooking(
  id: string,
  startsAt: string,
  displayStatus: 'Booked' | 'Past' = 'Booked',
): TutorBookingSummary {
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + 3_600_000);
  return {
    id,
    slotId: 'slot-' + id,
    tutorId: 'tutor-1',
    customerRef: 'cust-' + id,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    status: 'Booked',
    displayStatus,
    createdAt: '2026-12-01T00:00:00.000Z',
  };
}

describe('computeTutorKpis', () => {
  it('computes Offered, Occupied, and Asia/Bangkok Mon-Sun weekly counts across year boundaries', () => {
    // Thursday 2026-12-31 12:00:00+07:00
    // Mon = 2026-12-28, Sun = 2027-01-03 in Asia/Bangkok
    const nowMs = new Date('2026-12-31T12:00:00+07:00').getTime();

    const slots: OfferedSlot[] = [
      // Sunday before week (2026-12-27 23:30+07:00) -> NOT this week
      makeSlot('prev-sun', '2026-12-27T23:30:00+07:00', 'Occupied'),
      // Monday 00:00+07:00 (2026-12-27T17:00:00Z) -> IN this week
      makeSlot('mon-start', '2026-12-27T17:00:00.000Z', 'Available'),
      // Cross-year UTC instant: 2026-12-31T17:30:00Z = 2027-01-01 00:30+07:00 -> IN this week
      makeSlot('new-year-bkk', '2026-12-31T17:30:00.000Z', 'Occupied'),
      // Sunday 23:30+07:00 -> IN this week
      makeSlot('sun-end', '2027-01-03T23:30:00+07:00', 'Available'),
      // Next Monday 00:00+07:00 -> NOT this week
      makeSlot('next-mon', '2027-01-04T00:00:00+07:00', 'Available'),
    ];

    const kpis = computeTutorKpis(slots, nowMs);
    expect(kpis).toEqual({
      offeredCount: 5,
      occupiedCount: 2,
      slotsThisWeek: 3,
    });
  });
});

describe('selectNextTutorLesson', () => {
  it('distinguishes in-progress, upcoming, and excludes past bookings', () => {
    const nowMs = new Date('2026-11-15T10:30:00+07:00').getTime();

    const bookings: TutorBookingSummary[] = [
      makeBooking('past-1', '2026-11-15T08:00:00+07:00', 'Past'),
      makeBooking('ended-just-now', '2026-11-15T09:30:00+07:00', 'Booked'),
      makeBooking('active-now', '2026-11-15T10:00:00+07:00', 'Booked'),
      makeBooking('later-today', '2026-11-15T14:00:00+07:00', 'Booked'),
    ];

    const result = selectNextTutorLesson(bookings, nowMs);
    expect(result?.phase).toBe('in-progress');
    expect(result?.lesson.id).toBe('active-now');

    const upcomingOnly = selectNextTutorLesson([bookings[0], bookings[3]], nowMs);
    expect(upcomingOnly?.phase).toBe('upcoming');
    expect(upcomingOnly?.lesson.id).toBe('later-today');

    expect(selectNextTutorLesson([bookings[0]], nowMs)).toBeNull();
  });
});
