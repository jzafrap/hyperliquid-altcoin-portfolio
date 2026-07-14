import { type PointerEvent, useState } from "react";
import { useBtcCandles } from "../hooks/useBtcCandles";
import {
  candlesToPoints,
  changePct,
  priceDirection,
  type Candle,
  type ChartPoint,
} from "../lib/candles";

const WIDTH = 560;
const HEIGHT = 160;
const PADDING = 8;

function formatPrice(price: number): string {
  return price.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function BtcChartSvg({ candles }: { candles: Candle[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const points: ChartPoint[] = candlesToPoints(candles);
  const direction = priceDirection(candles) ?? "up";
  const pct = changePct(candles) ?? 0;
  const lastPrice = points[points.length - 1].price;

  const prices = points.map((p) => p.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  const xFor = (i: number) =>
    points.length > 1
      ? PADDING + (i / (points.length - 1)) * (WIDTH - PADDING * 2)
      : WIDTH / 2;
  const yFor = (price: number) =>
    HEIGHT - PADDING - ((price - minPrice) / priceRange) * (HEIGHT - PADDING * 2);

  const linePath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(2)},${yFor(p.price).toFixed(2)}`)
    .join(" ");
  const areaPath =
    `${linePath} ` +
    `L${xFor(points.length - 1).toFixed(2)},${(HEIGHT - PADDING).toFixed(2)} ` +
    `L${xFor(0).toFixed(2)},${(HEIGHT - PADDING).toFixed(2)} Z`;

  const lastIndex = points.length - 1;
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  const handlePointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (points.length < 2) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const ratio = (relX - PADDING) / (WIDTH - PADDING * 2);
    const idx = Math.round(ratio * (points.length - 1));
    setHoverIndex(Math.min(lastIndex, Math.max(0, idx)));
  };

  const handlePointerLeave = () => setHoverIndex(null);

  const directionWord = direction === "up" ? "up" : "down";
  const ariaLabel = `BTC price ${directionWord} ${Math.abs(pct).toFixed(2)}% over the last 24 hours, currently $${formatPrice(lastPrice)}`;

  return (
    <div className={`btc-chart btc-chart--${direction}`}>
      <div className="btc-chart-header">
        <span className="btc-chart-price num">${formatPrice(lastPrice)}</span>
        <span className={`btc-chart-change ${direction}`}>
          {pct >= 0 ? "+" : ""}
          {pct.toFixed(2)}%
        </span>
      </div>

      <svg
        className="btc-chart-svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        <path className="btc-chart-area" d={areaPath} />
        <path className="btc-chart-line" d={linePath} />
        <circle
          className="btc-chart-end-dot"
          cx={xFor(lastIndex)}
          cy={yFor(points[lastIndex].price)}
          r={4}
        />
        {hovered && hoverIndex !== null && (
          <>
            <line
              className="btc-chart-crosshair"
              x1={xFor(hoverIndex)}
              x2={xFor(hoverIndex)}
              y1={PADDING}
              y2={HEIGHT - PADDING}
            />
            <circle
              className="btc-chart-dot"
              cx={xFor(hoverIndex)}
              cy={yFor(hovered.price)}
              r={4}
            />
          </>
        )}
      </svg>

      {hovered && (
        <div className="btc-chart-tooltip" role="status">
          <strong className="num">${formatPrice(hovered.price)}</strong>
          <span className="muted small">{formatTime(hovered.time)}</span>
        </div>
      )}
    </div>
  );
}

/** "BTC · 24h" panel: a simple line/area price chart with hover crosshair + tooltip. */
export function BtcChart() {
  const { data: candles, isLoading, isError } = useBtcCandles();

  return (
    <section className="panel btc-chart-panel">
      <h2>BTC · 24h</h2>
      {isLoading && <p className="muted small">Loading BTC price…</p>}
      {isError && !isLoading && (
        <p className="error small">
          Couldn't load BTC price — check your connection and retry.
        </p>
      )}
      {!isLoading && !isError && candles && candles.length > 0 && (
        <BtcChartSvg candles={candles} />
      )}
    </section>
  );
}
