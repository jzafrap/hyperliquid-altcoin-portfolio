import type { Address } from "viem";
import type { Market, MarketType } from "../lib/markets";
import type { Tokenset } from "../lib/tokensets";
import { BuyForm } from "./BuyForm";
import { ShortForm } from "./ShortForm";

/**
 * List of the wallet's saved tokensets with a buy control per set (§6.3). In
 * perp mode, a directional short control is also mounted alongside the buy
 * control — tokenset/asset-scoped, since opening a short has no pre-existing
 * lot to attach to. P&L and open lots are shown separately (§6.5).
 */
export function TokensetList({
  tokensets,
  markets,
  marketType,
  masterAddress,
  agentApproved,
  onDelete,
  onBought,
}: {
  tokensets: Tokenset[];
  markets: Market[];
  marketType: MarketType;
  masterAddress: Address | undefined;
  agentApproved: boolean;
  onDelete: (id: string) => void;
  onBought: () => void;
}) {
  if (tokensets.length === 0) {
    return <p className="muted">No tokensets yet. Compose one above to get started.</p>;
  }

  return (
    <ul className="tokenset-list">
      {tokensets.map((ts) => (
        <li key={ts.id} className="tokenset-card">
          <div className="tokenset-card-head">
            <div>
              <strong className="tokenset-name">{ts.name}</strong>
              <span className="muted small">
                {" "}
                · {ts.tokens.length} token{ts.tokens.length > 1 ? "s" : ""} ·{" "}
                {new Date(ts.createdAt).toLocaleDateString()}
              </span>
            </div>
            <button
              type="button"
              className="ghost"
              onClick={() => onDelete(ts.id)}
              aria-label={`Delete ${ts.name}`}
            >
              ✕
            </button>
          </div>
          <div className="token-chips">
            {ts.tokens.map((t) => (
              <span key={t} className="token-chip">
                {t}
              </span>
            ))}
          </div>
          {masterAddress && (
            <BuyForm
              tokenset={ts}
              markets={markets}
              marketType={marketType}
              masterAddress={masterAddress}
              agentApproved={agentApproved}
              onBought={onBought}
            />
          )}
          {masterAddress && marketType === "perp" && (
            <ShortForm
              tokenset={ts}
              markets={markets}
              marketType={marketType}
              masterAddress={masterAddress}
              agentApproved={agentApproved}
              onShorted={onBought}
            />
          )}
        </li>
      ))}
    </ul>
  );
}
