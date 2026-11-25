# ANSWERS.md

Every number below is printed by one command, which uses the same engines as the app:

```
npm run answers
```

(`scripts/answers.ts`. The seed numbers are also asserted in `src/test/salesStats.test.ts`, and the
pricing numbers in `src/test/pricing.test.ts`: run `npm test`.)

All times are Asia/Dhaka. "Coupon typed" means the customer entered `MORNING15`.

## Q1. Maximum number of item C from an empty cart

**2.** Item C needs 2 cheese and the cheese stock is 4, so the third C stops with `Short: 2 cheese`.
The other ingredients allow more (egg 10 / 2 = 5, tofu 5, paratha 10, baked beans 8, mushroom 6).
Limiting ingredient: **cheese**.

## Q2. Cheapest valid configuration

**Toast + Fried x2 + Tofu = 360.00 BDT** per unit (base 250.00 + Toast 0.00 + Fried 2 x 30.00 + Tofu 50.00).
The script checks all 1,368,570 combinations that satisfy the group limits and keeps the cheapest one
that also passes `validate()` (no discounts apply at this size).

## Q3. Cart = A x3 (coupon typed)

A = Toast, Scrambled x2, Chicken Sausage x1, Ketchup. Unit price 380.00, so the subtotal is 3 x 380.00 = **1,140.00**.

**At 10:30**
1. C1 needs a subtotal of at least 1,200.00. 1,140.00 is below it, so C1 = 0.
2. C2 = 15% of 1,140.00 = 171.00, capped at 150.00, so C2 = 150.00. C2 is larger, **chosen discount = C2 (150.00)**.
3. Discounted subtotal = 1,140.00 - 150.00 = 990.00.
4. VAT = 5% of 990.00 = **49.50**.
5. Total = 990.00 + 49.50 = 1,039.50, rounded half-up to whole BDT: **payable = 1,040**.

**At 11:30**
1. The coupon is only valid strictly before 11:00, so C2 is rejected. C1 is not reachable (1,140.00 < 1,200.00). **No discount.**
2. Discounted subtotal = 1,140.00.
3. VAT = 5% of 1,140.00 = **57.00**.
4. Total = 1,197.00, **payable = 1,197**.

## Q4. After TC-10, payable at 11:30

Cart: B edited to Omelette x1 + Fried x3 (unit **643.50**) x1, plus C x2 (490.00 each = 980.00).
1. Subtotal = 643.50 + 980.00 = 1,623.50.
2. The coupon cannot work at 11:30. C1 applies (1,623.50 is at least 1,200.00): 100.00 off, so 1,523.50.
3. VAT = 5% of 1,523.50 = 76.175, rounded half-up to the poisha = **76.18**.
4. Total = 1,523.50 + 76.18 = 1,599.68, **payable = 1,600**.

## Q5. Seed orders (priced with our engine at each order's createdAt)

| Order | Time | Pay | Subtotal | Discount | VAT | Payable |
|---|---|---|---:|---|---:|---:|
| ORD-1001 | 20 Nov 09:15 | card | 380.00 | C2 57.00 | 16.15 | **339** |
| ORD-1002 | 20 Nov 12:40 | bkash | 679.50 | none | 33.98 | **713** |
| ORD-1003 | 21 Nov 10:05 | cash | 1,360.00 | C2 150.00 | 60.50 | **1,271** |
| ORD-1004 | 21 Nov 19:30 | card | 550.00 | none | 27.50 | **578** |
| ORD-1005 | 22 Nov 08:50 | bkash | 970.00 | C2 145.50 | 41.23 | **866** |
| ORD-1006 | 22 Nov 13:10 | card | 1,169.50 | none | 58.48 | **1,228** |

**Total revenue of all six: 4,995.00 BDT.**

## Q6. Best-selling option (units = line quantity x option quantity)

**Fried, 10 units** (ORD-1002: 2, ORD-1003: 2 x 2 = 4, ORD-1006: 2 + 2 = 4).
Next: Chicken Sausage 8 and Scrambled 8.

## Q7. Payment method with the most revenue

**Card: 2,145.00 BDT** (ORD-1001 339 + ORD-1004 578 + ORD-1006 1,228). bKash 1,579.00, cash 1,271.00.

## Q8. Orders that actually received MORNING15

**3 orders: ORD-1001, ORD-1003 and ORD-1005.**

Orders that have the code but did not get the discount:
- **ORD-1006** (22 Nov 13:10): the code was typed after 11:00, so the coupon is rejected ("only works before 11:00 Dhaka time"). Its subtotal 1,169.50 is also below the 1,200 needed for C1, so it got no discount at all.

Checks for the three that did get it:
- ORD-1001 (09:15): subtotal 380.00, C1 not reachable, C2 = 15% = 57.00, so C2.
- ORD-1003 (10:05): subtotal 1,360.00, C1 = 100.00, C2 = 15% = 204.00 capped at 150.00, so C2 wins.
- ORD-1005 (08:50): subtotal 970.00, C1 not reachable, C2 = 15% = 145.50, so C2.

(ORD-1002 and ORD-1004 had no code.)
