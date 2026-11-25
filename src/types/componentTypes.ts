// Props of the screen components.

import type { CartItem, CartState, PlateDraft } from './cartTypes'
import type { Menu } from './menuTypes'
import type { LivePrice } from './priceTypes'

export interface PlateBuilderProps {
  menu: Menu
  cartState: CartState
  draft: PlateDraft
  setDraft: (draft: PlateDraft) => void
  onCartChanged: () => Promise<void> | void
}

export interface CartPanelProps {
  menu: Menu
  cartState: CartState
  onEditItem: (item: CartItem) => void
  onCartChanged: () => Promise<void> | void
  onPaid: () => Promise<void> | void
}

export interface PriceTableProps {
  livePrice: LivePrice
  onRetry: () => void
}
