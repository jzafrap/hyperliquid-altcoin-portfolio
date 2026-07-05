/**
 * Buy-order math and construction (instructions.md §6.3).
 *
 * Pure, deterministic helpers: equal USDC split, size rounding to szDecimals,
 * the minimum-total guard (never skip legs), marketable IOC price bounding, and
 * Hyperliquid spot order construction. Kept side-effect free so the money math
 * is unit-tested; execution lives in execute.ts.
 *
 * Overspend safety: legs are sized off the marketable LIMIT price (the worst
 * price we allow), not mid — so actual fills (which never exceed the limit) can
 * never cost more than the requested per-token allocation.
 */

/**
 * Hyperliquid minimum order value in USDC. Documented protocol rule (orders must
 * be worth at least this much). Centralized for tuning; verify against current
 * Hyperliquid docs before mainnet.
 */
export const MIN_ORDER_NOTIONAL_USD = 10;

/** Default slippage bound for market-emulating IOC orders (fraction, 0.02 = 2%). */
export const DEFAULT_SLIPPAGE = 0.02;

/** Tiny epsilon so exact-boundary notionals (e.g. $10.00) aren't rejected by FP noise. */
const NOTIONAL_EPSILON = 1e-9;

/** Spot asset id for the exchange `a` field: 10000 + the spot universe index. */
export function spotAssetId(universeIndex: number): number {
  return 10000 + universeIndex;
}

/** Format a number as a plain decimal string (never exponential) for the API. */
export function toDecimalString(value: number, maxDecimals: number): string {
  if (!Number.isFinite(value)) return "0";
  const fixed = value.toFixed(Math.max(0, maxDecimals));
  // Trim trailing zeros only after a decimal point (never touch integer digits).
  return fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
}

/**
 * Round a size DOWN to szDecimals — never round up, to avoid overspending.
 * A tiny epsilon absorbs binary-float error so an already-aligned value isn't
 * truncated by a full unit (e.g. 0.58 * 100 = 57.99999999999999 → must stay 0.58,
 * not become 0.57). The epsilon (1e-9) is far larger than FP noise yet far smaller
 * than any real szDecimals tick, so genuine fractions are still rounded down.
 */
export function roundSize(size: number, szDecimals: number): number {
  if (!(size > 0)) return 0;
  const factor = 10 ** szDecimals;
  return Math.floor(size * factor + 1e-9) / factor;
}

/**
 * Marketable limit price for an IOC order: above mid for buys (rounded UP),
 * below mid for sells (rounded DOWN), by the slippage bound. Directional
 * rounding guarantees the price stays on the marketable side of mid even when
 * the decimal cap is coarse. ≤5 significant figures and ≤`maxDecimals` decimals
 * (maxDecimals differs by market: 8−szDec for spot, 6−szDec for perp).
 */
export function marketablePrice(
  mid: number,
  isBuy: boolean,
  maxDecimals: number,
  slippage = DEFAULT_SLIPPAGE,
): number {
  if (!(mid > 0)) return 0;
  const raw = isBuy ? mid * (1 + slippage) : mid * (1 - slippage);
  const fiveSigFigs = Number(raw.toPrecision(5));
  const factor = 10 ** Math.max(0, maxDecimals);
  const rounded = isBuy
    ? Math.ceil(fiveSigFigs * factor) / factor
    : Math.floor(fiveSigFigs * factor) / factor;
  return rounded;
}

/** Minimum total USDC required so every one of `n` legs clears the min notional. */
export function minTotalFor(n: number): number {
  return MIN_ORDER_NOTIONAL_USD * n;
}

/** Market inputs needed to size a buy leg (subset of `Market`). */
export interface BuyMarketInput {
  tokenName: string;
  coin: string;
  assetId: number;
  szDecimals: number;
  priceMaxDecimals: number;
  midPx: number | null;
  /** Perp only: asset requires isolated margin (cross not allowed). */
  isolatedOnly?: boolean;
}

export interface BuyLegPlan {
  tokenName: string;
  coin: string;
  assetId: number;
  szDecimals: number;
  priceMaxDecimals: number;
  /** Perp only: asset requires isolated margin (cross not allowed). */
  isolatedOnly?: boolean;
  /** Intended USDC for this leg (usdcTotal / n). */
  allocationUsd: number;
  /** Reference mid at plan time. */
  mid: number;
  /** Marketable IOC limit price actually submitted. */
  limitPrice: number;
  /** Size after rounding down to szDecimals. */
  size: number;
  /** Worst-case notional = size × limitPrice (the max this leg can spend). */
  maxNotionalUsd: number;
}

export interface BuyPlan {
  legs: BuyLegPlan[];
  usdcTotal: number;
  /** Sum of expected notionals (size × mid) — realistic estimate, not the cap. */
  plannedUsd: number;
  minTotal: number;
  slippage: number;
  ok: boolean;
  errors: string[];
}

/**
 * Plan an equal-split buy across the given markets. Enforces the minimum-total
 * guard up front and re-checks each leg after size rounding — never skips a leg
 * (§6.3 committed policy). Legs are sized off the marketable limit price so fills
 * cannot overspend. A non-ok plan must not be executed.
 */
export function planBuy(
  markets: BuyMarketInput[],
  usdcTotal: number,
  slippage = DEFAULT_SLIPPAGE,
  availableUsdc?: number,
): BuyPlan {
  const n = markets.length;
  const minTotal = minTotalFor(n);
  const errors: string[] = [];

  if (n === 0) errors.push("Tokenset has no tokens");
  if (!Number.isFinite(usdcTotal) || !(usdcTotal > 0)) {
    errors.push("Enter a valid amount greater than 0");
  } else if (n > 0 && usdcTotal < minTotal) {
    errors.push(
      `Amount too low: need at least ${minTotal} USDC (${MIN_ORDER_NOTIONAL_USD} × ${n} tokens)`,
    );
  }

  // Insufficient-funds guard (§7): checked at plan time and re-checked at execution.
  if (
    availableUsdc !== undefined &&
    Number.isFinite(availableUsdc) &&
    Number.isFinite(usdcTotal) &&
    usdcTotal > availableUsdc + NOTIONAL_EPSILON
  ) {
    errors.push(
      `Insufficient USDC: need ${usdcTotal}, have ${availableUsdc.toFixed(2)}`,
    );
  }

  const perToken = n > 0 && Number.isFinite(usdcTotal) ? usdcTotal / n : 0;
  const legs: BuyLegPlan[] = markets.map((m) => {
    const mid = m.midPx ?? 0;
    const limitPrice = marketablePrice(mid, true, m.priceMaxDecimals, slippage);
    // Size off the LIMIT price (worst case) so the fill can't exceed allocation.
    const size = limitPrice > 0 ? roundSize(perToken / limitPrice, m.szDecimals) : 0;
    return {
      tokenName: m.tokenName,
      coin: m.coin,
      assetId: m.assetId,
      szDecimals: m.szDecimals,
      priceMaxDecimals: m.priceMaxDecimals,
      isolatedOnly: m.isolatedOnly,
      allocationUsd: perToken,
      mid,
      limitPrice,
      size,
      maxNotionalUsd: size * limitPrice,
    };
  });

  // Post-rounding re-check: every leg must still clear the minimum notional.
  for (const leg of legs) {
    if (leg.mid <= 0 || leg.limitPrice <= 0) {
      errors.push(`${leg.tokenName}: no price available`);
    } else if (
      leg.size <= 0 ||
      leg.maxNotionalUsd < MIN_ORDER_NOTIONAL_USD - NOTIONAL_EPSILON
    ) {
      errors.push(
        `${leg.tokenName}: leg too small after rounding — raise the total amount`,
      );
    }
  }

  const plannedUsd = legs.reduce((sum, l) => sum + l.size * l.mid, 0);

  return {
    legs,
    usdcTotal,
    plannedUsd,
    minTotal,
    slippage,
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

/** Build IOC buy orders from an OK plan using each leg's precomputed limit price. */
export function buildBuyOrders(plan: BuyPlan): OrderObject[] {
  return plan.legs.map((leg) => ({
    a: leg.assetId,
    b: true,
    p: toDecimalString(leg.limitPrice, leg.priceMaxDecimals),
    s: toDecimalString(leg.size, leg.szDecimals),
    r: false,
    t: { limit: { tif: "Ioc" } },
  }));
}
