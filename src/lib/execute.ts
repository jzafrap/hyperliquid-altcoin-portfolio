import type { Address } from "viem";
import { getAgentExchangeClient, type TradingClient } from "./agent";
import {
  addLot,
  anyLegFilled,
  applySellFills,
  buildLegsFromStatuses,
  loadLots,
  makeBuyRecord,
  replaceLot,
  saveLots,
  type BuyRecord,
  type OrderStatus,
  type SellFill,
} from "./lots";
import type { MarketType } from "./markets";
import {
  buildOpenOrders,
  planBuy,
  type BuyLegPlan,
  type BuyMarketInput,
  type BuyPlan,
  type OrderObject,
} from "./orders";
import {
  buildSellOrders,
  planSell,
  type SellMarketInput,
  type SellPlan,
} from "./sell";

/** A leg that did not fill, with the reason to surface to the user. */
export interface FailedLeg {
  token: string;
  error: string;
}

/**
 * Recover per-order statuses from a thrown order error. The SDK throws
 * ApiRequestError when ANY leg in a batch errors — even if others filled — but
 * the raw response (with every leg's status) is attached to `error.response`.
 *
 * That raw response is the FULL exchange envelope
 * `{ status: "ok", response: { type: "order", data: { statuses: [...] } } }`,
 * so the statuses live at `error.response.response.data.statuses`. We also check
 * the shallower path defensively in case the shape ever changes.
 */
function statusesFromOrderError(e: unknown): OrderStatus[] | null {
  const resp = (e as { response?: unknown })?.response as
    | {
        data?: { statuses?: unknown };
        response?: { data?: { statuses?: unknown } };
      }
    | undefined;
  const statuses = resp?.response?.data?.statuses ?? resp?.data?.statuses;
  return Array.isArray(statuses) ? (statuses as OrderStatus[]) : null;
}

/**
 * Place a batch order and return per-leg statuses, treating a bulk-partial
 * (some filled, some errored) as success by recovering statuses from the throw.
 * Rethrows genuine failures (no recoverable statuses).
 */
async function placeOrders(
  client: { order: TradingClient["order"] },
  orders: OrderObject[],
): Promise<OrderStatus[]> {
  try {
    const res = await client.order({ orders, grouping: "na" });
    return (res.response?.data?.statuses ?? []) as OrderStatus[];
  } catch (e) {
    const recovered = statusesFromOrderError(e);
    if (recovered) return recovered;
    throw e;
  }
}

export interface ExecuteBuyArgs {
  masterAddress: Address;
  marketType: MarketType;
  tokensetId: string;
  tokensetName: string;
  /** Resolved markets for the tokenset's tokens, in basket order. */
  markets: BuyMarketInput[];
  usdcTotal: number;
  slippage?: number;
  /** Current available funds (spot USDC or perp margin) — re-checked here. */
  availableUsdc?: number;
  /** Perp leverage (1x-3x, per asset maxLeverage); ignored for spot. Defaults to 1. */
  leverage?: number;
}

export interface ExecuteBuyResult {
  plan: BuyPlan;
  record: BuyRecord;
  /** True if some legs filled and others did not, or a leg under-filled (§7). */
  partial: boolean;
  /** False if the order filled but the lot could not be persisted (surface loudly). */
  persisted: boolean;
  /** Legs that did not buy, with reasons — surfaced as a warning. */
  failed: FailedLeg[];
}

/** Stable-ish unique id, resilient to environments without crypto.randomUUID. */
function safeId(): string {
  const uuid = globalThis.crypto?.randomUUID;
  if (uuid) return uuid.call(globalThis.crypto);
  return `lot-${Date.now()}-${Math.floor(Math.random() * 1e9)}`;
}

/**
 * Set per-asset perp leverage before opening a position, grouped by whether the
 * asset disallows cross margin ("Cross margin is not allowed for this asset").
 * Shared by `executeBuy` and `executeShort` — leverage is a risk setting keyed
 * by asset, not by position direction, so both open paths group and set it the
 * same way. Idempotent; always called before any fill.
 */
async function setPerpLeverage(
  client: Pick<TradingClient, "updateLeverage">,
  legs: Pick<BuyLegPlan, "assetId" | "isolatedOnly">[],
  leverage: number,
): Promise<void> {
  const isolatedByAsset = new Map<number, boolean>();
  for (const leg of legs) {
    isolatedByAsset.set(leg.assetId, leg.isolatedOnly === true);
  }
  for (const [asset, isolatedOnly] of isolatedByAsset) {
    await client.updateLeverage({
      asset,
      isCross: !isolatedOnly,
      leverage,
    });
  }
}

/**
 * Open or increase a position for a tokenset (§6.3, generalized to both
 * directions): plan → guard → per-asset leverage → IOC orders signed by the
 * agent → record the lot. Shared implementation for `executeBuy` (side="long")
 * and `executeShort` (side="short") — same money-safety ordering, same
 * leverage grouping, only the order side and recorded lot side differ.
 *
 * Ordering of failure modes matters for money safety:
 * - Invalid plan or no fill at all → throw BEFORE anything executes (safe to retry).
 * - Once ANY leg fills, never throw: return the recorded lot with `partial`/
 *   `persisted` flags so a real fill is never mistaken for "nothing happened"
 *   (which would invite a double-spend retry).
 */
async function openPosition(
  args: ExecuteBuyArgs,
  side: "long" | "short",
): Promise<ExecuteBuyResult> {
  const {
    masterAddress,
    marketType,
    tokensetId,
    tokensetName,
    markets,
    usdcTotal,
    slippage,
    availableUsdc,
    leverage = 1,
  } = args;

  const plan = planBuy(markets, usdcTotal, slippage, availableUsdc, leverage);
  if (!plan.ok) throw new Error(plan.errors.join("; "));

  // Trust boundary: verifies an approved agent is bound to this exact master.
  const client = getAgentExchangeClient(masterAddress);

  // Perps: ensure each asset is set to the selected leverage before opening.
  if (marketType === "perp") {
    await setPerpLeverage(client, plan.legs, leverage);
  }

  const orders = buildOpenOrders(plan, side);
  // Recovers filled legs even if the batch throws because some legs errored.
  const statuses = await placeOrders(client, orders);
  const legs = buildLegsFromStatuses(plan, statuses);

  // Nothing filled → IOC canceled, no funds moved → safe to report failure.
  if (!anyLegFilled(legs)) {
    const firstError = legs.find((l) => l.error)?.error;
    const verb = side === "long" ? "Buy" : "Short";
    throw new Error(`${verb} did not fill${firstError ? `: ${firstError}` : ""}`);
  }

  // From here a real fill has occurred — do NOT throw; report via flags instead.
  // Record ONLY the legs that actually bought; surface the rest as `failed`.
  const filledLegs = legs.filter((l) => l.qtyBought > 0);
  const failed: FailedLeg[] = legs
    .filter((l) => l.qtyBought <= 0)
    .map((l) => ({ token: l.token, error: l.error ?? "not filled" }));

  const record = makeBuyRecord(
    { tokensetId, tokensetName, wallet: masterAddress, marketType, side, legs: filledLegs },
    safeId(),
    Date.now(),
  );

  let persisted = true;
  try {
    saveLots(masterAddress, marketType, addLot(loadLots(masterAddress, marketType), record));
  } catch {
    persisted = false;
  }

  // Partial if any leg failed or a filled leg under-filled its planned size.
  const planSizeByToken = new Map(plan.legs.map((l) => [l.tokenName, l.size]));
  const underfilled = filledLegs.some(
    (l) => l.qtyBought < (planSizeByToken.get(l.token) ?? 0) - 1e-12,
  );
  const partial = failed.length > 0 || underfilled;

  return { plan, record, partial, persisted, failed };
}

/** Buy (open or increase a long) — see `openPosition`. */
export async function executeBuy(args: ExecuteBuyArgs): Promise<ExecuteBuyResult> {
  return openPosition(args, "long");
}

/** Short (open or increase a short) — mirrors `executeBuy`; see `openPosition`. */
export async function executeShort(args: ExecuteBuyArgs): Promise<ExecuteBuyResult> {
  return openPosition(args, "short");
}

export interface ExecuteSellArgs {
  masterAddress: Address;
  marketType: MarketType;
  lot: BuyRecord;
  /** Fraction of each leg's remaining quantity to sell (0 < pct ≤ 1). */
  pct: number;
  /** Current markets (used to price/size the sell), in any order. */
  markets: SellMarketInput[];
  slippage?: number;
}

export interface ExecuteSellResult {
  plan: SellPlan;
  lot: BuyRecord;
  realizedPnlUsd: number;
  /** True if some sellable legs did not fully fill, or some legs were unsellable. */
  partial: boolean;
  persisted: boolean;
}

/**
 * Sell a percentage of a single lot (§6.4). Same money-safety ordering as buys:
 * throw before anything executes (invalid plan) or if nothing sold at all; once
 * any sell fills, never throw — report via `partial`/`persisted`. Only the target
 * lot is mutated (independent lots).
 *
 * KNOWN v1 LIMITATION: the load→modify→save of lots is not atomic across browser
 * tabs. Within a tab it is race-free (synchronous after the fill), and useLots
 * syncs on the `storage` event, but two tabs trading the same wallet at the same
 * instant can lose one update's bookkeeping (the on-exchange fills are still
 * correct). A cross-tab lock + re-read/merge is a planned follow-up (serverless v1).
 */
export async function executeSell(args: ExecuteSellArgs): Promise<ExecuteSellResult> {
  const { masterAddress, marketType, lot, pct, markets, slippage } = args;

  // Defense in depth: never sell a lot against the wrong market type (would use a
  // wrong asset id / reduceOnly flag). Old lots without a recorded type are trusted
  // to their storage namespace.
  if (lot.marketType && lot.marketType !== marketType) {
    throw new Error(
      `Lot is a ${lot.marketType} position; cannot sell it on the ${marketType} market`,
    );
  }

  const marketByToken = new Map(markets.map((m) => [m.tokenName, m]));
  const plan = planSell(lot, pct, marketByToken, slippage);
  if (!plan.ok) throw new Error(plan.errors.join("; "));

  const client = getAgentExchangeClient(masterAddress);
  const sellableLegs = plan.legs.filter((l) => l.sellable);
  const orders = buildSellOrders(sellableLegs);
  // Recovers filled legs even if the batch throws because some legs errored.
  const statuses = await placeOrders(client, orders);

  const fills: SellFill[] = sellableLegs.map((leg, i) => {
    const status = statuses[i];
    if (status && typeof status === "object" && "filled" in status) {
      return {
        token: leg.token,
        soldQty: Number(status.filled.totalSz),
        avgPx: Number(status.filled.avgPx),
      };
    }
    return { token: leg.token, soldQty: 0, avgPx: 0 };
  });

  const filled = fills.filter((f) => f.soldQty > 0);
  if (filled.length === 0) {
    throw new Error("Sell did not fill");
  }

  // A real sell occurred — do not throw past this point.
  const { lot: updatedLot, realizedPnlUsd } = applySellFills(lot, filled);

  let persisted = true;
  try {
    saveLots(masterAddress, marketType, replaceLot(loadLots(masterAddress, marketType), updatedLot));
  } catch {
    persisted = false;
  }

  const partial =
    plan.legs.some((l) => !l.sellable) ||
    sellableLegs.some((leg, i) => (fills[i]?.soldQty ?? 0) < leg.sellQty - 1e-12);

  return { plan, lot: updatedLot, realizedPnlUsd, partial, persisted };
}
