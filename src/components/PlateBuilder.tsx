import { useRef, useState } from 'react'
import { ApiError, api } from '../api/apiClient'
import { emptyPlateDraft } from '../hooks/useSavedDraft'
import { useLivePrice } from '../hooks/useLivePrice'
import { formatMissingIngredients, howManyMoreCanBeAdded, ingredientsNeeded, missingIngredients, stockLeftFor } from '../logic/ingredientStock'
import { formatBdt } from '../logic/money'
import { validate } from '../logic/validateRules'
import { newIdempotencyKey, toTitleCase } from '../logic/formatText'
import { PriceTable } from './PriceTable'
import type { PlateBuilderProps } from '../types'

/** The left side of the screen: the user builds one plate and adds it to the cart. */
export function PlateBuilder({ menu, cartState, draft, setDraft, onCartChanged }: PlateBuilderProps) {
  const quantityChoices = Array.from({ length: menu.maxItemQty }, (_, index) => index + 1) // 1, 2, 3 ... from the menu data
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // A ref changes at once, so a fast double click cannot start two requests (state is too slow for that)
  const isRequestRunning = useRef(false)
  // Sending the same key again means "this is the same click", so the server will not add a second item
  const idempotencyKey = useRef<string | null>(null)

  const editingItem = cartState.items.find((item) => item.id === draft.editingItemId) ?? null
  const reservationExpired = editingItem?.status === 'expired'

  // While editing, the item's own old allocation counts as available to itself
  const stockAvailable = stockLeftFor(cartState, editingItem?.status === 'active' ? editingItem.id : null)
  const ruleViolations = validate(draft.options, menu.groups, menu.rules)
  const missing = missingIngredients(ingredientsNeeded(draft.options, draft.qty, menu.groups), stockAvailable)
  const hasSelection = Object.values(draft.options).some((qty) => qty > 0)

  const livePrice = useLivePrice(hasSelection ? [{ qty: draft.qty, options: draft.options }] : [], null)
  const canSave = hasSelection && ruleViolations.length === 0 && missing.length === 0 && !isSaving

  function changeOptionQty(optionId: string, change: number) {
    const options = { ...draft.options }
    const newQty = Math.max(0, (options[optionId] ?? 0) + change)
    if (newQty === 0) delete options[optionId]
    else options[optionId] = newQty
    setNotice(null)
    setDraft({ ...draft, options })
  }

  async function savePlate() {
    if (isRequestRunning.current || !canSave) return
    isRequestRunning.current = true
    setIsSaving(true)
    setNotice(null)
    idempotencyKey.current ??= newIdempotencyKey()
    const plate = { qty: draft.qty, options: draft.options }
    try {
      if (!editingItem) await api.addItem(plate, idempotencyKey.current)
      else if (reservationExpired) await api.addItem({ ...plate, replaces: editingItem.id }, idempotencyKey.current)
      else await api.editItem(editingItem.id, plate)
      idempotencyKey.current = null
      setDraft(emptyPlateDraft())
      await onCartChanged()
    } catch (error) {
      setNotice(toTitleCase(describeSaveError(error)))
      // A clear answer from the server means the next click is a new attempt
      if (error instanceof ApiError && error.status < 500) idempotencyKey.current = null
      await onCartChanged()
    } finally {
      isRequestRunning.current = false
      setIsSaving(false)
    }
  }

  const buttonText = isSaving ? 'Saving...' : reservationExpired ? 'Reserve Again' : editingItem ? 'Save Changes' : 'Add To Cart'

  return (
    <section className="card" aria-labelledby="builder-title">
      <h2 id="builder-title">{toTitleCase(menu.product.name)}</h2>
      <p className="muted">Base Price {formatBdt(menu.product.basePrice)} BDT</p>

      {editingItem && (
        <p className={reservationExpired ? 'banner warn' : 'banner'} role="status">
          {reservationExpired
            ? 'This Reservation Expired While You Were Editing. Its Stock Was Released. Your Changes Are Kept: Reserve Again To Book It.'
            : `Editing ${toTitleCase(editingItem.id.replace('item-', 'item '))}.`}{' '}
          <button type="button" onClick={() => setDraft(emptyPlateDraft())}>
            {reservationExpired ? 'Discard' : 'Cancel Edit'}
          </button>
        </p>
      )}

      <label className="row">
        Quantity
        <select value={draft.qty} onChange={(e) => setDraft({ ...draft, qty: Number(e.target.value) })} aria-label="Quantity">
          {quantityChoices.map((qty) => (
            <option key={qty} value={qty}>
              {qty}
            </option>
          ))}
        </select>
      </label>

      {menu.groups.map((group) => (
        <fieldset key={group.id}>
          <legend>
            {toTitleCase(group.name)}{' '}
            <span className="muted">
              (Min {group.min}, Max {group.max}
              {group.step ? `, Steps Of ${group.step}` : ''})
            </span>
          </legend>
          {group.options.map((option) => {
            const optionQty = draft.options[option.id] ?? 0
            const canAddMore = howManyMoreCanBeAdded(option.id, draft.options, draft.qty, stockAvailable, menu.groups)
            return (
              <div className="option" key={option.id}>
                <span className="name">
                  {toTitleCase(option.name)} <span className="muted">+{formatBdt(option.price)}</span>
                </span>
                <span className="muted" data-testid={`more-${option.id}`}>
                  {canAddMore === null ? 'No Stock Limit' : `Can Add ${canAddMore} More`}
                </span>
                <button
                  type="button"
                  aria-label={`Remove One ${option.name}`}
                  disabled={optionQty === 0}
                  onClick={() => changeOptionQty(option.id, -1)}
                >
                  -
                </button>
                <output aria-label={`${option.name} Quantity`}>{optionQty}</output>
                <button
                  type="button"
                  aria-label={`Add One ${option.name}`}
                  disabled={canAddMore === 0}
                  onClick={() => changeOptionQty(option.id, 1)}
                >
                  +
                </button>
              </div>
            )
          })}
        </fieldset>
      ))}

      {ruleViolations.length > 0 && hasSelection && (
        <ul className="errors" aria-label="Rule Violations">
          {ruleViolations.map((violation) => (
            <li key={violation.id}>{toTitleCase(violation.message)}</li>
          ))}
        </ul>
      )}
      {missing.length > 0 && (
        <p className="error" role="alert">
          {toTitleCase(formatMissingIngredients(missing))}
        </p>
      )}
      {notice && (
        <p className="banner warn" role="alert">
          {notice}
        </p>
      )}

      {hasSelection && (
        <>
          <h3>Price</h3>
          <PriceTable livePrice={livePrice} onRetry={livePrice.retry} />
        </>
      )}

      <div className="actions">
        <button type="button" className="primary" disabled={!canSave} onClick={savePlate}>
          {buttonText}
        </button>
        <button
          type="button"
          onClick={() => {
            setNotice(null)
            setDraft(emptyPlateDraft())
          }}
        >
          Reset
        </button>
      </div>
    </section>
  )
}

/** Turns a failed save into a sentence the user can act on. */
function describeSaveError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Could not reach the server. Your selection is kept. Press the button to retry.'
  if (error.body.error === 'out_of_stock') return `Not saved. ${error.body.message ?? ''} Your changes are still here.`
  if (error.body.error === 'reservation_expired') return 'Your reservation expired. Your changes are kept: press "Reserve Again" to book it as new.'
  if (error.body.error === 'invalid_config') return `Not saved: ${error.body.violations?.map((v) => v.message).join(' ')}`
  return 'The server failed before it saved anything, so nothing is held. Your selection is kept. Press the button to retry.'
}
