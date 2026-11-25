import { describe, expect, it } from 'vitest'
import { bestSellingOptions, couponStats, averageOrderValue, countOrders, ordersOnDate, revenueByPaymentMethod, totalRevenue, optionSales } from '../logic/salesStats'
import { ordersToJsonText } from '../logic/formatText'
import { body, makeServer, menu } from './helpers'
import type { StoredOrder } from '../types'

const seeded = () => body<{ orders: StoredOrder[] }>(makeServer().server.getOrders()).orders

describe('seed orders (priced with our engine at their createdAt)', () => {
  it('Q5 payable of each order and the total revenue', () => {
    const orders = seeded()
    expect(orders.map((o) => o.totals.payableBdt)).toEqual([339, 713, 1271, 578, 866, 1228])
    expect(totalRevenue(orders)).toBe(499500)
  })

  it('Q6 best-selling option by units is Fried (10)', () => {
    const best = bestSellingOptions(seeded(), menu)
    expect(best).toEqual([{ optionId: 'fried', name: 'Fried', units: 10 }])
    expect(optionSales(seeded(), menu).find((o) => o.optionId === 'sausage')?.units).toBe(8)
  })

  it('Q7 card brought the most revenue', () => {
    expect(revenueByPaymentMethod(seeded())).toEqual({ card: 214500, bkash: 157900, cash: 127100 })
  })

  it('Q8 3 orders got MORNING15; ORD-1006 typed it after 11:00', () => {
    const s = couponStats(seeded())
    expect(s.applied).toBe(3)
    expect(s.enteredNotApplied).toHaveLength(1)
    expect(s.enteredNotApplied[0]).toMatchObject({ orderId: 'ORD-1006' })
    expect(s.enteredNotApplied[0].reason).toMatch(/before 11:00/)
  })

  it('counts, averages and date filters use the Dhaka calendar day', () => {
    const orders = seeded()
    expect(countOrders(orders)).toBe(6)
    expect(countOrders(orders, { date: '2026-11-20' })).toBe(2)
    expect(averageOrderValue(orders)).toBe(83250) // 4,995 / 6 = 832.50
    expect(averageOrderValue([], {})).toBeNull()
    expect(ordersOnDate(orders, '2026-11-22').map((o) => o.id)).toEqual(['ORD-1005', 'ORD-1006'])
    expect(ordersOnDate(orders, '2026-12-01')).toEqual([])
  })

  it('the exported file is valid JSON in the documented shape', () => {
    const text = ordersToJsonText(seeded())
    const parsed = JSON.parse(text)
    expect(parsed).toMatchObject({ schemaVersion: 1, currency: 'BDT', moneyUnit: 'poisha' })
    expect(parsed.orders).toHaveLength(6)
    expect(parsed.orders[0].totals.payable).toBe(33900)
  })
})
