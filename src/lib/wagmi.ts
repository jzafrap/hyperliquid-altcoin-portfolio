import { createConfig, http } from "wagmi";
import { arbitrum, arbitrumSepolia } from "wagmi/chains";
import { injected } from "wagmi/connectors";

/**
 * wagmi config for wallet connection (instructions.md §4, §6.1).
 *
 * The injected connector covers both Rabby and MetaMask. We only ever ask the
 * wallet to SIGN typed data (the agent approval, §3) — we never send EVM
 * transactions from here — so the configured chains exist purely to give the
 * wallet a valid EIP-712 signature domain. Hyperliquid signs L1 actions against
 * an Arbitrum domain, hence Arbitrum One (mainnet) + Arbitrum Sepolia (testnet).
 *
 * IMPORTANT: these EVM chains are NOT the app's Hyperliquid network. The active
 * Hyperliquid network (testnet/mainnet) lives in ENV (config/env.ts).
 */
export const wagmiConfig = createConfig({
  chains: [arbitrum, arbitrumSepolia],
  connectors: [injected()],
  transports: {
    [arbitrum.id]: http(),
    [arbitrumSepolia.id]: http(),
  },
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
