import { formatBdt } from '../logic/money'
import { ordersToJsonText, toTitleCase } from '../logic/formatText'
import type { StoredOrder } from '../types'

/** All orders (seed orders and new ones) with a button that downloads them as orders.json. */
export function OrdersList({ orders }: { orders: StoredOrder[] }) {
  function downloadOrdersFile() {
    const file = new Blob([ordersToJsonText(orders)], { type: 'application/json' })
    const fileUrl = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = fileUrl
    link.download = 'orders.json'
    link.click()
    URL.revokeObjectURL(fileUrl)
  }

  return (
    <section className="card" aria-labelledby="orders-title">
      <h2 id="orders-title">Orders ({orders.length})</h2>
      <button type="button" onClick={downloadOrdersFile}>
        Download Orders.json
      </button>
      <table className="orders">
        <thead>
          <tr>
            <th>ID</th>
            <th>Time</th>
            <th>Pay</th>
            <th>Coupon</th>
            <th>Payable</th>
          </tr>
        </thead>
        <tbody>
          {[...orders].reverse().map((order) => (
            <tr key={order.id}>
              <td>{order.id}</td>
              <td>{order.createdAt.slice(0, 16).replace('T', ' ')}</td>
              <td>{toTitleCase(order.paymentMethod)}</td>
              <td>{order.coupon.code ? (order.coupon.applied ? 'Applied' : 'Not Applied') : '-'}</td>
              <td>{formatBdt(order.totals.payable)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
