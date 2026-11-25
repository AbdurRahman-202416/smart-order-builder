import { addIngredients, formatMissingIngredients, ingredientsNeeded, missingIngredients, stockLeft } from '../logic/ingredientStock'
import { priceCart } from '../logic/pricing'
import { validate } from '../logic/validateRules'
import { PAYMENT_METHODS } from '../types'
import type { CartItem, CartLine, CartPrice, IngredientAmounts, MockServerOptions, PaymentMethod, SelectedOptions, ServerData, ServerReply, StoredOrder } from '../types'

/** A reservation lasts 5 minutes, measured on the SERVER clock. */
export const RESERVATION_MS = 5 * 60 * 1000
/** Saved server data. The version in the name changes whenever the saved shape changes. */
export const SERVER_STORAGE_KEY = 'sob.server.v2'

/** Thrown on purpose to simulate a server crash in the middle of a reservation. */
class SimulatedCrash extends Error {}

/** Shop time as text, for example 2026-11-20T09:15:00.000+06:00 */
export function toDhakaIsoTime(ms: number, offsetMinutes = 360): string {
  const shopTime = new Date(ms + offsetMinutes * 60_000).toISOString().slice(0, 23)
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const absMinutes = Math.abs(offsetMinutes)
  const hh = String(Math.floor(absMinutes / 60)).padStart(2, '0')
  const mm = String(absMinutes % 60).padStart(2, '0')
  return `${shopTime}${sign}${hh}:${mm}`
}

export class MockServer {
  private readonly options: MockServerOptions

  constructor(options: MockServerOptions) {
    this.options = options
  }

  // ===== Reading =====

  getMenu(): ServerReply {
    return { status: 200, body: { menu: this.options.menu, serverTime: this.options.clock() } }
  }

  getCartState(): ServerReply {
    const now = this.options.clock()
    const data = this.loadData()
    this.expireOldReservations(data, now)
    this.saveData(data) // save the expiries so every browser tab sees the same thing
    return {
      status: 200,
      body: { serverTime: now, items: data.items, soldStock: data.soldStock, stockTotal: this.options.menu.stock },
    }
  }

  getOrders(): ServerReply {
    return { status: 200, body: { orders: this.loadData().orders, serverTime: this.options.clock() } }
  }

  previewPrice(body: { lines?: unknown[]; couponCode?: string | null }): ServerReply {
    const now = this.options.clock()
    const lines: CartLine[] = []
    for (const rawLine of body.lines ?? []) {
      const checked = this.checkItemInput(rawLine)
      if ('error' in checked) return { status: 400, body: { error: checked.error, serverTime: now } }
      lines.push(checked.line)
    }
    const price = priceCart({ lines, couponCode: body.couponCode }, this.options.menu, this.options.menu.promos, now)
    return { status: 200, body: { price, serverTime: now } }
  }

  // ===== Cart =====

  addItem(idempotencyKey: string | null, body: Partial<CartLine> & { replaces?: string }): ServerReply {
    return this.runTransaction((data, now) => {
      const earlierReply = idempotencyKey ? data.repliesByKey[idempotencyKey] : undefined
      if (earlierReply) return earlierReply

      const checked = this.checkWholeItem(body, now)
      if ('errorReply' in checked) return checked.errorReply

      // "replaces" re-reserves an expired item with new settings in one step
      let itemToReplace: CartItem | undefined
      if (body.replaces) {
        itemToReplace = data.items.find((item) => item.id === body.replaces)
        if (!itemToReplace) return { status: 404, body: { error: 'item_not_found', serverTime: now } }
        if (itemToReplace.status === 'active') return { status: 409, body: { error: 'item_still_active', serverTime: now } }
      }

      const reserved = this.reserveIngredients(data, checked.line, now)
      if ('errorReply' in reserved) return reserved.errorReply

      const newItem: CartItem = {
        id: `item-${data.nextItemNumber++}`,
        qty: checked.line.qty,
        options: checked.line.options,
        ingredientsHeld: reserved.ingredients,
        status: 'active',
        createdAt: now,
        expiresAt: now + RESERVATION_MS,
      }
      if (itemToReplace) data.items = data.items.filter((item) => item.id !== itemToReplace.id)
      data.items.push(newItem)

      const reply: ServerReply = { status: 201, body: { item: newItem, serverTime: now } }
      if (idempotencyKey) data.repliesByKey[idempotencyKey] = reply
      return reply
    })
  }

  /** Edit is ONE call: the old allocation is swapped for the new one (only the difference is checked). */
  editItem(itemId: string, body: Partial<CartLine>): ServerReply {
    return this.runTransaction((data, now) => {
      const item = data.items.find((i) => i.id === itemId)
      if (!item) return { status: 404, body: { error: 'item_not_found', serverTime: now } }
      if (item.status === 'expired') return { status: 410, body: { error: 'reservation_expired', serverTime: now } }

      const checked = this.checkWholeItem(body, now)
      if ('errorReply' in checked) return checked.errorReply

      // The item's own old allocation is NOT counted as taken, so it counts as available to itself.
      const reserved = this.reserveIngredients(data, checked.line, now, item.id)
      if ('errorReply' in reserved) return reserved.errorReply

      item.qty = checked.line.qty
      item.options = checked.line.options
      item.ingredientsHeld = reserved.ingredients // swapped in one step: nothing is counted twice
      return { status: 200, body: { item, serverTime: now } }
    })
  }

  removeItem(itemId: string): ServerReply {
    return this.runTransaction((data, now) => {
      const itemCountBefore = data.items.length
      data.items = data.items.filter((item) => item.id !== itemId)
      if (data.items.length === itemCountBefore) return { status: 404, body: { error: 'item_not_found', serverTime: now } }
      return { status: 200, body: { ok: true, serverTime: now } }
    })
  }

  // ===== Checkout =====

  /**
   * Pay: every ACTIVE item becomes one order, reserved stock becomes sold stock, and the cart empties.
   * The server creates the order id and the time (the browser clock is not trusted).
   */
  checkout(idempotencyKey: string | null, body: { paymentMethod?: string; couponCode?: string | null }): ServerReply {
    return this.runTransaction((data, now) => {
      const earlierReply = idempotencyKey ? data.repliesByKey[idempotencyKey] : undefined
      if (earlierReply) return earlierReply

      if (!PAYMENT_METHODS.includes(body.paymentMethod as PaymentMethod)) {
        return { status: 400, body: { error: 'Choose Card, Bkash Or Cash.', serverTime: now } }
      }
      const activeItems = data.items.filter((item) => item.status === 'active')
      if (activeItems.length === 0) return { status: 409, body: { error: 'empty_cart', serverTime: now } }

      const lines = activeItems.map((item) => ({ qty: item.qty, options: item.options }))
      const price = priceCart({ lines, couponCode: body.couponCode }, this.options.menu, this.options.menu.promos, now)
      const order = this.createOrderRecord(
        `ORD-${data.nextOrderNumber++}`,
        toDhakaIsoTime(now),
        body.paymentMethod as PaymentMethod,
        lines,
        price,
      )

      data.orders.push(order)
      for (const item of activeItems) data.soldStock = addIngredients(data.soldStock, item.ingredientsHeld)
      data.items = [] // paid items are done; expired items held no stock, so they are dropped too

      const reply: ServerReply = { status: 201, body: { order, serverTime: now } }
      if (idempotencyKey) data.repliesByKey[idempotencyKey] = reply
      return reply
    })
  }

  // ===== Private helpers =====

  /** Always read storage again: other browser tabs share it, so it is the one source of truth. */
  private loadData(): ServerData {
    const savedText = this.options.storage.getItem(SERVER_STORAGE_KEY)
    if (savedText) return JSON.parse(savedText) as ServerData

    const freshData: ServerData = {
      nextItemNumber: 1,
      nextOrderNumber: 1001,
      items: [],
      soldStock: {},
      orders: [],
      repliesByKey: {},
    }
    // First start: load the seed orders and price them with OUR engine at their own time.
    for (const seed of this.options.seedOrders ?? []) {
      const price = priceCart(
        { lines: seed.lines, couponCode: seed.couponCode },
        this.options.menu,
        this.options.menu.promos,
        Date.parse(seed.createdAt),
      )
      freshData.orders.push(this.createOrderRecord(seed.id, seed.createdAt, seed.paymentMethod, seed.lines, price))
      const seedNumber = Number(seed.id.replace(/\D/g, ''))
      if (Number.isFinite(seedNumber)) freshData.nextOrderNumber = Math.max(freshData.nextOrderNumber, seedNumber + 1)
    }
    this.saveData(freshData)
    return freshData
  }

  private saveData(data: ServerData) {
    this.options.storage.setItem(SERVER_STORAGE_KEY, JSON.stringify(data))
  }

  /** Expired reservations stop holding stock and become read-only. */
  private expireOldReservations(data: ServerData, now: number) {
    for (const item of data.items) {
      if (item.status === 'active' && now >= item.expiresAt) item.status = 'expired'
    }
  }

  /**
   * One transaction = load, expire old reservations, do the work, save.
   * If the work throws, nothing is saved, so a half-finished ("phantom") reservation cannot exist.
   */
  private runTransaction(work: (data: ServerData, now: number) => ServerReply): ServerReply {
    const now = this.options.clock()
    const data = this.loadData()
    this.expireOldReservations(data, now)
    try {
      const reply = work(data, now)
      this.saveData(data) // error replies never change data, so saving after them is safe
      return reply
    } catch (error) {
      if (error instanceof SimulatedCrash) {
        return { status: 500, body: { error: 'reserve_failed', serverTime: now } }
      }
      throw error
    }
  }

  /** Stock that is already taken: sold stock plus every other active reservation. */
  private stockInUse(data: ServerData, ignoreItemId?: string): IngredientAmounts[] {
    const activeReservations = data.items.filter((item) => item.status === 'active' && item.id !== ignoreItemId)
    return [data.soldStock, ...activeReservations.map((item) => item.ingredientsHeld)]
  }

  /** Checks one item's quantity and options. */
  private checkItemInput(body: unknown): { line: CartLine } | { error: string } {
    const input = body as Partial<CartLine> | null
    if (!input || typeof input !== 'object') return { error: 'Body Must Be An Object.' }
    const qty = input.qty
    const maxItemQty = this.options.menu.maxItemQty
    if (!Number.isInteger(qty) || (qty as number) < 1 || (qty as number) > maxItemQty) {
      return { error: `Qty Must Be A Whole Number From 1 To ${maxItemQty}.` }
    }
    const knownOptionIds = new Set(this.options.menu.groups.flatMap((group) => group.options.map((o) => o.id)))
    const options: SelectedOptions = {}
    for (const [optionId, optionQty] of Object.entries(input.options ?? {})) {
      if (!knownOptionIds.has(optionId)) return { error: `Unknown Option "${optionId}".` }
      if (!Number.isInteger(optionQty) || optionQty < 0) return { error: `Bad Quantity For "${optionId}".` }
      if (optionQty > 0) options[optionId] = optionQty
    }
    return { line: { qty: qty as number, options } }
  }

  /** checkItemInput plus the menu rules. The server checks the rules again, so a client cannot skip them. */
  private checkWholeItem(body: unknown, now: number): { line: CartLine } | { errorReply: ServerReply } {
    const checked = this.checkItemInput(body)
    if ('error' in checked) return { errorReply: { status: 400, body: { error: checked.error, serverTime: now } } }
    const violations = validate(checked.line.options, this.options.menu.groups, this.options.menu.rules)
    if (violations.length > 0) {
      return { errorReply: { status: 422, body: { error: 'invalid_config', violations, serverTime: now } } }
    }
    return { line: checked.line }
  }

  /**
   * Checks the stock and works out the ingredients an item will hold.
   * All or nothing: the ingredients are collected on a scratch copy and only saved by the caller,
   * so a crash half-way leaves nothing reserved.
   */
  private reserveIngredients(
    data: ServerData,
    line: CartLine,
    now: number,
    ignoreItemId?: string,
  ): { ingredients: IngredientAmounts } | { errorReply: ServerReply } {
    const needed = ingredientsNeeded(line.options, line.qty, this.options.menu.groups)
    const left = stockLeft(this.options.menu.stock, this.stockInUse(data, ignoreItemId))
    const missing = missingIngredients(needed, left)
    if (missing.length > 0) {
      return {
        errorReply: {
          status: 409,
          body: {
            error: 'out_of_stock',
            missingIngredients: missing,
            message: formatMissingIngredients(missing),
            serverTime: now,
          },
        },
      }
    }

    let ingredientsToReserve: IngredientAmounts = {}
    for (const [ingredient, amount] of Object.entries(needed)) {
      ingredientsToReserve = addIngredients(ingredientsToReserve, { [ingredient]: amount })
      if (this.options.shouldCrashDuringReserve?.()) throw new SimulatedCrash()
    }
    return { ingredients: ingredientsToReserve }
  }

  private createOrderRecord(
    id: string,
    createdAt: string,
    paymentMethod: PaymentMethod,
    cartLines: CartLine[],
    price: CartPrice,
  ): StoredOrder {
    return {
      id,
      createdAt,
      paymentMethod,
      currency: 'BDT',
      moneyUnit: 'poisha',
      coupon: { code: price.coupon.code, applied: price.coupon.applied, reason: price.coupon.reason },
      lines: cartLines.map((line, index) => ({
        qty: line.qty,
        options: line.options,
        unitPrice: price.lines[index].unitPrice,
        lineTotal: price.lines[index].lineTotal,
      })),
      totals: {
        subtotal: price.subtotal,
        discount: {
          flatDiscount: price.flatDiscount,
          couponDiscount: price.couponDiscount,
          chosen: price.chosenDiscount,
          applied: price.discount,
        },
        vat: price.vat,
        payable: price.payable,
        payableBdt: price.payableBdt,
      },
    }
  }
}
