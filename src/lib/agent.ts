import type { AbstractWallet } from "@nktkas/hyperliquid/signing";
import type { Address } from "viem";
import {
  generatePrivateKey,
  privateKeyToAccount,
  type PrivateKeyAccount,
} from "viem/accounts";
import { makeExchangeClient } from "./hyperliquid";

/**
 * Agent (API) wallet session — the committed signing model (instructions.md §3).
 *
 * The delegated agent key is generated and held ONLY in module memory. It is
 * never written to localStorage/sessionStorage/cookies/IndexedDB, never logged,
 * and is discarded on disconnect/refresh (a refresh requires re-approval). The
 * key is trade-only: it can place/cancel orders but cannot withdraw funds.
 *
 * Flow: the master wallet signs one `approveAgent` action; thereafter orders are
 * signed locally by this agent key with no wallet popups.
 */

const AGENT_NAME = "tokensets";

export interface AgentSession {
  masterAddress: Address;
  /** viem local account wrapping the in-memory agent private key. */
  account: PrivateKeyAccount;
  agentAddress: Address;
  /** Set once the master wallet has approved this agent; null until then. */
  approvedAt: number | null;
}

// In-memory ONLY. Deliberately a module-scoped variable, never serialized.
let session: AgentSession | null = null;

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Generate a fresh in-memory agent key bound to a master address (unapproved). */
export function generateAgent(masterAddress: Address): AgentSession {
  const account = privateKeyToAccount(generatePrivateKey());
  session = {
    masterAddress,
    account,
    agentAddress: account.address,
    approvedAt: null,
  };
  return session;
}

export function getAgentSession(): AgentSession | null {
  return session;
}

/** Wipe the agent key from memory (disconnect, wallet switch, or manual revoke). */
export function clearAgent(): void {
  session = null;
}

/** True when an approved agent exists and is bound to the given master. */
export function isAgentApprovedFor(masterAddress: Address | undefined): boolean {
  return (
    session !== null &&
    masterAddress !== undefined &&
    sameAddress(session.masterAddress, masterAddress) &&
    session.approvedAt !== null
  );
}

/**
 * Approve an agent for `masterAddress`, signed ONCE by the master wallet.
 * (Re)generates the key if none exists or it is bound to a different master.
 * Resolves to the approved session; throws if the approval action fails.
 */
export async function approveAgent(
  masterWallet: AbstractWallet,
  masterAddress: Address,
): Promise<AgentSession> {
  if (session === null || !sameAddress(session.masterAddress, masterAddress)) {
    generateAgent(masterAddress);
  }
  const current = session!;

  // Signed by the MASTER wallet (one popup). The SDK throws on an error response.
  const exchange = makeExchangeClient(masterWallet);
  await exchange.approveAgent({
    agentAddress: current.agentAddress,
    agentName: AGENT_NAME,
  });

  current.approvedAt = Date.now();
  return current;
}

/**
 * ExchangeClient that signs with the in-memory agent key — used to place/cancel
 * orders without wallet popups (buy/sell flow, slices 5+). Throws if there is no
 * approved agent session (caller must approve first).
 */
export function getAgentExchangeClient() {
  if (session === null || session.approvedAt === null) {
    throw new Error("No approved agent session — approve a trading agent first");
  }
  return makeExchangeClient(session.account);
}
