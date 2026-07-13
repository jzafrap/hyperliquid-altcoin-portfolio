# Hyperliquid Spot Tokensets — Build Instructions

> Purpose: a build guide to bootstrap a web application that lets a user assemble,
> buy, hold, and sell **baskets of spot tokens ("tokensets")** on Hyperliquid, using
> a browser wallet (Rabby / MetaMask) for authentication, with per-token and
> per-tokenset P&L tracking.

---

## 1. Product summary

A serverless-first web app where a user can:

1. **Create a tokenset** — a named basket of spot tokens (e.g. `tokenset1` = [HYPE, PURR, ...]).
2. **Buy a tokenset with USDC** — enter an amount (e.g. 100 USDC). The amount is split
   **equally across the N tokens** in the set (100/N USDC per token) and executed as
   spot market buys on Hyperliquid.
3. **Sell a tokenset** — fully (100%) or partially (e.g. 50%, 25%). The chosen
   percentage is applied to the **current holding of each token** in the set and sold
   at market.
4. **Monitor** — see all created tokensets and, for any set with an open (unsold) buy,
   the **P&L% total and per token**.
5. **Authenticate with a browser wallet** — Rabby or MetaMask. **No private keys are
   ever stored by the app** (see §3 for the one nuance about agent wallets). Once
   connected, show the wallet address and the **active network** (production target is
   **mainnet**; development runs on **testnet first** — see §4.1) plus the tokenset
   operations tied to that wallet.

---

## 2. Critical technical realities of Hyperliquid (read first)

These constrain the design. Verify each against the current Hyperliquid docs/API before coding.

- **Actions are signed messages, not on-chain txs.** Every order/cancel is an EIP-712
  `L1 action` sent to the exchange API endpoint. There is no per-trade gas.
- **Spot trading uses USDC as the quote asset.** Each spot token has an index and a
  market vs. USDC. You must fetch the **spot metadata** (`spotMeta`) to map token names
  → asset indices, `szDecimals`, and tick/lot sizing.
- **No native "market order".** Market execution is done via an **IOC (immediate-or-cancel)
  limit order** priced aggressively (buy: above ask; sell: below bid) within a **slippage
  bound** you define. Always compute a slippage cap.
- **Minimum order notional and size rounding.** Hyperliquid enforces a minimum order
  value and per-token size decimals (`szDecimals`). **Verify the current minimum
  notional against the API/docs** — do not hardcode a guessed value. This means "equal
  distribution" is *approximately* equal: sizes get rounded, and for small total amounts
  or tokens with coarse lot sizes the split will not be exact. The app must handle and
  surface this.
- **Balances are held on HyperCore (spot).** The user must have USDC available in their
  Hyperliquid spot balance. Bridging/depositing USDC into Hyperliquid is a
  **prerequisite outside this app's core scope** (link users to it; optionally add later).
- **Hyperliquid does not know about "tokensets".** Grouping tokens into a named basket
  and tracking cost basis is **100% app-side bookkeeping**. The chain only knows raw spot
  balances. The app must persist: tokenset definitions, each buy operation, and the entry
  price paid per token, in order to compute P&L.

---

## 3. Signing architecture — COMMITTED: Agent (API) wallet

A basket buy/sell touches N tokens = N signed actions. **This project uses the Hyperliquid
agent (API) wallet model.** This is the chosen architecture — build against it.

### How it works
- The user's main wallet (Rabby/MetaMask) signs **one** `approveAgent` action per session.
- The app generates a **delegated agent keypair** that can **place/cancel orders only —
  it cannot withdraw or transfer funds**. All basket orders are then signed locally by the
  agent key with **no further wallet popups**.
- The main private key is **never** exposed, requested, or stored.

### Rules for the agent key — COMMITTED: session-memory only
- The agent key lives **only in session memory**. Generate it in memory on connect,
  approve, and **discard it on disconnect/refresh** — re-approve next session. No
  persistence = smallest attack surface. **Do not write the agent key to `localStorage`,
  `sessionStorage`, cookies, IndexedDB, or any disk.**
- Keep the key in a non-serialized in-memory store (e.g. a module-scoped variable or a
  non-persisted state store). Never log it, never include it in error reports/telemetry.
- The agent key is a **trade-only delegated key, not the user's wallet key, and cannot
  move funds.** The UI MUST state this explicitly at approval time, and warn that a
  refresh will require re-approval.

### Session lifecycle
1. On wallet connect → check for a valid, unexpired agent approval.
2. If none → generate agent keypair + prompt `approveAgent` (single main-wallet signature).
3. All buy/sell orders → signed locally by the agent key.
4. Detect approval expiry/revocation or wallet switch → halt trading and re-approve.

> Note: a "manual signing" fallback (one wallet popup per order) is explicitly **out of
> scope for v1**. It can be added later if ever needed.

---

## 4. Recommended tech stack

| Concern | Choice | Notes |
|---|---|---|
| Language | TypeScript | End-to-end type safety with the Hyperliquid schemas |
| Build/UI | React + Vite | Fast, simple SPA |
| Wallet connection | `wagmi` + `viem` (optionally RainbowKit) | Injected connector covers Rabby & MetaMask; `viem` also does EIP-712 signing |
| Hyperliquid client | **`@nktkas/hyperliquid`** (COMMITTED — see §4.2) | Accepts a `viem` wallet client (main wallet via wagmi) AND a `privateKeyToAccount` (agent key); full spot + agent + testnet coverage |
| Market data | Hyperliquid `info` endpoint (`spotMeta`, `spotMetaAndAssetCtxs`, `allMids`, `l2Book`, `spotClearinghouseState`) + WebSocket for live prices | Poll or subscribe to mids for live P&L; `spotMetaAndAssetCtxs`/`l2Book` feed the liquidity indicators (§6.2) |
| Persistence | `localStorage` keyed by `{network}:{wallet}` (serverless, v1) | Stores tokenset defs + buy records. Backend deferred until cross-device history is needed |
| State | React Query (server/chain state) + light local store (Zustand) | Separate chain state from app bookkeeping |

> Serverless-first keeps it aligned with "no keys, no custody". Add a backend only if you
> later need cross-device sync or a shared audit trail.

### 4.1 Environment — COMMITTED: testnet-first
- Build and validate the **entire flow on Hyperliquid testnet first**. Only switch to
  mainnet once buy/sell/P&L are proven.
- Drive the network with a **single environment config** (`testnet` | `mainnet`) that
  selects: API base URL, WebSocket URL, chain/signing domain, and the agent-approval
  target. No environment-specific logic scattered through the code — one switch.
- Default the app to **testnet** in dev; require an explicit, visible toggle (and a clear
  UI banner showing the active network) to run on mainnet.
- Persisted data (tokensets, lots) must be **scoped by network** as well as wallet, so
  testnet lots never mix with mainnet lots.

### 4.2 Hyperliquid client — COMMITTED: `@nktkas/hyperliquid`
Chosen after evaluating the two Hyperliquid-docs-linked TS SDKs. It maps exactly onto our
committed architecture (agent wallet + wagmi/viem + testnet-first):

- **Dual signer model — the deciding factor.** It accepts either a **`viem` wallet client**
  (or ethers) *or* a **`privateKeyToAccount`**. So:
  - Main wallet (Rabby/MetaMask via wagmi) → a `viem` WalletClient signs the **one**
    `approveAgent` action.
  - The in-memory agent key → a `privateKeyToAccount` signs all buy/sell orders locally,
    no popups. This is precisely §3.
- **`approveAgent` supported:** `exchClient.approveAgent({ agentAddress, agentName })`.
  When operating through the agent, set the SDK's `walletAddress` field to the **master
  account address** (required or some methods fail). Note: the `approveAgent` signature
  uses the **Arbitrum chain domain (chainId 42161)** — verify current behavior.
- **Spot supported:** `info.spot.getSpotMeta()`; spot assets addressed as
  `"NAME:0xtokenId"`. IOC/market emulation via the order `tif: "Ioc"` field.
- **Split clients:** `InfoClient` (read: meta, mids, l2Book, clearinghouse state) and
  `ExchangeClient` (write: orders, approveAgent) — clean separation for our read/sign layers.
- **Testnet:** selectable via transport config → satisfies §4.1's single env switch.
- **Actively maintained:** v0.33.x as of mid-2026, 70+ releases — lower bit-rot risk.

> Fallback if ever needed: a thin custom client over the REST API + `viem` EIP-712 signing.
> Not planned for v1. (`nomeida/hyperliquid` was the runner-up but does not document
> `viem`/`window.ethereum` signing for the master-wallet approval, which our flow needs.)

---

## 5. Data model (app-side bookkeeping)

Persist per connected wallet address **and network** (`{network}:{wallet}` key), so
testnet and mainnet lots never mix (§4.1):

```ts
type Tokenset = {
  id: string;
  name: string;              // e.g. "tokenset1"
  tokens: string[];          // spot token symbols, resolved to asset indices at runtime
  createdAt: number;
};

type BuyRecord = {
  id: string;
  tokensetId: string;
  wallet: string;
  usdcSpent: number;         // intended total, e.g. 100
  legs: BuyLeg[];            // one per token actually filled
  status: "open" | "partially_sold" | "closed";
  createdAt: number;
};

type BuyLeg = {
  token: string;
  assetIndex: number;
  usdcAllocated: number;     // ~ usdcSpent / N (after rounding)
  qtyBought: number;         // filled size
  avgEntryPrice: number;     // USDC per token, from fills
  qtyRemaining: number;      // decreases on partial sells
};
```

> **Lots are independent (committed).** Each buy of a tokenset is its own `BuyRecord`
> (lot), with its own cost basis and `status`. Selling operates on a single lot and never
> mutates another lot. The dashboard may *display* a per-tokenset aggregate, but it is
> always derived from the individual lots — no merged/averaged position is persisted.

P&L is derived, not stored:
- Per leg: `pnl% = (currentMid - avgEntryPrice) / avgEntryPrice * 100`.
- Per tokenset (open position): notional-weighted average of the legs' P&L using
  `qtyRemaining * currentMid` as weights.

---

## 6. Core flows

### 6.1 Connect wallet
1. `wagmi` injected connector → user picks Rabby/MetaMask.
2. Confirm chain/mainnet context; display connected address.
3. Check for an existing valid agent approval; if none, generate the agent keypair and
   prompt `approveAgent` (single main-wallet signature — see §3).
4. Load USDC spot balance (`spotClearinghouseState`) and this wallet's stored tokensets.

### 6.2 Create tokenset
1. User names the set and selects tokens from the `spotMeta` token list (validate each
   has a live USDC spot market).
2. **Show a liquidity indicator per token (REQUIRED)** so the user avoids illiquid tokens
   before committing them to a basket. For each candidate token display, at minimum:
   - **24h notional volume** (`dayNtlVlm` from `spotMetaAndAssetCtxs`).
   - **Bid/ask spread %** (from top of `l2Book` — wide spread = illiquid).
   - **Order-book depth** near mid (sum of `l2Book` size within, e.g., ±1–2% of mid) —
     this is the truest proxy for how much a market buy/sell will slip.
   - A simple **liquidity badge** (e.g. High / Medium / Low, or a warning icon) derived
     from the above thresholds, plus an explicit warning when a selected token is Low.
3. Optionally surface, at compose time, an **estimated slippage** for the planned per-token
   allocation against current book depth, so "poco líquido" is concrete, not abstract.
4. Save `Tokenset` to storage. No chain interaction. (Liquidity is live market data —
   fetch it on demand, do not persist it in the tokenset.)

### 6.3 Buy tokenset (amount in USDC)
1. **Enforce a minimum total up front (COMMITTED policy).** Compute
   `minTotal = minNotional × N` (where `minNotional` is Hyperliquid's current minimum
   order value — fetch/verify it, do not hardcode). Block input below `minTotal` and show
   the required minimum. This guarantees every leg clears the minimum, so the basket is
   always **complete and equally split** — no skipped legs.
2. Input `usdcTotal`. Validate `minTotal <= usdcTotal <= availableUSDC`.
3. `perToken = usdcTotal / N`.
4. For each token: fetch mid, compute `size = perToken / mid`, round to `szDecimals`.
   After rounding, re-check each leg still clears `minNotional` (rounding can nudge a leg
   just under); if any leg fails the post-rounding check, block and prompt a slightly
   higher total rather than skipping the leg.
5. Build an IOC buy order per token with a slippage-bounded limit price.
6. Execute: sign each leg locally with the agent key (no popups).
7. Record fills into a `BuyRecord` with `avgEntryPrice` from actual fills.

### 6.4 Sell a lot (percentage) — COMMITTED: lots are independent
Each buy is a **lot** (`BuyRecord`) and is sold on its own. **A sell always targets one
lot and never touches another lot**, even if both belong to the same tokenset.
1. User selects **one specific open lot** and a percentage (25/50/100 or custom).
2. For each leg in that lot: `sellQty = qtyRemaining * pct`, rounded to `szDecimals`
   (re-check the min-notional rule from §6.3 on the resulting sell size).
3. IOC sell orders with slippage bound.
4. Update `qtyRemaining` per leg **of that lot only**; set that lot's `status` to
   `partially_sold` (pct < 100 or size rounding leaves a remainder) or `closed`.
5. Record realized P&L per leg for the sold portion.

> Note: no cross-lot or "sell entire tokenset at once" action in v1 — selling is
> per-lot. (A convenience "sell all lots" that simply loops per-lot can be added later.)

### 6.5 Monitor / dashboard
- List tokensets. For each tokenset with any open lot:
  - **Aggregate view (display only):** combined P&L% and current notional across its open
    lots — computed from the underlying lots, not stored as a merged position.
  - **Per-lot breakdown:** each open lot with its own entry cost, current value, P&L%,
    and a sell control (25/50/100/custom) that acts on that lot alone.
  - **Per-token row within a lot:** entry price, current mid, qty remaining, P&L%.
- Live-update prices via WS or polling `allMids`.

---

## 7. Edge cases & rules to implement (do not skip)

- **Partial basket fills / rejected signatures:** a buy may fill some legs and not others.
  Never assume atomicity — Hyperliquid has no multi-order atomic bundle. Record whatever
  actually filled; show the user a clear "partial basket" state and let them complete or
  abandon.
- **Minimum notional per leg (policy = require minimum total):** enforce
  `usdcTotal >= minNotional × N` before buying, and re-check each leg after size rounding.
  Never skip legs — always keep the basket complete and equally split (see §6.3).
- **Rounding drift:** rounded sizes mean the sum of leg costs ≠ exactly `usdcTotal`.
  Show the actual USDC spent, not the requested amount.
- **Slippage on illiquid spot tokens:** enforce a max-slippage bound and abort a leg that
  would exceed it.
- **Insufficient USDC / stale balance:** re-check balance right before execution.
- **Agent approval expiry / revocation:** detect and re-prompt for approval.
- **Wallet switched / disconnected mid-flow:** halt and re-sync.
- **Price feed staleness:** guard P&L display when mids are stale.

---

## 8. Security & trust posture

- Never request, store, or transmit the user's main private key. Ever.
- The agent wallet's delegated key is **trade-only** and lives **only in session memory** —
  never written to disk (see §3). Document the trade-only scope in the UI at approval time.
- All state is per-wallet; do not leak one wallet's tokensets/records to another.
- Treat all amounts and sizes as integers/decimals with explicit precision — no float
  drift in order sizing.
- Read-only by default: only sign when the user explicitly triggers buy/sell.

### 8.1 Known v1 limitations (serverless bookkeeping)

- **Cross-tab lot writes are not atomic.** Lot persistence is a localStorage
  read-modify-write. Within a single tab it is race-free (synchronous after a
  fill) and tabs re-sync on the `storage` event, but two tabs trading the **same
  wallet at the same instant** can lose one update's bookkeeping (the on-exchange
  fills remain correct — only local P&L/remaining-qty diverges). Planned fix: a
  cross-tab lock (`navigator.locks`) with re-read/merge inside the lock.
- **Corrupt/unreadable storage reads as empty.** `loadLots` returns `[]` on a
  parse error, which looks like "no positions". Acceptable for v1; a future
  version should distinguish and warn.

### 8.2 Perpetuals — model and caveats

Perps mirror the spot model (create tokensets, app-side lot bookkeeping) but
generalize it to both directions and selectable leverage:

- **Buy** opens or increases a **long**, with user-selectable **1x/2x/3x
  leverage** (gated per asset by `Market.maxLeverage` — options above the cap
  are hidden in the UI, never silently clamped or submitted past the venue's
  limit).
- **Short** (a separate, tokenset/asset-scoped control next to Buy —
  `executeShort`, not part of the per-lot sell control, since opening a short
  has no pre-existing lot) opens or increases a **short**, mirroring the buy
  flow with the same leverage selection and money-safety ordering.
- **Quick-close** (25/50/100%, `executeSell`) stays `reduceOnly` and is
  side-aware: closing a long lot is a plain sell (unchanged); closing a short
  lot **buys to cover** instead of growing the short. No leverage selector on
  close, and `updateLeverage` is never called on this path.
- **Positions net on-exchange.** Hyperliquid keeps ONE netted position per perp
  asset with a blended entry, so multiple app "lots" (long or short) for the
  same asset are an app-side accounting layer over a single real position. A
  directional short sized larger than an existing long nets the position to a
  short in one fill — the exchange nets it, no app-side flip logic is needed.
- **Funding is not reflected in P&L.** P&L is mark-vs-entry (side-aware: a
  short profits as price falls); perp funding payments accrue on the real
  position but are not modeled here. Treat displayed perp P&L as an
  approximation; the authoritative value is on Hyperliquid.
- **No pre-trade reconciliation.** Opening a long or short doesn't check
  existing on-exchange positions for that asset (opened elsewhere, or from
  lost local storage). If the account already holds that asset, the app's lot
  cost basis may not match true net exposure. Planned hardening: read
  `clearinghouseState` positions and warn/reconcile before opening.
- **Leverage is set per asset before opening** (`updateLeverage`, cross
  normally / isolated for assets that disallow cross); if that call fails the
  open aborts before any order is placed. A lot records its `marketType` and
  `side` and cannot be sold on the wrong market.
- **Delisted perps** drop out of the market list, so a held position in a delisted
  asset can't be closed via this UI (Hyperliquid force-settles delistings).

---

## 9. Build roadmap (suggested slices)

0. **Environment switch** (testnet/mainnet config; default testnet, visible network banner — §4.1).
1. **Skeleton + wallet connect** (wagmi/viem, show connected address + network, read USDC balance).
2. **Hyperliquid read layer** (`spotMeta`, `spotMetaAndAssetCtxs`, `allMids`, `l2Book`,
   `spotClearinghouseState`) + token picker **with liquidity indicators** (§6.2).
3. **Tokenset CRUD** (local persistence scoped by network+wallet, no chain).
4. **Signing layer** — agent (API) wallet: keypair generation, `approveAgent`, local signing (§3).
5. **Buy flow** (equal split, sizing, min-notional/slippage guards, fill recording).
6. **Sell flow** (percentage, per-leg qty, record updates).
7. **Dashboard & live P&L** (per-token + per-tokenset).
8. **Edge-case hardening** (partial fills, rounding, staleness).
9. **Polish** (UX for agent-wallet explanation, error states).

---

## 10. Open questions to resolve before coding

- [x] Signing model: **Agent (API) wallet** (Option B). ✅ Decided.
- [x] Agent key persistence: **session-memory only** — never written to disk. ✅ Decided.
- [x] Minimum-notional policy: **require minimum total** (`minNotional × N`), never skip legs. ✅ Decided.
- [x] Persistence: **serverless for v1** (`localStorage`, scoped by network+wallet); backend
      deferred until cross-device history is actually needed. ✅ Decided.
- [x] Multiple open buys of the same tokenset: **track separately as independent lots**;
      each lot sold on its own (100% or %), never affecting other lots. ✅ Decided.
- [x] Hyperliquid client: **`@nktkas/hyperliquid`** — dual signer (viem wallet client for
      `approveAgent` + `privateKeyToAccount` for the agent key), full spot/agent/testnet
      coverage, actively maintained (§4.2). ✅ Decided.
- [x] Testnet-first: **yes** — build/validate on testnet, single env switch to mainnet (§4.1). ✅ Decided.
- [x] Liquidity indicators when composing a tokenset: **required** (24h vol, spread, book depth,
      badge) so illiquid tokens are visible before selection (§6.2). ✅ Decided.

---

## 11. References to confirm (do not code from memory — verify current docs/API)

- Hyperliquid API docs: exchange endpoint, `info` endpoint, spot meta, order/IOC semantics,
  minimum order value, `szDecimals`.
- Liquidity data sources: `spotMetaAndAssetCtxs` (`dayNtlVlm`, mids) and `l2Book`
  (spread + depth) — confirm field names and shapes.
- Agent (API) wallet approval flow and its permission boundaries.
- EIP-712 signing scheme for L1 actions.
- `@nktkas/hyperliquid` docs: `ExchangeClient`/`InfoClient` setup, `approveAgent`,
  `walletAddress` field when using an agent, spot order shape + `tif: "Ioc"`, testnet
  transport. Repo: https://github.com/nktkas/hyperliquid · npm `@nktkas/hyperliquid`.
- Confirm the `approveAgent` signing domain/chainId (reported as Arbitrum 42161).
- Testnet endpoints and faucet.
```
