/**
 * Shop clock helpers. Bangladesh has no daylight saving, so a fixed offset (+06:00 = 360 minutes)
 * is exact and needs no timezone database.
 */

const ONE_DAY_MS = 24 * 60 * 60 * 1000

/** Milliseconds since midnight on the shop clock. */
export function msSinceMidnightInShop(instantMs: number, utcOffsetMinutes: number): number {
  const shopMs = instantMs + utcOffsetMinutes * 60_000
  return ((shopMs % ONE_DAY_MS) + ONE_DAY_MS) % ONE_DAY_MS
}

/** True only when the moment is STRICTLY before hour:minute:00.000 on the shop clock. */
export function dhakaTimeIsBefore(instantMs: number, hour: number, minute: number, utcOffsetMinutes: number): boolean {
  const cutoffMs = (hour * 60 + minute) * 60_000
  return msSinceMidnightInShop(instantMs, utcOffsetMinutes) < cutoffMs
}

/** The shop's calendar day for a moment, for example "2026-11-20". */
export function dhakaDate(moment: string | number, utcOffsetMinutes: number): string {
  const ms = typeof moment === 'number' ? moment : Date.parse(moment)
  return new Date(ms + utcOffsetMinutes * 60_000).toISOString().slice(0, 10)
}
