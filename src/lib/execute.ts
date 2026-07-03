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
  /** True if some legs filled and others did not (partial basket, §7). */
  partial: boolean;
}

/**
 * Execute an equal-split market buy for a tokenset (§6.3):
 * plan → guard → IOC orders signed by the agent → record the lot.
 *
 * Never assumes atomicity: a partial basket is recorded as-is (filled legs kept,
 * failed legs marked) and surfaced via `partial`. Throws only if the plan is
 * invalid or nothing filled at all.
 */
export async function executeBuy(args: ExecuteBuyArgs): Promise<ExecuteBuyResult> {
  const { masterAddress, tokensetId, tokensetName, markets, usdcTotal, slippage } =
    args;

  const plan = planBuy(markets, usdcTotal);
  if (!plan.ok) throw new Error(plan.errors.join("; "));

  // Trust boundary: verifies an approved agent is bound to this exact master.
  const client = getAgentExchangeClient(masterAddress);
  const orders = buildBuyOrders(plan, slippage);
  const res = await client.order({ orders, grouping: "na" });

  const statuses = res.response.data.statuses as OrderStatus[];
  const legs = buildLegsFromStatuses(plan, statuses);

  if (!anyLegFilled(legs)) {
    const firstError = legs.find((l) => l.error)?.error;
    throw new Error(
      `Buy did not fill${firstError ? `: ${firstError}` : ""}`,
    );
  }

  const record = makeBuyRecord(
    { tokensetId, tokensetName, wallet: masterAddress, legs },
    crypto.randomUUID(),
    Date.now(),
  );
  saveLots(masterAddress, addLot(loadLots(masterAddress), record));

  return {
    plan,
    record,
    partial: legs.some((l) => l.qtyBought === 0),
  };
}
