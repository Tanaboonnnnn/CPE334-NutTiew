import { bangkokClock, bangkokDayKey, bangkokLongDate } from './tutor-calendar.js';

export type CustomerAvailabilityOffer = {
  slotId: string;
  tutorRef: string;
  startsAt: string;
  endsAt: string;
};

export const DEFAULT_VISIBLE_TIME_GROUPS = 6;
export const WEEKDAY_LABELS_MON_FIRST = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'] as const;

const DAY_MS = 86_400_000;

export function monthKeyFromDayKey(dayKey: string): string {
  return dayKey.slice(0, 7);
}

export function shiftMonthKey(monthKey: string, deltaMonths: number): string {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const monthIndex0 = Number(monthStr) - 1;
  const total = year * 12 + monthIndex0 + deltaMonths;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12 + 12) % 12 + 1;
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month1To12: number): number {
  return new Date(Date.UTC(year, month1To12, 0)).getUTCDate();
}

export function weekdayMon0FromDayKey(dayKey: string): number {
  const [y, m, d] = dayKey.split('-').map(Number);
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Sun..6=Sat
  return (utcDay + 6) % 7; // 0=Mon..6=Sun
}

export function formatBangkokMonthYear(monthKey: string): string {
  const anchor = new Date(`${monthKey}-15T12:00:00.000+07:00`);
  return new Intl.DateTimeFormat('th-TH-u-ca-gregory-nu-latn', {
    timeZone: 'Asia/Bangkok',
    month: 'long',
    year: 'numeric',
  }).format(anchor);
}

export function bangkokLongDateFromDayKey(dayKey: string): string {
  return bangkokLongDate(new Date(`${dayKey}T12:00:00.000+07:00`));
}

export function computeOfferDurationMinutes(offer: Pick<CustomerAvailabilityOffer, 'startsAt' | 'endsAt'>): number {
  const startMs = Date.parse(offer.startsAt);
  const endMs = Date.parse(offer.endsAt);
  return Math.max(0, Math.round((endMs - startMs) / 60_000));
}

export type CalendarGridCell =
  | {
      kind: 'spacer';
      key: string;
    }
  | {
      kind: 'day';
      key: string;
      dayKey: string;
      dayNumber: number;
      offerCount: number;
      dateLabel: string;
      ariaLabel: string;
    };

export function buildMonthGrid(
  monthKey: string,
  offersByDay: ReadonlyMap<string, readonly CustomerAvailabilityOffer[]>,
): CalendarGridCell[] {
  const [yearStr, monthStr] = monthKey.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const totalDays = daysInMonth(year, month);
  const firstDayKey = `${monthKey}-01`;
  const leadingSpacers = weekdayMon0FromDayKey(firstDayKey);

  const cells: CalendarGridCell[] = [];
  for (let i = 0; i < leadingSpacers; i++) {
    cells.push({ kind: 'spacer', key: `${monthKey}-pre-${i}` });
  }

  for (let day = 1; day <= totalDays; day++) {
    const dayKey = `${monthKey}-${String(day).padStart(2, '0')}`;
    const offerCount = offersByDay.get(dayKey)?.length ?? 0;
    const dateLabel = bangkokLongDateFromDayKey(dayKey);
    const ariaLabel =
      offerCount > 0
        ? `${dateLabel} มี ${offerCount} ช่วงเวลา`
        : `${dateLabel} ไม่มีช่วงเวลาว่าง`;
    cells.push({
      kind: 'day',
      key: dayKey,
      dayKey,
      dayNumber: day,
      offerCount,
      dateLabel,
      ariaLabel,
    });
  }

  const trailingRemainder = cells.length % 7;
  if (trailingRemainder !== 0) {
    const needed = 7 - trailingRemainder;
    for (let i = 0; i < needed; i++) {
      cells.push({ kind: 'spacer', key: `${monthKey}-post-${i}` });
    }
  }
  return cells;
}

export type AvailabilityCalendarIndex = {
  offersByDay: Map<string, CustomerAvailabilityOffer[]>;
  earliestDayKey: string | null;
  earliestMonthKey: string | null;
  minMonthKey: string | null;
  maxMonthKey: string | null;
  monthOfferCount: (monthKey: string) => number;
};

export function buildAvailabilityCalendarIndex(
  offers: readonly CustomerAvailabilityOffer[],
  evaluatedAt: string | null,
): AvailabilityCalendarIndex {
  const offersByDay = new Map<string, CustomerAvailabilityOffer[]>();
  const offersByMonthCount = new Map<string, number>();

  for (const offer of offers) {
    const dayKey = bangkokDayKey(new Date(offer.startsAt));
    const list = offersByDay.get(dayKey);
    if (list) {
      list.push(offer);
    } else {
      offersByDay.set(dayKey, [offer]);
    }
    const mKey = monthKeyFromDayKey(dayKey);
    offersByMonthCount.set(mKey, (offersByMonthCount.get(mKey) ?? 0) + 1);
  }

  if (offers.length === 0) {
    return {
      offersByDay,
      earliestDayKey: null,
      earliestMonthKey: null,
      minMonthKey: null,
      maxMonthKey: null,
      monthOfferCount: () => 0,
    };
  }

  let earliestDayKey = bangkokDayKey(new Date(offers[0].startsAt));
  let latestDayKey = earliestDayKey;
  for (const dayKey of offersByDay.keys()) {
    if (dayKey < earliestDayKey) earliestDayKey = dayKey;
    if (dayKey > latestDayKey) latestDayKey = dayKey;
  }

  const earliestMonthKey = monthKeyFromDayKey(earliestDayKey);
  const latestOfferMonthKey = monthKeyFromDayKey(latestDayKey);

  let minMonthKey = earliestMonthKey;
  let maxMonthKey = latestOfferMonthKey;
  if (evaluatedAt) {
    const evaluatedMs = Date.parse(evaluatedAt);
    if (Number.isFinite(evaluatedMs)) {
      const evalMonthKey = monthKeyFromDayKey(bangkokDayKey(new Date(evaluatedMs)));
      if (evalMonthKey < minMonthKey) minMonthKey = evalMonthKey;
      const horizonEndMonthKey = monthKeyFromDayKey(
        bangkokDayKey(new Date(evaluatedMs + 60 * DAY_MS)),
      );
      if (horizonEndMonthKey > maxMonthKey) maxMonthKey = horizonEndMonthKey;
    }
  }

  return {
    offersByDay,
    earliestDayKey,
    earliestMonthKey,
    minMonthKey,
    maxMonthKey,
    monthOfferCount: (monthKey: string) => offersByMonthCount.get(monthKey) ?? 0,
  };
}

export type TimeIntervalGroup = {
  key: string;
  startsAt: string;
  endsAt: string;
  startClock: string;
  endClock: string;
  crossMidnight: boolean;
  dateLabel: string;
  items: CustomerAvailabilityOffer[];
};

export function groupDayOffersByExactInterval(
  dayOffers: readonly CustomerAvailabilityOffer[],
): TimeIntervalGroup[] {
  const groups: TimeIntervalGroup[] = [];
  const byKey = new Map<string, TimeIntervalGroup>();

  for (const offer of dayOffers) {
    const key = `${offer.startsAt}|${offer.endsAt}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.items.push(offer);
      continue;
    }
    const start = new Date(offer.startsAt);
    const end = new Date(offer.endsAt);
    const group: TimeIntervalGroup = {
      key,
      startsAt: offer.startsAt,
      endsAt: offer.endsAt,
      startClock: bangkokClock(start),
      endClock: bangkokClock(end),
      crossMidnight: bangkokDayKey(start) !== bangkokDayKey(end),
      dateLabel: bangkokLongDate(start),
      items: [offer],
    };
    byKey.set(key, group);
    groups.push(group);
  }
  return groups;
}

export function sliceVisibleTimeGroups<T>(
  groups: readonly T[],
  showAll: boolean,
  limit = DEFAULT_VISIBLE_TIME_GROUPS,
): { visibleGroups: readonly T[]; hiddenCount: number } {
  if (showAll || groups.length <= limit) {
    return { visibleGroups: groups, hiddenCount: 0 };
  }
  return {
    visibleGroups: groups.slice(0, limit),
    hiddenCount: groups.length - limit,
  };
}
