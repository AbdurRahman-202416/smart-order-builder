import type { Menu, SelectedOptions, StoredOrder } from '../types'

/**
 * Makes every word start with a capital letter: "can add 8 more" becomes "Can Add 8 More".
 * Letters that are already capital are kept, so "BDT" and "MORNING15" stay as they are.
 */
export function toTitleCase(text: string): string {
  return text.replace(/(^|\s|\()([a-z])/g, (_match, before: string, letter: string) => before + letter.toUpperCase())
}

/** "Toast, Scrambled x2, Chicken Sausage": the selected options, using the menu's names. */
export function listSelectedOptions(options: SelectedOptions, menu: Menu): string {
  const parts: string[] = []
  for (const group of menu.groups) {
    for (const option of group.options) {
      const optionQty = options[option.id] ?? 0
      if (optionQty > 0) parts.push(optionQty > 1 ? `${option.name} x${optionQty}` : option.name)
    }
  }
  return parts.join(', ')
}

/** 300000 ms becomes "05:00". Negative values show "00:00". */
export function formatMinutesSeconds(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

/** The text saved by the "Download orders.json" button (seed orders and new orders). */
export function ordersToJsonText(orders: StoredOrder[]): string {
  return JSON.stringify({ schemaVersion: 1, currency: 'BDT', moneyUnit: 'poisha', orders }, null, 2)
}

/** A new random key. Sending the same key again means "this is the same click". */
export function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `key-${Date.now()}-${Math.random().toString(36).slice(2)}`
}
