import { useState } from "react";
import type { Address } from "viem";
import { executeSell } from "../lib/execute";
import { formatUsd } from "../lib/format";
import type { BuyRecord } from "../lib/lots";
import type { Market, MarketType } from "../lib/markets";

const PERCENTAGES: { label: string; pct: number }[] = [
  { label: "25%", pct: 0.25 },
  { label: "50%", pct: 0.5 },
  { label: "100%", pct: 1 },
];

/**
 * Sell controls for a single lot (§6.4): sell 25/50/100% of each leg's remaining
 * quantity. Acts on this lot alone. Requires an approved agent. For perps this
 * closes the position via reduceOnly orders — a long lot closes with a plain
 * sell, a short lot closes by buying to cover (see `sell.ts`'s side-aware
 * `planSell`/`buildSellOrders`); the label reflects which is happening so a
 * "Sell" action doesn't quietly submit a cover-buy under the hood.
 */
export function SellForm({
  lot,
  markets,
  marketType,
  masterAddress,
  agentApproved,
  onSold,
}: {
  lot: BuyRecord;
  markets: Market[];
  marketType: MarketType;
  masterAddress: Address;
  agentApproved: boolean;
  onSold: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Lots persisted before directional shorts existed have no `side` field —
  // treated as "long", matching sell.ts/lots.ts's own backward-compat default.
  const closeLabel = lot.side === "short" ? "Cover" : "Sell";

  if (!agentApproved) {
    return <p className="muted small">Enable trading to sell.</p>;
  }

  const handleSell = async (pct: number) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await executeSell({ masterAddress, marketType, lot, pct, markets });
      const pnl = res.realizedPnlUsd;
      const pnlText = `${pnl >= 0 ? "+" : ""}${formatUsd(pnl)}`;
      if (!res.persisted) {
        setError(
          `Sold (realized ${pnlText}) but could not save the update locally — refresh and verify.`,
        );
      } else {
        setMessage(
          `Sold — realized ${pnlText}${
            res.partial ? " (partial — some legs did not fully sell)" : ""
          }`,
        );
      }
      onSold();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sell-form">
      <div className="sell-row">
        <span className="muted small">{closeLabel}</span>
        {PERCENTAGES.map(({ label, pct }) => (
          <button
            key={label}
            type="button"
            className="ghost sell-btn"
            disabled={busy}
            onClick={() => handleSell(pct)}
          >
            {label}
          </button>
        ))}
      </div>
      {message && <p className="ok small">{message}</p>}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
