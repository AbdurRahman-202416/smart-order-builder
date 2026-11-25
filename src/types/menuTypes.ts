// Menu data: options, groups, rules, promotions and money.

export type Poisha = number

export type SelectedOptions = Record<string, number> // optionId -> how many units of that option

export type IngredientAmounts = Record<string, number> // ingredientId -> amount

export interface Option {
  id: string
  name: string
  price: Poisha
  /** Ingredients one unit of this option consumes. Missing = unlimited (no stock). */
  uses?: IngredientAmounts
}

export interface Group {
  id: string
  name: string
  min: number
  max: number
  /** The total units in the group must be a multiple of this. */
  step?: number
  maxDistinct?: number
  maxPerOption?: number
  options: Option[]
}

export type Rule =
  | { id: string; type: 'requires'; option: string; anyOf: string[] }
  | { id: string; type: 'excludes'; option: string; anyOf: string[] }
  | { id: string; type: 'overrideLimit'; when: string; group: string; max: number }

export interface Promotions {
  /** P2: for every `every` units of the group, the cheapest unit is free. */
  freeCheapest: { id: string; group: string; every: number }
  /** P1: percent off per unit when every requirement is met (units counted per group). */
  combo: { id: string; percent: number; requires: { group: string; minUnits: number }[] }
  cartDiscountRules: {
    /** C1: automatic fixed discount. */
    flatDiscount: { id: string; minSubtotal: Poisha; amount: Poisha }
    /** C2: coupon, percent of subtotal with a cap, only before a local time of day. */
    couponDiscount: {
      id: string
      code: string
      percent: number
      cap: Poisha
      beforeHour: number
      beforeMinute: number
      /** Minutes east of UTC for the shop clock (Dhaka = 360). */
      utcOffsetMinutes: number
    }
  }
  vatPercent: number
}

export interface Product {
  id: string
  name: string
  basePrice: Poisha
}

export interface Menu {
  product: Product
  /** The most units one cart item can have (the brief says 3). */
  maxItemQty: number
  groups: Group[]
  rules: Rule[]
  /** Total stock per ingredient. Ingredients not listed are unlimited. */
  stock: IngredientAmounts
  promos: Promotions
}

/** The rule that changes a group's max when an option is selected. */
export type OverrideRule = Extract<Rule, { type: 'overrideLimit' }>
