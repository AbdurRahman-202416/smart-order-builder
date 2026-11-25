// Sales statistics.

export interface DateFilter {
  /** "YYYY-MM-DD" in shop time. Omit to include every order. */
  date?: string
}

export interface OptionSales {
  optionId: string
  name: string
  units: number
}

export interface CouponStats {
  /** Orders where the coupon really reduced the price. */
  applied: number
  /** Orders where a code was typed but it did not apply, with the reason. */
  enteredNotApplied: { orderId: string; code: string | null; reason: string | null }[]
}
