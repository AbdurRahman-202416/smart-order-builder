// The mock server.

import type { CartItem } from './cartTypes'
import type { IngredientAmounts, Menu } from './menuTypes'
import type { SeedOrder, StoredOrder } from './orderTypes'

export interface ServerReply<T = unknown> {
  status: number
  body: T
}

/** Everything the server remembers. It is saved as one JSON text. */
export interface ServerData {
  nextItemNumber: number
  nextOrderNumber: number
  items: CartItem[]
  /** Stock that was paid for. It never comes back. */
  soldStock: IngredientAmounts
  orders: StoredOrder[]
  /** Idempotency key -> the reply already given. Only successful replies are kept. */
  repliesByKey: Record<string, ServerReply>
}

/** Anything shaped like localStorage. Tests pass an in-memory version. */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export interface MockServerOptions {
  menu: Menu
  storage: StorageLike
  /** The server clock in ms. In the browser it runs 90 seconds ahead of Date.now(). */
  clock: () => number
  seedOrders?: SeedOrder[]
  /** Return true to make a reservation crash half-way (used by the demo checkbox and tests). */
  shouldCrashDuringReserve?: () => boolean
}

/** Knobs for demos and for the acceptance tests. They live on window.__mock in the browser. */
export interface MockControls {
  /** 0..1, share of /api/price calls that fail with a 500. Spec: 15%. */
  priceFailureRate: number
  /** Simulated /api/price latency range in ms. Spec: 200-1500. */
  priceLatency: [number, number]
  /** Latency for the other endpoints, so double clicks really overlap. */
  latency: [number, number]
  /** One-shot: the next reserve/edit crashes half-way. */
  crashNextReserve: boolean
}

/** The JSON an error reply carries, so the screen can show the reason. */
export interface ApiErrorBody {
  error?: string
  message?: string
  missingIngredients?: { ingredient: string; missing: number }[]
  violations?: { message: string }[]
}
