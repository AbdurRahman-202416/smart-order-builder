// Prices and discounts.

import type { Menu, Poisha } from './menuTypes'

export type PriceMenu = Pick<Menu, 'product' | 'groups'>

export interface LinePrice {
  /** Step 1: base + sum(option price * option qty). */
  unitSubtotal: Poisha
  /** Step 2: value of the free cheapest extras (P2). */
  freeExtrasDiscount: Poisha
  /** Step 3: P1 combo discount, taken from the step-2 amount. */
  comboDiscount: Poisha
  /** Unit price after steps 2 and 3. */
  unitPrice: Poisha
  qty: number
  /** Step 4: unitPrice * qty. */
  lineTotal: Poisha
}

export interface CouponResult {
  code: string | null
  entered: boolean
  applied: boolean
  reason: string | null
}

export interface CartPrice {
  lines: LinePrice[]
  subtotal: Poisha
  /** The two candidate cart discounts (0 when not eligible). */
  flatDiscount: Poisha
  couponDiscount: Poisha
  chosenDiscount: 'C1' | 'C2' | null
  discount: Poisha
  coupon: CouponResult
  discountedSubtotal: Poisha
  vat: Poisha
  /** The VAT percent used, so the screen never hardcodes it. */
  vatPercent: number
  /** discountedSubtotal + vat, in poisha, not yet rounded. */
  totalBeforeRounding: Poisha
  /** Final amount, rounded half-up to whole BDT, expressed in poisha (always a multiple of 100). */
  payable: Poisha
  payableBdt: number
}

export interface LivePrice {
  status: 'idle' | 'loading' | 'ok' | 'error'
  /** The last price received. It can be old while a new one is loading. */
  price: CartPrice | null
  error: string | null
}
