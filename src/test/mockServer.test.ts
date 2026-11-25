import { describe, expect, it } from 'vitest'
import { stockLeft, formatMissingIngredients } from '../logic/ingredientStock'
import { MockServer, RESERVATION_MS } from '../mockServer/MockServer'
import { loadMenu } from '../mockServer/loadMenu'
import rawMenu from '../mockServer/menu.json'
import { priceCart } from '../logic/pricing'
import { A, B, C, body, makeServer, menu, memoryStorage, T_1059 } from './helpers'
import type { CartItem, StoredOrder } from '../types'

type Added = { item: CartItem }
type StateBody = { items: CartItem[]; soldStock: Record<string, number>; stockTotal: Record<string, number> }
type Err = { error: string; missingIngredients?: { ingredient: string; missing: number }[]; message?: string }

/** Remaining stock as the client computes it from the server state. */
function remaining(server: MockServer) {
  const s = body<StateBody>(server.getCartState())
  return stockLeft(s.stockTotal, [s.soldStock, ...s.items.filter((i) => i.status === 'active').map((i) => i.ingredientsHeld)])
}

/** The cart of TC-08..TC-11: B x1 + C x2. */
function cartBC() {
  const ctx = makeServer({ seeded: false })
  const b = ctx.server.addItem('k-b', { qty: 1, options: B })
  const c = ctx.server.addItem('k-c', { qty: 2, options: C })
  expect(b.status).toBe(201)
  expect(c.status).toBe(201)
  return { ...ctx, bId: body<Added>(b).item.id, cId: body<Added>(c).item.id }
}

describe('shared ingredient stock', () => {
  it('TC-08 cart B x1 + C x2 leaves egg 0, cheese 0, croissant 1; a new egg item is blocked with the reason', () => {
    const { server } = cartBC()
    const left = remaining(server)
    expect(left.egg).toBe(0)
    expect(left.cheese).toBe(0)
    expect(left.croissant).toBe(1)

    const blocked = server.addItem('k-a', { qty: 1, options: A })
    expect(blocked.status).toBe(409)
    expect(body<Err>(blocked).error).toBe('out_of_stock')
    expect(body<Err>(blocked).message).toBe('Short: 2 egg')
  })

  it("TC-09 edit B to Omelette x3 + Fried x1: Short: 1 egg (B's own 6 eggs count as available)", () => {
    const { server, bId } = cartBC()
    const r = server.editItem(bId, { qty: 1, options: { ...B, omelette: 3, fried: 1 } })
    expect(r.status).toBe(409)
    expect(body<Err>(r).message).toBe('Short: 1 egg')
    expect(remaining(server).egg).toBe(0) // nothing changed
  })

  it('TC-10 edit B to Omelette x1 + Fried x3: allowed, 643.50, egg remaining becomes 1', () => {
    const { server, bId } = cartBC()
    const r = server.editItem(bId, { qty: 1, options: { ...B, omelette: 1, fried: 3 } })
    expect(r.status).toBe(200)
    expect(remaining(server).egg).toBe(1)
    const priced = body<{ price: { lines: { unitPrice: number }[] } }>(
      server.previewPrice({ lines: [{ qty: 1, options: { ...B, omelette: 1, fried: 3 } }] }),
    )
    expect(priced.price.lines[0].unitPrice).toBe(64350)
  })

  it('TC-11 change C quantity 2 -> 3: Short: 2 egg, 2 cheese (all missingIngredients listed)', () => {
    const { server, cId } = cartBC()
    const r = server.editItem(cId, { qty: 3, options: C })
    expect(r.status).toBe(409)
    expect(body<Err>(r).message).toBe('Short: 2 egg, 2 cheese')
    expect(body<Err>(r).missingIngredients).toEqual([
      { ingredient: 'egg', missing: 2 },
      { ingredient: 'cheese', missing: 2 },
    ])
  })

  it('editing never double counts: saving the same item twice keeps the same allocation', () => {
    const { server, bId } = cartBC()
    server.editItem(bId, { qty: 1, options: B })
    server.editItem(bId, { qty: 1, options: B })
    expect(remaining(server).egg).toBe(0)
    expect(remaining(server).croissant).toBe(1)
  })

  it('formatMissingIngredients writes the exact text', () => {
    expect(formatMissingIngredients([{ ingredient: 'egg', missing: 2 }])).toBe('Short: 2 egg')
  })

  it('the server re-validates the rules (a client cannot skip them)', () => {
    const { server } = makeServer({ seeded: false })
    const r = server.addItem('x', { qty: 1, options: { toast: 1, scrambled: 3, sausage: 1 } })
    expect(r.status).toBe(422)
    expect(server.addItem('y', { qty: 1, options: { nope: 1 } }).status).toBe(400)
    expect(server.addItem('z', { qty: 4, options: A }).status).toBe(400)
  })
})

describe('cart and reservations', () => {
  it('TC-13 the same Add to Cart sent 3 times (same idempotency key) creates one item', () => {
    const { server } = makeServer({ seeded: false })
    const replies = [1, 2, 3].map(() => server.addItem('same-key', { qty: 1, options: A }))
    expect(replies.map((r) => r.status)).toEqual([201, 201, 201])
    const ids = replies.map((r) => body<Added>(r).item.id)
    expect(new Set(ids).size).toBe(1)
    const state = body<StateBody>(server.getCartState())
    expect(state.items).toHaveLength(1)
    expect(remaining(server).egg).toBe(8) // reserved once, not three times
  })

  it('TC-14 a reserve that fails mid-way leaves no stock held and Retry works', () => {
    const { server, fail } = makeServer({ seeded: false })
    const before = remaining(server)
    fail.on = true
    const r = server.addItem('k1', { qty: 1, options: B })
    expect(r.status).toBe(500)
    expect(body<StateBody>(server.getCartState()).items).toHaveLength(0)
    expect(remaining(server)).toEqual(before)

    fail.on = false
    const retry = server.addItem('k1', { qty: 1, options: B }) // same key: failures are not cached
    expect(retry.status).toBe(201)
    expect(body<StateBody>(server.getCartState()).items).toHaveLength(1)
  })

  it('a failed edit keeps the old allocation', () => {
    const { server, fail, bId } = (() => {
      const ctx = makeServer({ seeded: false })
      const id = body<Added>(ctx.server.addItem('k', { qty: 1, options: B })).item.id
      return { ...ctx, bId: id }
    })()
    fail.on = true
    expect(server.editItem(bId, { qty: 1, options: { ...B, omelette: 1, fried: 3 } }).status).toBe(500)
    fail.on = false
    expect(remaining(server).egg).toBe(4) // B still holds its 6 eggs
  })

  it('TC-15 at 5:00 on the server clock the stock is released and the item is read-only', () => {
    const { server, clock } = makeServer({ seeded: false })
    const id = body<Added>(server.addItem('k', { qty: 1, options: B })).item.id
    expect(remaining(server).egg).toBe(4)

    clock.t = T_1059 + RESERVATION_MS - 1
    expect(body<StateBody>(server.getCartState()).items[0].status).toBe('active')

    clock.t = T_1059 + RESERVATION_MS // exactly 5:00 later
    const state = body<StateBody>(server.getCartState())
    expect(state.items[0].status).toBe('expired')
    expect(remaining(server).egg).toBe(10) // released
    expect(server.editItem(id, { qty: 1, options: B }).status).toBe(410) // read-only
    expect(server.removeItem(id).status).toBe(200) // but it can be removed
  })

  it('an expired item can be re-reserved with new settings in one step (replaces)', () => {
    const { server, clock } = makeServer({ seeded: false })
    const id = body<Added>(server.addItem('k', { qty: 1, options: B })).item.id
    clock.t += RESERVATION_MS
    const r = server.addItem('k2', { qty: 1, options: A, replaces: id })
    expect(r.status).toBe(201)
    const items = body<StateBody>(server.getCartState()).items
    expect(items).toHaveLength(1)
    expect(items[0].options).toEqual(A)
  })

  it('no overselling: when the stock is nearly gone the next reservation is refused', () => {
    const { server } = makeServer({ seeded: false })
    // sausage stock is 4: the first item takes 3, so the second (needs 2) is short by 1
    expect(server.addItem('1', { qty: 1, options: { toast: 1, fried: 2, sausage: 3 } }).status).toBe(201)
    const second = server.addItem('2', { qty: 1, options: { toast: 1, fried: 2, sausage: 2 } })
    expect(second.status).toBe(409)
    expect(body<Err>(second).message).toBe('Short: 1 sausage')
    expect(remaining(server).sausage).toBe(1) // the failed request held nothing
  })
})

describe('checkout and orders', () => {
  it('TC-16 Pay twice quickly: exactly one order, cart empty, sold stock not released again', () => {
    const { server } = cartBC()
    const first = server.checkout('pay-1', { paymentMethod: 'card', couponCode: 'MORNING15' })
    const second = server.checkout('pay-1', { paymentMethod: 'card', couponCode: 'MORNING15' }) // double click
    const third = server.checkout('pay-2', { paymentMethod: 'card' }) // a different click, cart already empty
    expect(first.status).toBe(201)
    expect(second.status).toBe(201)
    expect(body<{ order: StoredOrder }>(second).order.id).toBe(body<{ order: StoredOrder }>(first).order.id)
    expect(third.status).toBe(409)

    const state = body<StateBody>(server.getCartState())
    expect(state.items).toHaveLength(0)
    expect(state.soldStock.egg).toBe(10)
    expect(remaining(server).egg).toBe(0) // still sold, not released
    const orders = body<{ orders: StoredOrder[] }>(server.getOrders()).orders
    expect(orders).toHaveLength(1)
  })

  it('the order carries its computed totals; the server makes the id and timestamp', () => {
    const { server } = cartBC()
    const { order } = body<{ order: StoredOrder }>(
      server.checkout('p', { paymentMethod: 'bkash', couponCode: 'MORNING15' }),
    )
    expect(order.id).toBe('ORD-1001')
    expect(order.createdAt).toBe('2026-11-24T10:59:59.000+06:00')
    expect(order.totals).toMatchObject({ subtotal: 165950, vat: 7548, payable: 158500, payableBdt: 1585 })
    expect(order.totals.discount).toMatchObject({ chosen: 'C2', applied: 15000 })
    expect(order.coupon).toEqual({ code: 'MORNING15', applied: true, reason: null })
    expect(order.lines.map((l) => l.qty)).toEqual([1, 2])
  })

  it('records a coupon that was entered but not applied (after 11:00)', () => {
    const { server, clock } = cartBC()
    clock.t = Date.parse('2026-11-24T11:00:00+06:00')
    const { order } = body<{ order: StoredOrder }>(
      server.checkout('p', { paymentMethod: 'cash', couponCode: 'MORNING15' }),
    )
    expect(order.coupon.applied).toBe(false)
    expect(order.coupon.code).toBe('MORNING15')
    expect(order.coupon.reason).toMatch(/before 11:00/)
    expect(order.totals.payableBdt).toBe(1637)
  })

  it('expired items are not paid for', () => {
    const { server, clock } = cartBC()
    clock.t += RESERVATION_MS
    expect(server.checkout('p', { paymentMethod: 'card' }).status).toBe(409)
  })

  it('rejects an unknown payment method and an empty cart', () => {
    const { server } = makeServer({ seeded: false })
    expect(server.checkout('a', { paymentMethod: 'card' }).status).toBe(409)
    server.addItem('x', { qty: 1, options: A })
    expect(server.checkout('b', { paymentMethod: 'gold' }).status).toBe(400)
  })

  it('TC-17 orders survive a refresh (a new server on the same storage) and seeds load once', () => {
    const storage = memoryStorage()
    const make = () =>
      new MockServer({ menu, storage, clock: () => T_1059, seedOrders: [] })
    const s1 = new MockServer({
      menu,
      storage,
      clock: () => T_1059,
      seedOrders: [
        { id: 'ORD-1001', createdAt: '2026-11-20T09:15:00+06:00', paymentMethod: 'card', couponCode: null, lines: [{ qty: 1, options: A }] },
      ],
    })
    s1.addItem('x', { qty: 1, options: A })
    s1.checkout('p', { paymentMethod: 'cash' })
    const s2 = make() // "refresh"
    const orders = body<{ orders: StoredOrder[] }>(s2.getOrders()).orders
    expect(orders.map((o) => o.id)).toEqual(['ORD-1001', 'ORD-1002'])
    expect(JSON.parse(JSON.stringify(orders))).toEqual(orders) // plain valid JSON
  })
})

describe('a different menu fixture needs no code change', () => {
  it('works with other options, stock, limits, VAT and promos (everything comes from the menu data)', () => {
    const other = structuredClone(rawMenu)
    other.product.basePrice = 100
    other.maxItemQty = 2
    other.promos.vatPercent = 10
    other.stock.egg = 2
    other.groups[0].options.push({ id: 'naan', name: 'Naan', price: 15, uses: { naan: 1 } } as never)
    other.stock = { ...other.stock, naan: 1 } as never
    const newMenu = loadMenu(other)

    const server = new MockServer({ menu: newMenu, storage: memoryStorage(), clock: () => T_1059 })
    const bigQty = server.addItem('a', { qty: 3, options: A })
    expect(bigQty.status).toBe(400) // the quantity limit is now 2

    const naanPlate = { toast: 0, naan: 1, fried: 2, tofu: 1 }
    expect(server.addItem('b', { qty: 1, options: naanPlate }).status).toBe(201)
    const second = server.addItem('c', { qty: 1, options: naanPlate })
    expect(second.status).toBe(409) // naan and eggs ran out
    expect(body<Err>(second).message).toBe('Short: 1 naan, 2 egg')

    const price = priceCart({ lines: [{ qty: 1, options: naanPlate }] }, newMenu, newMenu.promos, T_1059)
    expect(price.subtotal).toBe(100_00 + 15_00 + 60_00 + 50_00)
    expect(price.vatPercent).toBe(10)
  })
})
