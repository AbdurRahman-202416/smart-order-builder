# Smart Order Builder (DevsStream frontend assessment)

React 18+ / TypeScript (strict) / Vite. The "server" is a mock API served by MSW (Mock Service Worker)
inside the browser; there is no real backend.

## Run it

```bash
npm install
cp .env.example .env.local     # then put your own free Google AI Studio key in VITE_GEMINI_API_KEY
npm run dev                    # http://localhost:5173
npm test                       # all tests (Vitest + React Testing Library), one command
npm run answers                # prints the numbers used in ANSWERS.md
npm run typecheck && npm run build
```

Never commit `.env.local`. `.env.example` only has the variable name. The assistant shows a clear message
when the key is missing, invalid (401/403/400), over quota (429) or the network fails.

## Architecture

```
src/types/        EVERY type, one file per topic (menuTypes, cartTypes, priceTypes, orderTypes,
                  serverTypes, chatTypes, ...). Import them all from "../types".
src/logic/        PURE functions: no React, no I/O, no hardcoded ids
  validateRules.ts    Part A  validate(selected, groups, rules) -> every violation
  ingredientStock.ts  Part B  ingredientsNeeded, stockLeft, missingIngredients, howManyMoreCanBeAdded
  pricing.ts          Part C  priceCart(cart, menu, promos, serverTime), integer poisha
  salesStats.ts       Part F  sales numbers over the orders JSON
  money.ts, dhakaTime.ts, formatText.ts (toTitleCase and text helpers)
src/mockServer/   the mock server
  menu.json           Appendix A. Replace this file to run a different menu: no code change needed.
  orders.seed.json    Appendix B (the six seed orders)
  MockServer.ts       cart, reservations, checkout, orders, idempotency. Takes an injected clock and
                      storage, so tests run it directly with no HTTP.
  apiRoutes.ts        MSW routes, simulated delay and the 15% price failures
  startMockServer.ts  starts MSW, clock = Date.now() + 90s, data in localStorage (shared by tabs)
  loadMenu.ts         reads menu.json (BDT) and converts it to poisha
src/chatbot/      Part F chatTools.ts (Gemini tool list + runTool) and askSalesAssistant.ts (REST client)
src/api/          apiClient.ts: fetch wrapper + server clock offset
src/hooks/        useLivePrice, useShopData, useSavedDraft, useServerNow
src/components/   PlateBuilder, CartPanel, OrdersList, SalesChat, PriceTable
src/test/         acceptance tests TC-01..TC-20 and the seed answers
```

**Rules engine.** Group limits (min, max, step, maxDistinct, maxPerOption), `requires`, `excludes` and
`overrideLimit` are all driven by the data. The engine contains no option id. `validate` never stops at
the first problem. The server runs the same `validate` again, so a client cannot skip the rules.

**Stock.** Stock is per ingredient and shared by every cart item and the draft. Available =
total - sold - the other active reservations. To edit an item, its own allocation is simply left out of
"held", so the net difference is all that is checked and nothing is double counted or released twice.
Shortages are listed all at once ("Short: 2 egg, 2 cheese").

**Pricing.** Pure, integer poisha, steps in the exact order of the brief. Every percentage rounds
half-up with integer maths (`percentOfRounded`), only the final payable is rounded to whole BDT. The coupon time
check uses a fixed +06:00 offset (Bangladesh has no DST) and is strictly before 11:00:00.
The price preview is debounced 300 ms, the previous request is aborted, and each response carries a request
id so an old answer can never replace a newer price. Failures keep the configuration and show Retry.

**Cart and reservations.** `addItem` takes an `Idempotency-Key`; the same key returns the stored reply.
Reserve runs on a scratch copy and is saved only at the end (all or nothing), so a crash leaves no phantom
hold (tick "Dev: crash the next reservation" to see it). Each reservation lasts 5 minutes on the server
clock. The client learns the server clock offset from `serverTime` in each response (NTP style) and every
countdown uses it, never `Date.now()`. Expired items release their stock and become read-only.

**Orders.** Pay turns all active items into one order in one transaction (stock becomes sold, cart empties).
The server creates the id and the time. Orders live in localStorage, so they survive a refresh, and
`orders.seed.json` is priced with our own engine at each order's `createdAt` the first time the app starts.
`Download orders.json` exports seed and new orders. Shape: see DECISIONS.md (D6).

**Assistant.** The model only picks one of 8 tools and phrases the tool result. Every number comes from
`src/logic/salesStats.ts`. Orders are fetched again on every question, so a new checkout shows up at once.
A model answer with a number and no tool call is thrown away.

## Part G (bonus)

- Refresh keeps only still-valid reservations: **done** (server state is persisted and re-checked on every call).
- Unfinished configuration survives a refresh: **done** (`useSavedDraft`, localStorage).
- Two tabs with a version number and conflict on stale writes: **not done.** There is no version counter.
  Tabs do refresh each other through the `storage` event and polling, and the server always re-checks the stock.

## Trade-offs and what is unfinished

- The mock server is simple on purpose. Cross-tab consistency relies on every request doing
  load -> change -> save in one synchronous step; a real server would use a database transaction.
- localStorage can be cleared by the user, which resets the "server" (it then reseeds).
- The Gemini client is unit-tested with a mocked `fetch`, and was also run once against the real API with a free key
  (it answered the order count and refused the customer question). Model names change: it tries
  `gemini-flash-lite-latest`, `gemini-3.5-flash` and `gemini-3-flash-preview` in turn when a model is busy (503) or
  retired (404). `VITE_GEMINI_MODEL` is tried first when set.
- The UI is plain on purpose (the brief says logic is graded, not design). It has not had a manual
  accessibility audit beyond labels and roles.

## Hours spent

TODO: write the real number here (the brief asks for actual hours).
