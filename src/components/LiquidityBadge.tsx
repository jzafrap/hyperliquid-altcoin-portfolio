import type { LiquidityTier } from "../lib/liquidity";

const LABELS: Record<LiquidityTier, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Colored badge for a liquidity tier (instructions.md §6.2). */
export function LiquidityBadge({ tier }: { tier: LiquidityTier }) {
  return (
    <span className={`liq-badge liq-${tier}`}>
      {LABELS[tier]}
      {tier === "low" && (
        <span className="liq-warn" title="Illiquid — trades may slip" aria-hidden="true">
          {" "}⚠
        </span>
      )}
    </span>
  );
}
