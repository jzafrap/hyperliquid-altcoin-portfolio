import { formatPrice, formatUsd } from "../lib/format";
import type { BuyRecord } from "../lib/lots";

/**
 * Basic list of open buy lots confirming what was purchased (§6.5, initial).
 * Live P&L (current mid vs entry, per token and per lot) arrives in slice 7.
 */
export function LotsList({ lots }: { lots: BuyRecord[] }) {
  if (lots.length === 0) {
    return <p className="muted">No buys yet.</p>;
  }

  return (
    <ul className="lots-list">
      {lots.map((lot) => (
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
                  <td className="muted small">{leg.error ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </li>
      ))}
    </ul>
  );
}
