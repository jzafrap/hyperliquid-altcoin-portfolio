# Changelog

Notable changes, newest first. The project is pre-release (testnet); entries are
grouped by date rather than version. PR numbers link the change to its review.

## 2026-07 — Perpetuals

### Added
- **Perpetuals trading (1x)** alongside spot, via a **Spot | Perps** selector
  (#14, #15). Create tokensets, **buy = open a 1x long**, **sell % = reduceOnly
  close**. A `MarketType` dimension runs through markets, orders, funds, storage
  and UI; spot and perp tokensets/lots are stored separately and never mix.
- Docs updated across the site for perps (#16): user guide, trading model,
  architecture, Hyperliquid reference, security.

### Fixed
- **Isolated-margin assets** (#17): perp assets that disallow cross margin
  (`onlyIsolated`/`strictIsolated`, e.g. OX, ZRO, W) were failing with
  *"Cross margin is not allowed for this asset."* Leverage is now set to **1x
  cross or 1x isolated** per asset as required.
- **Partial batch fills were lost** (#18, #19): when one leg of a basket errored
  (e.g. an IOC that couldn't match), the SDK threw and the app recorded nothing —
  even though other legs had filled (money moved, no record). The app now recovers
  per-leg statuses from the thrown error, **records only the filled legs**, and
  shows a *"Couldn't buy X"* warning for the rest. (#19 corrected the nesting path
  the recovery reads.)
- **Unified account funds** (#20): after closing perps, freed USDC lands in
  Hyperliquid's **unified balance** (surfaced in the *spot* clearinghouse state).
  The app read only the perp `withdrawable` and showed 0. Perp buying power is now
  `max(perp withdrawable, spot USDC)`, correct in both unified and standard modes.

## 2026-07 — Agent signing & UX

### Fixed
- **Approval worked on any wallet chain** (#11): the *Approve trading agent* button
  was disabled when the wallet was on an unconfigured network; the signer is now
  built from the connector's EIP-1193 provider, independent of chain.
- **Rabby EIP-712 signing** (#12): stopped pinning `signatureChainId` to Arbitrum
  (Rabby rejects a domain chainId that differs from the active chain). The SDK now
  derives it from the wallet's chain; Hyperliquid accepts any.

### Added
- **Hide small balances** toggle in the Portfolio (#13): hides lots worth under
  $5; never hides a lot that can't be priced.

## 2026-07 — Foundation (slices 0–9)

Initial end-to-end app: testnet-first environment switch, wallet connect (no keys),
agent (API) wallet signing, tokenset CRUD, token picker with liquidity indicators,
equal-split market buy, per-lot percentage sell, live P&L dashboard, and edge-case
guards (insufficient funds, price staleness, partial baskets). Full documentation
under [`docs/`](./docs/README.md) (#10). Every money-moving change was reviewed
adversarially before merge.
