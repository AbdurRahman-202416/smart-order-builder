import { CartPanel } from './components/CartPanel'
import { OrdersList } from './components/OrdersList'
import { PlateBuilder } from './components/PlateBuilder'
import { SalesChat } from './components/SalesChat'
import { useSavedDraft } from './hooks/useSavedDraft'
import { useShopData } from './hooks/useShopData'

export default function App() {
  const { menu, cartState, orders, loadError, refreshCart, refreshOrders } = useShopData()
  const [draft, setDraft] = useSavedDraft()

  if (!menu || !cartState) {
    return (
      <main className="app">
        <p>{loadError ?? 'Loading...'}</p>
      </main>
    )
  }

  return (
    <main className="app">
      <header>
        <h1>Smart Order Builder</h1>
        <label className="dev muted">
          <input
            type="checkbox"
            onChange={(event) => {
              if (window.__mock) window.__mock.crashNextReserve = event.target.checked
            }}
          />{' '}
          Dev: Crash The Next Reservation Half-Way
        </label>
      </header>
      {loadError && <p className="banner warn">{loadError}</p>}
      <div className="grid">
        <PlateBuilder menu={menu} cartState={cartState} draft={draft} setDraft={setDraft} onCartChanged={refreshCart} />
        <div className="stack">
          <CartPanel
            menu={menu}
            cartState={cartState}
            onEditItem={(item) => setDraft({ options: item.options, qty: item.qty, editingItemId: item.id })}
            onCartChanged={refreshCart}
            onPaid={async () => {
              await refreshCart()
              await refreshOrders()
            }}
          />
          <OrdersList orders={orders} />
          <SalesChat menu={menu} />
        </div>
      </div>
    </main>
  )
}
