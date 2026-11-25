// Cart items and the plate being built.

import type { IngredientAmounts, SelectedOptions } from './menuTypes'

export interface CartLine {
  qty: number
  options: SelectedOptions
}

export interface CartItem {
  id: string
  qty: number
  options: SelectedOptions
  /** Ingredients this item holds while it is active. */
  ingredientsHeld: IngredientAmounts
  status: 'active' | 'expired'
  /** Server-clock milliseconds. */
  createdAt: number
  expiresAt: number
}

/** What the server says about the cart: items, sold stock and total stock. */
export interface CartState {
  serverTime: number
  items: CartItem[]
  soldStock: IngredientAmounts
  stockTotal: IngredientAmounts
}

export interface CartToPrice {
  lines: CartLine[]
  /** The coupon text the customer typed. Empty or null means no coupon. */
  couponCode?: string | null
}

/** The plate the user is building (not in the cart yet). */
export interface PlateDraft {
  options: SelectedOptions
  qty: number
  /** The cart item being edited, or null when this is a new plate. */
  editingItemId: string | null
}
