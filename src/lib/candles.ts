import type { CandleSnapshotResponse } from "@nktkas/hyperliquid";
import { getInfoClient } from "./hyperliquid";

/** A single candle with OHLCV fields parsed to numbers (the SDK returns strings). */
export interface Candle {
  /** Opening timestamp (ms since epoch). */
  t: number;
  /** Closing timestamp (ms since epoch). */
  T: number;
  o: number;
  c: number;
  h: number;
  l: number;
  v: number;
}

/** A single plotted point: close price at the candle's close time. */
export interface ChartPoint {
  time: number;
  price: number;
}

export type PriceDirection = "up" | "down";

/** ~96 points over 24h — smooth enough for a line chart, cheap enough to fetch. */
export const BTC_CANDLE_INTERVAL = "15m";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse one raw SDK candle (string OHLCV) into a numeric {@link Candle}. */
export function parseCandle(raw: CandleSnapshotResponse[number]): Candle {
  return {
    t: raw.t,
    T: raw.T,
    o: Number(raw.o),
    c: Number(raw.c),
    h: Number(raw.h),
    l: Number(raw.l),
    v: Number(raw.v),
  };
}

/** Map candles to chart points (close time, close price), in series order. */
export function candlesToPoints(candles: Candle[]): ChartPoint[] {
  return candles.map((c) => ({ time: c.T, price: c.c }));
}

/**
 * Direction of the window: up if the last close is at or above the first open,
 * down otherwise. Null when there's no data.
 */
export function priceDirection(candles: Candle[]): PriceDirection | null {
  if (candles.length === 0) return null;
  const first = candles[0];
  const last = candles[candles.length - 1];
  return last.c >= first.o ? "up" : "down";
}

/** Percent change from the first candle's open to the last candle's close. */
export function changePct(candles: Candle[]): number | null {
  if (candles.length === 0) return null;
  const first = candles[0];
  const last = candles[candles.length - 1];
  if (first.o <= 0) return null;
  return ((last.c - first.o) / first.o) * 100;
}

/** Fetch the last 24h of BTC perp candles at {@link BTC_CANDLE_INTERVAL} granularity. */
export async function getBtcCandles(): Promise<Candle[]> {
  const raw = await getInfoClient().candleSnapshot({
    coin: "BTC",
    interval: BTC_CANDLE_INTERVAL,
    startTime: Date.now() - DAY_MS,
  });
  return raw.map(parseCandle);
}
