# Architecture

How the app is organized and how data flows. The design is **serverless and
client-only**: a React SPA talks directly to Hyperliquid and persists bookkeeping
in the browser.

## Tech stack

| Concern | Choice |
|---------|--------|
| UI | React 19 + Vite 6 + TypeScript (strict) |
| Wallet | wagmi + viem (injected connector: Rabby / MetaMask) |
| Hyperliquid client | [`@nktkas/hyperliquid`](https://github.com/nktkas/hyperliquid) |
| Server/chain state | TanStack Query |
| Persistence | `localStorage`, scoped by `{network}:{wallet}` |
| Tests | Vitest + Testing Library + jsdom |

## Layers

```
components/  ── React UI (presentation)
     │  hooks/  ── React Query + reactive state (useSpotMarkets, useAgent, useLots, …)
     ▼
lib/         ── pure logic + IO (orders, sell, execute, lots, pnl, agent, markets, …)
     ▼
@nktkas/hyperliquid (InfoClient / ExchangeClient) ──► Hyperliquid API
```

The **pure logic** in `lib/` (sizing, pricing, P&L, lot updates) has no React or
network dependencies, which is why it is unit-tested directly.

## Module map

### Config
- `config/env.ts` — the single network switch. Derives API/WS URLs, testnet flag,
  EIP-712 signature chain id, the web-app URL, and the storage namespace from one
  `VITE_HL_NETWORK` value.

### Hyperliquid access
- `lib/hyperliquid.ts` — client factory: `getInfoClient()` (reads) and
  `makeExchangeClient(wallet)` (signed writes).
- `lib/markets.ts` — `getSpotMarkets()` (USDC-quoted markets + 24h context) and
  `getBookLiquidity()` (spread + depth from the order book).
- `lib/balances.ts` — spot balances / available USDC.
- `lib/liquidity.ts` — pure spread/depth/tier helpers.

### Trading (money path)
- `lib/orders.ts` — buy math: asset id, equal split, size rounding, marketable
  price, minimum-total guard, order construction.
- `lib/sell.ts` — sell math: per-lot percentage sizing and sell-order construction.
- `lib/lots.ts` — `BuyRecord`/`BuyLeg` model, fill parsing, `applySellFills`,
  persistence.
- `lib/execute.ts` — `executeBuy` / `executeSell` orchestration and money-safety
  ordering.
- `lib/pnl.ts` — unrealized P&L and price-staleness helpers.
- `lib/tokensets.ts` — tokenset definitions + persistence.

### Signing
- `lib/agent.ts` — the agent (API) wallet session: in-memory key, reactive store,
  and `getAgentExchangeClient(master)` (the trust boundary). See
  [Security](./security.md).

### Hooks
`useSpotMarkets`, `useBookLiquidity`, `useUsdcBalance`, `useTokensets`, `useLots`,
`useAgent` — bridge `lib/` to React with caching and reactivity.

### Components
`WalletConnect`, `NetworkBanner`, `AgentApproval`, `TokenPicker`,
`LiquidityBadge`, `TokenLiquidityDetail`, `SelectedBasket`, `TokensetList`,
`BuyForm`, `SellForm`, `PortfolioDashboard`, plus `App.tsx` and
`app/providers.tsx` (Wagmi + Query providers).

## Data flow: a buy

```
BuyForm (amount)
  └─ useUsdcBalance.refetch()        # fresh balance
  └─ executeBuy(...)                 # lib/execute
       ├─ planBuy(...)               # lib/orders — size/guard
       ├─ getAgentExchangeClient()   # lib/agent — trust boundary
       ├─ client.order({...})        # @nktkas/hyperliquid
       ├─ buildLegsFromStatuses()    # lib/lots — parse fills
       └─ saveLots(addLot(...))      # localStorage
  └─ refreshLots()                   # useLots re-reads → PortfolioDashboard updates
```

## State ownership

| State | Where | Reactivity |
|-------|-------|-----------|
| Market data, balances | TanStack Query (cached, refetched) | Query hooks |
| Tokensets, lots | `localStorage` (per network+wallet) | `useTokensets` / `useLots` + `storage` event |
| Agent session | module-scoped variable in `lib/agent.ts` | `useSyncExternalStore` (so all consumers stay in sync) |

## Market type (spot | perp)

A `MarketType` dimension runs through the whole app. `app/marketType.tsx` holds the
active type (a React context); `MarketTypeTabs` switches it. It parameterizes the
markets layer (asset id, price decimals, order side/reduceOnly), the funds source
(spot USDC vs perp margin), and storage — so spot and perp tokensets/lots are fully
isolated. Perps support selectable 1x-3x leverage and directional shorts; see
[Trading Model → Perpetuals](./trading-model.md#perpetuals-leverage--directional-short).

## Persistence keys

```
hl-tokensets:{network}:{marketType}:{wallet}:tokensets   # tokenset definitions
hl-tokensets:{network}:{marketType}:{wallet}:lots        # buy lots
```

The agent private key is **never** persisted (memory only).

## Testing strategy

Pure `lib/` logic is unit-tested (sizing, pricing, P&L, lot updates, fill parsing).
Orchestration (`executeBuy`/`executeSell`) is tested with a mocked exchange client.
Every money-moving change was additionally reviewed by adversarial reviewers before
merge. See [Development](./development.md).

## Next step

[Security](./security.md) for the signing model, or [Trading Model](./trading-model.md)
for the money mechanics.
