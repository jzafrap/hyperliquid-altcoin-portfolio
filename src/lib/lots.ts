import { storageNamespace } from "../config/env";
import type { MarketType } from "./markets";
import type { BuyPlan } from "./orders";

/**
 * Buy lots — the app-side bookkeeping Hyperliquid does not keep (§5).
 *
 * Each buy of a tokenset is an independent lot with per-token cost basis, so P&L
 * (slice 7) and per-lot selling (slice 6) can be computed. Persisted serverlessly
 * in localStorage, scoped by network+wallet.
 */

export interface BuyLeg {
  token: string;
  assetId: number;
  /** Intended USDC for this leg. */
  usdcAllocated: number;
  /** Size actually filled. */
  qtyBought: number;
  /** Average entry price (USDC per token) from fills; 0 if unfilled. */
  avgEntryPrice: number;
  /** Remaining size not yet sold (decreases on partial sells). */
  qtyRemaining: number;
  /** Cumulative realized P&L (USDC) from sells of this leg. */
  realizedPnlUsd?: number;
  /** Present when this leg failed to place/fill. */
  error?: string;
}

export type LotStatus = "open" | "partially_sold" | "closed";

export interface BuyRecord {
  id: string;
  tokensetId: string;
  tokensetName: string;
  wallet: string;
  /** Actual USDC spent from fills (not the requested total — see §7 rounding). */
  usdcSpent: number;
  legs: BuyLeg[];
  status: LotStatus;
  createdAt: number;
}

/** Minimal shape of a Hyperliquid per-order status (subset we consume). */
export type OrderStatus =
  | { filled: { totalSz: string; avgPx: string; oid: number } }
  | { resting: { oid: number } }
  | { error: string }
  | "waitingForFill"
  | "waitingForTrigger";

// --- Pure builders ----------------------------------------------------------

/**
 * Build lot legs by pairing an executed plan with the exchange's per-order
 * statuses (same order). A leg with no fill is recorded with qty 0 (and its
 * error, if any) — never dropped — so a partial basket is visible (§7).
 */
export function buildLegsFromStatuses(
  plan: BuyPlan,
  statuses: OrderStatus[],
): BuyLeg[] {
  return plan.legs.map((leg, i) => {
    const status = statuses[i];
    if (status && typeof status === "object" && "filled" in status) {
      const qty = Number(status.filled.totalSz);
      return {
        token: leg.tokenName,
        assetId: leg.assetId,
        usdcAllocated: leg.allocationUsd,
        qtyBought: qty,
        avgEntryPrice: Number(status.filled.avgPx),
        qtyRemaining: qty,
      };
    }
    const error =
      status && typeof status === "object" && "error" in status
        ? status.error
        : "not filled";
    return {
      token: leg.tokenName,
      assetId: leg.assetId,
      usdcAllocated: leg.allocationUsd,
      qtyBought: 0,
      avgEntryPrice: 0,
      qtyRemaining: 0,
      error,
    };
  });
}

/** Actual USDC spent = sum of filled notionals (qty × entry price). */
export function spentFromLegs(legs: BuyLeg[]): number {
  return legs.reduce((sum, l) => sum + l.qtyBought * l.avgEntryPrice, 0);
}

export interface NewLotInput {
  tokensetId: string;
  tokensetName: string;
  wallet: string;
  legs: BuyLeg[];
}

export function makeBuyRecord(
  input: NewLotInput,
  id: string,
  createdAt: number,
): BuyRecord {
  return {
    id,
    tokensetId: input.tokensetId,
    tokensetName: input.tokensetName,
    wallet: input.wallet,
    usdcSpent: spentFromLegs(input.legs),
    legs: input.legs,
    status: "open",
    createdAt,
  };
}

/** True if at least one leg actually filled. */
export function anyLegFilled(legs: BuyLeg[]): boolean {
  return legs.some((l) => l.qtyBought > 0);
}

// --- Persistence (localStorage, network+wallet scoped) ---------------------

function storageKey(wallet: string, marketType: MarketType): string {
  return `${storageNamespace(wallet, marketType)}:lots`;
}

export function loadLots(wallet: string, marketType: MarketType): BuyRecord[] {
  try {
    const raw = localStorage.getItem(storageKey(wallet, marketType));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as BuyRecord[]) : [];
  } catch {
    return [];
  }
}

/**
 * Persist lots. Throws on failure (quota/unavailable) — the caller MUST surface
 * this, because a filled buy whose lot is not saved becomes untracked money.
 */
export function saveLots(
  wallet: string,
  marketType: MarketType,
  lots: BuyRecord[],
): void {
  localStorage.setItem(storageKey(wallet, marketType), JSON.stringify(lots));
}

export function addLot(lots: BuyRecord[], lot: BuyRecord): BuyRecord[] {
  return [lot, ...lots];
}

/** Replace a lot in place by id (used after a sell updates it). */
export function replaceLot(lots: BuyRecord[], updated: BuyRecord): BuyRecord[] {
  return lots.map((l) => (l.id === updated.id ? updated : l));
}

const DUST_EPSILON = 1e-9;

/** A confirmed sell fill for one leg. */
export interface SellFill {
  token: string;
  soldQty: number;
  avgPx: number;
}

/**
 * Apply sell fills to a lot: reduce each sold leg's qtyRemaining, accrue realized
 * P&L (soldQty × (sellPrice − avgEntryPrice)), and recompute lot status. Pure —
 * returns a new lot plus the realized P&L of this sell. Legs not in `fills` are
 * untouched (only the targeted lot's sold legs change).
 */
export function applySellFills(
  lot: BuyRecord,
  fills: SellFill[],
): { lot: BuyRecord; realizedPnlUsd: number } {
  const byToken = new Map(fills.map((f) => [f.token, f]));
  let realizedPnlUsd = 0;

  const legs = lot.legs.map((leg) => {
    const fill = byToken.get(leg.token);
    if (!fill || fill.soldQty <= 0) return leg;
    const pnl = fill.soldQty * (fill.avgPx - leg.avgEntryPrice);
    realizedPnlUsd += pnl;
    return {
      ...leg,
      qtyRemaining: Math.max(0, leg.qtyRemaining - fill.soldQty),
      realizedPnlUsd: (leg.realizedPnlUsd ?? 0) + pnl,
    };
  });

  // Status: closed if nothing remains across all originally-bought legs;
  // partially_sold if some remains but at least one sell has happened.
  const anyRemaining = legs.some((l) => l.qtyRemaining > DUST_EPSILON);
  const status: LotStatus = anyRemaining ? "partially_sold" : "closed";

  return { lot: { ...lot, legs, status }, realizedPnlUsd };
}
