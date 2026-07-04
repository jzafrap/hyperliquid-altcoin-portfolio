# Documentation

Everything you need to run, use, understand, and extend **Hyperliquid Tokensets** —
a web app for buying, holding, and selling baskets of Hyperliquid spot tokens with
per-lot P&L.

> New here? Start with **[Getting Started](./getting-started.md)**, then the
> **[User Guide](./user-guide.md)**.

## Map

| Doc | Read it when you want to… |
|-----|---------------------------|
| [Getting Started](./getting-started.md) | Install, configure the network, run the app, connect a wallet, deposit, and make your first trade. |
| [User Guide](./user-guide.md) | Learn each feature: create a tokenset, buy, sell, and read the portfolio. |
| [Trading Model](./trading-model.md) | Understand exactly how buys/sells are sized, priced, and recorded. |
| [Architecture](./architecture.md) | See how the code is organized and how data flows. |
| [Security](./security.md) | Understand the key model, what the agent wallet can/can't do, and the trust boundary. |
| [Development](./development.md) | Set up locally, run tests, and follow the contribution workflow. |
| [Hyperliquid Reference](./hyperliquid-reference.md) | Look up the verified API facts and gotchas this app relies on. |

## At a glance

- **Testnet-first.** The app defaults to Hyperliquid testnet; switching to mainnet
  is explicit and shown by a network banner.
- **No keys stored.** Your wallet signs one agent approval; a trade-only key kept
  only in memory signs orders. It cannot withdraw funds.
- **Serverless.** Tokenset definitions and buy lots live in your browser
  (`localStorage`), scoped by network + wallet.

For the original build specification and committed design decisions, see
[`../instructions.md`](../instructions.md).
