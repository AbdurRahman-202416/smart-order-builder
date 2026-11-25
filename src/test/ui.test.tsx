import { act, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PRICE_DEBOUNCE_MS, useLivePrice } from '../hooks/useLivePrice'
import { A, B, line, menu } from './helpers'

// The UI talks to the mock server through this module; we replace it with spies.
vi.mock('../api/apiClient', async (importOriginal) => {
  const real = await importOriginal<typeof import('../api/apiClient')>()
  return {
    ...real,
    api: {
      getPrice: vi.fn(),
      addItem: vi.fn(),
      editItem: vi.fn(),
      removeItem: vi.fn(),
      checkout: vi.fn(),
      getCartState: vi.fn(),
      getOrders: vi.fn(),
      getMenu: vi.fn(),
    },
  }
})

import { api, computeClockOffset, serverClock } from '../api/apiClient'
import { PlateBuilder } from '../components/PlateBuilder'
import { CartPanel } from '../components/CartPanel'
import type { CartPrice, CartState } from '../types'

const mocked = api as unknown as Record<keyof typeof api, ReturnType<typeof vi.fn>>

const fakePrice = (payable: number) => ({ price: { payable, payableBdt: payable / 100, lines: [], coupon: { entered: false } } as unknown as CartPrice, serverTime: 0 })
const emptyState = (over: Partial<CartState> = {}): CartState => ({
  serverTime: 0, items: [], soldStock: {}, stockTotal: menu.stock, ...over,
})

beforeEach(() => {
  vi.clearAllMocks()
  mocked.getPrice.mockResolvedValue(fakePrice(38000))
  serverClock.offset = 0
})
afterEach(() => vi.useRealTimers())

describe('TC-12 pricing responses return out of order', () => {
  it('only the latest configuration price is ever displayed', async () => {
    vi.useFakeTimers()
    const pending: { resolve: (v: ReturnType<typeof fakePrice>) => void }[] = []
    mocked.getPrice.mockImplementation(() => new Promise((resolve) => pending.push({ resolve })))

    const { result, rerender } = renderHook(({ lines }) => useLivePrice(lines, null), {
      initialProps: { lines: [line(A)] },
    })
    await act(() => vi.advanceTimersByTimeAsync(PRICE_DEBOUNCE_MS)) // request 1 is sent
    rerender({ lines: [line(B)] })
    await act(() => vi.advanceTimersByTimeAsync(PRICE_DEBOUNCE_MS)) // request 2 is sent
    expect(pending).toHaveLength(2)

    await act(async () => pending[1].resolve(fakePrice(67950))) // the NEW one answers first
    expect(result.current.price?.payable).toBe(67950)
    await act(async () => pending[0].resolve(fakePrice(38000))) // the OLD one answers late
    expect(result.current.price?.payable).toBe(67950) // must not be replaced
    expect(result.current.status).toBe('ok')
  })

  it('debounces: typing fast sends one request', async () => {
    vi.useFakeTimers()
    const { rerender } = renderHook(({ lines }) => useLivePrice(lines, null), { initialProps: { lines: [line(A, 1)] } })
    for (const qty of [2, 3]) {
      rerender({ lines: [line(A, qty)] })
      await act(() => vi.advanceTimersByTimeAsync(100))
    }
    await act(() => vi.advanceTimersByTimeAsync(PRICE_DEBOUNCE_MS))
    expect(mocked.getPrice).toHaveBeenCalledTimes(1)
  })

  it('on failure the last price stays, an error shows, and Retry works', async () => {
    vi.useFakeTimers()
    mocked.getPrice.mockResolvedValueOnce(fakePrice(38000)).mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(fakePrice(41000))
    const { result, rerender } = renderHook(({ lines }) => useLivePrice(lines, null), { initialProps: { lines: [line(A)] } })
    await act(() => vi.advanceTimersByTimeAsync(PRICE_DEBOUNCE_MS))
    expect(result.current.price?.payable).toBe(38000)

    rerender({ lines: [line(A, 2)] })
    await act(() => vi.advanceTimersByTimeAsync(PRICE_DEBOUNCE_MS))
    expect(result.current.status).toBe('error')
    expect(result.current.price?.payable).toBe(38000) // configuration and last price kept

    act(() => result.current.retry())
    await act(() => vi.advanceTimersByTimeAsync(PRICE_DEBOUNCE_MS))
    expect(result.current.price?.payable).toBe(41000)
  })
})

describe('Builder', () => {
  const draft = (options: Record<string, number>) => ({ options, qty: 1, editingItemId: null })

  it('TC-13 Add to Cart clicked 3 times quickly sends exactly one request (one idempotency key)', async () => {
    let release!: () => void
    mocked.addItem.mockImplementation(() => new Promise((resolve) => (release = () => resolve({ item: {} }))))
    render(<PlateBuilder menu={menu} cartState={emptyState()} draft={draft(A)} setDraft={() => {}} onCartChanged={() => {}} />)

    const button = screen.getByRole('button', { name: 'Add To Cart' })
    fireEvent.click(button)
    fireEvent.click(button)
    fireEvent.click(button)
    expect(mocked.addItem).toHaveBeenCalledTimes(1)
    release()
    await waitFor(() => expect(mocked.addItem).toHaveBeenCalledTimes(1))
  })

  it('Add to Cart stays disabled while any rule is violated, and lists every violation', () => {
    const bad = draft({ toast: 1, scrambled: 3, sausage: 1, hollandaise: 1, tofu: 1 })
    render(<PlateBuilder menu={menu} cartState={emptyState()} draft={bad} setDraft={() => {}} onCartChanged={() => {}} />)
    expect(screen.getByRole('button', { name: 'Add To Cart' })).toBeDisabled()
    const list = screen.getByRole('list', { name: 'Rule Violations' })
    expect(list.textContent).toMatch(/Multiple Of 2/)
    expect(list.textContent).toMatch(/Tofu Cannot Be Combined With: Chicken Sausage/)
  })

  it('valid + in stock -> enabled', () => {
    render(<PlateBuilder menu={menu} cartState={emptyState()} draft={draft(A)} setDraft={() => {}} onCartChanged={() => {}} />)
    expect(screen.getByRole('button', { name: 'Add To Cart' })).toBeEnabled()
  })

  it('shows how many more units can be added and disables an option at 0 (TC-08)', () => {
    // cart B x1 + C x2 holds every egg and cheese
    const state = emptyState({
      items: [
        { id: 'item-1', qty: 1, options: B, ingredientsHeld: { egg: 6, croissant: 1, sausage: 1, bacon: 1, hashbrown: 1, mushroom: 1, hollandaise: 1 }, status: 'active', createdAt: 0, expiresAt: 1e15 },
        { id: 'item-2', qty: 2, options: {}, ingredientsHeld: { egg: 4, cheese: 4, paratha: 2, tofu: 2, mushroom: 2, beans: 2 }, status: 'active', createdAt: 0, expiresAt: 1e15 },
      ],
    })
    render(<PlateBuilder menu={menu} cartState={state} draft={draft({})} setDraft={() => {}} onCartChanged={() => {}} />)
    expect(screen.getByTestId('more-fried')).toHaveTextContent('Can Add 0 More')
    expect(screen.getByTestId('more-cheese')).toHaveTextContent('Can Add 0 More')
    expect(screen.getByTestId('more-croissant')).toHaveTextContent('Can Add 1 More')
    expect(screen.getByTestId('more-ketchup')).toHaveTextContent('No Stock Limit')
    expect(screen.getByRole('button', { name: 'Add One Fried' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Add One Croissant' })).toBeEnabled()
  })

  it('a failed save keeps the configuration and tells the user why (D1)', async () => {
    const { ApiError } = await import('../api/apiClient')
    mocked.addItem.mockRejectedValue(new ApiError(409, { error: 'out_of_stock', message: 'Short: 2 egg' }))
    const setDraft = vi.fn()
    render(<PlateBuilder menu={menu} cartState={emptyState()} draft={draft(A)} setDraft={setDraft} onCartChanged={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'Add To Cart' }))
    expect(await screen.findByText(/Short: 2 Egg/)).toBeInTheDocument()
    expect(setDraft).not.toHaveBeenCalled() // nothing the user typed was cleared
  })
})

describe('Cart countdown uses SERVER time (TC-15)', () => {
  it('computeClockOffset assumes the reply was created mid round-trip', () => {
    expect(computeClockOffset(1_090_100, 1_000_000, 1_000_200)).toBe(90_000)
  })

  it('with the server 90s ahead the countdown still shows ~05:00, not 06:30', () => {
    serverClock.offset = 90_000
    const serverNow = Date.now() + 90_000
    const state = emptyState({
      items: [{ id: 'item-1', qty: 1, options: A, ingredientsHeld: {}, status: 'active', createdAt: serverNow, expiresAt: serverNow + 300_000 }],
    })
    render(<CartPanel menu={menu} cartState={state} onEditItem={() => {}} onCartChanged={() => {}} onPaid={() => {}} />)
    expect(screen.getByLabelText('Time Left For Item 1').textContent).toMatch(/^0(5:00|4:59)$/)
  })

  it('an expired item is read-only: no Edit, no quantity change, but it can be removed', () => {
    const state = emptyState({
      items: [{ id: 'item-1', qty: 1, options: A, ingredientsHeld: {}, status: 'expired', createdAt: 0, expiresAt: 1 }],
    })
    render(<CartPanel menu={menu} cartState={state} onEditItem={() => {}} onCartChanged={() => {}} onPaid={() => {}} />)
    expect(screen.getByText(/Expired, Read-Only/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit' })).toBeDisabled()
    expect(screen.getByLabelText('Quantity For Item 1')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Pay' })).toBeDisabled() // nothing active to pay
  })

  it('TC-16 Pay clicked twice quickly sends one checkout request', async () => {
    let release!: () => void
    mocked.checkout.mockImplementation(() => new Promise((resolve) => (release = () => resolve({ order: { id: 'ORD-1', paymentMethod: 'card', totals: { payable: 100 } } }))))
    const state = emptyState({
      items: [{ id: 'item-1', qty: 1, options: A, ingredientsHeld: {}, status: 'active', createdAt: 0, expiresAt: 1e15 }],
    })
    render(<CartPanel menu={menu} cartState={state} onEditItem={() => {}} onCartChanged={() => {}} onPaid={() => {}} />)
    const pay = screen.getByRole('button', { name: 'Pay' })
    fireEvent.click(pay)
    fireEvent.click(pay)
    expect(mocked.checkout).toHaveBeenCalledTimes(1)
    release()
    await screen.findByText(/Order ORD-1 Placed/)
  })
})
