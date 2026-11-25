import { setupWorker } from 'msw/browser'
import seed from './orders.seed.json'
import { MockServer } from './MockServer'
import { defaultMenu } from './loadMenu'
import { createApiRoutes, defaultMockControls } from './apiRoutes'
import type { MockControls, SeedOrder, StorageLike } from '../types'

/** The mock server's clock runs 90 seconds ahead of the browser, as the brief requires. */
export const SERVER_CLOCK_SKEW_MS = 90_000

declare global {
  interface Window {
    __mock?: MockControls
  }
}

/** localStorage can throw (private mode); fall back to memory so the app still runs. */
function storageOrMemory(): StorageLike {
  try {
    localStorage.setItem('sob.probe', '1')
    localStorage.removeItem('sob.probe')
    return localStorage
  } catch {
    const memory = new Map<string, string>()
    return { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v) }
  }
}

export async function startMockServer() {
  const controls = defaultMockControls()
  window.__mock = controls

  const server = new MockServer({
    menu: defaultMenu,
    storage: storageOrMemory(),
    clock: () => Date.now() + SERVER_CLOCK_SKEW_MS,
    seedOrders: seed.orders as SeedOrder[],
    shouldCrashDuringReserve: () => {
      if (!controls.crashNextReserve) return false
      controls.crashNextReserve = false
      return true
    },
  })

  const worker = setupWorker(...createApiRoutes(server, controls))
  await worker.start({ onUnhandledFrame: 'bypass', quiet: true })
}
