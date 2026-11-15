import { bangkokDayKey, shiftDay, type OfferedSlot } from './tutor-calendar.js';

export type TutorBookingSummary = {
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

export type TutorKpis = {
  offeredCount: number;
  occupiedCount: number;
  slotsThisWeek: number;
};

export type NextTutorLesson = {
  lesson: TutorBookingSummary;
  phase: 'in-progress' | 'upcoming';
};

/**
 * Computes Tutor KPIs strictly from live API data using Asia/Bangkok (UTC+07:00)
 * Monday-to-Sunday week boundaries.
 */
export function computeTutorKpis(slots: OfferedSlot[], nowMs: number = Date.now()): TutorKpis {
  const todayBangkok = bangkokDayKey(new Date(nowMs));
  const todayDow = new Date(todayBangkok + 'T00:00:00Z').getUTCDay(); // 0=Sun..6=Sat
  const daysFromMon = (todayDow + 6) % 7;
  const weekStart = shiftDay(todayBangkok, -daysFromMon);
  const weekEnd = shiftDay(weekStart, 6);

  let offeredCount = 0;
  let occupiedCount = 0;
  let slotsThisWeek = 0;

  for (const slot of slots) {
    if (slot.lifecycle === 'Offered') {
      offeredCount++;
      if (slot.occupancy === 'Occupied') occupiedCount++;
    }
    const dayKey = bangkokDayKey(new Date(slot.startsAt));
    if (dayKey >= weekStart && dayKey <= weekEnd) {
      slotsThisWeek++;
    }
  }

  return { offeredCount, occupiedCount, slotsThisWeek };
}

/**
 * Selects the earliest active or upcoming booking for the Next Booked Lesson Spotlight,
 * distinguishing an in-progress session from an upcoming one.
 */
export function selectNextTutorLesson(
  bookings: TutorBookingSummary[],
  nowMs: number = Date.now(),
): NextTutorLesson | null {
  const candidates = bookings
    .filter(b => {
      if (b.displayStatus === 'Past') return false;
      const endMs = new Date(b.endsAt).getTime();
      return Number.isFinite(endMs) && endMs > nowMs;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));

  const next = candidates[0];
  if (!next) return null;

  const startMs = new Date(next.startsAt).getTime();
  return {
    lesson: next,
    phase: Number.isFinite(startMs) && startMs <= nowMs ? 'in-progress' : 'upcoming',
  };
}
