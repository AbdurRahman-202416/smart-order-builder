# DECISIONS.md

## C1. Why not keep 679.50 as a float?

A float cannot keep many decimal numbers exactly. In TC-06 the VAT is 5% of 1,509.50, which is 75.475.
With floats, `Math.round(75.475 * 100)` gives 7547, which is wrong. So I keep all money as whole poisha.
5% of 150950 poisha is 7547.5, half goes up, so VAT is 7548 = **75.48**. Then 1,509.50 + 75.48 = 1,584.98,
and the payable is **1,585**.

## C2. What can the bot answer?

The functions are in `src/logic/salesStats.ts`. The bot calls them through `src/chatbot/chatTools.ts`.

| Question | Function | Input | Output |
|---|---|---|---|
| How many orders? | `count_orders` | date (optional) | order count |
| Total revenue? | `total_revenue` | date (optional) | order count, revenue |
| Average order value? | `average_order_value` | date (optional) | average amount |
| Best-selling option? | `best_selling_option` | none | option name, units |
| Revenue by payment method? | `revenue_by_payment_method` | none | card, bkash, cash |
| How many orders got the coupon? | `coupon_applied_count` | none | count, orders that missed it and why |
| Orders on a date? | `orders_on_date` | date | list of orders |
| Anything else | `describe_available_data` | none | what data we have and do not have |

## D1. Tab B takes the last eggs while Tab A is editing

When Tab A saves, the server checks the stock again. It is not enough, so the server says no and Tab A shows
"Short: 1 egg" (with the real number). Nothing is saved on the server. The user loses nothing: the selection
stays on the screen, so they can use fewer eggs and save again.

## D2. When is the price locked?

I lock it at checkout. Item prices do not change with time, but the coupon does. So the price in the cart is
only a preview. When the user presses Pay, the server works out the price with its own time and saves it in
the order. This gives 1,585 at 10:59:59 and 1,637 at 11:00:00.

## D3. A reservation ends while the user is editing

The user's changes are not removed. The screen shows a warning that the reservation expired and the stock was
released. The save button changes to "Reserve Again". Pressing it removes the old item and reserves the new
one in a single call. If there is not enough stock, it shows what is short.

## D4. Who makes the order id and time? What about double click?

The server makes both, because the browser clock cannot be trusted. For double click I do three things.
The Pay button locks at once using a ref. The request carries a key, and the same key gets the same order
back. And after the first order the cart is empty, so another request is refused.

## D5. "Who is our best customer?"

Orders do not store any customer. The bot calls `describe_available_data`, which says customer names are not
available, and then it says it cannot know. The model never sees the raw orders. If it writes a number without
calling a function, I throw that answer away.

## D6. Shape of a stored order

```json
{
  "id": "ORD-1001",
  "createdAt": "2026-11-20T09:15:00+06:00",
  "paymentMethod": "card",
  "currency": "BDT",
  "moneyUnit": "poisha",
  "coupon": { "code": "MORNING15", "applied": true, "reason": null },
  "lines": [
    {
      "qty": 1,
      "options": { "toast": 1, "scrambled": 2, "sausage": 1, "ketchup": 1 },
      "unitPrice": 38000,
      "lineTotal": 38000
    }
  ],
  "totals": {
    "subtotal": 38000,
    "discount": { "flatDiscount": 0, "couponDiscount": 5700, "chosen": "C2", "applied": 5700 },
    "vat": 1615,
    "payable": 33900,
    "payableBdt": 339
  }
}
```

All money is in poisha, and `moneyUnit` says so. If a coupon was typed but not used, I keep the `code`, set
`applied` to false and write why in `reason`. I save both discounts so anyone can check which one was bigger.
The downloaded file is `{ schemaVersion, currency, moneyUnit, orders }`.

## Other choices

- "eggs >= 4" counts egg units, so one Omelette counts as 1.
- If two rules change the same group's max, the lower max wins.
- Editing an item does not give it a new 5 minutes.
- After Pay the cart is emptied, including expired items.
