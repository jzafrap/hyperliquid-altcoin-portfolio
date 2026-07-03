import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { useAccount, useWalletClient } from "wagmi";
import {
  approveAgent as approveAgentLib,
  clearAgent,
  isAgentApprovedFor,
} from "../lib/agent";

interface AgentState {
  approved: boolean;
  agentAddress?: Address;
}

/**
 * Manage the agent (API) wallet session for the connected wallet (§3).
 *
 * - The agent key lives only in memory; a refresh starts unapproved.
 * - Switching or disconnecting the wallet wipes the agent (lifecycle guard).
 * - `approve()` triggers the single master-wallet signature.
 */
export function useAgent() {
  const { address } = useAccount();
  const { data: walletClient } = useWalletClient();

  const [state, setState] = useState<AgentState>({ approved: false });
  const [isApproving, setIsApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wipe the agent whenever it is not (or no longer) valid for the current wallet.
  useEffect(() => {
    if (!isAgentApprovedFor(address)) {
      clearAgent();
      setState({ approved: false });
      setError(null);
    }
  }, [address]);

  const approve = useCallback(async () => {
    if (!walletClient || !address) return;
    setIsApproving(true);
    setError(null);
    try {
      const session = await approveAgentLib(walletClient, address);
      setState({ approved: true, agentAddress: session.agentAddress });
    } catch (e) {
      clearAgent();
      setState({ approved: false });
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsApproving(false);
    }
  }, [walletClient, address]);

  const revoke = useCallback(() => {
    clearAgent();
    setState({ approved: false });
    setError(null);
  }, []);

  return {
    isApproved: state.approved,
    agentAddress: state.agentAddress,
    approve,
    revoke,
    isApproving,
    error,
    canApprove: Boolean(walletClient && address),
  };
}
