import { formatBdt } from '../logic/money'
import { toTitleCase } from '../logic/formatText'
import type { CartPrice, PriceTableProps } from '../types'

/** Shows the full price: subtotal, both discounts, the discount used, VAT and the payable amount. */
export function PriceTable({ livePrice, onRetry }: PriceTableProps) {
  const { price, status, error } = livePrice
  return (
    <div className="price" aria-live="polite">
      {status === 'loading' && <p className="muted">Calculating Price...</p>}
      {status === 'error' && (
        <p className="error" role="alert">
          {toTitleCase(`Could not get the price (${error}). Your selection is kept.`)}{' '}
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </p>
      )}
      {price && <PriceRows price={price} isOld={status !== 'ok'} />}
    </div>
  )
}

function PriceRows({ price, isOld }: { price: CartPrice; isOld: boolean }) {
  const { coupon } = price
  return (
    <table className={isOld ? 'price-table old' : 'price-table'}>
      <tbody>
        {price.lines.length > 1 &&
          price.lines.map((line, index) => (
            <tr key={index} className="muted">
              <td>
                Item {index + 1}: {formatBdt(line.unitPrice)} x {line.qty}
              </td>
              <td>{formatBdt(line.lineTotal)}</td>
            </tr>
          ))}
        <tr>
          <td>Subtotal</td>
          <td>{formatBdt(price.subtotal)}</td>
        </tr>
        <tr className={price.chosenDiscount === 'C1' ? 'used' : 'muted'}>
          <td>Flat Discount (C1)</td>
          <td>-{formatBdt(price.flatDiscount)}</td>
        </tr>
        {coupon.entered && (
          <tr className={price.chosenDiscount === 'C2' ? 'used' : 'muted'}>
            <td>Coupon Discount (C2) {coupon.code}</td>
            <td>-{formatBdt(price.couponDiscount)}</td>
          </tr>
        )}
        <tr>
          <td>Discount Used {price.chosenDiscount ? `(${price.chosenDiscount})` : ''}</td>
          <td>-{formatBdt(price.discount)}</td>
        </tr>
        {coupon.entered && !coupon.applied && coupon.reason && (
          <tr>
            <td colSpan={2} className="error">
              {toTitleCase(coupon.reason)}
            </td>
          </tr>
        )}
        <tr>
          <td>VAT {price.vatPercent}%</td>
          <td>{formatBdt(price.vat)}</td>
        </tr>
        <tr className="total">
          <td>Payable (Whole BDT)</td>
          <td>{formatBdt(price.payable)}</td>
        </tr>
      </tbody>
    </table>
  )
}
