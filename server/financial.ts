export const FINANCIAL_TERMS_VERSION = '2026-11-21-v1';
export const TOP15_TERM_MS = 30 * 24 * 60 * 60 * 1000;

export function coversTop15Term(listingExpiresAt: string | null | undefined, now: number): boolean {
  const expiry = listingExpiresAt ? Date.parse(listingExpiresAt) : NaN;
  return Number.isFinite(expiry) && expiry >= now + TOP15_TERM_MS;
}

// BigInt avoids floating point drift; half-tetri rounds upward consistently.
export function unusedTimeRefundMinor(amountMinor: number, startsAt: number, endsAt: number, stoppedAt: number): number {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || ![startsAt, endsAt, stoppedAt].every(Number.isFinite) || endsAt <= startsAt) {
    throw new Error('INVALID_REFUND_INPUT');
  }
  const total = BigInt(Math.trunc(endsAt - startsAt));
  const unused = BigInt(Math.trunc(Math.max(0, endsAt - Math.max(startsAt, stoppedAt))));
  return Number((BigInt(amountMinor) * unused + total / 2n) / total);
}
