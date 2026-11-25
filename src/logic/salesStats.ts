import { dhakaDate } from './dhakaTime'
import type { CouponStats, DateFilter, Menu, OptionSales, PaymentMethod, Poisha, StoredOrder } from '../types'

/**
 * Sales statistics: pure functions over the stored orders JSON.
 * The assistant's tools call these; the AI model never does the arithmetic.
 */

const SHOP_UTC_OFFSET = 360 // Asia/Dhaka

export function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
}

export function filterByDate(orders: StoredOrder[], { date }: DateFilter = {}): StoredOrder[] {
  if (!date) return orders
  return orders.filter((o) => dhakaDate(o.createdAt, SHOP_UTC_OFFSET) === date)
}

export function countOrders(orders: StoredOrder[], filter: DateFilter = {}): number {
  return filterByDate(orders, filter).length
}

/** Sum of the final payable amounts, in poisha. */
export function totalRevenue(orders: StoredOrder[], filter: DateFilter = {}): Poisha {
  return filterByDate(orders, filter).reduce((sum, o) => sum + o.totals.payable, 0)
}

/** Average payable per order in poisha (rounded half-up), or null when there are no orders. */
export function averageOrderValue(orders: StoredOrder[], filter: DateFilter = {}): Poisha | null {
  const list = filterByDate(orders, filter)
  if (list.length === 0) return null
  const total = list.reduce((sum, o) => sum + o.totals.payable, 0)
  return Math.floor((2 * total + list.length) / (2 * list.length))
}

/** Units sold per option = line quantity x option quantity, best first. */
export function optionSales(orders: StoredOrder[], menu: Menu): OptionSales[] {
  const names = new Map(menu.groups.flatMap((g) => g.options).map((o) => [o.id, o.name]))
  const units = new Map<string, number>()
  for (const order of orders) {
    for (const line of order.lines) {
      for (const [optionId, qty] of Object.entries(line.options)) {
        units.set(optionId, (units.get(optionId) ?? 0) + qty * line.qty)
      }
    }
  }
  return [...units.entries()]
    .map(([optionId, u]) => ({ optionId, name: names.get(optionId) ?? optionId, units: u }))
    .sort((a, b) => b.units - a.units || a.name.localeCompare(b.name))
}

/** Every option tied for first place (usually one). */
export function bestSellingOptions(orders: StoredOrder[], menu: Menu): OptionSales[] {
  const all = optionSales(orders, menu)
  if (all.length === 0) return []
  return all.filter((o) => o.units === all[0].units)
}

export function revenueByPaymentMethod(orders: StoredOrder[]): Record<PaymentMethod, Poisha> {
  const out: Record<PaymentMethod, Poisha> = { card: 0, bkash: 0, cash: 0 }
  for (const o of orders) out[o.paymentMethod] += o.totals.payable
  return out
}

export function couponStats(orders: StoredOrder[]): CouponStats {
  return {
    applied: orders.filter((o) => o.coupon.applied).length,
    enteredNotApplied: orders
      .filter((o) => o.coupon.code && !o.coupon.applied)
      .map((o) => ({ orderId: o.id, code: o.coupon.code, reason: o.coupon.reason })),
  }
}

export function ordersOnDate(orders: StoredOrder[], date: string) {
  return filterByDate(orders, { date }).map((o) => ({
    id: o.id,
    createdAt: o.createdAt,
    paymentMethod: o.paymentMethod,
    payable: o.totals.payable,
  }))
}
