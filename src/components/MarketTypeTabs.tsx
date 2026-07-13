import { useMarketType } from "../app/marketType";
import type { MarketType } from "../lib/markets";

const TABS: { type: MarketType; label: string }[] = [
  { type: "spot", label: "Spot" },
  { type: "perp", label: "Perps" },
];

/** Segmented control to switch the whole view between spot and perp markets. */
export function MarketTypeTabs() {
  const { marketType, setMarketType } = useMarketType();
  return (
    <div className="market-tabs" role="tablist" aria-label="Market type">
      {TABS.map(({ type, label }) => (
        <button
          key={type}
          type="button"
          role="tab"
          aria-selected={marketType === type}
          className={`market-tab ${marketType === type ? "active" : ""}`}
          onClick={() => setMarketType(type)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
