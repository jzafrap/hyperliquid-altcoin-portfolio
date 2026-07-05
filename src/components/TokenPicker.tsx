import { useMemo, useState } from "react";
import { useSpotMarkets } from "../hooks/useSpotMarkets";
import { formatPct, formatPrice, formatUsdCompact } from "../lib/format";
import type { Market } from "../lib/markets";
import { LiquidityBadge } from "./LiquidityBadge";

const MAX_ROWS = 80;

/**
 * Searchable list of USDC-quoted spot tokens with liquidity indicators, for
 * composing a tokenset (instructions.md §6.2). Selection is controlled by the
 * parent so tokenset persistence (§6.3, slice 3) can own the state.
 */
export function TokenPicker({
  selected,
  onToggle,
}: {
  selected: Set<string>;
  onToggle: (market: Market) => void;
}) {
  const { data: markets, isLoading, isError, error } = useSpotMarkets();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!markets) return [];
    const q = query.trim().toUpperCase();
    const list = q
      ? markets.filter((m) => m.tokenName.toUpperCase().includes(q))
      : markets;
    return list;
  }, [markets, query]);

  if (isLoading) return <p className="muted">Loading spot markets…</p>;
  if (isError) return <p className="error">Failed to load markets: {String(error)}</p>;

  const shown = filtered.slice(0, MAX_ROWS);
  const hidden = filtered.length - shown.length;

  return (
    <div className="token-picker">
      <input
        className="token-search"
        type="search"
        placeholder="Search token (e.g. HYPE, PURR)…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="token-list" role="list">
        {shown.map((m) => {
          const isSelected = selected.has(m.tokenName);
          return (
            <button
              type="button"
              role="listitem"
              key={m.coin}
              className={`token-row ${isSelected ? "selected" : ""}`}
              onClick={() => onToggle(m)}
              aria-pressed={isSelected}
            >
              <span className="token-check" aria-hidden="true">
                {isSelected ? "✓" : "+"}
              </span>
              <span className="token-name">{m.tokenName}</span>
              <span className="token-price">{formatPrice(m.midPx)}</span>
              <span
                className={`token-change ${
                  (m.change24hPct ?? 0) >= 0 ? "up" : "down"
                }`}
              >
                {formatPct(m.change24hPct)}
              </span>
              <span className="token-vol muted">
                {formatUsdCompact(m.dayNtlVlm)}
              </span>
              <LiquidityBadge tier={m.volumeTier} />
            </button>
          );
        })}
        {shown.length === 0 && <p className="muted">No tokens match “{query}”.</p>}
      </div>

      {hidden > 0 && (
        <p className="muted small">
          Showing top {MAX_ROWS} by volume — refine your search to see {hidden} more.
        </p>
      )}
    </div>
  );
}
