import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VISIBLE_TIME_GROUPS,
  buildAvailabilityCalendarIndex,
  buildMonthGrid,
  computeOfferDurationMinutes,
  daysInMonth,
  formatBangkokMonthYear,
  groupDayOffersByExactInterval,
  monthKeyFromDayKey,
  shiftMonthKey,
  sliceVisibleTimeGroups,
  type CustomerAvailabilityOffer,
} from '../src/customer-availability-calendar.js';

function makeOffer(slotId: string, tutorRef: string, startsAt: string, endsAt: string): CustomerAvailabilityOffer {
  return { slotId, tutorRef, startsAt, endsAt };
}

describe('Customer Availability Option A calendar & grouping pure helpers', () => {
  it('handles cross-year month shifts and leap-year February day counts without browser-clock drift', () => {
    expect(monthKeyFromDayKey('2026-11-29')).toBe('2026-11');
    expect(shiftMonthKey('2026-11', 1)).toBe('2026-12');
    expect(shiftMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftMonthKey('2027-01', -1)).toBe('2026-12');
    expect(shiftMonthKey('2026-12', -1)).toBe('2026-11');

    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2027, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2100, 2)).toBe(28);
    expect(daysInMonth(2026, 12)).toBe(31);
    expect(daysInMonth(2027, 1)).toBe(31);

    expect(formatBangkokMonthYear('2026-11')).toBe('พฤศจิกายน 2026');
    expect(formatBangkokMonthYear('2027-01')).toBe('มกราคม 2027');
    expect(formatBangkokMonthYear('2028-02')).toBe('กุมภาพันธ์ 2028');
  });

  it('indexes 500+ offers across Nov -> Dec(empty) -> Jan respecting OD-002 60-day T_view bounds and counting total offers per day', () => {
    const evaluatedAt = '2026-11-28T05:00:00.000Z'; // 2026-11-28 12:00 BKK (+60d = 2027-01-27)
    const offers: CustomerAvailabilityOffer[] = [];
    // Seed 250 offers on 2026-11-29 (across repeated tutors and 10 time intervals) and 260 offers on 2027-01-15
    for (let i = 0; i < 250; i++) {
      const hour = String(8 + (i % 10)).padStart(2, '0');
      const endHour = String(9 + (i % 10)).padStart(2, '0');
      const start = new Date(`2026-11-29T${hour}:00:00.000+07:00`).toISOString();
      const end = new Date(`2026-11-29T${endHour}:00:00.000+07:00`).toISOString();
      offers.push(makeOffer(`slot-nov-${i}`, `tutor-${i % 5}`, start, end));
    }
    for (let i = 0; i < 260; i++) {
      const hour = String(8 + (i % 10)).padStart(2, '0');
      const endHour = String(9 + (i % 10)).padStart(2, '0');
      const start = new Date(`2027-01-15T${hour}:00:00.000+07:00`).toISOString();
      const end = new Date(`2027-01-15T${endHour}:00:00.000+07:00`).toISOString();
      offers.push(makeOffer(`slot-jan-${i}`, `tutor-${i % 4}`, start, end));
    }
    offers.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.tutorRef.localeCompare(b.tutorRef) || a.slotId.localeCompare(b.slotId));

    const index = buildAvailabilityCalendarIndex(offers, evaluatedAt);
    expect(index.earliestDayKey).toBe('2026-11-29');
    expect(index.earliestMonthKey).toBe('2026-11');
    expect(index.minMonthKey).toBe('2026-11');
    expect(index.maxMonthKey).toBe('2027-01');
    // Day offer count MUST equal exact offers count, NOT unique tutors
    expect(index.offersByDay.get('2026-11-29')?.length).toBe(250);
    expect(index.offersByDay.get('2027-01-15')?.length).toBe(260);
    expect(index.monthOfferCount('2026-12')).toBe(0);
    expect(index.monthOfferCount('2026-11')).toBe(250);
    expect(index.monthOfferCount('2027-01')).toBe(260);

    // Grid alignment for Nov 2026 (2026-11-01 is Sunday -> 6 leading spacers Mon..Sat)
    const novGrid = buildMonthGrid('2026-11', index.offersByDay);
    expect(novGrid.length % 7).toBe(0);
    expect(novGrid.slice(0, 6).every(c => c.kind === 'spacer')).toBe(true);
    const nov29 = novGrid.find(c => c.kind === 'day' && c.dayKey === '2026-11-29');
    expect(nov29).toMatchObject({
      kind: 'day',
      dayKey: '2026-11-29',
      dayNumber: 29,
      offerCount: 250,
    });
    if (nov29?.kind === 'day') {
      expect(nov29.ariaLabel).toBe('29 พ.ย. 2026 มี 250 ช่วงเวลา');
    }

    // Empty day label in Dec 2026
    const decGrid = buildMonthGrid('2026-12', index.offersByDay);
    const dec15 = decGrid.find(c => c.kind === 'day' && c.dayKey === '2026-12-15');
    if (dec15?.kind === 'day') {
      expect(dec15.offerCount).toBe(0);
      expect(dec15.ariaLabel).toBe('15 ธ.ค. 2026 ไม่มีช่วงเวลาว่าง');
    }

    // Leap year grid alignment: 2028-02-01 is Tuesday -> 1 leading spacer (Mon), includes day 29
    const feb2028Grid = buildMonthGrid('2028-02', new Map());
    expect(feb2028Grid[0].kind).toBe('spacer');
    expect(feb2028Grid[1]).toMatchObject({ kind: 'day', dayKey: '2028-02-01', dayNumber: 1 });
    expect(feb2028Grid.some(c => c.kind === 'day' && c.dayKey === '2028-02-29')).toBe(true);
    expect(feb2028Grid.length % 7).toBe(0);
  });

  it('groups offers strictly by exact (startsAt, endsAt) without hour snapping, preserves cross-midnight flags, computes real duration, and limits default visible groups to 6', () => {
    const dayOffers: CustomerAvailabilityOffer[] = [
      makeOffer('s1', 'tutor-a', '2026-11-12T01:00:00.000Z', '2026-11-12T02:00:00.000Z'), // 08:00-09:00
      makeOffer('s2', 'tutor-a', '2026-11-12T02:00:00.000Z', '2026-11-12T03:00:00.000Z'), // 09:00-10:00
      makeOffer('s3', 'tutor-b', '2026-11-12T02:00:00.000Z', '2026-11-12T03:00:00.000Z'), // 09:00-10:00 same exact interval
      makeOffer('s4', 'tutor-c', '2026-11-12T02:15:00.000Z', '2026-11-12T03:45:00.000Z'), // 09:15-10:45 (90 min, NOT merged into 09:00)
      makeOffer('s5', 'tutor-a', '2026-11-12T04:00:00.000Z', '2026-11-12T05:00:00.000Z'), // 11:00-12:00
      makeOffer('s6', 'tutor-a', '2026-11-12T06:00:00.000Z', '2026-11-12T07:00:00.000Z'), // 13:00-14:00
      makeOffer('s7', 'tutor-a', '2026-11-12T08:00:00.000Z', '2026-11-12T09:00:00.000Z'), // 15:00-16:00
      makeOffer('s8', 'tutor-a', '2026-11-12T10:00:00.000Z', '2026-11-12T11:00:00.000Z'), // 17:00-18:00 (group #7)
      makeOffer('s9', 'tutor-a', '2026-11-12T16:30:00.000Z', '2026-11-12T17:30:00.000Z'), // 23:30-00:30 Bangkok cross-midnight! (group #8)
    ];

    const groups = groupDayOffersByExactInterval(dayOffers);
    expect(groups).toHaveLength(8);
    expect(groups[1].items.map(x => x.slotId)).toEqual(['s2', 's3']);
    expect(groups[2].startClock).toBe('09:15');
    expect(groups[2].endClock).toBe('10:45');
    expect(computeOfferDurationMinutes(groups[2].items[0])).toBe(90);
    expect(groups[7].startClock).toBe('23:30');
    expect(groups[7].endClock).toBe('00:30');
    expect(groups[7].crossMidnight).toBe(true);

    expect(DEFAULT_VISIBLE_TIME_GROUPS).toBe(6);
    const collapsed = sliceVisibleTimeGroups(groups, false);
    expect(collapsed.visibleGroups).toHaveLength(6);
    expect(collapsed.hiddenCount).toBe(2);

    const expanded = sliceVisibleTimeGroups(groups, true);
    expect(expanded.visibleGroups).toHaveLength(8);
    expect(expanded.hiddenCount).toBe(0);
  });

  it('buckets UTC instants into Asia/Bangkok days accurately across 16:30Z vs 17:30Z boundary and handles empty offer index', () => {
    const emptyIdx = buildAvailabilityCalendarIndex([], null);
    expect(emptyIdx.earliestDayKey).toBeNull();
    expect(emptyIdx.earliestMonthKey).toBeNull();
    expect(emptyIdx.minMonthKey).toBeNull();
    expect(emptyIdx.maxMonthKey).toBeNull();
    expect(emptyIdx.monthOfferCount('2026-11')).toBe(0);

    const lateNov12 = makeOffer('u1', 'tutor-a', '2026-11-12T16:30:00.000Z', '2026-11-12T17:30:00.000Z'); // 23:30-00:30 on 2026-11-12 BKK
    const earlyNov13 = makeOffer('u2', 'tutor-a', '2026-11-12T17:00:00.000Z', '2026-11-12T18:00:00.000Z'); // 00:00-01:00 on 2026-11-13 BKK
    const afterMidnightNov13 = makeOffer('u3', 'tutor-b', '2026-11-12T17:30:00.000Z', '2026-11-12T18:30:00.000Z'); // 00:30-01:30 on 2026-11-13 BKK

    const idx = buildAvailabilityCalendarIndex([lateNov12, earlyNov13, afterMidnightNov13], '2026-11-12T10:00:00.000Z');
    expect(idx.earliestDayKey).toBe('2026-11-12');
    expect(idx.offersByDay.get('2026-11-12')?.map(o => o.slotId)).toEqual(['u1']);
    expect(idx.offersByDay.get('2026-11-13')?.map(o => o.slotId)).toEqual(['u2', 'u3']);
  });
});
