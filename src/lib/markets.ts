import { QUOTE_COIN } from "./balances";
import { getInfoClient } from "./hyperliquid";
import {
  depthWithinPct,
  liquidityTier,
  midFromBook,
  spreadPct,
  volumeTier,
  type LiquidityTier,
} from "./liquidity";
import { spotAssetId } from "./orders";

/** Spot or perpetual market. Drives asset id, price precision, and order side. */
export type MarketType = "spot" | "perp";

/** Max price decimals = MAX − szDecimals (8 for spot, 6 for perps). */
const MAX_PRICE_DECIMALS: Record<MarketType, number> = { spot: 8, perp: 6 };

/** A tradable market (spot or perp), enriched with 24h context (§6.2). */
export interface Market {
  marketType: MarketType;
  /** Coin string used for l2Book and (spot) order routing / mid lookup. */
  coin: string;
  /** Exchange asset id: spot = 10000 + universe.index; perp = universe array index. */
  assetId: number;
  /** Display symbol, e.g. "PURR" (spot base) or "BTC" (perp). */
  tokenName: string;
  szDecimals: number;
  /** Max decimal places allowed for this market's prices. */
  priceMaxDecimals: number;
  midPx: number | null;
  dayNtlVlm: number;
  change24hPct: number | null;
  /** Volume-only tier for the list (cheap: no per-token order-book fetch). */
  volumeTier: LiquidityTier;
  /** Perp only: maximum leverage the venue allows (we always trade 1x). */
  maxLeverage?: number;
  /** Perp only: asset requires isolated margin (cross is not allowed). */
  isolatedOnly?: boolean;
}

function priceMaxDecimals(marketType: MarketType, szDecimals: number): number {
  return Math.max(0, MAX_PRICE_DECIMALS[marketType] - szDecimals);
}

function change24h(midPx: number | null, prevDayPx: number): number | null {
  return midPx != null && prevDayPx > 0 ? ((midPx - prevDayPx) / prevDayPx) * 100 : null;
}

/**
 * All spot markets quoted in USDC, sorted by 24h volume descending.
 * Asset contexts are NOT positionally aligned with the universe — match by the
 * shared `coin` key (ctx.coin === universe.name). Spot asset id = 10000 + index.
 */
export async function getSpotMarkets(): Promise<Market[]> {
  const [meta, ctxs] = await getInfoClient().spotMetaAndAssetCtxs();

  const usdc = meta.tokens.find((t) => t.name === QUOTE_COIN);
  if (!usdc) return [];

  const ctxByCoin = new Map(ctxs.map((c) => [c.coin, c]));

  const markets: Market[] = [];
  meta.universe.forEach((u) => {
    const [baseIdx, quoteIdx] = u.tokens;
    if (quoteIdx !== usdc.index) return; // only USDC-quoted markets

    const base = meta.tokens.find((t) => t.index === baseIdx);
    if (!base) return;

    const ctx = ctxByCoin.get(u.name);
    const midPx = ctx?.midPx != null ? Number(ctx.midPx) : null;
    const dayNtlVlm = ctx ? Number(ctx.dayNtlVlm) : 0;

    markets.push({
      marketType: "spot",
      coin: u.name,
      assetId: spotAssetId(u.index),
      tokenName: base.name,
      szDecimals: base.szDecimals,
      priceMaxDecimals: priceMaxDecimals("spot", base.szDecimals),
      midPx,
      dayNtlVlm,
      change24hPct: change24h(midPx, ctx ? Number(ctx.prevDayPx) : 0),
      volumeTier: volumeTier(dayNtlVlm),
    });
  });

  return markets.sort((a, b) => b.dayNtlVlm - a.dayNtlVlm);
}

/**
 * All perpetual markets, sorted by 24h volume descending.
 * Perp asset contexts ARE positionally aligned with `meta.universe`, and the
 * perp asset id is that array index (0-based). Delisted markets are skipped.
 */
export async function getPerpMarkets(): Promise<Market[]> {
  const [meta, ctxs] = await getInfoClient().metaAndAssetCtxs();

  const markets: Market[] = [];
  meta.universe.forEach((u, i) => {
    if (u.isDelisted) return;
    const ctx = ctxs[i];
    const midPx =
      ctx?.midPx != null
        ? Number(ctx.midPx)
        : ctx?.markPx != null
          ? Number(ctx.markPx)
          : null;
    const dayNtlVlm = ctx ? Number(ctx.dayNtlVlm) : 0;

    markets.push({
      marketType: "perp",
      coin: u.name,
      assetId: i,
      tokenName: u.name,
      szDecimals: u.szDecimals,
      priceMaxDecimals: priceMaxDecimals("perp", u.szDecimals),
      midPx,
      dayNtlVlm,
      change24hPct: change24h(midPx, ctx ? Number(ctx.prevDayPx) : 0),
      volumeTier: volumeTier(dayNtlVlm),
      maxLeverage: u.maxLeverage,
      // Some assets disallow cross margin — they must be opened isolated.
      isolatedOnly:
        u.onlyIsolated === true ||
        u.marginMode === "strictIsolated" ||
        u.marginMode === "noCross",
    });
  });

  return markets.sort((a, b) => b.dayNtlVlm - a.dayNtlVlm);
}

/** Fetch markets for the given type. */
export function getMarkets(marketType: MarketType): Promise<Market[]> {
  return marketType === "perp" ? getPerpMarkets() : getSpotMarkets();
}

/** Order-book-derived liquidity for a single market (spread + depth near mid). */
export interface BookLiquidity {
  spreadPct: number | null;
  /** USD depth on the bid side within the band (what a SELL can hit). */
  bidDepthUsd: number;
  /** USD depth on the ask side within the band (what a BUY can hit). */
  askDepthUsd: number;
  /** Combined tier from volume + spread. */
  tier: LiquidityTier;
  bandPct: number;
}

/**
 * Fetch order-book liquidity for one market. Called on demand for tokens the
 * user is actually composing into a set (not for the whole list) to keep API
 * load down. `dayNtlVlm` is folded in so the badge reflects both signals.
 */
export async function getBookLiquidity(
  coin: string,
  dayNtlVlm: number,
  bandPct = 0.02,
): Promise<BookLiquidity> {
  const book = await getInfoClient().l2Book({ coin });
  if (!book) throw new Error(`No order book returned for ${coin}`);
  const [bids, asks] = book.levels;
  const mid = midFromBook(bids, asks);
  const spread = spreadPct(bids, asks);

  return {
    spreadPct: spread,
    bidDepthUsd: mid ? depthWithinPct(bids, mid, bandPct) : 0,
    askDepthUsd: mid ? depthWithinPct(asks, mid, bandPct) : 0,
    tier: liquidityTier(dayNtlVlm, spread),
    bandPct,
  };
}
