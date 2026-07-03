/** Display formatting helpers (presentation only). */

/** Compact USD, e.g. 1_250_000 -> "$1.25M". */
export function formatUsdCompact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
}

/** Full USD with cents, e.g. 1234.5 -> "$1,234.50". */
export function formatUsd(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** A price with a sensible number of significant digits for small/large values. */
export function formatPrice(value: number | null): string {
  if (value === null) return "—";
  const digits = value >= 1 ? 4 : 6;
  return value.toLocaleString(undefined, { maximumSignificantDigits: digits });
}

/** Signed percentage, e.g. 2.5 -> "+2.50%". */
export function formatPct(value: number | null, digits = 2): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}
