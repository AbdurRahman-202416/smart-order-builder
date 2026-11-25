import type { CartState, Group, IngredientAmounts, MissingIngredient, SelectedOptions } from '../types'

/** Ingredients one cart item needs: (option quantity x option ingredients) x item quantity. */
export function ingredientsNeeded(options: SelectedOptions, itemQty: number, groups: Group[]): IngredientAmounts {
  const needed: IngredientAmounts = {}
  for (const group of groups) {
    for (const option of group.options) {
      const optionQty = options[option.id] ?? 0
      if (!optionQty || !option.uses) continue
      for (const [ingredient, perUnit] of Object.entries(option.uses)) {
        needed[ingredient] = (needed[ingredient] ?? 0) + perUnit * optionQty * itemQty
      }
    }
  }
  return needed
}

export function addIngredients(a: IngredientAmounts, b: IngredientAmounts): IngredientAmounts {
  const total: IngredientAmounts = { ...a }
  for (const [ingredient, amount] of Object.entries(b)) total[ingredient] = (total[ingredient] ?? 0) + amount
  return total
}

export function sumIngredients(list: IngredientAmounts[]): IngredientAmounts {
  return list.reduce(addIngredients, {})
}

/**
 * Stock left = total stock minus everything already taken (sold stock + other reservations).
 * An ingredient missing from `totalStock` is unlimited and never appears in the result.
 *
 * To EDIT an item, leave that item's own amounts out of `alreadyTaken`.
 * Its old allocation then counts as available to itself (the "net difference" rule).
 */
export function stockLeft(totalStock: IngredientAmounts, alreadyTaken: IngredientAmounts[]): IngredientAmounts {
  const taken = sumIngredients(alreadyTaken)
  const left: IngredientAmounts = {}
  for (const [ingredient, amount] of Object.entries(totalStock)) {
    left[ingredient] = amount - (taken[ingredient] ?? 0)
  }
  return left
}

/** Every ingredient that is short, with the exact missing amount. */
export function missingIngredients(needed: IngredientAmounts, left: IngredientAmounts): MissingIngredient[] {
  const result: MissingIngredient[] = []
  for (const [ingredient, amount] of Object.entries(needed)) {
    if (!(ingredient in left)) continue // unlimited ingredient
    const missing = amount - left[ingredient]
    if (missing > 0) result.push({ ingredient, missing })
  }
  return result
}

/** "Short: 2 egg, 2 cheese" */
export function formatMissingIngredients(list: MissingIngredient[]): string {
  return `Short: ${list.map((item) => `${item.missing} ${item.ingredient}`).join(', ')}`
}

/**
 * How many MORE units of one option can be added to the plate being built.
 * Returns null when the option has no stock limit (for example Ketchup).
 * The plate's own amounts are already taken out, and the item quantity multiplies the cost.
 */
export function howManyMoreCanBeAdded(
  optionId: string,
  plateOptions: SelectedOptions,
  itemQty: number,
  stockAvailable: IngredientAmounts,
  groups: Group[],
): number | null {
  const option = groups.flatMap((g) => g.options).find((o) => o.id === optionId)
  if (!option?.uses) return null
  const leftAfterPlate = stockLeft(stockAvailable, [ingredientsNeeded(plateOptions, itemQty, groups)])
  let fewest: number | null = null
  for (const [ingredient, perUnit] of Object.entries(option.uses)) {
    if (!(ingredient in leftAfterPlate)) continue // unlimited ingredient
    const canAdd = Math.max(0, Math.floor(leftAfterPlate[ingredient] / (perUnit * itemQty)))
    fewest = fewest === null ? canAdd : Math.min(fewest, canAdd)
  }
  return fewest
}

/**
 * The stock the user can still use, worked out from the server's cart state.
 * Pass the id of the item being edited: its own allocation is then NOT counted as taken,
 * so it counts as available to itself (the "net difference" rule).
 */
export function stockLeftFor(cartState: CartState, editingItemId?: string | null): IngredientAmounts {
  const otherActiveItems = cartState.items.filter((item) => item.status === 'active' && item.id !== editingItemId)
  return stockLeft(cartState.stockTotal, [cartState.soldStock, ...otherActiveItems.map((item) => item.ingredientsHeld)])
}
