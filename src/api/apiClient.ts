import type { ApiErrorBody, CartItem, CartLine, CartPrice, CartState, Menu, PaymentMethod, StoredOrder } from '../types'

/** An error reply from the server. The JSON body is kept so the screen can show the reason. */
export class ApiError extends Error {
  status: number
  body: ApiErrorBody
  constructor(status: number, body: ApiErrorBody) {
    super(body.message ?? body.error ?? `HTTP ${status}`)
    this.status = status
    this.body = body
  }
}

/**
 * The server clock runs ahead of the browser, so every countdown must use SERVER time.
 * We learn the difference from the `serverTime` in each reply, the way NTP does:
 * we assume the reply was made halfway through the round trip.
 */
export function computeClockOffset(serverTime: number, sentAt: number, receivedAt: number): number {
  return serverTime - (sentAt + receivedAt) / 2
}

export const serverClock = {
  /** Server time minus browser time, in ms. */
  offset: 0,
  /** The current server time in ms. */
  now: () => Date.now() + serverClock.offset,
}

async function sendRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  extra: { signal?: AbortSignal; idempotencyKey?: string } = {},
): Promise<T> {
  const sentAt = Date.now()
  const response = await fetch(path, {
    method,
    signal: extra.signal,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(extra.idempotencyKey ? { 'Idempotency-Key': extra.idempotencyKey } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const receivedAt = Date.now()
  const data = await response.json().catch(() => ({}))
  if (typeof data.serverTime === 'number') {
    serverClock.offset = computeClockOffset(data.serverTime, sentAt, receivedAt)
  }
  if (!response.ok) throw new ApiError(response.status, data)
  return data as T
}

export const api = {
  getMenu: () => sendRequest<{ menu: Menu }>('GET', '/api/menu').then((reply) => reply.menu),
  getCartState: () => sendRequest<CartState>('GET', '/api/state'),
  getOrders: () => sendRequest<{ orders: StoredOrder[] }>('GET', '/api/orders').then((reply) => reply.orders),
  getPrice: (
    payload: { lines: CartLine[]; couponCode: string | null },
    signal?: AbortSignal,
  ): Promise<{ price: CartPrice; serverTime: number }> => sendRequest('POST', '/api/price', payload, { signal }),
  addItem: (item: CartLine & { replaces?: string }, idempotencyKey: string) =>
    sendRequest<{ item: CartItem }>('POST', '/api/cart/items', item, { idempotencyKey }),
  editItem: (itemId: string, item: CartLine) => sendRequest<{ item: CartItem }>('PUT', `/api/cart/items/${itemId}`, item),
  removeItem: (itemId: string) => sendRequest<{ ok: true }>('DELETE', `/api/cart/items/${itemId}`),
  checkout: (payload: { paymentMethod: PaymentMethod; couponCode: string | null }, idempotencyKey: string) =>
    sendRequest<{ order: StoredOrder }>('POST', '/api/checkout', payload, { idempotencyKey }),
}
