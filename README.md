# Hyperliquid Tokensets

Web app to assemble, buy, hold, and sell **baskets of spot tokens ("tokensets")** on
Hyperliquid, using a browser wallet (Rabby / MetaMask) for authentication, with
per-token and per-lot P&L tracking.

> **Testnet-first.** The app defaults to Hyperliquid **testnet**. Switching to mainnet is
> explicit (`VITE_HL_NETWORK=mainnet`) and shown by an always-visible network banner.

## Status

Early development. Roadmap slices 0–1 done: environment switch, wallet connect
(Rabby/MetaMask, no keys stored), and live USDC spot balance.

See [`instructions.md`](./instructions.md) for the full architecture, committed decisions,
and build roadmap.

## Stack

React 19 · Vite · TypeScript · wagmi + viem · [`@nktkas/hyperliquid`](https://github.com/nktkas/hyperliquid) · TanStack Query · Zustand · Vitest

## Getting started

```bash
npm install
cp .env.example .env   # defaults to testnet
npm run dev
```

Other scripts:

```bash
npm run typecheck   # tsc -b
npm test            # vitest run
npm run build       # production build
```

## Security posture

- The user's main private key is never requested, stored, or transmitted.
- Trading uses a Hyperliquid **agent (API) wallet**: the main wallet signs one approval;
  a delegated, trade-only key (kept **only in session memory**) signs orders. It cannot
  withdraw funds. See `instructions.md` §3.
