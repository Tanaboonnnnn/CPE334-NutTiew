// OD-014: count Unicode scalars, not UTF-16 code units. With the u flag,
// valid surrogate pairs are astral code points; only lone surrogates match.
export function parseTutorCancellationReason(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const reason = input.trim();
  if (!/\p{L}/u.test(reason) || /[\u0000\uD800-\uDFFF]/u.test(reason) || [...reason].length > 500) return null;
  return reason;
}
