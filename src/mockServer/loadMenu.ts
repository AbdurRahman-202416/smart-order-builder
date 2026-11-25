import { bdtToPoisha } from '../logic/money'
import raw from './menu.json'
import type { Group, Menu } from '../types'

/**
 * The fixture file is written in BDT (readable). The engines work in integer poisha,
 * so every money field is converted once, here. To test another menu, replace
 * menu.fixture.json (same shape): no code change is needed.
 */
type RawMenu = typeof raw

export function loadMenu(source: RawMenu = raw): Menu {
  const { product, rules, stock, promos } = source
  // JSON can't express the optional/indexed fields of Group, so cast once here.
  const groups = source.groups as unknown as Group[]
  const flatDiscount = promos.cartDiscountRules.flatDiscount
  const couponDiscount = promos.cartDiscountRules.couponDiscount
  return {
    product: { ...product, basePrice: bdtToPoisha(product.basePrice) },
    maxItemQty: source.maxItemQty,
    groups: groups.map((g) => ({
      ...g,
      options: g.options.map((o) => ({ ...o, price: bdtToPoisha(o.price) })),
    })),
    rules: rules as Menu['rules'],
    stock,
    promos: {
      ...promos,
      cartDiscountRules: {
        flatDiscount: { ...flatDiscount, minSubtotal: bdtToPoisha(flatDiscount.minSubtotal), amount: bdtToPoisha(flatDiscount.amount) },
        couponDiscount: { ...couponDiscount, cap: bdtToPoisha(couponDiscount.cap) },
      },
    },
  }
}

export const defaultMenu: Menu = loadMenu()
