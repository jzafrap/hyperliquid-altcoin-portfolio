import type { BuyRecord } from "./lots";

/**
 * Unrealized P&L math for open positions (instructions.md §6.5). Pure and
 * derived — nothing is persisted. Values are computed from a lot's remaining
 * quantities and current mid prices; a leg with no current price is left
 * unvalued (null) and excluded from totals rather than guessed.
 */

const DUST = 1e-9;

export interface LegPnl {
  token: string;
  qtyRemaining: number;
  avgEntryPrice: number;
  currentPrice: number | null;
  costUsd: number;
  valueUsd: number | null;
  pnlUsd: number | null;
  pnlPct: number | null;
}

export interface PnlTotals {
  /** Cost basis of the priced, still-held legs. */
  costUsd: number;
  /** Current market value of the priced, still-held legs. */
  valueUsd: number;
  pnlUsd: number;
  pnlPct: number | null;
  /** Legs that could not be valued (no current price). */
  unpricedCount: number;
}

export interface LotPnl {
  lot: BuyRecord;
  legs: LegPnl[];
  totals: PnlTotals;
}

function pct(pnlUsd: number, costUsd: number): number | null {
  return costUsd > DUST ? (pnlUsd / costUsd) * 100 : null;
}

/** Per-leg unrealized P&L for a lot's remaining holdings. */
export function computeLegPnls(
  lot: BuyRecord,
  priceByToken: Map<string, number | null>,
): LegPnl[] {
  return lot.legs
    .filter((leg) => leg.qtyRemaining > DUST)
    .map((leg) => {
      const currentPrice = priceByToken.get(leg.token) ?? null;
      const costUsd = leg.qtyRemaining * leg.avgEntryPrice;
      const valueUsd =
        currentPrice !== null ? leg.qtyRemaining * currentPrice : null;
      const pnlUsd = valueUsd !== null ? valueUsd - costUsd : null;
      return {
        token: leg.token,
        qtyRemaining: leg.qtyRemaining,
        avgEntryPrice: leg.avgEntryPrice,
        currentPrice,
        costUsd,
        valueUsd,
        pnlUsd,
        pnlPct: pnlUsd !== null ? pct(pnlUsd, costUsd) : null,
      };
    });
}

/** Aggregate totals over priced legs (unpriced legs are counted, not valued). */
export function totalsFromLegs(legs: LegPnl[]): PnlTotals {
  let costUsd = 0;
  let valueUsd = 0;
  let unpricedCount = 0;
  for (const leg of legs) {
    if (leg.valueUsd === null) {
      unpricedCount += 1;
      continue;
    }
    costUsd += leg.costUsd;
    valueUsd += leg.valueUsd;
  }
  const pnlUsd = valueUsd - costUsd;
  return { costUsd, valueUsd, pnlUsd, pnlPct: pct(pnlUsd, costUsd), unpricedCount };
}

/** Full P&L view for one lot. */
export function computeLotPnl(
  lot: BuyRecord,
  priceByToken: Map<string, number | null>,
): LotPnl {
  const legs = computeLegPnls(lot, priceByToken);
  return { lot, legs, totals: totalsFromLegs(legs) };
}

/** Combined totals across several lots (e.g. all open lots of one tokenset). */
export function aggregateTotals(lotPnls: LotPnl[]): PnlTotals {
  return totalsFromLegs(lotPnls.flatMap((l) => l.legs));
}
