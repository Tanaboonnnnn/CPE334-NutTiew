import { describe, expect, it } from 'vitest';
import { parseSlotStart } from '../src/slot-time.js';

describe('SLOT-06/19 strict minute-granularity RFC3339 validation', () => {
  it('accepts every minute with explicit timezone and canonicalizes to UTC', () => {
    expect(parseSlotStart('2026-11-06T13:17:00+07:00')?.toISOString()).toBe('2026-11-06T06:17:00.000Z');
    expect(parseSlotStart('2026-11-06T13:00:00.000+07:00')?.toISOString()).toBe('2026-11-06T06:00:00.000Z');
    expect(parseSlotStart('2026-11-06T06:00:00Z')?.toISOString()).toBe('2026-11-06T06:00:00.000Z');
    expect(parseSlotStart('2028-02-29T23:59:00+07:00')?.toISOString()).toBe('2028-02-29T16:59:00.000Z');
  });
  it.each([
    '2026-11-06T13:00:30+07:00',
    '2026-11-06T13:00:00.500+07:00',
    '2026-11-06T13:00:00.0000+07:00',
    '2026-11-06T13:00+07:00',
    '2026-11-06T13:00:00',
    '2026-02-30T13:00:00+07:00',
    '2026-11-06T24:00:00+07:00',
    '2026-11-06T13:60:00+07:00',
    '2026-11-06T13:00:00+15:00',
    '2026-11-06T13:00:00+07:99',
    '2026-11-06T13:00:00+14:30',
    '0000-11-06T13:00:00+07:00',
    '',
  ])('rejects invalid or non-minute-precise timestamp %s without rounding', input => {
    expect(parseSlotStart(input)).toBeNull();
  });
});
