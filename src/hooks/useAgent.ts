import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useAccount, useWalletClient } from "wagmi";
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
 */
export function useAgent() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();
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
    if (!walletClient || !address) return;
    setIsApproving(true);
    setError(null);
    try {
      await approveAgentLib(walletClient, address);
      // Approval state flows through the reactive snapshot — nothing to set here.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsApproving(false);
    }
  }, [walletClient, address]);

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
    canApprove: Boolean(walletClient && address),
  };
}
