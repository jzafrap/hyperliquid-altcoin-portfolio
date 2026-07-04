/**
 * Single environment switch for the whole app (see instructions.md §4.1).
 *
 * Everything network-dependent (Hyperliquid REST/WS endpoints, the SDK testnet
 * flag, the EVM chain used to sign the agent approval, and the storage namespace)
 * derives from ONE value: the active Hyperliquid network.
 *
 * COMMITTED policy: default to testnet. Switching to mainnet must be explicit.
 */

export type HlNetwork = "testnet" | "mainnet";

/** Read the desired network from the Vite env, defaulting to testnet-first. */
function resolveNetwork(): HlNetwork {
  const raw = import.meta.env.VITE_HL_NETWORK?.toLowerCase();
  return raw === "mainnet" ? "mainnet" : "testnet";
}

export interface NetworkConfig {
  network: HlNetwork;
  isTestnet: boolean;
  /** Hyperliquid REST API base URL. */
  apiUrl: string;
  /** Hyperliquid WebSocket URL for live market data. */
  wsUrl: string;
  /**
   * EVM chain id used as the EIP-712 signature domain for user-signed L1 actions
   * (e.g. approveAgent). Hyperliquid signs these against an Arbitrum domain.
   * Verify against current Hyperliquid behavior (instructions.md §4.2, §11).
   */
  signatureChainId: number;
  /** Human label for the network banner. */
  label: string;
  /** Hyperliquid web app (for depositing/bridging USDC — a prerequisite, §2). */
  webAppUrl: string;
}

const CONFIGS: Record<HlNetwork, NetworkConfig> = {
  testnet: {
    network: "testnet",
    isTestnet: true,
    apiUrl: "https://api.hyperliquid-testnet.xyz",
    wsUrl: "wss://api.hyperliquid-testnet.xyz/ws",
    signatureChainId: 421614, // Arbitrum Sepolia
    label: "Testnet",
    webAppUrl: "https://app.hyperliquid-testnet.xyz",
  },
  mainnet: {
    network: "mainnet",
    isTestnet: false,
    apiUrl: "https://api.hyperliquid.xyz",
    wsUrl: "wss://api.hyperliquid.xyz/ws",
    signatureChainId: 42161, // Arbitrum One
    label: "Mainnet",
    webAppUrl: "https://app.hyperliquid.xyz",
  },
};

export const ENV: NetworkConfig = CONFIGS[resolveNetwork()];

/** Namespace for persisted data, scoped by network (instructions.md §5). */
export function storageNamespace(wallet: string): string {
  return `hl-tokensets:${ENV.network}:${wallet.toLowerCase()}`;
}
