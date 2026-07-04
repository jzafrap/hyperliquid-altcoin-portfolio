# Getting Started

Get the app running and make your first tokenset trade on **testnet** in a few minutes.

## Quick path

1. **Install**
   ```bash
   npm install
   ```
2. **Configure the network** (defaults to testnet)
   ```bash
   cp .env.example .env
   ```
3. **Run**
   ```bash
   npm run dev
   ```
   Open the printed local URL. The header shows a **Testnet** banner.
4. **Connect** a wallet (Rabby or MetaMask) → **Enable trading** (one signature) →
   **Create a tokenset** → **Buy** → watch **P&L** → **Sell**.

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Node.js 20+ | Developed on Node 25; any modern LTS works. |
| A browser wallet | Rabby or MetaMask (any injected wallet). |
| Hyperliquid spot USDC | You must have USDC in your Hyperliquid **spot** balance to buy. On testnet, use the Hyperliquid testnet faucet/app. |

## Step by step

### 1. Choose the network

The whole app is driven by one variable in `.env`:

```bash
VITE_HL_NETWORK=testnet   # or "mainnet"
```

Leave it as `testnet` until you have validated the flow. The banner in the header
(and the footer) always shows the active network — mainnet is highlighted.

### 2. Connect your wallet

Click **Connect wallet**. The app uses the injected connector, so Rabby and
MetaMask both work. Your wallet address appears, truncated, in the header. **No
private key ever leaves your wallet.**

### 3. Deposit USDC (prerequisite)

Buying requires USDC in your Hyperliquid **spot** balance. If your balance is `0`,
the app shows a link to deposit on the Hyperliquid app for the active network.
Bridging/depositing happens on Hyperliquid, not in this app. See
[Trading Model → Prerequisites](./trading-model.md#prerequisites).

### 4. Enable trading (approve the agent)

Click **Approve trading agent**. Your wallet signs **once**. This creates a
delegated, **trade-only** key held only in memory that signs your orders without
further popups. It **cannot withdraw or move your funds**. A page refresh clears
it and you re-approve. Details: [Security](./security.md).

### 5. Compose and buy a tokenset

- In **Tokens**, search and select spot tokens. Each row shows a liquidity badge;
  selected tokens show live spread and depth.
- Name the set and click **Create tokenset**.
- On the saved set, enter a USDC amount and click **Buy**. The amount is split
  equally across the tokens. Minimum is `10 USDC × number of tokens`.

### 6. Monitor and sell

- **Portfolio** shows open positions grouped by tokenset with live P&L per token,
  per lot, and per tokenset.
- Each lot has **Sell 25 / 50 / 100%** controls that act on that lot alone.

## Verify your setup

- [ ] `npm run dev` serves the app and the network banner matches `.env`.
- [ ] Wallet connects and the address shows in the header.
- [ ] `npm test` passes and `npm run build` succeeds.

## Next step

Read the **[User Guide](./user-guide.md)** for the full feature walkthrough, or
**[Trading Model](./trading-model.md)** to understand what happens under the hood.
