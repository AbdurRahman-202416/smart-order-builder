import { defaultMenu } from '../mockServer/loadMenu'
import { MockServer } from '../mockServer/MockServer'
import seed from '../mockServer/orders.seed.json'
import type { CartLine, SeedOrder, SelectedOptions, StorageLike } from '../types'

export const menu = defaultMenu

/** Appendix A / Section 9 sample configurations. */
export const A: SelectedOptions = { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 }
export const B: SelectedOptions = {
  croissant: 1, omelette: 2, fried: 2, sausage: 1, bacon: 1, hashbrown: 1, mushroom: 1, hollandaise: 1,
}
export const C: SelectedOptions = { paratha: 1, fried: 2, tofu: 1, cheese: 2, beans: 1, mushroom: 1, chili: 1 }

export const line = (options: SelectedOptions, qty = 1): CartLine => ({ qty, options })

export function memoryStorage(): StorageLike {
  const data = new Map<string, string>()
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) }
}

/** Fixed instants on the shop clock (Asia/Dhaka, +06:00). */
export const at = (iso: string) => Date.parse(iso)
export const T_1059 = at('2026-11-24T10:59:59+06:00')
export const T_1100 = at('2026-11-24T11:00:00+06:00')

export function makeServer(opts: { now?: { t: number }; fail?: { on: boolean }; seeded?: boolean } = {}) {
  const clock = opts.now ?? { t: T_1059 }
  const fail = opts.fail ?? { on: false }
  const server = new MockServer({
    menu,
    storage: memoryStorage(),
    clock: () => clock.t,
    seedOrders: opts.seeded === false ? [] : (seed.orders as SeedOrder[]),
    shouldCrashDuringReserve: () => fail.on,
  })
  return { server, clock, fail }
}

export const body = <T>(reply: { body: unknown }) => reply.body as T
