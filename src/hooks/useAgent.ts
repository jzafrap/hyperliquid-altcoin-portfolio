import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { createWalletClient, custom, type EIP1193Provider } from "viem";
import { useAccount } from "wagmi";
import {
  approveAgent as approveAgentLib,
  clearAgent,
  getAgentSession,
  getSnapshot,
  subscribe,
} from "../lib/agent";

function sameAddress(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

/**
 * Manage the agent (API) wallet session for the connected wallet (§3).
 *
 * - Reads reactive state from the agent store, so every consumer stays in sync.
 * - The agent key lives only in memory; a refresh starts unapproved.
 * - Switching or disconnecting the wallet wipes any agent bound to a different
 *   master, and "approved" is only reported when the agent matches the connected
 *   wallet — closing the stale-agent window.
 *
 * The signer is built at approve time from the connector's EIP-1193 provider —
 * NOT wagmi's chain-gated useWalletClient — because approveAgent only signs
 * EIP-712 typed data (with an Arbitrum domain the SDK sets itself), so the
 * wallet's active network is irrelevant. This lets approval work regardless of
 * which chain the wallet happens to be on.
 */
export function useAgent() {
  const { address, connector, isConnected } = useAccount();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wipe any agent not bound to the currently connected wallet (lifecycle guard).
  useEffect(() => {
    const s = getAgentSession();
    if (s !== null && !sameAddress(s.masterAddress, address)) {
      clearAgent();
    }
    setError(null);
  }, [address]);

  const approve = useCallback(async () => {
    if (!address || !connector) return;
    setIsApproving(true);
    setError(null);
    try {
      const provider = (await connector.getProvider()) as EIP1193Provider;
      // Chain-agnostic signer: signs typed data via the wallet on any network.
      const walletClient = createWalletClient({
        account: address,
        transport: custom(provider),
      });
      await approveAgentLib(walletClient, address);
      // Approval state flows through the reactive snapshot — nothing to set here.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsApproving(false);
    }
  }, [address, connector]);

  const revoke = useCallback(() => {
    clearAgent();
    setError(null);
  }, []);

  // Only treat as approved when the snapshot's master matches the live wallet.
  const isApproved =
    snapshot.approved && sameAddress(snapshot.masterAddress, address);

  return {
    isApproved,
    agentAddress: isApproved ? snapshot.agentAddress : undefined,
    approve,
    revoke,
    isApproving,
    error,
    canApprove: Boolean(isConnected && address && connector),
  };
}
