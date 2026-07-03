import type { Address } from "viem";
import { formatPrice, formatUsd } from "../lib/format";
import type { BuyRecord } from "../lib/lots";
import type { SpotMarket } from "../lib/markets";
import { SellForm } from "./SellForm";

const DUST = 1e-9;

/**
 * List of buy lots with per-lot sell controls (§6.4, §6.5).
 * Live P&L (current mid vs entry) arrives in slice 7; realized P&L shows after a sell.
 */
export function LotsList({
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
  if (lots.length === 0) {
    return <p className="muted">No buys yet.</p>;
  }

  return (
    <ul className="lots-list">
      {lots.map((lot) => {
        const hasRemaining = lot.legs.some((l) => l.qtyRemaining > DUST);
        return (
          <li key={lot.id} className="lot-card">
            <div className="lot-head">
              <strong>{lot.tokensetName}</strong>
              <span className="muted small">
                {formatUsd(lot.usdcSpent)} · {lot.status} ·{" "}
                {new Date(lot.createdAt).toLocaleDateString()}
              </span>
            </div>
            <table className="lot-legs">
              <tbody>
                {lot.legs.map((leg) => (
                  <tr key={leg.token} className={leg.error ? "leg-failed" : ""}>
                    <td>{leg.token}</td>
                    <td className="num">{leg.qtyRemaining}</td>
                    <td className="num muted">
                      {leg.error ? "—" : `@ ${formatPrice(leg.avgEntryPrice)}`}
                    </td>
                    <td className="num small">
                      {leg.realizedPnlUsd !== undefined && leg.realizedPnlUsd !== 0 ? (
                        <span className={leg.realizedPnlUsd >= 0 ? "ok" : "error"}>
                          {leg.realizedPnlUsd >= 0 ? "+" : ""}
                          {formatUsd(leg.realizedPnlUsd)}
                        </span>
                      ) : (
                        <span className="muted">{leg.error ?? ""}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {masterAddress && hasRemaining && (
              <SellForm
                lot={lot}
                markets={markets}
                masterAddress={masterAddress}
                agentApproved={agentApproved}
                onSold={onSold}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}
