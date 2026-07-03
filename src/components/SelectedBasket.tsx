import type { SpotMarket } from "../lib/markets";
import { TokenLiquidityDetail } from "./TokenLiquidityDetail";

/**
 * Preview of the tokens currently selected for a tokenset, each with live
 * order-book liquidity (spread + depth) so the user can judge "poco líquido"
 * before saving the set (instructions.md §6.2). Persisting the set is slice 3.
 */
export function SelectedBasket({
  markets,
  onRemove,
}: {
  markets: SpotMarket[];
  onRemove: (market: SpotMarket) => void;
}) {
  if (markets.length === 0) {
    return (
      <p className="muted">
        Select tokens on the left to compose a set. Their live liquidity appears here.
      </p>
    );
  }

  return (
    <div className="selected-basket">
      <p className="muted small">
        {markets.length} token{markets.length > 1 ? "s" : ""} · buys will split
        equally across them (§6.3)
      </p>
      <ul className="basket-list">
        {markets.map((m) => (
          <li key={m.coin} className="basket-item">
            <div className="basket-item-head">
              <strong>{m.tokenName}</strong>
              <button
                type="button"
                className="ghost"
                onClick={() => onRemove(m)}
                aria-label={`Remove ${m.tokenName}`}
              >
                ✕
              </button>
            </div>
            <TokenLiquidityDetail coin={m.coin} dayNtlVlm={m.dayNtlVlm} />
          </li>
        ))}
      </ul>
    </div>
  );
}
