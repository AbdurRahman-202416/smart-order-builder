import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api/apiClient'
import type { CartLine, LivePrice } from '../types'

export const PRICE_DEBOUNCE_MS = 300

/**
 * Asks the server for a price whenever the lines or the coupon change.
 * The price service is slow and fails sometimes, so two guards make sure an OLD answer can never
 * replace the price of a NEWER selection:
 *   1. when the selection changes, the old request is cancelled (abort), and
 *   2. every request gets a number, and an answer is used only if its number is still the latest.
 */
export function useLivePrice(lines: CartLine[], couponCode: string | null): LivePrice & { retry: () => void } {
  const [livePrice, setLivePrice] = useState<LivePrice>({ status: 'idle', price: null, error: null })
  const [retryCount, setRetryCount] = useState(0)
  const latestRequestNumber = useRef(0)
  const selectionKey = JSON.stringify([lines, couponCode])

  useEffect(() => {
    const requestNumber = ++latestRequestNumber.current
    if (lines.length === 0) {
      setLivePrice({ status: 'idle', price: null, error: null })
      return
    }
    setLivePrice((old) => ({ ...old, status: 'loading', error: null }))

    const controller = new AbortController()
    const timer = setTimeout(async () => {
      try {
        const { price } = await api.getPrice({ lines, couponCode }, controller.signal)
        if (requestNumber === latestRequestNumber.current) setLivePrice({ status: 'ok', price, error: null })
      } catch (error) {
        if (controller.signal.aborted || requestNumber !== latestRequestNumber.current) return
        // Keep the selection and the last price, and let the user press Retry.
        const message = error instanceof Error ? error.message : 'Price Failed'
        setLivePrice((old) => ({ status: 'error', price: old.price, error: message }))
      }
    }, PRICE_DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
      controller.abort()
    }
    // selectionKey stands for "lines + couponCode"; retryCount runs the same request again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey, retryCount])

  const retry = useCallback(() => setRetryCount((count) => count + 1), [])
  return { ...livePrice, retry }
}
