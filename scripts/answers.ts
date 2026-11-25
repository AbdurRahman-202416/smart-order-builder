/**
 * Prints the answers for ANSWERS.md. Run:  npm run answers
 * Everything is computed by the same engines the app uses.
 */
import { formatBdt } from '../src/logic/money'
import { priceCart, priceLine } from '../src/logic/pricing'
import { validate } from '../src/logic/validateRules'
import { MockServer } from '../src/mockServer/MockServer'
import { defaultMenu as menu } from '../src/mockServer/loadMenu'
import seed from '../src/mockServer/orders.seed.json'
import { bestSellingOptions, couponStats, optionSales, revenueByPaymentMethod, totalRevenue } from '../src/logic/salesStats'
import type { CartLine, Group, SeedOrder, SelectedOptions, StorageLike, StoredOrder } from '../src/types'

const showBdt = (p: number) => `${formatBdt(p)} BDT`
const at = (iso: string) => Date.parse(iso)
const h = (s: string) => console.log(`\n=== ${s} ===`)

function memory(): StorageLike {
  const m = new Map<string, string>()
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v) }
}
const freshServer = (seeded = false, t = at('2026-11-24T10:30:00+06:00')) => {
  const clock = { t }
  const server = new MockServer({
    menu,
    storage: memory(),
    clock: () => clock.t,
    seedOrders: seeded ? (seed.orders as SeedOrder[]) : [],
  })
  return { server, clock }
}

const C: SelectedOptions = { paratha: 1, fried: 2, tofu: 1, cheese: 2, beans: 1, mushroom: 1, chili: 1 }
const B: SelectedOptions = { croissant: 1, omelette: 2, fried: 2, sausage: 1, bacon: 1, hashbrown: 1, mushroom: 1, hollandaise: 1 }
const A: SelectedOptions = { toast: 1, scrambled: 2, sausage: 1, ketchup: 1 }

// Q1 ---------------------------------------------------------------
h('Q1 max units of item C from an empty cart')
{
  const { server } = freshServer()
  let count = 0
  let limit = ''
  for (let i = 0; i < 50; i++) {
    const r = server.addItem(`q1-${i}`, { qty: 1, options: C })
    if (r.status !== 201) {
      limit = (r.body as { message?: string }).message ?? ''
      break
    }
    count++
  }
  console.log(`Max C = ${count}. Stopped with: ${limit}`)
  console.log('Cheese stock is 4 and each C needs 2 cheese -> 2. (egg 10/2=5, tofu 5, paratha 10, beans 8, mushroom 6 are not the limit)')
}

// Q2 ---------------------------------------------------------------
h('Q2 cheapest valid configuration')
{
  // all vectors of option quantities for one group that respect min/max/step/maxPerOption/maxDistinct
  const groupChoices = (g: Group): SelectedOptions[] => {
    const out: SelectedOptions[] = []
    const walk = (i: number, left: number, cur: SelectedOptions) => {
      if (i === g.options.length) {
        const total = Object.values(cur).reduce((a, b) => a + b, 0)
        const distinct = Object.values(cur).filter((q) => q > 0).length
        if (total >= g.min && (!g.step || total % g.step === 0) && (g.maxDistinct === undefined || distinct <= g.maxDistinct)) {
          out.push({ ...cur })
        }
        return
      }
      const cap = Math.min(left, g.maxPerOption ?? left)
      for (let q = 0; q <= cap; q++) {
        walk(i + 1, left - q, q ? { ...cur, [g.options[i].id]: q } : cur)
      }
    }
    walk(0, g.max, {})
    return out
  }
  const per = menu.groups.map(groupChoices)
  let best: { options: SelectedOptions; unit: number } | null = null
  let checked = 0
  const combine = (i: number, cur: SelectedOptions) => {
    if (i === per.length) {
      checked++
      if (validate(cur, menu.groups, menu.rules).length) return
      const unit = priceLine({ qty: 1, options: cur }, menu, menu.promos).unitPrice
      if (!best || unit < best.unit) best = { options: cur, unit }
      return
    }
    for (const choice of per[i]) combine(i + 1, { ...cur, ...choice })
  }
  combine(0, {})
  const b = best as unknown as { options: SelectedOptions; unit: number }
  console.log(`Checked ${checked} combinations. Cheapest valid: ${JSON.stringify(b.options)}`)
  console.log(`Unit price = ${showBdt(b.unit)}  (base 250.00 + Toast 0 + Fried x2 60.00 + Tofu 50.00)`)
}

// Q3 ---------------------------------------------------------------
h('Q3 cart = A x3 (coupon MORNING15 typed), at 10:30 and 11:30')
for (const time of ['10:30', '11:30']) {
  const p = priceCart({ lines: [{ qty: 3, options: A }], couponCode: 'MORNING15' }, menu, menu.promos, at(`2026-11-24T${time}:00+06:00`))
  console.log(`${time}: unit ${showBdt(p.lines[0].unitPrice)} x3, subtotal ${showBdt(p.subtotal)}, C1 ${showBdt(p.flatDiscount)}, C2 ${showBdt(p.couponDiscount)}, chosen ${p.chosenDiscount ?? 'none'} (${showBdt(p.discount)})`)
  console.log(`      discounted ${showBdt(p.discountedSubtotal)}, VAT ${showBdt(p.vat)}, total ${showBdt(p.totalBeforeRounding)}, payable ${p.payableBdt} BDT`)
}

// Q4 ---------------------------------------------------------------
h('Q4 after TC-10, payable at 11:30')
{
  const edited: SelectedOptions = { ...B, omelette: 1, fried: 3 }
  const lines: CartLine[] = [{ qty: 1, options: edited }, { qty: 2, options: C }]
  const p = priceCart({ lines, couponCode: null }, menu, menu.promos, at('2026-11-24T11:30:00+06:00'))
  console.log(`B' unit ${showBdt(p.lines[0].unitPrice)}, C x2 ${showBdt(p.lines[1].lineTotal)}, subtotal ${showBdt(p.subtotal)}`)
  console.log(`C1 ${showBdt(p.flatDiscount)} chosen, discounted ${showBdt(p.discountedSubtotal)}, VAT ${showBdt(p.vat)}, total ${showBdt(p.totalBeforeRounding)}, payable ${p.payableBdt} BDT`)
}

// Q5-Q8 ------------------------------------------------------------
const { server } = freshServer(true)
const orders = (server.getOrders().body as { orders: StoredOrder[] }).orders

h('Q5 seed orders priced at their createdAt')
for (const o of orders) {
  console.log(`${o.id} ${o.createdAt} ${o.paymentMethod.padEnd(5)} subtotal ${showBdt(o.totals.subtotal).padStart(13)}  discount ${(o.totals.discount.chosen ?? '-').padEnd(2)} ${showBdt(o.totals.discount.applied).padStart(11)}  VAT ${showBdt(o.totals.vat).padStart(9)}  payable ${String(o.totals.payableBdt).padStart(5)} BDT`)
}
console.log(`Total revenue of all ${orders.length} orders: ${showBdt(totalRevenue(orders))}`)

h('Q6 best-selling option (units = line qty x option qty)')
console.log(optionSales(orders, menu).map((o) => `${o.name}: ${o.units}`).join(', '))
console.log('Best:', bestSellingOptions(orders, menu).map((o) => `${o.name} (${o.units} units)`).join(', '))

h('Q7 revenue by payment method')
const rev = revenueByPaymentMethod(orders)
for (const [k, v] of Object.entries(rev)) console.log(`${k}: ${showBdt(v)}`)
console.log('Most:', Object.entries(rev).sort((a, b) => b[1] - a[1])[0][0])

h('Q8 MORNING15 discounts')
const cs = couponStats(orders)
console.log(`Orders that actually received MORNING15: ${cs.applied}`, orders.filter((o) => o.coupon.applied).map((o) => o.id))
for (const e of cs.enteredNotApplied) console.log(`Typed but NOT applied: ${e.orderId}: ${e.reason}`)

