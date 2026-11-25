import { HttpResponse, delay, http } from 'msw'
import type { MockServer } from './MockServer'
import type { MockControls, ServerReply } from '../types'

export const defaultMockControls = (): MockControls => ({
  priceFailureRate: 0.15,
  priceLatency: [200, 1500],
  latency: [80, 250],
  crashNextReserve: false,
})

const randomBetween = ([min, max]: [number, number]) => Math.round(min + Math.random() * (max - min))
const toHttpResponse = (reply: ServerReply) => HttpResponse.json(reply.body as never, { status: reply.status })
const readJsonBody = async (request: Request) => (await request.json().catch(() => ({}))) as Record<string, never>

export function createApiRoutes(server: MockServer, controls: MockControls) {
  const waitSimulatedDelay = () => delay(randomBetween(controls.latency))

  return [
    http.get('/api/menu', async () => {
      await waitSimulatedDelay()
      return toHttpResponse(server.getMenu())
    }),
    http.get('/api/state', async () => {
      await waitSimulatedDelay()
      return toHttpResponse(server.getCartState())
    }),
    http.get('/api/orders', async () => {
      await waitSimulatedDelay()
      return toHttpResponse(server.getOrders())
    }),

    // Async price preview: waitSimulatedDelay and flaky on purpose. The client must cope.
    http.post('/api/price', async ({ request }) => {
      await delay(randomBetween(controls.priceLatency))
      if (Math.random() < controls.priceFailureRate) {
        return HttpResponse.json({ error: 'price_service_unavailable' }, { status: 500 })
      }
      return toHttpResponse(server.previewPrice(await readJsonBody(request)))
    }),

    http.post('/api/cart/items', async ({ request }) => {
      await waitSimulatedDelay()
      return toHttpResponse(server.addItem(request.headers.get('Idempotency-Key'), await readJsonBody(request)))
    }),
    http.put('/api/cart/items/:id', async ({ request, params }) => {
      await waitSimulatedDelay()
      return toHttpResponse(server.editItem(String(params.id), await readJsonBody(request)))
    }),
    http.delete('/api/cart/items/:id', async ({ params }) => {
      await waitSimulatedDelay()
      return toHttpResponse(server.removeItem(String(params.id)))
    }),
    http.post('/api/checkout', async ({ request }) => {
      await waitSimulatedDelay()
      return toHttpResponse(server.checkout(request.headers.get('Idempotency-Key'), await readJsonBody(request)))
    }),
  ]
}
