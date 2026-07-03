import type { ExchangeClient } from "@nktkas/hyperliquid";
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
 * The delegated agent key is generated and held ONLY in this module's memory. It
 * is never persisted (localStorage/sessionStorage/cookies/IndexedDB), never
 * logged, never placed in serializable React state, and is discarded on
 * disconnect/refresh (a refresh requires re-approval). The key is trade-only.
 *
 * State is exposed reactively via a subscribe/getSnapshot pair (useSyncExternalStore)
 * so every consumer sees one consistent, live view — the module variable is the
 * single source of truth. Only the public snapshot (booleans + addresses) is
 * exposed to React; the private key never leaves this module.
 */

const AGENT_NAME = "tokensets";

/** Trade-only surface of the ExchangeClient exposed for order flow (least privilege). */
export type TradingClient = Pick<
  ExchangeClient,
  "order" | "cancel" | "cancelByCloid"
>;

export interface AgentSession {
  masterAddress: Address;
  /** viem local account wrapping the in-memory agent private key. */
  account: PrivateKeyAccount;
  agentAddress: Address;
  /** Set once the master wallet has approved this agent; null until then. */
  approvedAt: number | null;
}

/** Public, key-free view of the session for the UI. */
export interface AgentSnapshot {
  approved: boolean;
  agentAddress?: Address;
  masterAddress?: Address;
}

const NO_AGENT: AgentSnapshot = { approved: false };

// In-memory ONLY. The single source of truth; never serialized.
let session: AgentSession | null = null;
let snapshot: AgentSnapshot = NO_AGENT;
const listeners = new Set<() => void>();

function sameAddress(a: string, b: string): boolean {
  return a.toLowerCase() === b.toLowerCase();
}

/** Recompute the public snapshot and notify subscribers. */
function publish(): void {
  snapshot =
    session !== null && session.approvedAt !== null
      ? {
          approved: true,
          agentAddress: session.agentAddress,
          masterAddress: session.masterAddress,
        }
      : NO_AGENT;
  for (const listener of listeners) listener();
}

// --- Reactive store (for useSyncExternalStore) -----------------------------

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): AgentSnapshot {
  return snapshot;
}

// --- Session management -----------------------------------------------------

export function getAgentSession(): AgentSession | null {
  return session;
}

/** Wipe the agent key from memory (disconnect, wallet switch, or manual revoke). */
export function clearAgent(): void {
  if (session === null) return;
  session = null;
  publish();
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

/** Generate a fresh in-memory agent key bound to a master address (unapproved). */
export function generateAgent(masterAddress: Address): AgentSession {
  const account = privateKeyToAccount(generatePrivateKey());
  session = {
    masterAddress,
    account,
    agentAddress: account.address,
    approvedAt: null,
  };
  publish();
  return session;
}

// De-duplicate concurrent approvals for the same master (avoids double popups
// and last-write-wins races on the shared session).
let inFlight: { master: string; promise: Promise<AgentSession> } | null = null;

/**
 * Approve an agent for `masterAddress`, signed ONCE by the master wallet.
 * Short-circuits if already approved. (Re)generates the key if none exists or it
 * is bound to a different master. If the connected wallet changes during the
 * (async) signature, the stale result is discarded rather than applied.
 */
export async function approveAgent(
  masterWallet: AbstractWallet,
  masterAddress: Address,
): Promise<AgentSession> {
  if (isAgentApprovedFor(masterAddress)) return session!;
  if (inFlight !== null && sameAddress(inFlight.master, masterAddress)) {
    return inFlight.promise;
  }

  const promise = (async (): Promise<AgentSession> => {
    if (session === null || !sameAddress(session.masterAddress, masterAddress)) {
      generateAgent(masterAddress);
    }
    const target = session!;

    // Signed by the MASTER wallet (one popup). The SDK throws on an error response.
    const exchange = makeExchangeClient(masterWallet);
    await exchange.approveAgent({
      agentAddress: target.agentAddress,
      agentName: AGENT_NAME,
    });

    // Apply only if this exact session is still current (wallet didn't change).
    if (session !== target || !sameAddress(target.masterAddress, masterAddress)) {
      throw new Error("Wallet changed during approval — please approve again");
    }
    target.approvedAt = Date.now();
    publish();
    return target;
  })();

  inFlight = { master: masterAddress, promise };
  try {
    return await promise;
  } finally {
    if (inFlight?.promise === promise) inFlight = null;
  }
}

/**
 * Trade-only ExchangeClient signed by the in-memory agent key (buy/sell flow).
 * Requires the CURRENT master address and verifies the approved agent is bound
 * to it — this is the trust boundary (do not rely on UI lifecycle effects).
 * Throws if there is no approved agent for that master.
 */
export function getAgentExchangeClient(masterAddress: Address): TradingClient {
  if (!isAgentApprovedFor(masterAddress)) {
    throw new Error(
      "No approved agent for the connected wallet — approve a trading agent first",
    );
  }
  return makeExchangeClient(session!.account);
}
