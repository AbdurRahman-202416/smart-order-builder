// Orders and payment methods.

import type { Poisha, SelectedOptions } from './menuTypes'
import type { CartPrice } from './priceTypes'

export type PaymentMethod = 'card' | 'bkash' | 'cash'

export const PAYMENT_METHODS: PaymentMethod[] = ['card', 'bkash', 'cash']

/** D6: the shape of a stored order. All money is integer poisha. */
export interface StoredOrder {
  id: string
  /** ISO 8601 with the shop's +06:00 offset. Created by the server. */
  createdAt: string
  paymentMethod: PaymentMethod
  currency: 'BDT'
  moneyUnit: 'poisha'
  /** What the customer typed, and whether it really changed the price. */
  coupon: { code: string | null; applied: boolean; reason: string | null }
  lines: { qty: number; options: SelectedOptions; unitPrice: Poisha; lineTotal: Poisha }[]
  totals: {
    subtotal: Poisha
    discount: { flatDiscount: Poisha; couponDiscount: Poisha; chosen: CartPrice['chosenDiscount']; applied: Poisha }
    vat: Poisha
    payable: Poisha
    payableBdt: number
  }
}

export interface SeedOrder {
  id: string
  createdAt: string
  paymentMethod: PaymentMethod
  couponCode: string | null
  lines: { qty: number; options: SelectedOptions }[]
}
