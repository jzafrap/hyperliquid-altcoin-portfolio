# Trading Model

Exactly how the app turns "buy 100 USDC of tokenset1" into orders, and how it
records and values the result. This is the money-critical logic; every rule here
is enforced in code and covered by tests.

## Prerequisites

- USDC must be in your Hyperliquid **spot** balance. Depositing/bridging is done on
  Hyperliquid, outside this app.
- An **approved agent** must be active (see [Security](./security.md)).

## Asset identity (spot vs perp)

Hyperliquid orders reference an asset by a numeric id, computed differently per market:

| Market | Asset id | Price decimals |
|--------|----------|----------------|
| Spot | `10000 + universe.index` (the `.index` field, not array position) | `8 − szDecimals` |
| Perp | universe **array index** (0-based; no `.index` field) | `6 − szDecimals` |

Verified against testnet: spot `PURR/USDC` → `10000`, `@1` → `10001`; perp `BTC` →
its array index. See [Hyperliquid Reference](./hyperliquid-reference.md).

## Buying (equal split)

Input: a USDC total and a tokenset of `N` tokens.

| Step | Rule |
|------|------|
| Minimum total | Reject unless `total ≥ 10 × N` (Hyperliquid's ~$10 per-order minimum). |
| Split | `perToken = total / N`. |
| Price | Marketable IOC **limit** = `mid × (1 + slippage)`, rounded **up** to a valid tick (default slippage 2%). |
| Size | `size = floor(perToken / limitPrice)` to the token's `szDecimals`. |
| Re-check | After rounding, every leg must still clear the $10 minimum — otherwise the buy is blocked (never silently skipped). |
| Order | One batched IOC order (`grouping: "na"`), each leg `b: true`. |

**Why size off the limit price, not mid?** An IOC buy can fill anywhere up to its
limit. Sizing off `mid` while submitting a higher limit would let a fill cost more
than the allocation. Sizing off the limit price guarantees `size × fillPrice ≤
perToken` — you can under-spend slightly, never over-spend.

**Rounding is honest.** Sizes round down, so the actual spend can be a bit below
your input. The app reports what was actually spent, not the requested amount.

## Selling (per lot, by percentage)

A sell targets **one lot** and a percentage of each token's remaining quantity. It
never touches another lot, even for the same tokenset.

| Step | Rule |
|------|------|
| Percentage | 25 / 50 / 100% of each leg's `qtyRemaining`. |
| Size | `sellQty = floor(qtyRemaining × pct)` to `szDecimals`. |
| Price | Marketable IOC **limit** = `mid × (1 − slippage)`, rounded **down**. |
| Minimum | A leg whose `sellQty × limitPrice` is below $10 is flagged unsellable (not dropped). |
| Order | IOC order, each leg `b: false`. |
| Update | Reduce `qtyRemaining`; recompute status; accrue realized P&L. |

Lot status after a sell:

- `partially_sold` — some quantity remains.
- `closed` — nothing remains across all legs.

## Perpetuals (1x)

Perps reuse the spot flow with these differences:

| Aspect | Perp behavior |
|--------|---------------|
| Buy | Opens a **1x long**. Before ordering, leverage is set to **1x cross** per asset (`updateLeverage`); if that fails, the buy aborts before any order. |
| Sell | Closes the long with **`reduceOnly`** orders — a "sell" can never flip into a short. |
| Funds | Hyperliquid defaults to **unified account mode**: one USDC balance collateralizes spot and perps (it shows in the *spot* clearinghouse state; the perp `withdrawable` is "not meaningful"). Buying power is taken as the max of perp `withdrawable` and spot USDC. No spot→perp transfer is needed. At 1x, notional ≈ margin. |
| Storage | Perp tokensets/lots are namespaced separately from spot; a lot records its `marketType` and can't be sold on the wrong market. |

**Caveats (see also `instructions.md` §8.2):**

- **Positions net on-exchange.** Hyperliquid keeps one netted position per perp
  asset; multiple app "lots" are an accounting layer over that single position.
- **Funding is not modeled.** P&L is mark-vs-entry; funding accrues on the real
  position but isn't shown. The authoritative value is on Hyperliquid.
- **No pre-trade reconciliation.** A buy doesn't check for an existing position on
  that asset (opened elsewhere or from lost local storage).

## Price and size formatting

Prices and sizes are sent as **plain decimal strings** — never exponential
notation. `String(5.1e-7)` would produce `"5.1e-7"`, which Hyperliquid rejects;
this matters for low-priced altcoins. A dedicated formatter emits fixed-notation,
trailing-zero-trimmed strings within Hyperliquid's limits (≤5 significant figures,
≤ `8 − szDecimals` decimals for spot).

Size rounding also uses a tiny epsilon so an already-aligned value isn't truncated
by binary-float error (e.g. `0.58 × 100 = 57.999…` must stay `0.58`, not become
`0.57`). Without it, a "100%" sell could leave un-closable dust.

## Partial fills — no atomicity

Hyperliquid has **no atomic multi-order bundle**. A batch can fill some legs and not
others. The app:

- records the legs that filled (with real fill price/size),
- keeps failed legs in the record (marked), never dropping them,
- flags the result as **partial** so you can see the basket is incomplete.

## Lots and P&L bookkeeping

Hyperliquid does not know about "tokensets" — grouping and cost basis are entirely
app-side.

- Each buy is a **lot** (`BuyRecord`) with per-token legs: entry price, quantity
  bought, quantity remaining, and accrued realized P&L.
- **Unrealized P&L** (portfolio) = `qtyRemaining × (currentMid − avgEntryPrice)`,
  per leg, aggregated to lot and tokenset. Legs without a current price are left
  unvalued and excluded from totals — never guessed.
- **Realized P&L** (on sell) = `soldQty × (sellPrice − avgEntryPrice)`, accrued per
  leg.

## Money-safety guarantees (enforced in `executeBuy` / `executeSell`)

- Invalid plan or **nothing filled** → throw **before/without** moving funds (safe
  to retry; IOC that doesn't fill spends nothing).
- Once **any** leg fills → **never throw**. The result is returned with `partial`
  and `persisted` flags so a real fill is never mistaken for "nothing happened"
  (which would invite a double-spend retry).
- If the fill can't be saved locally, `persisted: false` is surfaced loudly ("do
  not retry") rather than reported as success.
- Balance is re-read right before executing; the amount is checked against it both
  in the UI and at the execution boundary.

## Known limitations

See [Security → Known limitations](./security.md#known-v1-limitations) and
`instructions.md` §8.1 (cross-tab lot writes, corrupt-storage handling, fee
headroom).

## Next step

See [Security](./security.md) for the signing/trust model, or
[Architecture](./architecture.md) for where each rule lives in the code.
