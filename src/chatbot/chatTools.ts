import { formatBdt } from '../logic/money'
import {
  averageOrderValue,
  bestSellingOptions,
  countOrders,
  couponStats,
  isValidDate,
  ordersOnDate,
  revenueByPaymentMethod,
  totalRevenue,
} from '../logic/salesStats'
import type { Menu, StoredOrder, ToolDeclaration, ToolResult } from '../types'

/**
 * The tools the model may pick from. Each one is a thin wrapper over a pure stats
 * function. The model only chooses a tool and phrases the result.
 */

const dateProp = {
  date: { type: 'STRING' as const, description: 'Optional day in YYYY-MM-DD (Dhaka time). Omit for all orders.' },
}

export const toolDeclarations: ToolDeclaration[] = [
  {
    name: 'count_orders',
    description: 'How many orders were placed, optionally on one date.',
    parameters: { type: 'OBJECT', properties: dateProp },
  },
  {
    name: 'total_revenue',
    description: 'Total revenue (sum of payable amounts in BDT), optionally on one date.',
    parameters: { type: 'OBJECT', properties: dateProp },
  },
  {
    name: 'average_order_value',
    description: 'Average payable amount per order in BDT, optionally on one date.',
    parameters: { type: 'OBJECT', properties: dateProp },
  },
  {
    name: 'best_selling_option',
    description: 'The best-selling menu option by units sold (line quantity x option quantity).',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'revenue_by_payment_method',
    description: 'Revenue in BDT for each payment method (card, bkash, cash).',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'coupon_applied_count',
    description: 'How many orders actually got the coupon discount, and which orders typed it but did not get it.',
    parameters: { type: 'OBJECT', properties: {} },
  },
  {
    name: 'orders_on_date',
    description: 'List the orders placed on one date.',
    parameters: {
      type: 'OBJECT',
      properties: { date: { type: 'STRING', description: 'Day in YYYY-MM-DD (Dhaka time).' } },
      required: ['date'],
    },
  },
  {
    name: 'describe_available_data',
    description:
      'Describe which fields the order data has. Call this when the question asks for something the other tools cannot answer (for example customers).',
    parameters: { type: 'OBJECT', properties: {} },
  },
]

const showBdt = (poisha: number) => `${formatBdt(poisha)} BDT`

function readDateArgument(args: Record<string, unknown>): { date?: string } | { error: string } {
  const date = args.date
  if (date === undefined || date === null || date === '') return {}
  if (typeof date !== 'string' || !isValidDate(date)) return { error: `"${String(date)}" is not a valid date. Use YYYY-MM-DD.` }
  return { date }
}

/** Runs one tool. Unknown tools and bad arguments return an `error` the model must repeat, not hide. */
export function runTool(name: string, args: Record<string, unknown>, orders: StoredOrder[], menu: Menu): ToolResult {
  switch (name) {
    case 'count_orders': {
      const filter = readDateArgument(args)
      if ('error' in filter) return filter
      return { ...filter, orderCount: countOrders(orders, filter) }
    }
    case 'total_revenue': {
      const filter = readDateArgument(args)
      if ('error' in filter) return filter
      return { ...filter, orderCount: countOrders(orders, filter), totalRevenue: showBdt(totalRevenue(orders, filter)) }
    }
    case 'average_order_value': {
      const filter = readDateArgument(args)
      if ('error' in filter) return filter
      const avg = averageOrderValue(orders, filter)
      return avg === null
        ? { ...filter, orderCount: 0, note: 'There are no orders, so there is no average.' }
        : { ...filter, orderCount: countOrders(orders, filter), averageOrderValue: showBdt(avg) }
    }
    case 'best_selling_option': {
      const best = bestSellingOptions(orders, menu)
      if (best.length === 0) return { note: 'There are no orders yet.' }
      return { bestSellers: best.map((b) => ({ option: b.name, unitsSold: b.units })), tied: best.length > 1 }
    }
    case 'revenue_by_payment_method': {
      const r = revenueByPaymentMethod(orders)
      return { card: showBdt(r.card), bkash: showBdt(r.bkash), cash: showBdt(r.cash) }
    }
    case 'coupon_applied_count': {
      const s = couponStats(orders)
      return {
        ordersWithCouponDiscount: s.applied,
        couponTypedButNotApplied: s.enteredNotApplied.map((e) => ({ order: e.orderId, why: e.reason })),
      }
    }
    case 'orders_on_date': {
      const filter = readDateArgument(args)
      if ('error' in filter || !filter.date) return { error: 'A date in YYYY-MM-DD is required.' }
      const list = ordersOnDate(orders, filter.date)
      return {
        date: filter.date,
        orderCount: list.length,
        orders: list.map((o) => ({ id: o.id, time: o.createdAt, paymentMethod: o.paymentMethod, payable: showBdt(o.payable) })),
      }
    }
    case 'describe_available_data':
      return {
        availableFields: [
          'order id',
          'order time',
          'payment method (card, bkash, cash)',
          'items bought and their quantities',
          'coupon typed and whether it was applied',
          'prices, discount, VAT and payable amount',
        ],
        notAvailable: ['customer name or identity', 'customer contact', 'delivery address'],
      }
    default:
      return { error: `Unknown tool "${name}".` }
  }
}
