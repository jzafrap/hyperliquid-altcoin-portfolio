import type { Address } from "viem";
import { getAgentExchangeClient } from "./agent";
import {
  addLot,
  anyLegFilled,
  buildLegsFromStatuses,
  loadLots,
  makeBuyRecord,
  saveLots,
  type BuyRecord,
  type OrderStatus,
} from "./lots";
import {
  buildBuyOrders,
  planBuy,
  type BuyMarketInput,
  type BuyPlan,
} from "./orders";

export interface ExecuteBuyArgs {
  masterAddress: Address;
  tokensetId: string;
  tokensetName: string;
  /** Resolved markets for the tokenset's tokens, in basket order. */
  markets: BuyMarketInput[];
  usdcTotal: number;
  slippage?: number;
}

export interface ExecuteBuyResult {
  plan: BuyPlan;
  record: BuyRecord;
  /** True if some legs filled and others did not, or a leg under-filled (§7). */
  partial: boolean;
  /** False if the order filled but the lot could not be persisted (surface loudly). */
  persisted: boolean;
}

/** Stable-ish unique id, resilient to environments without crypto.randomUUID. */
function safeId(): string {
  const uuid = globalThis.crypto?.randomUUID;
  if (uuid) return uuid.call(globalThis.crypto);
  return `lot-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/**
 * Execute an equal-split market buy for a tokenset (§6.3):
 * plan → guard → IOC orders signed by the agent → record the lot.
 *
 * Ordering of failure modes matters for money safety:
 * - Invalid plan or no fill at all → throw BEFORE anything executes (safe to retry).
 * - Once ANY leg fills, never throw: return the recorded lot with `partial`/
 *   `persisted` flags so a real fill is never mistaken for "nothing happened"
 *   (which would invite a double-spend retry).
 */
export async function executeBuy(args: ExecuteBuyArgs): Promise<ExecuteBuyResult> {
  const { masterAddress, tokensetId, tokensetName, markets, usdcTotal, slippage } =
    args;

  const plan = planBuy(markets, usdcTotal, slippage);
  if (!plan.ok) throw new Error(plan.errors.join("; "));

  // Trust boundary: verifies an approved agent is bound to this exact master.
  const client = getAgentExchangeClient(masterAddress);
  const orders = buildBuyOrders(plan);
  const res = await client.order({ orders, grouping: "na" });

  const statuses = (res.response?.data?.statuses ?? []) as OrderStatus[];
  const legs = buildLegsFromStatuses(plan, statuses);

  // Nothing filled → IOC canceled, no funds moved → safe to report failure.
  if (!anyLegFilled(legs)) {
    const firstError = legs.find((l) => l.error)?.error;
    throw new Error(`Buy did not fill${firstError ? `: ${firstError}` : ""}`);
  }

  // From here a real fill has occurred — do NOT throw; report via flags instead.
  const record = makeBuyRecord(
    { tokensetId, tokensetName, wallet: masterAddress, legs },
    safeId(),
    Date.now(),
  );

  let persisted = true;
  try {
    saveLots(masterAddress, addLot(loadLots(masterAddress), record));
  } catch {
    persisted = false;
  }

  // Partial if any leg didn't fill or under-filled its planned size.
  const partial = legs.some(
    (l, i) => l.qtyBought <= 0 || l.qtyBought < plan.legs[i].size - 1e-12,
  );

  return { plan, record, partial, persisted };
}
