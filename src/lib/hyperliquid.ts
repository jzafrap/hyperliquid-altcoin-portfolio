import {
  ExchangeClient,
  HttpTransport,
  InfoClient,
} from "@nktkas/hyperliquid";
import type { AbstractWallet } from "@nktkas/hyperliquid/signing";
import { ENV } from "../config/env";

/**
 * Hyperliquid client factory (instructions.md §4.2).
 *
 * - Transport targets the active network via the single env switch (§4.1).
 * - InfoClient  → read-only market/account data (mids, l2Book, balances).
 * - ExchangeClient → signed write actions (approveAgent, orders). Accepts either
 *   a viem WalletClient (main wallet, for approveAgent) or a viem local account
 *   built from the in-memory agent key (for orders) — the dual-signer model (§3).
 */

/** Signature domain chain id as the `0x`-prefixed hex the SDK expects. */
const SIGNATURE_CHAIN_ID = `0x${ENV.signatureChainId.toString(16)}` as const;

function makeTransport(): HttpTransport {
  return new HttpTransport({ isTestnet: ENV.isTestnet });
}

// The InfoClient is stateless and read-only, so a singleton is fine.
let infoClientSingleton: InfoClient | null = null;

export function getInfoClient(): InfoClient {
  if (!infoClientSingleton) {
    infoClientSingleton = new InfoClient({ transport: makeTransport() });
  }
  return infoClientSingleton;
}

/**
 * Build an ExchangeClient bound to a specific signer.
 * `wallet` may be a viem WalletClient (main wallet) or a viem local account
 * (agent key). We keep the signer out of module state — callers own its lifecycle
 * (the agent key must live only in session memory, §3).
 */
export function makeExchangeClient(wallet: AbstractWallet): ExchangeClient {
  return new ExchangeClient({
    transport: makeTransport(),
    wallet,
    signatureChainId: SIGNATURE_CHAIN_ID,
  });
}
