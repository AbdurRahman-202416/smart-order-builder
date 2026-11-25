import { useEffect, useRef, useState } from 'react'
import { ApiError, api } from '../api/apiClient'
import { useLivePrice } from '../hooks/useLivePrice'
import { useServerNow } from '../hooks/useServerNow'
import { formatBdt } from '../logic/money'
import { formatMinutesSeconds, listSelectedOptions, newIdempotencyKey, toTitleCase } from '../logic/formatText'
import { PriceTable } from './PriceTable'
import { PAYMENT_METHODS } from '../types'
import type { CartItem, CartPanelProps, PaymentMethod } from '../types'

/** "item-3" becomes "Item 3" */
const itemLabel = (item: CartItem) => toTitleCase(item.id.replace('item-', 'item '))

/** The cart: items with countdowns, the coupon box, the price and the Pay button. */
export function CartPanel({ menu, cartState, onEditItem, onCartChanged, onPaid }: CartPanelProps) {
  const quantityChoices = Array.from({ length: menu.maxItemQty }, (_, index) => index + 1) // 1, 2, 3 ... from the menu data
  const serverNow = useServerNow() // SERVER time, never Date.now()
  const [couponText, setCouponText] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card')
  const [isPaying, setIsPaying] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [itemErrors, setItemErrors] = useState<Record<string, string>>({})
  const isPaymentRunning = useRef(false) // a ref changes at once, so a fast double click cannot pay twice
  const paymentKey = useRef<string | null>(null) // the same key again means "the same click"

  const activeItems = cartState.items.filter((item) => item.status === 'active')
  const livePrice = useLivePrice(
    activeItems.map((item) => ({ qty: item.qty, options: item.options })),
    couponText.trim() || null,
  )

  // When a countdown reaches 0, ask the server: it decides what has really expired
  const anyItemExpiredHere = activeItems.some((item) => serverNow >= item.expiresAt)
  useEffect(() => {
    if (anyItemExpiredHere) void onCartChanged()
  }, [anyItemExpiredHere, onCartChanged])

  async function changeItemQty(item: CartItem, qty: number) {
    setItemErrors((errors) => ({ ...errors, [item.id]: '' }))
    try {
      await api.editItem(item.id, { qty, options: item.options })
    } catch (error) {
      const reason = error instanceof ApiError ? (error.body.message ?? error.message) : 'Could not reach the server.'
      setItemErrors((errors) => ({ ...errors, [item.id]: toTitleCase(`Not changed. ${reason}`) }))
    }
    await onCartChanged()
  }

  async function removeItem(item: CartItem) {
    try {
      await api.removeItem(item.id)
    } catch {
      /* the item is already gone: refreshing below shows the truth */
    }
    await onCartChanged()
  }

  async function pay() {
    if (isPaymentRunning.current || activeItems.length === 0) return
    isPaymentRunning.current = true
    setIsPaying(true)
    setMessage(null)
    paymentKey.current ??= newIdempotencyKey()
    try {
      const { order } = await api.checkout({ paymentMethod, couponCode: couponText.trim() || null }, paymentKey.current)
      paymentKey.current = null
      setCouponText('')
      setMessage(toTitleCase(`Order ${order.id} placed. Payable ${formatBdt(order.totals.payable)} BDT via ${order.paymentMethod}.`))
      await onPaid()
    } catch (error) {
      if (error instanceof ApiError && error.status < 500) paymentKey.current = null
      const cartWasEmpty = error instanceof ApiError && error.body.error === 'empty_cart'
      setMessage(cartWasEmpty ? 'Nothing To Pay: The Cart Is Empty.' : 'Payment Failed, Nothing Was Charged. Try Again.')
      await onCartChanged()
    } finally {
      isPaymentRunning.current = false
      setIsPaying(false)
    }
  }

  return (
    <section className="card" aria-labelledby="cart-title">
      <h2 id="cart-title">Cart</h2>
      {cartState.items.length === 0 && <p className="muted">Your Cart Is Empty.</p>}

      <ul className="cart">
        {cartState.items.map((item) => {
          const isExpired = item.status === 'expired'
          return (
            <li key={item.id} className={isExpired ? 'expired' : ''}>
              <div className="item-head">
                <strong>{itemLabel(item)}</strong>
                {isExpired ? (
                  <span className="badge warn">Expired, Read-Only</span>
                ) : (
                  <span className="badge" aria-label={`Time Left For ${itemLabel(item)}`}>
                    {formatMinutesSeconds(item.expiresAt - serverNow)}
                  </span>
                )}
              </div>
              <div>{listSelectedOptions(item.options, menu)}</div>
              <div className="row">
                <label>
                  Qty{' '}
                  <select
                    value={item.qty}
                    disabled={isExpired}
                    aria-label={`Quantity For ${itemLabel(item)}`}
                    onChange={(e) => void changeItemQty(item, Number(e.target.value))}
                  >
                    {quantityChoices.map((qty) => (
                      <option key={qty} value={qty}>
                        {qty}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={() => onEditItem(item)} disabled={isExpired}>
                  Edit
                </button>
                <button type="button" onClick={() => void removeItem(item)}>
                  Remove
                </button>
              </div>
              {itemErrors[item.id] && (
                <p className="error" role="alert">
                  {itemErrors[item.id]}
                </p>
              )}
            </li>
          )
        })}
      </ul>

      {activeItems.length > 0 && (
        <>
          <label className="row">
            Coupon
            <input value={couponText} onChange={(e) => setCouponText(e.target.value)} placeholder={menu.promos.cartDiscountRules.couponDiscount.code} aria-label="Coupon Code" />
          </label>
          <PriceTable livePrice={livePrice} onRetry={livePrice.retry} />
          <label className="row">
            Payment
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} aria-label="Payment Method">
              {PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {toTitleCase(method)}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      <button type="button" className="primary" disabled={activeItems.length === 0 || isPaying} onClick={() => void pay()}>
        {isPaying ? 'Paying...' : 'Pay'}
      </button>
      {message && (
        <p className="banner" role="status">
          {message}
        </p>
      )}
    </section>
  )
}
