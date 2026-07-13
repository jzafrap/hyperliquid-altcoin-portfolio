const LEVERAGE_OPTIONS = [1, 2, 3] as const;

/**
 * Shared 1x/2x/3x leverage picker for the perp BUY and directional SELL
 * (short) forms. Options above the asset's `maxLeverage` are hidden — never
 * silently clamped or left to fail after signing (money-safety convention).
 */
export function LeverageSelector({
  maxLeverage,
  value,
  onChange,
}: {
  /** Highest leverage allowed for the resolved asset(s) (min across a basket). */
  maxLeverage: number;
  value: number;
  onChange: (leverage: number) => void;
}) {
  return (
    <div className="leverage-selector" role="group" aria-label="Leverage">
      {LEVERAGE_OPTIONS.filter((lev) => lev <= maxLeverage).map((lev) => (
        <button
          key={lev}
          type="button"
          className={`leverage-btn ${value === lev ? "active" : ""}`}
          aria-pressed={value === lev}
          onClick={() => onChange(lev)}
        >
          {lev}x
        </button>
      ))}
    </div>
  );
}
