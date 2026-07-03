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

/** A USDC-quoted spot market, enriched with 24h context (instructions.md §6.2). */
export interface SpotMarket {
  /** Universe name — the `coin` used for l2Book and order placement. */
  coin: string;
  universeIndex: number;
  /** Base token symbol shown to the user, e.g. "PURR". */
  tokenName: string;
  tokenIndex: number;
  /** Size decimals — order sizes must be rounded to this (used later in §6.3). */
  szDecimals: number;
  tokenId: `0x${string}`;
  midPx: number | null;
  dayNtlVlm: number;
  change24hPct: number | null;
  /** Volume-only tier for the list (cheap: no per-token order-book fetch). */
  volumeTier: LiquidityTier;
}

/**
 * All spot markets quoted in USDC, sorted by 24h volume descending.
 * Uses a single `spotMetaAndAssetCtxs` call; asset contexts align with the
 * universe by index.
 */
export async function getSpotMarkets(): Promise<SpotMarket[]> {
  const [meta, ctxs] = await getInfoClient().spotMetaAndAssetCtxs();

  const usdc = meta.tokens.find((t) => t.name === QUOTE_COIN);
  if (!usdc) return [];

  // Asset contexts are NOT positionally aligned with the universe (their array
  // lengths differ). Match by the shared `coin` key: ctx.coin === universe.name.
  const ctxByCoin = new Map(ctxs.map((c) => [c.coin, c]));

  const markets: SpotMarket[] = [];
  meta.universe.forEach((u) => {
    const [baseIdx, quoteIdx] = u.tokens;
    if (quoteIdx !== usdc.index) return; // only USDC-quoted markets

    const base = meta.tokens.find((t) => t.index === baseIdx);
    if (!base) return;

    const ctx = ctxByCoin.get(u.name);
    const midPx = ctx?.midPx != null ? Number(ctx.midPx) : null;
    const prevDayPx = ctx ? Number(ctx.prevDayPx) : 0;
    const dayNtlVlm = ctx ? Number(ctx.dayNtlVlm) : 0;

    markets.push({
      coin: u.name,
      universeIndex: u.index,
      tokenName: base.name,
      tokenIndex: base.index,
      szDecimals: base.szDecimals,
      tokenId: base.tokenId,
      midPx,
      dayNtlVlm,
      change24hPct:
        midPx != null && prevDayPx > 0
          ? ((midPx - prevDayPx) / prevDayPx) * 100
          : null,
      volumeTier: volumeTier(dayNtlVlm),
    });
  });

  return markets.sort((a, b) => b.dayNtlVlm - a.dayNtlVlm);
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
