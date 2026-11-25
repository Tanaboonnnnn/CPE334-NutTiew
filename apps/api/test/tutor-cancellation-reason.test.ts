import { expect, it } from 'vitest';
import { parseTutorCancellationReason } from '../src/tutor-cancellation-reason.js';

it.each([null, undefined, 1, {}, '', ' \t\n ', '...', '๑๒๓', '😀', '\u200B', 'เหตุผล\0', 'เหตุผล\ud800', 'เหตุผล\udc00'])(
  'TCAN-04: rejects malformed or filler-only reasons (%j)',
  input => expect(parseTutorCancellationReason(input)).toBeNull(),
);

it('TCAN-04: trims Thai, preserves valid interior text and counts Unicode scalar values', () => {
  const text = 'ติดธุระ  ช่วงนี้ 📚';
  expect(parseTutorCancellationReason('  ' + text + '\t')).toBe(text);
  expect(parseTutorCancellationReason('A' + '😀'.repeat(499))).toBe('A' + '😀'.repeat(499));
  expect(parseTutorCancellationReason('A' + '😀'.repeat(500))).toBeNull();
});
