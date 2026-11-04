/**
 * Parses one explicitly zoned RFC3339 instant at exact minute precision.
 * Any minute is valid: no hourly / 15-minute / business-hour grid is imposed.
 * Rejects rather than rounding nonzero seconds/fractions or invalid civil dates.
 */
export function parseSlotStart(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):00(?:\.(0{1,3}))?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null;
  const offsetHour = m[7] === 'Z' ? 0 : Number(m[9]);
  const offsetMinute = m[7] === 'Z' ? 0 : Number(m[10]);
  if (offsetHour > 14 || offsetMinute > 59 || (offsetHour === 14 && offsetMinute !== 0)) return null;
  const civil = new Date(0);
  civil.setUTCFullYear(year, month - 1, day);
  civil.setUTCHours(hour, minute, 0, 0);
  if (civil.getUTCFullYear() !== year || civil.getUTCMonth() !== month - 1 || civil.getUTCDate() !== day) return null;
  const sign = m[8] === '-' ? -1 : 1;
  const timestamp = civil.getTime() - sign * (offsetHour * 60 + offsetMinute) * 60_000;
  const instant = new Date(timestamp);
  return Number.isFinite(timestamp) && !Number.isNaN(instant.getTime()) ? instant : null;
}
