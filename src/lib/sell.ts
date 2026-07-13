import type { BuyRecord } from "./lots";
import type { MarketType } from "./markets";
import {
  marketablePrice,
  MIN_ORDER_NOTIONAL_USD,
  roundSize,
  toDecimalString,
  type OrderObject,
} from "./orders";

/**
 * Sell-order math (instructions.md §6.4). A sell always targets ONE lot and a
 * percentage of each leg's remaining quantity; it never touches another lot.
 * For perps a "sell" CLOSES the lot's position, so orders are reduceOnly — but
 * the order side depends on what is being closed: closing a long is a plain
 * sell (`b:false`); closing a short is a buy-to-cover (`b:true`). A plain sell
 * on a short lot would GROW the short instead of covering it, so this module is
 * side-aware end to end (limit price direction AND order side). Pure and
 * side-effect free — execution lives in execute.ts.
 */

const DUST_EPSILON = 1e-9;

/** Current market data needed to price/size a sell leg (subset of `Market`). */
export interface SellMarketInput {
  tokenName: string;
  coin: string;
  marketType: MarketType;
  assetId: number;
  szDecimals: number;
  priceMaxDecimals: number;
  midPx: number | null;
}

export interface SellLegPlan {
  token: string;
  marketType: MarketType;
  assetId: number;
  szDecimals: number;
  priceMaxDecimals: number;
  qtyRemaining: number;
  /** Quantity to sell for this leg (qtyRemaining × pct, rounded down). */
  sellQty: number;
  mid: number;
  limitPrice: number;
  /** Whether this leg can actually be sold now. */
  sellable: boolean;
  /**
   * Position direction being closed, from the lot. "short" closes via
   * buy-to-cover (`b:true`); "long" closes via a plain sell (`b:false`,
   * unchanged behavior).
   */
  side: "long" | "short";
  /** Why a leg is not sellable (no market / below min / rounds to zero). */
  reason?: string;
}

export interface SellPlan {
  lotId: string;
  /** Fraction to sell, 0 < pct ≤ 1. */
  pct: number;
  legs: SellLegPlan[];
  sellableCount: number;
  ok: boolean;
  errors: string[];
}

/**
 * Plan a percentage sell of a single lot. Only legs with remaining quantity are
 * considered. A leg is not sellable if its token has no market, its rounded sell
 * size is zero, or the sell would be below the minimum notional — those legs are
 * flagged (not silently dropped) so a partial sell is visible.
 */
export function planSell(
  lot: BuyRecord,
  pct: number,
  marketByToken: Map<string, SellMarketInput>,
  slippage?: number,
): SellPlan {
  const errors: string[] = [];
  if (!Number.isFinite(pct) || pct <= 0 || pct > 1) {
    errors.push("Sell percentage must be between 0 and 100");
  }

  // Closing a short means buying to cover: the marketable price direction
  // flips (above mid, rounded up, like a buy) and so does the eventual order
  // side. Lots without `side` (persisted before directional shorts existed)
  // default to "long" — identical to current behavior.
  const side: "long" | "short" = lot.side === "short" ? "short" : "long";
  const isBuyToClose = side === "short";

  const legs: SellLegPlan[] = lot.legs
    .filter((leg) => leg.qtyRemaining > DUST_EPSILON)
    .map((leg) => {
      const market = marketByToken.get(leg.token);
      const mid = market?.midPx ?? 0;
      const szDecimals = market?.szDecimals ?? 0;

      const base: SellLegPlan = {
        token: leg.token,
        marketType: market?.marketType ?? "spot",
        assetId: market?.assetId ?? leg.assetId,
        szDecimals,
        priceMaxDecimals: market?.priceMaxDecimals ?? 0,
        qtyRemaining: leg.qtyRemaining,
        sellQty: 0,
        mid,
        limitPrice: 0,
        sellable: false,
        side,
      };

      if (!market || mid <= 0) {
        return { ...base, reason: "no market/price" };
      }

      const validPct = Number.isFinite(pct) && pct > 0 && pct <= 1 ? pct : 0;
      const sellQty = roundSize(leg.qtyRemaining * validPct, szDecimals);
      const limitPrice = marketablePrice(mid, isBuyToClose, market.priceMaxDecimals, slippage);
      if (sellQty <= 0) {
        return { ...base, sellQty, limitPrice, reason: "rounds to zero" };
      }
      // Check against the worst-case marketable price (limit), not mid, so the
      // exchange won't reject a leg that looked ok at mid (mirrors the buy path).
      if (sellQty * limitPrice < MIN_ORDER_NOTIONAL_USD - DUST_EPSILON) {
        return { ...base, sellQty, limitPrice, reason: "below $10 min" };
      }
      return { ...base, sellQty, limitPrice, sellable: true };
    });

  const sellableCount = legs.filter((l) => l.sellable).length;
  if (legs.length === 0) errors.push("Lot has nothing left to sell");
  else if (sellableCount === 0) {
    errors.push("No legs are sellable right now (illiquid, dust, or below minimum)");
  }

  return {
    lotId: lot.id,
    pct,
    legs,
    sellableCount,
    ok: errors.length === 0,
    errors,
  };
}

/**
 * Build IOC close orders from the sellable legs of a plan. Perp closes are
 * `reduceOnly` (never flip a long into a short or vice versa); spot sells are
 * not. The order side (`b`) is side-aware: closing a long is a plain sell
 * (`b:false`); closing a short is a buy-to-cover (`b:true`) — a plain sell on a
 * short lot would GROW the short instead of closing it.
 */
export function buildSellOrders(legs: SellLegPlan[]): OrderObject[] {
  return legs
    .filter((leg) => leg.sellable)
    .map((leg) => ({
      a: leg.assetId,
      b: leg.side === "short",
      p: toDecimalString(leg.limitPrice, leg.priceMaxDecimals),
      s: toDecimalString(leg.sellQty, leg.szDecimals),
      r: leg.marketType === "perp",
      t: { limit: { tif: "Ioc" } },
    }));
}
