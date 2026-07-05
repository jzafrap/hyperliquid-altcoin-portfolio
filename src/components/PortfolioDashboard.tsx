import { useEffect, useMemo, useState } from "react";
import type { Address } from "viem";
import { formatPct, formatPrice, formatUsd } from "../lib/format";
import type { BuyRecord } from "../lib/lots";
import type { Market } from "../lib/markets";
import {
  aggregateTotals,
  computeLotPnl,
  isPriceStale,
  isSmallPosition,
  SMALL_POSITION_USD,
  type LotPnl,
  type PnlTotals,
} from "../lib/pnl";
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
  pricesUpdatedAt = 0,
  pricesError = false,
}: {
  lots: BuyRecord[];
  markets: Market[];
  masterAddress: Address | undefined;
  agentApproved: boolean;
  onSold: () => void;
  pricesUpdatedAt?: number;
  pricesError?: boolean;
}) {
  // Tick so the staleness banner appears even when nothing else re-renders.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const stale = pricesError || isPriceStale(pricesUpdatedAt, now);

  const [hideSmall, setHideSmall] = useState(false);

  const priceByToken = useMemo(
    () => new Map(markets.map((m) => [m.tokenName, m.midPx])),
    [markets],
  );

  // Group lots that still have holdings, by tokenset (preserving order), and
  // compute each lot's P&L. Optionally hide lots worth less than $5.
  const { visibleGroups, hiddenCount } = useMemo(() => {
    const open = lots.filter((lot) => lot.legs.some((l) => l.qtyRemaining > DUST));
    const byId = new Map<string, { name: string; lotPnls: LotPnl[] }>();
    for (const lot of open) {
      const g = byId.get(lot.tokensetId) ?? { name: lot.tokensetName, lotPnls: [] };
      g.lotPnls.push(computeLotPnl(lot, priceByToken));
      byId.set(lot.tokensetId, g);
    }

    let hidden = 0;
    const groups = [...byId.values()]
      .map((g) => {
        const lotPnls = hideSmall
          ? g.lotPnls.filter((p) => {
              const small = isSmallPosition(p);
              if (small) hidden += 1;
              return !small;
            })
          : g.lotPnls;
        return { name: g.name, lotPnls };
      })
      .filter((g) => g.lotPnls.length > 0);

    return { visibleGroups: groups, hiddenCount: hidden };
  }, [lots, priceByToken, hideSmall]);

  const hasAnyOpen = lots.some((lot) => lot.legs.some((l) => l.qtyRemaining > DUST));
  if (!hasAnyOpen) {
    return <p className="muted">No open positions.</p>;
  }

  return (
    <div className="portfolio">
      <div className="portfolio-controls">
        <label className="toggle small">
          <input
            type="checkbox"
            checked={hideSmall}
            onChange={(e) => setHideSmall(e.target.checked)}
          />
          Hide small balances (&lt; {formatUsd(SMALL_POSITION_USD)})
          {hideSmall && hiddenCount > 0 && (
            <span className="muted"> · {hiddenCount} hidden</span>
          )}
        </label>
      </div>

      {stale && (
        <p className="stale-banner small">
          ⚠ Prices may be stale — P&amp;L below might be out of date.
        </p>
      )}

      {visibleGroups.length === 0 ? (
        <p className="muted">
          All open positions are below {formatUsd(SMALL_POSITION_USD)}.
        </p>
      ) : (
        visibleGroups.map((group) => {
        const lotPnls = group.lotPnls;
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
        })
      )}
    </div>
  );
}
