import { useEffect, useState } from 'react'
import { serverClock } from '../api/apiClient'

/** The current SERVER time in ms, refreshed every second. Countdowns must use this, never Date.now(). */
export function useServerNow(refreshEveryMs = 1000): number {
  const [serverNow, setServerNow] = useState(() => serverClock.now())
  useEffect(() => {
    const timer = setInterval(() => setServerNow(serverClock.now()), refreshEveryMs)
    return () => clearInterval(timer)
  }, [refreshEveryMs])
  return serverNow
}
