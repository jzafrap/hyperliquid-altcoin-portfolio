import { useBookLiquidity } from "../hooks/useBookLiquidity";
import { formatPct, formatUsdCompact } from "../lib/format";
import { LiquidityBadge } from "./LiquidityBadge";

/**
 * Order-book liquidity detail for a single selected token (instructions.md §6.2):
 * spread % and depth near mid, so "illiquid" is concrete, not abstract.
 */
export function TokenLiquidityDetail({
  coin,
  dayNtlVlm,
}: {
  coin: string;
  dayNtlVlm: number;
}) {
  const { data, isLoading, isError } = useBookLiquidity(coin, dayNtlVlm);

  if (isLoading) return <span className="muted small">loading book…</span>;
  if (isError || !data) return <span className="error small">book unavailable</span>;

  const bandLabel = `±${(data.bandPct * 100).toFixed(0)}%`;
  return (
    <span className="liq-detail small">
      <LiquidityBadge tier={data.tier} />
      <span className="muted">
        spread {formatPct(data.spreadPct, 2)} · depth {bandLabel}:{" "}
        {formatUsdCompact(data.bidDepthUsd)} bid / {formatUsdCompact(data.askDepthUsd)} ask
      </span>
    </span>
  );
}
