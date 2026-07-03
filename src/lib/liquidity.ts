/**
 * Pure liquidity helpers for the token picker (instructions.md §6.2).
 *
 * These turn raw market data (24h volume, order-book levels) into the concrete
 * signals shown when composing a tokenset: bid/ask spread %, order-book depth
 * near mid, and a High/Medium/Low badge so illiquid tokens are visible before
 * they are added to a basket.
 *
 * All thresholds are heuristic and intentionally centralized here for tuning.
 */

/** A single order-book price level (subset of the SDK's L2 level). */
export interface Level {
  px: string;
  sz: string;
}

export type LiquidityTier = "high" | "medium" | "low";

/** Daily notional volume (USD) thresholds. */
export const VOLUME_THRESHOLDS = { high: 1_000_000, medium: 100_000 } as const;

/** Bid/ask spread thresholds, in percent. Lower is more liquid. */
export const SPREAD_THRESHOLDS = { tight: 0.3, wide: 1.0 } as const;

/** Mid price from the top of book, or null if either side is empty. */
export function midFromBook(bids: Level[], asks: Level[]): number | null {
  const bestBid = bids[0]?.px;
  const bestAsk = asks[0]?.px;
  if (bestBid === undefined || bestAsk === undefined) return null;
  const mid = (Number(bestBid) + Number(bestAsk)) / 2;
  return mid > 0 ? mid : null;
}

/** Bid/ask spread as a percentage of mid, or null if the book is one-sided. */
export function spreadPct(bids: Level[], asks: Level[]): number | null {
  const bestBid = bids[0]?.px;
  const bestAsk = asks[0]?.px;
  if (bestBid === undefined || bestAsk === undefined) return null;
  const mid = midFromBook(bids, asks);
  if (mid === null) return null;
  return ((Number(bestAsk) - Number(bestBid)) / mid) * 100;
}

/**
 * Sum notional (USD) of levels within ±`bandPct` of mid.
 * `bandPct` is a fraction (0.02 = ±2%). Works for bids and asks alike since a
 * symmetric band contains bid levels below mid and ask levels above it.
 */
export function depthWithinPct(levels: Level[], mid: number, bandPct: number): number {
  const lo = mid * (1 - bandPct);
  const hi = mid * (1 + bandPct);
  let usd = 0;
  for (const level of levels) {
    const px = Number(level.px);
    if (px >= lo && px <= hi) usd += px * Number(level.sz);
  }
  return usd;
}

/** Tier from 24h notional volume. */
export function volumeTier(dayNtlVlm: number): LiquidityTier {
  if (dayNtlVlm >= VOLUME_THRESHOLDS.high) return "high";
  if (dayNtlVlm >= VOLUME_THRESHOLDS.medium) return "medium";
  return "low";
}

/** Tier from spread %. Tighter spread = more liquid. */
export function spreadTier(pct: number): LiquidityTier {
  if (pct <= SPREAD_THRESHOLDS.tight) return "high";
  if (pct <= SPREAD_THRESHOLDS.wide) return "medium";
  return "low";
}

const TIER_RANK: Record<LiquidityTier, number> = { low: 0, medium: 1, high: 2 };

/** The least-liquid (most conservative) of the given tiers. */
export function worstTier(...tiers: LiquidityTier[]): LiquidityTier {
  if (tiers.length === 0) return "low";
  return tiers.reduce((worst, t) => (TIER_RANK[t] < TIER_RANK[worst] ? t : worst));
}

/**
 * Combined liquidity tier. Volume is always available (from asset contexts);
 * spread is optional (requires an order-book fetch). When spread is present we
 * take the more conservative of the two signals.
 */
export function liquidityTier(dayNtlVlm: number, spread: number | null): LiquidityTier {
  const vol = volumeTier(dayNtlVlm);
  if (spread === null) return vol;
  return worstTier(vol, spreadTier(spread));
}
