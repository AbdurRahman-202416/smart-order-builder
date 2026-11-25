import { dhakaTimeIsBefore } from './dhakaTime'
import { percentOfRounded, roundToWholeBdt } from './money'
import type { CartLine, CartPrice, CartToPrice, CouponResult, Group, LinePrice, Poisha, PriceMenu, Promotions } from '../types'

const countUnitsInGroup = (group: Group | undefined, options: CartLine['options']) =>
  group ? group.options.reduce((sum, option) => sum + (options[option.id] ?? 0), 0) : 0

/** Steps 1 to 4 of the brief, for one cart line. */
export function priceLine(line: CartLine, menu: PriceMenu, promos: Promotions): LinePrice {
  const allOptions = menu.groups.flatMap((group) => group.options)

  // Step 1: unit subtotal = base price + sum(option price x option quantity)
  const unitSubtotal = allOptions.reduce(
    (sum, option) => sum + option.price * (line.options[option.id] ?? 0),
    menu.product.basePrice,
  )

  // Step 2 (P2): for every 3 extra units, the cheapest extra unit is free
  const extrasGroup = menu.groups.find((group) => group.id === promos.freeCheapest.group)
  const extraUnitPrices: Poisha[] = []
  for (const option of extrasGroup?.options ?? []) {
    for (let i = 0; i < (line.options[option.id] ?? 0); i++) extraUnitPrices.push(option.price)
  }
  extraUnitPrices.sort((a, b) => a - b)
  const freeUnitCount = Math.floor(extraUnitPrices.length / promos.freeCheapest.every)
  const freeExtrasDiscount = extraUnitPrices.slice(0, freeUnitCount).reduce((a, b) => a + b, 0)
  const priceAfterFreeExtras = unitSubtotal - freeExtrasDiscount

  // Step 3 (P1): combo discount when every requirement is met, taken from the step 2 amount
  const comboApplies = promos.combo.requires.every((requirement) => {
    const group = menu.groups.find((g) => g.id === requirement.group)
    return countUnitsInGroup(group, line.options) >= requirement.minUnits
  })
  const comboDiscount = comboApplies ? percentOfRounded(priceAfterFreeExtras, promos.combo.percent) : 0
  const unitPrice = priceAfterFreeExtras - comboDiscount

  // Step 4: line total
  return { unitSubtotal, freeExtrasDiscount, comboDiscount, unitPrice, qty: line.qty, lineTotal: unitPrice * line.qty }
}

/** Step 5: works out both cart discounts and keeps only the bigger one (a tie goes to C1). */
function chooseCartDiscount(subtotal: Poisha, typedCode: string, promos: Promotions, serverTime: number) {
  const { flatDiscount: flatRule, couponDiscount: couponRule } = promos.cartDiscountRules

  const flatDiscount = subtotal >= flatRule.minSubtotal ? flatRule.amount : 0

  let couponDiscount = 0
  let couponProblem: string | null = null
  if (typedCode) {
    const codeIsRight = typedCode.toUpperCase() === couponRule.code.toUpperCase()
    const stillValid = dhakaTimeIsBefore(serverTime, couponRule.beforeHour, couponRule.beforeMinute, couponRule.utcOffsetMinutes)
    if (!codeIsRight) {
      couponProblem = `Coupon "${typedCode}" is not valid.`
    } else if (!stillValid) {
      const cutoff = `${String(couponRule.beforeHour).padStart(2, '0')}:${String(couponRule.beforeMinute).padStart(2, '0')}`
      couponProblem = `${couponRule.code} only works before ${cutoff} (Dhaka time).`
    } else {
      couponDiscount = Math.min(percentOfRounded(subtotal, couponRule.percent), couponRule.cap)
    }
  }

  const discountUsed: CartPrice['chosenDiscount'] =
    couponDiscount > flatDiscount ? 'C2' : flatDiscount > 0 ? 'C1' : null
  const discount = discountUsed === 'C2' ? couponDiscount : discountUsed === 'C1' ? flatDiscount : 0

  if (typedCode && !couponProblem && discountUsed !== 'C2') {
    couponProblem = `${flatRule.id} gave a bigger or equal discount, so ${couponRule.code} was not used.`
  }
  const coupon: CouponResult = {
    code: typedCode || null,
    entered: typedCode !== '',
    applied: discountUsed === 'C2',
    reason: discountUsed === 'C2' ? null : couponProblem,
  }

  return { flatDiscount, couponDiscount, discountUsed, discount, coupon }
}

/**
 * Pure function, shared by the mock server and the tests.
 * `serverTime` (ms or ISO text) is the moment the price is worked out. It decides whether the
 * time-limited coupon still works.
 */
export function priceCart(
  cart: CartToPrice,
  menu: PriceMenu,
  promos: Promotions,
  serverTime: number | string,
): CartPrice {
  const serverTimeMs = typeof serverTime === 'number' ? serverTime : Date.parse(serverTime)

  const lines = cart.lines.map((line) => priceLine(line, menu, promos))
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)

  const typedCode = (cart.couponCode ?? '').trim()
  const { flatDiscount, couponDiscount, discountUsed, discount, coupon } = chooseCartDiscount(
    subtotal,
    typedCode,
    promos,
    serverTimeMs,
  )

  // Step 6: VAT on the discounted subtotal, then the final payable is rounded to whole BDT
  const discountedSubtotal = subtotal - discount
  const vat = percentOfRounded(discountedSubtotal, promos.vatPercent)
  const totalBeforeRounding = discountedSubtotal + vat
  const payable = roundToWholeBdt(totalBeforeRounding)

  return {
    lines,
    subtotal,
    flatDiscount,
    couponDiscount,
    chosenDiscount: discountUsed,
    discount,
    coupon,
    discountedSubtotal,
    vat,
    vatPercent: promos.vatPercent,
    totalBeforeRounding,
    payable,
    payableBdt: payable / 100,
  }
}
