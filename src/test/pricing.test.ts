import { describe, expect, it } from 'vitest'
import { percentOfRounded, roundToWholeBdt } from '../logic/money'
import { priceCart, priceLine } from '../logic/pricing'
import { A, B, C, T_1059, T_1100, line, menu } from './helpers'

const price = (lines: ReturnType<typeof line>[], t: number, couponCode: string | null = 'MORNING15') =>
  priceCart({ lines, couponCode }, menu, menu.promos, t)

describe('money helpers', () => {
  it('rounds percentages half-up in integers', () => {
    expect(percentOfRounded(150950, 5)).toBe(7548) // 75.475 BDT -> 75.48
    expect(percentOfRounded(155950, 5)).toBe(7798) // 77.975 BDT -> 77.98
    expect(percentOfRounded(10, 5)).toBe(1) // 0.5 poisha rounds up
    expect(percentOfRounded(9, 5)).toBe(0) // 0.45 poisha rounds down
  })
  it('rounds the payable half-up to whole BDT', () => {
    expect(roundToWholeBdt(158498)).toBe(158500)
    expect(roundToWholeBdt(163748)).toBe(163700)
    expect(roundToWholeBdt(10050)).toBe(10100) // x.50 goes up
    expect(roundToWholeBdt(10049)).toBe(10000)
  })
})

describe('pricing', () => {
  it('TC-05 unit price of A, B, C', () => {
    expect(priceLine(line(A), menu, menu.promos).unitPrice).toBe(38000)
    expect(priceLine(line(B), menu, menu.promos).unitPrice).toBe(67950)
    expect(priceLine(line(C), menu, menu.promos).unitPrice).toBe(49000)
  })

  it('P2: 4 extras -> the cheapest one is free; P1 combo needs 4 eggs and 2 protein', () => {
    const c = priceLine(line(C), menu, menu.promos)
    expect(c.freeExtrasDiscount).toBe(2500) // Baked Beans
    expect(c.comboDiscount).toBe(0)
    const b = priceLine(line(B), menu, menu.promos)
    expect(b.comboDiscount).toBe(7550) // 10% of 755.00
  })

  it('TC-06 B x1 + C x2 at 10:59:59 -> C2 wins, VAT 75.48, payable 1,585', () => {
    const p = price([line(B), line(C, 2)], T_1059)
    expect(p.subtotal).toBe(165950)
    expect(p.flatDiscount).toBe(10000)
    expect(p.couponDiscount).toBe(15000) // 15% = 248.93 but capped at 150
    expect(p.chosenDiscount).toBe('C2')
    expect(p.vat).toBe(7548)
    expect(p.payable).toBe(158500)
    expect(p.payableBdt).toBe(1585)
    expect(p.coupon.applied).toBe(true)
  })

  it('TC-07 same cart at 11:00:00 -> coupon rejected, C1, VAT 77.98, payable 1,637', () => {
    const p = price([line(B), line(C, 2)], T_1100)
    expect(p.couponDiscount).toBe(0)
    expect(p.chosenDiscount).toBe('C1')
    expect(p.vat).toBe(7798)
    expect(p.payableBdt).toBe(1637)
    expect(p.coupon).toMatchObject({ entered: true, applied: false })
    expect(p.coupon.reason).toMatch(/before 11:00/)
  })

  it('without a coupon, C1 applies by itself', () => {
    expect(price([line(B), line(C, 2)], T_1059, null).chosenDiscount).toBe('C1')
  })

  it('no discount below 1,200 BDT', () => {
    const p = price([line(A)], T_1100, null)
    expect(p.chosenDiscount).toBeNull()
    expect(p.discount).toBe(0)
  })

  it('tie between C1 and C2 picks C1', () => {
    // find a subtotal where 15% == 100 BDT is impossible with the fixture, so use a custom promo
    const promos = structuredClone(menu.promos)
    promos.cartDiscountRules.flatDiscount.minSubtotal = 0
    promos.cartDiscountRules.flatDiscount.amount = 5700 // equals 15% of A (380.00 = 38000 -> 5700)
    const p = priceCart({ lines: [line(A)], couponCode: 'MORNING15' }, menu, promos, T_1059)
    expect(p.flatDiscount).toBe(p.couponDiscount)
    expect(p.chosenDiscount).toBe('C1')
    expect(p.coupon.applied).toBe(false)
  })

  it('coupon is case-insensitive and an unknown code is rejected', () => {
    expect(price([line(A)], T_1059, 'morning15').chosenDiscount).toBe('C2')
    const bad = price([line(A)], T_1059, 'SAVE50')
    expect(bad.coupon.applied).toBe(false)
    expect(bad.coupon.reason).toMatch(/not valid/)
  })

  it('is pure: same input, same output', () => {
    const a = price([line(B), line(C, 2)], T_1059)
    const b = price([line(B), line(C, 2)], T_1059)
    expect(a).toEqual(b)
  })
})
