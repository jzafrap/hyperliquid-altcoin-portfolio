# User Guide

How to use every feature of the app. For the math behind trades, see
[Trading Model](./trading-model.md).

## Spot vs Perps

A selector at the top switches the whole view between **Spot** and **Perps (1x)**:

- **Spot** — you buy and hold the actual tokens.
- **Perps (1x)** — a "buy" opens a **1x long** position; a "sell" **closes** it
  (reduceOnly). Margin comes from your Hyperliquid **perp** account, not spot USDC.

Tokensets and positions are kept **separately per market type** — your spot
tokensets and perp tokensets don't mix. Everything below works the same in both
modes unless noted.

> Perp caveats: positions **net** on the exchange (two buys of the same perp share
> one real position), and displayed P&L is mark-vs-entry and **does not include
> funding**. See [Trading Model → Perps](./trading-model.md#perpetuals-1x).

## The screen, top to bottom

| Section | What it does |
|---------|--------------|
| Header | App title, network banner, wallet connect/disconnect. |
| Spot/Perps selector | Switch market type. |
| Balance | Spot USDC, or perp margin in perp mode (with a deposit link when 0). |
| Enable trading | Approve the trade-only agent (one signature). |
| Tokens / New tokenset | Compose and save a basket. |
| Your tokensets | Saved baskets, each with a Buy control. |
| Portfolio | Open positions with live P&L and Sell controls. |

## Create a tokenset

A **tokenset** is a named basket of spot tokens. Creating one is local — no chain
interaction, no signature.

1. In **Tokens**, search by symbol (e.g. `HYPE`, `PURR`).
2. Click tokens to add them. Each candidate shows:
   - **Liquidity badge** — High / Medium / Low from 24h volume (and spread for
     selected tokens). Low tokens carry a ⚠ warning.
   - Price and 24h change.
3. Selected tokens appear under **New tokenset** with live **spread** and **depth**
   so you can judge how much a trade will slip.
4. Give the set a name and click **Create tokenset**.

> Names must be unique per wallet. Tokens are de-duplicated automatically.

## Buy a tokenset

On a saved set, enter a USDC amount and click **Buy**.

- The amount is **split equally** across the set's tokens.
- Minimum total is **`10 USDC × number of tokens`** (Hyperliquid's per-order
  minimum). The form tells you the minimum and your available balance.
- Orders execute at market (IOC) with a slippage bound.
- The result becomes a **lot** — one record of that purchase, with per-token entry
  prices. Buying the same set again creates a **separate lot**.

Possible outcomes:

| Message | Meaning |
|---------|---------|
| `Bought — spent $X` | Filled. `$X` is what was actually spent (may be slightly under your input due to rounding). |
| `… (partial basket …)` | Some legs didn't fully fill. The filled part is recorded. |
| `Insufficient USDC …` | Your balance is below the amount. |
| `Order FILLED … but could not be saved …` | Rare: the trade happened but local storage failed. **Do not buy again** — record it manually. |

## Read your portfolio

**Portfolio** groups your open lots by tokenset:

- **Per tokenset** — a combined value and P&L aggregated from that set's open lots.
- **Per lot** — date, status (`open` / `partially_sold` / `closed`), and its P&L.
- **Per token** — remaining quantity, entry price, current price, and live P&L.

P&L is unrealized and derived from current mid prices. If prices go stale or fail
to load, a ⚠ banner appears so you don't act on outdated numbers.

**Hide small balances.** Toggle *Hide small balances (< $5.00)* to hide lots whose
current value is under $5 (dust). A lot that can't be priced right now is never
hidden, so a price outage won't make real positions disappear. The count of hidden
lots is shown next to the toggle.

## Sell a lot

Each open lot has **Sell 25% / 50% / 100%** buttons.

- The percentage applies to **each token's remaining quantity** in **that lot only**
  — other lots are untouched.
- Sells are market (IOC) orders priced below mid.
- After a sell, the lot's remaining quantities and status update, and **realized
  P&L** for that sell is shown and accrued per token.
- A leg that can't be sold right now (no market, or the slice is below the $10
  minimum) is flagged rather than silently skipped; the sell is marked partial.

## Networks and safety

- The active network (testnet/mainnet) is always visible. Testnet and mainnet data
  are stored separately, so they never mix.
- Your positions are stored in your browser per network + wallet. Using a different
  browser or clearing storage starts fresh (the on-exchange balances are unaffected).

## Next step

Want the exact mechanics (sizing, price rounding, asset ids)? See
**[Trading Model](./trading-model.md)**. Curious how it's built? See
**[Architecture](./architecture.md)**.
