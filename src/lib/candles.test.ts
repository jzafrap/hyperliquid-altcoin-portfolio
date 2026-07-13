import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./hyperliquid", () => ({
  getInfoClient: vi.fn(),
}));

import { getInfoClient } from "./hyperliquid";
import {
  BTC_CANDLE_INTERVAL,
  candlesToPoints,
  changePct,
  getBtcCandles,
  parseCandle,
  priceDirection,
  type Candle,
} from "./candles";

function rawCandle(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    t: 1_000,
    T: 1_900_000,
    s: "BTC",
    i: "15m" as const,
    o: "100.5",
    c: "102.25",
    h: "103",
    l: "99",
    v: "12.34",
    n: 42,
    ...overrides,
  };
}

function candle(overrides: Partial<Candle> = {}): Candle {
  return { t: 0, T: 0, o: 100, c: 100, h: 100, l: 100, v: 0, ...overrides };
}

describe("parseCandle", () => {
  it("parses the string OHLCV fields into numbers", () => {
    expect(parseCandle(rawCandle())).toEqual({
      t: 1_000,
      T: 1_900_000,
      o: 100.5,
      c: 102.25,
      h: 103,
      l: 99,
      v: 12.34,
    });
  });
});

describe("candlesToPoints", () => {
  it("maps each candle to a {time, price} point using close time and close price", () => {
    const candles = [
      candle({ t: 0, T: 100, o: 10, c: 12 }),
      candle({ t: 100, T: 200, o: 12, c: 11 }),
    ];
    expect(candlesToPoints(candles)).toEqual([
      { time: 100, price: 12 },
      { time: 200, price: 11 },
    ]);
  });

  it("returns an empty array for an empty series", () => {
    expect(candlesToPoints([])).toEqual([]);
  });
});

describe("priceDirection", () => {
  it("is up when the last close is at or above the first open", () => {
    const candles = [candle({ o: 10, c: 10 }), candle({ o: 10, c: 11 })];
    expect(priceDirection(candles)).toBe("up");
  });

  it("is down when the last close is below the first open", () => {
    const candles = [candle({ o: 10, c: 10 }), candle({ o: 10, c: 9 })];
    expect(priceDirection(candles)).toBe("down");
  });

  it("treats an unchanged price as up (last close equal to first open)", () => {
    expect(priceDirection([candle({ o: 10, c: 10 })])).toBe("up");
  });

  it("is null for an empty series", () => {
    expect(priceDirection([])).toBeNull();
  });
});

describe("changePct", () => {
  it("computes the percent change from the first open to the last close", () => {
    const candles = [candle({ o: 100, c: 100 }), candle({ o: 100, c: 110 })];
    expect(changePct(candles)).toBe(10);
  });

  it("computes a negative percent change when price fell", () => {
    const candles = [candle({ o: 100, c: 100 }), candle({ o: 100, c: 90 })];
    expect(changePct(candles)).toBe(-10);
  });

  it("returns null for an empty series", () => {
    expect(changePct([])).toBeNull();
  });

  it("returns null when the first open is zero (avoid division by zero)", () => {
    expect(changePct([candle({ o: 0, c: 5 })])).toBeNull();
  });
});

describe("getBtcCandles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches a 24h BTC candle window and parses the response", async () => {
    const candleSnapshot = vi.fn().mockResolvedValue([rawCandle()]);
    (getInfoClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ candleSnapshot });

    const candles = await getBtcCandles();

    expect(candleSnapshot).toHaveBeenCalledWith(
      expect.objectContaining({ coin: "BTC", interval: BTC_CANDLE_INTERVAL }),
    );
    const [{ startTime }] = candleSnapshot.mock.calls[0];
    expect(startTime).toBeLessThanOrEqual(Date.now() - 23 * 60 * 60 * 1000);
    expect(candles).toEqual([
      { t: 1_000, T: 1_900_000, o: 100.5, c: 102.25, h: 103, l: 99, v: 12.34 },
    ]);
  });
});
