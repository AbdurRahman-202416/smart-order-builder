import { describe, expect, it } from 'vitest'
import { AssistantError, CANNOT_ANSWER_MESSAGE, askSalesAssistant } from '../chatbot/askSalesAssistant'
import { runTool } from '../chatbot/chatTools'
import { bestSellingOptions } from '../logic/salesStats'
import { A, body, makeServer, menu } from './helpers'
import type { StoredOrder } from '../types'

/** Reply helpers that look like Gemini's REST answers. */
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status })
const callTool = (name: string, args: Record<string, unknown> = {}) =>
  json({ candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args } }] } }] })
const say = (text: string) => json({ candidates: [{ content: { role: 'model', parts: [{ text }] } }] })

/**
 * A fake Gemini. First turn: picks a tool for the question. Second turn (it sees the
 * functionResponse): phrases the tool result. No network and no real key are used.
 */
function fakeGemini(pick: (question: string) => { tool: string; args?: Record<string, unknown> } | null) {
  const calls: unknown[] = []
  const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
    const req = JSON.parse(String(init?.body))
    calls.push(req)
    const last = req.contents[req.contents.length - 1]
    const result = last.parts[0].functionResponse
    if (result) return say(`RESULT ${JSON.stringify(result.response)}`)
    const choice = pick(last.parts[0].text)
    return choice ? callTool(choice.tool, choice.args) : say('I do not know.')
  }) as typeof fetch
  return { fetchImpl, calls }
}

const ask = (question: string, over: Partial<Parameters<typeof askSalesAssistant>[0]> & { orders?: () => Promise<StoredOrder[]> }) =>
  askSalesAssistant({
    question,
    menu,
    apiKey: 'test-key',
    getOrders: over.orders ?? (async () => []),
    ...over,
  })

describe('sales assistant tools', () => {
  it('TC-18 "How many orders?" differs by exactly one after a checkout, with no reload', async () => {
    const { server } = makeServer()
    const getOrders = async () => body<{ orders: StoredOrder[] }>(server.getOrders()).orders
    const { fetchImpl } = fakeGemini(() => ({ tool: 'count_orders' }))

    const before = await ask('How many orders?', { getOrders, fetchImpl })
    server.addItem('k', { qty: 1, options: A })
    server.checkout('p', { paymentMethod: 'cash', couponCode: null })
    const after = await ask('How many orders?', { getOrders, fetchImpl })

    expect(before).toContain('"orderCount":6')
    expect(after).toContain('"orderCount":7')
  })

  it('TC-19 best-selling answer equals the stats function, even after the data changes', async () => {
    const { server } = makeServer()
    const getOrders = async () => body<{ orders: StoredOrder[] }>(server.getOrders()).orders
    const { fetchImpl } = fakeGemini(() => ({ tool: 'best_selling_option' }))

    expect(await ask('best seller?', { getOrders, fetchImpl })).toContain('"option":"Fried","unitsSold":10')

    // change the data: three Scrambled x2 lines in one order would not beat Fried, so buy a lot
    for (let i = 0; i < 3; i++) server.addItem(`k${i}`, { qty: 3, options: { toast: 1, scrambled: 2, sausage: 1 } })
    server.checkout('p', { paymentMethod: 'card', couponCode: null })
    const orders = await getOrders()
    const best = bestSellingOptions(orders, menu)[0]
    expect(await ask('best seller?', { getOrders, fetchImpl })).toContain(`"option":"${best.name}","unitsSold":${best.units}`)
    expect(best.name).toBe('Scrambled')
  })

  it('TC-20 "Who is our best customer?" is answered with "cannot know", never a name', async () => {
    const { fetchImpl, calls } = fakeGemini(() => ({ tool: 'describe_available_data' }))
    const text = await ask('Who is our best customer?', { fetchImpl })
    expect(text).toContain('notAvailable')
    expect(text).toContain('customer name or identity')
    expect(calls).toHaveLength(2)
  })

  it('numbers without a tool call are discarded (the model must not guess)', async () => {
    const fetchImpl = (async () => say('You had about 12 orders.')) as typeof fetch
    expect(await ask('How many orders?', { fetchImpl })).toBe(CANNOT_ANSWER_MESSAGE)
  })

  it('a plain answer with no numbers and no tool is allowed (greetings)', async () => {
    const fetchImpl = (async () => say('Hello! Ask me about sales.')) as typeof fetch
    expect(await ask('hi', { fetchImpl })).toBe('Hello! Ask me about sales.')
  })

  it('tools reject bad dates and unknown tools instead of guessing', () => {
    const orders = body<{ orders: StoredOrder[] }>(makeServer().server.getOrders()).orders
    expect(runTool('count_orders', { date: 'yesterday' }, orders, menu)).toHaveProperty('error')
    expect(runTool('orders_on_date', {}, orders, menu)).toHaveProperty('error')
    expect(runTool('delete_everything', {}, orders, menu)).toHaveProperty('error')
    expect(runTool('count_orders', { date: '2026-11-20' }, orders, menu)).toEqual({ date: '2026-11-20', orderCount: 2 })
  })

  it('tries the next model when one is busy (503) or retired (404)', async () => {
    const urls: string[] = []
    const fetchImpl = (async (url: unknown) => {
      urls.push(String(url))
      if (urls.length === 1) return json({}, 503)
      if (urls.length === 2) return json({}, 404)
      return say('Hello! Ask me about sales.')
    }) as typeof fetch
    expect(await ask('hi', { fetchImpl })).toBe('Hello! Ask me about sales.')
    expect(urls).toHaveLength(3)
    expect(new Set(urls).size).toBe(3) // three different models were tried
  })

  it('shows clear errors: missing key, invalid key, quota (429), network', async () => {
    const code = async (over: Parameters<typeof ask>[1], apiKey: string | null = 'k') => {
      try {
        await askSalesAssistant({ question: 'q', menu, apiKey: apiKey ?? undefined, getOrders: async () => [], ...over })
      } catch (e) {
        return (e as AssistantError).code
      }
    }
    expect(await code({}, null)).toBe('missing_key')
    expect(await code({ fetchImpl: (async () => json({ error: { message: 'API key not valid' } }, 400)) as typeof fetch })).toBe('invalid_key')
    expect(await code({ fetchImpl: (async () => json({}, 403)) as typeof fetch })).toBe('invalid_key')
    expect(await code({ fetchImpl: (async () => json({}, 429)) as typeof fetch })).toBe('quota')
    expect(await code({ fetchImpl: (async () => { throw new TypeError('offline') }) as typeof fetch })).toBe('network')
  })
})
