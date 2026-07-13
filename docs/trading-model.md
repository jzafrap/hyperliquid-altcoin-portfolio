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
| Price | Marketable IOC **limit** = `mid × (1 − slippage)`, rounded **down** — for a **spot** sell or a **long-lot perp close**. Closing a **short** perp lot flips this: limit = `mid × (1 + slippage)`, rounded **up** (buying to cover). |
| Minimum | A leg whose `sellQty × limitPrice` is below $10 is flagged unsellable (not dropped). |
| Order | IOC order. `b: false` for a spot sell or a long-lot perp close; `b: true` for a short-lot perp close (buy-to-cover — a plain sell would have grown the short instead of closing it). |
| Update | Reduce `qtyRemaining`; recompute status; accrue realized P&L (side-aware — see Perpetuals below). |

Lot status after a sell:

- `partially_sold` — some quantity remains.
- `closed` — nothing remains across all legs.

## Perpetuals (leverage + directional short)

Perps reuse the spot flow, generalized to both directions and selectable leverage:

| Aspect | Perp behavior |
|--------|---------------|
| Buy | Opens or increases a **long**. The user picks 1x/2x/3x leverage (a shared `LeverageSelector`, gated to the resolved asset's `Market.maxLeverage` — options above the cap are hidden, never silently clamped or submitted). Before ordering, that leverage is set per asset (`updateLeverage`) — **cross** normally, **isolated** for assets that disallow cross (`onlyIsolated`/`strictIsolated`); if that fails, the buy aborts before any order. |
| Short | A separate, tokenset/asset-scoped control (`ShortForm`, next to the buy control — not inside the per-lot sell control, since opening a short has no pre-existing lot) opens or increases a **short** via `executeShort`, mirroring the buy flow: same leverage selector, same per-asset `updateLeverage` step, same money-safety ordering. Produces non-`reduceOnly` sell-to-open orders. |
| Close (quick-close) | The existing 25/50/100% quick-close remains `reduceOnly` and is side-aware: closing a **long** lot is a plain sell (unchanged); closing a **short** lot **buys to cover** (`b:true`, price rounded up) instead of growing the short — a plain sell on a short lot would have increased it. No leverage selector on close; `updateLeverage` is never called here. |
| Sizing | The USDC amount is **notional exposure**, unchanged from pre-leverage sizing. Leverage only changes the funds guard: required margin = `notional / leverage`. At 1x this is numerically identical to the old behavior. |
| Funds | Hyperliquid defaults to **unified account mode**: one USDC balance collateralizes spot and perps (it shows in the *spot* clearinghouse state; the perp `withdrawable` is "not meaningful"). Buying power is taken as the max of perp `withdrawable` and spot USDC. No spot→perp transfer is needed. |
| Storage | Perp tokensets/lots are namespaced separately from spot; a lot records its `marketType` and `side` (`"long"` or `"short"`, defaulting to `"long"` for lots persisted before this existed) and can't be sold on the wrong market. |

**Caveats (see also `instructions.md` §8.2):**

- **Positions net on-exchange.** Hyperliquid keeps one netted position per perp
  asset; multiple app "lots" (long or short) are an accounting layer over that
  single position. A directional sell sized larger than an existing long nets
  the position to a short in one fill — no app-side flip logic is needed, the
  exchange nets it.
- **Funding is not modeled.** P&L is mark-vs-entry (side-aware: a short profits
  as price falls); funding accrues on the real position but isn't shown. The
  authoritative value is on Hyperliquid.
- **No pre-trade reconciliation.** Opening a long or short doesn't check for an
  existing position on that asset (opened elsewhere or from lost local storage).

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
others (e.g. an IOC leg that can't match a thin book). Importantly, the SDK
**throws** on a batch where any leg errors — even if others filled — attaching the
full per-leg statuses to the error. The app therefore:

- recovers the per-leg statuses from that thrown error (from
  `error.response.response.data.statuses`) so real fills are never lost,
- records **only the legs that actually filled**,
- returns the legs that didn't as a `failed` list and surfaces a warning
  ("Couldn't buy X"), and flags the result as **partial**.

If **no** leg fills, the buy throws before recording (nothing moved — safe to retry).

## Lots and P&L bookkeeping

Hyperliquid does not know about "tokensets" — grouping and cost basis are entirely
app-side.

- Each buy or short-open is a **lot** (`BuyRecord`) with a `side` (`"long"` or
  `"short"`, defaulting to `"long"` for lots persisted before shorts existed)
  and per-token legs: entry price, quantity bought, quantity remaining, and
  accrued realized P&L.
- **Unrealized P&L** (portfolio) = `qtyRemaining × (currentMid − avgEntryPrice)`
  for a long leg; **inverted** (`avgEntryPrice − currentMid`) for a short leg —
  a short profits as price falls. Aggregated per leg, to lot and tokenset. Legs
  without a current price are left unvalued and excluded from totals — never
  guessed.
- **Realized P&L** (on sell/cover) = `soldQty × (sellPrice − avgEntryPrice)` for
  a long leg; inverted for a short leg (covering below entry is a profit).
  Accrued per leg.

## Money-safety guarantees (enforced in `executeBuy` / `executeShort` / `executeSell`)

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
