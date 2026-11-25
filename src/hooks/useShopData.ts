import { useCallback, useEffect, useState } from 'react'
import { api } from '../api/apiClient'
import { SERVER_STORAGE_KEY } from '../mockServer/MockServer'
import type { CartState, Menu, StoredOrder } from '../types'

/** Loads the menu, the cart and the orders from the server, and keeps them up to date. */
export function useShopData() {
  const [menu, setMenu] = useState<Menu | null>(null)
  const [cartState, setCartState] = useState<CartState | null>(null)
  const [orders, setOrders] = useState<StoredOrder[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const refreshCart = useCallback(async () => {
    try {
      setCartState(await api.getCartState())
      setLoadError(null)
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could Not Load The Cart')
    }
  }, [])

  const refreshOrders = useCallback(async () => {
    try {
      setOrders(await api.getOrders())
    } catch {
      /* the next refresh tries again */
    }
  }, [])

  useEffect(() => {
    api.getMenu().then(setMenu, (error) => setLoadError(error instanceof Error ? error.message : 'Could Not Load The Menu'))
    void refreshCart()
    void refreshOrders()

    // Another browser tab changed the shared server data: refresh at once. Also refresh every 4 seconds.
    const onStorageChange = (event: StorageEvent) => {
      if (event.key === SERVER_STORAGE_KEY) {
        void refreshCart()
        void refreshOrders()
      }
    }
    window.addEventListener('storage', onStorageChange)
    const pollTimer = setInterval(() => void refreshCart(), 4000)
    return () => {
      window.removeEventListener('storage', onStorageChange)
      clearInterval(pollTimer)
    }
  }, [refreshCart, refreshOrders])

  return { menu, cartState, orders, loadError, refreshCart, refreshOrders }
}
