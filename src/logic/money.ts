import type { Poisha } from '../types'

/**
 * Percentage of an integer amount, rounded half-up to the nearest integer.
 * Pure integer maths, so no floating point error:
 *   amount * percent / 100, rounded half-up == floor((2 * amount * percent + 100) / 200)
 * Works for non-negative integers (all amounts here are).
 */
export function percentOfRounded(amount: Poisha, percent: number): Poisha {
  return Math.floor((2 * amount * percent + 100) / 200)
}

/** Round poisha to whole BDT (half-up), result still expressed in poisha. */
export function roundToWholeBdt(amount: Poisha): Poisha {
  return Math.floor((amount + 50) / 100) * 100
}

/** Poisha -> "1,659.50" for display. Only used for display, never for calculation. */
export function formatBdt(amount: Poisha): string {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  const whole = Math.floor(abs / 100)
  const frac = String(abs % 100).padStart(2, '0')
  return `${sign}${whole.toLocaleString('en-US')}.${frac}`
}

/** BDT number (e.g. 250) -> poisha. Used only for fixture data. */
export const bdtToPoisha = (amount: number): Poisha => Math.round(amount * 100)
