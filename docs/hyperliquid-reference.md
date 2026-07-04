# Hyperliquid Reference

The concrete Hyperliquid facts and gotchas this app relies on — each verified
against the live testnet or the `@nktkas/hyperliquid` types during development.
Re-verify against current docs before mainnet.

## Endpoints (by network)

| | Testnet | Mainnet |
|---|---------|---------|
| REST API | `https://api.hyperliquid-testnet.xyz` | `https://api.hyperliquid.xyz` |
| WebSocket | `wss://api.hyperliquid-testnet.xyz/ws` | `wss://api.hyperliquid.xyz/ws` |
| Web app | `https://app.hyperliquid-testnet.xyz` | `https://app.hyperliquid.xyz` |
| Signature chain id | `421614` (Arbitrum Sepolia) | `42161` (Arbitrum One) |

The SDK's `HttpTransport({ isTestnet })` selects endpoints automatically.

## Spot metadata

- `info.spotMetaAndAssetCtxs()` returns `[meta, assetCtxs]`.
- **`assetCtxs` is NOT positionally aligned with `meta.universe`.** Their lengths
  differ (testnet: 1302 universes vs 2066 contexts). **Match by the shared `coin`
  key** (`ctx.coin === universe.name`), not by index. Verified: 1302/1302 match by
  name, 0 missing.
- USDC is a token named `"USDC"` at index `0`. A "USDC-quoted market" is any
  universe whose quote token index is USDC's.

## Spot asset id

```
assetId = 10000 + universe.index
```

Use the `.index` field, **not** the array position — they differ for ~1298/1302
pairs. Verified: `PURR/USDC` (index 0) → `10000`; `@1` (index 1) → `10001`. Pair
names like `@N` always satisfy `N === index`.

## Orders

- Placed via `ExchangeClient.order({ orders, grouping: "na" })` — a batch of order
  objects. **No atomic multi-order bundle**: legs fill independently.
- Order object:
  ```
  { a: assetId, b: isBuy, p: priceString, s: sizeString,
    r: false, t: { limit: { tif: "Ioc" } } }
  ```
- "Market" orders are emulated with **IOC** limit orders priced across the book.
- Response: `res.response.data.statuses[]`, aligned with the submitted orders; each
  is `{ filled: { totalSz, avgPx, oid } } | { error } | { resting } |
  "waitingForFill" | "waitingForTrigger"`.

## Price & size rules

- Prices: ≤ **5 significant figures** and ≤ **`8 − szDecimals`** decimal places for
  spot. Integer prices always allowed.
- Sizes: rounded to the token's `szDecimals`.
- Send both as **plain decimal strings**. `String(5.1e-7)` → `"5.1e-7"` is rejected
  — use fixed-notation formatting (matters for low-priced tokens).
- **Minimum order value** ≈ **$10** notional. Treated as a tunable constant;
  **verify against live docs before mainnet.**

## Agent (API) wallet

- Approve via `ExchangeClient.approveAgent({ agentAddress, agentName })`. The SDK
  auto-fills `signatureChainId`, `hyperliquidChain` (from `isTestnet`), and `nonce`.
- The master wallet signs the approval; the agent key signs subsequent orders.
- The agent is **trade-only** — it cannot withdraw/transfer.

## SDK dual-signer model (`@nktkas/hyperliquid`)

`ExchangeClient`'s `wallet` accepts either:

- a **viem WalletClient** (from wagmi) — satisfies `AbstractViemJsonRpcAccount`
  (`signTypedData` / `getAddresses` / `getChainId`) → used for `approveAgent`; or
- a **`privateKeyToAccount`** — satisfies `AbstractViemLocalAccount` → used by the
  in-memory agent key for orders.

`InfoClient` (reads) and `ExchangeClient` (signed writes) are separate.

## Verifying request format without funds

A well-formed request signed by an unfunded/unknown key returns a **server business
error** (e.g. `"Must deposit before performing actions"` or `"User or API Wallet …
does not exist"`), not a local `ValidationError`. That distinction confirms the
request shape and signing path are correct — used throughout development to validate
`approveAgent` and `order` construction on testnet.

## Environment / tooling gotchas

- **Vitest must be v3** with Vite 6 — Vitest 2 nests its own Vite copy and breaks
  types.
- **jsdom's `localStorage` is a non-functional stub** in this runtime (no
  `setItem`/`clear`). The test setup installs a small in-memory `Storage`.

## Sources

- Hyperliquid docs: https://hyperliquid.gitbook.io/hyperliquid-docs
- SDK: https://github.com/nktkas/hyperliquid · `npm i @nktkas/hyperliquid`
