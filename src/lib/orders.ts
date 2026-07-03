/**
 * Buy-order math and construction (instructions.md §6.3).
 *
 * Pure, deterministic helpers: equal USDC split, size rounding to szDecimals,
 * the minimum-total guard (never skip legs), marketable IOC price bounding, and
 * Hyperliquid spot order construction. Kept side-effect free so the money math
 * is unit-tested; execution lives in execute.ts.
 */

/**
 * Hyperliquid minimum order value in USDC. Documented protocol rule (orders must
 * be worth at least this much). Centralized for tuning; verify against current
 * Hyperliquid docs before mainnet.
 */
export const MIN_ORDER_NOTIONAL_USD = 10;

/** Default slippage bound for market-emulating IOC orders (fraction, 0.02 = 2%). */
export const DEFAULT_SLIPPAGE = 0.02;

/** Max decimal places for spot prices is (8 - szDecimals); prices also ≤5 sig figs. */
const SPOT_PRICE_MAX_DECIMALS = 8;

/** Spot asset id for the exchange `a` field: 10000 + the spot universe index. */
export function spotAssetId(universeIndex: number): number {
  return 10000 + universeIndex;
}

/** Round a size DOWN to szDecimals — never round up, to avoid overspending. */
export function roundSize(size: number, szDecimals: number): number {
  if (!(size > 0)) return 0;
  const factor = 10 ** szDecimals;
  return Math.floor(size * factor) / factor;
}

/**
 * Round a spot price to a Hyperliquid-valid tick: at most 5 significant figures
 * and at most (8 - szDecimals) decimal places.
 */
export function roundSpotPrice(px: number, szDecimals: number): number {
  if (!(px > 0)) return 0;
  const maxDecimals = Math.max(0, SPOT_PRICE_MAX_DECIMALS - szDecimals);
  const fiveSigFigs = Number(px.toPrecision(5));
  return Number(fiveSigFigs.toFixed(maxDecimals));
}

/**
 * Marketable limit price for an IOC order: above mid for buys, below for sells,
 * by the slippage bound, then rounded to a valid tick.
 */
export function marketablePrice(
  mid: number,
  isBuy: boolean,
  szDecimals: number,
  slippage = DEFAULT_SLIPPAGE,
): number {
  const raw = isBuy ? mid * (1 + slippage) : mid * (1 - slippage);
  return roundSpotPrice(raw, szDecimals);
}

/** Minimum total USDC required so every one of `n` legs clears the min notional. */
export function minTotalFor(n: number): number {
  return MIN_ORDER_NOTIONAL_USD * n;
}

/** Market inputs needed to size a buy leg. */
export interface BuyMarketInput {
  tokenName: string;
  coin: string;
  universeIndex: number;
  szDecimals: number;
  midPx: number | null;
}

export interface BuyLegPlan {
  tokenName: string;
  coin: string;
  assetId: number;
  szDecimals: number;
  /** Intended USDC for this leg (usdcTotal / n). */
  allocationUsd: number;
  /** Reference mid used for sizing. */
  price: number;
  /** Size after rounding down to szDecimals. */
  size: number;
  /** Actual notional after rounding (size * price). */
  notionalUsd: number;
}

export interface BuyPlan {
  legs: BuyLegPlan[];
  usdcTotal: number;
  /** Sum of leg notionals after rounding (differs from usdcTotal due to rounding). */
  plannedUsd: number;
  minTotal: number;
  ok: boolean;
  errors: string[];
}

/**
 * Plan an equal-split buy across the given markets. Enforces the minimum-total
 * guard up front and re-checks each leg after size rounding — never skips a leg
 * (§6.3 committed policy). A non-ok plan must not be executed.
 */
export function planBuy(markets: BuyMarketInput[], usdcTotal: number): BuyPlan {
  const n = markets.length;
  const minTotal = minTotalFor(n);
  const errors: string[] = [];

  if (n === 0) errors.push("Tokenset has no tokens");
  if (!(usdcTotal > 0)) errors.push("Enter an amount greater than 0");
  if (n > 0 && usdcTotal < minTotal) {
    errors.push(
      `Amount too low: need at least ${minTotal} USDC (${MIN_ORDER_NOTIONAL_USD} × ${n} tokens)`,
    );
  }

  const perToken = n > 0 ? usdcTotal / n : 0;
  const legs: BuyLegPlan[] = markets.map((m) => {
    const price = m.midPx ?? 0;
    const size = price > 0 ? roundSize(perToken / price, m.szDecimals) : 0;
    const notionalUsd = size * price;
    return {
      tokenName: m.tokenName,
      coin: m.coin,
      assetId: spotAssetId(m.universeIndex),
      szDecimals: m.szDecimals,
      allocationUsd: perToken,
      price,
      size,
      notionalUsd,
    };
  });

  // Post-rounding re-check: every leg must still clear the minimum notional.
  for (const leg of legs) {
    if (leg.price <= 0) {
      errors.push(`${leg.tokenName}: no price available`);
    } else if (leg.size <= 0 || leg.notionalUsd < MIN_ORDER_NOTIONAL_USD) {
      errors.push(
        `${leg.tokenName}: leg too small after rounding — raise the total amount`,
      );
    }
  }

  const plannedUsd = legs.reduce((sum, l) => sum + l.notionalUsd, 0);

  return {
    legs,
    usdcTotal,
    plannedUsd,
    minTotal,
    ok: errors.length === 0,
    errors,
  };
}

/** A single Hyperliquid order object (exchange `orders[]` entry). */
export interface OrderObject {
  a: number;
  b: boolean;
  p: string;
  s: string;
  r: boolean;
  t: { limit: { tif: "Ioc" } };
}

/** Build IOC buy orders from an OK plan, each priced with the slippage bound. */
export function buildBuyOrders(plan: BuyPlan, slippage = DEFAULT_SLIPPAGE): OrderObject[] {
  return plan.legs.map((leg) => ({
    a: leg.assetId,
    b: true,
    p: String(marketablePrice(leg.price, true, leg.szDecimals, slippage)),
    s: String(leg.size),
    r: false,
    t: { limit: { tif: "Ioc" } },
  }));
}
