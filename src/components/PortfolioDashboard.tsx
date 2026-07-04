import { useMemo } from "react";
import type { Address } from "viem";
import { formatPct, formatPrice, formatUsd } from "../lib/format";
import type { BuyRecord } from "../lib/lots";
import type { SpotMarket } from "../lib/markets";
import { aggregateTotals, computeLotPnl, type PnlTotals } from "../lib/pnl";
import { SellForm } from "./SellForm";

const DUST = 1e-9;

/** Colored value + percent for a P&L figure. */
function PnlFigure({ usd, pct }: { usd: number | null; pct: number | null }) {
  if (usd === null) return <span className="muted">—</span>;
  const cls = usd >= 0 ? "ok" : "error";
  return (
    <span className={cls}>
      {usd >= 0 ? "+" : ""}
      {formatUsd(usd)} ({formatPct(pct)})
    </span>
  );
}

function TotalsLine({ totals }: { totals: PnlTotals }) {
  return (
    <span className="pnl-totals">
      value {formatUsd(totals.valueUsd)} ·{" "}
      <PnlFigure usd={totals.pnlUsd} pct={totals.pnlPct} />
      {totals.unpricedCount > 0 && (
        <span className="muted small"> · {totals.unpricedCount} unpriced</span>
      )}
    </span>
  );
}

/**
 * Portfolio view (instructions.md §6.5): open lots grouped by tokenset, each with
 * a combined P&L aggregate derived from its lots, a per-lot breakdown, and a
 * per-token row showing entry, current mid, remaining qty and live P&L.
 */
export function PortfolioDashboard({
  lots,
  markets,
  masterAddress,
  agentApproved,
  onSold,
}: {
  lots: BuyRecord[];
  markets: SpotMarket[];
  masterAddress: Address | undefined;
  agentApproved: boolean;
  onSold: () => void;
}) {
  const priceByToken = useMemo(
    () => new Map(markets.map((m) => [m.tokenName, m.midPx])),
    [markets],
  );

  // Group lots that still have holdings, by tokenset (preserving order).
  const groups = useMemo(() => {
    const open = lots.filter((lot) => lot.legs.some((l) => l.qtyRemaining > DUST));
    const byId = new Map<string, { name: string; lots: BuyRecord[] }>();
    for (const lot of open) {
      const g = byId.get(lot.tokensetId) ?? { name: lot.tokensetName, lots: [] };
      g.lots.push(lot);
      byId.set(lot.tokensetId, g);
    }
    return [...byId.values()];
  }, [lots]);

  if (groups.length === 0) {
    return <p className="muted">No open positions.</p>;
  }

  return (
    <div className="portfolio">
      {groups.map((group) => {
        const lotPnls = group.lots.map((lot) => computeLotPnl(lot, priceByToken));
        const agg = aggregateTotals(lotPnls);
        return (
          <div key={group.name} className="portfolio-group">
            <div className="group-head">
              <strong>{group.name}</strong>
              <TotalsLine totals={agg} />
            </div>

            {lotPnls.map(({ lot, legs, totals }) => (
              <div key={lot.id} className="lot-card">
                <div className="lot-head">
                  <span className="muted small">
                    {new Date(lot.createdAt).toLocaleDateString()} · {lot.status}
                  </span>
                  <TotalsLine totals={totals} />
                </div>
                <table className="lot-legs">
                  <thead>
                    <tr className="muted small">
                      <th>Token</th>
                      <th className="num">Qty</th>
                      <th className="num">Entry</th>
                      <th className="num">Now</th>
                      <th className="num">P&L</th>
                    </tr>
                  </thead>
                  <tbody>
                    {legs.map((leg) => (
                      <tr key={leg.token}>
                        <td>{leg.token}</td>
                        <td className="num">{leg.qtyRemaining}</td>
                        <td className="num muted">{formatPrice(leg.avgEntryPrice)}</td>
                        <td className="num muted">{formatPrice(leg.currentPrice)}</td>
                        <td className="num">
                          <PnlFigure usd={leg.pnlUsd} pct={leg.pnlPct} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {masterAddress && (
                  <SellForm
                    lot={lot}
                    markets={markets}
                    masterAddress={masterAddress}
                    agentApproved={agentApproved}
                    onSold={onSold}
                  />
                )}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
