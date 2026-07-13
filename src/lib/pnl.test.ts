import { describe, expect, it } from "vitest";
import type { BuyRecord } from "./lots";
import {
  aggregateTotals,
  computeLotPnl,
  isPriceStale,
  isSmallPosition,
  PRICE_STALE_MS,
} from "./pnl";

function lot(over: Partial<BuyRecord> = {}): BuyRecord {
  return {
    id: "lot1",
    tokensetId: "ts1",
    tokensetName: "Set",
    wallet: "0xabc",
    usdcSpent: 100,
    status: "open",
    createdAt: 1,
    legs: [
      { token: "A", assetId: 10001, usdcAllocated: 50, qtyBought: 5, avgEntryPrice: 10, qtyRemaining: 5 },
      { token: "B", assetId: 10002, usdcAllocated: 50, qtyBought: 2, avgEntryPrice: 25, qtyRemaining: 2 },
    ],
    ...over,
  };
}

describe("computeLotPnl", () => {
  it("computes per-leg and total unrealized P&L from current prices", () => {
    const prices = new Map<string, number | null>([
      ["A", 12], // +2/unit on 5 = +10 (cost 50 -> +20%)
      ["B", 20], // -5/unit on 2 = -10 (cost 50 -> -20%)
    ]);
    const { legs, totals } = computeLotPnl(lot(), prices);
    expect(legs[0]).toMatchObject({ valueUsd: 60, pnlUsd: 10, pnlPct: 20 });
    expect(legs[1]).toMatchObject({ valueUsd: 40, pnlUsd: -10, pnlPct: -20 });
    expect(totals.costUsd).toBe(100);
    expect(totals.valueUsd).toBe(100);
    expect(totals.pnlUsd).toBe(0);
    expect(totals.pnlPct).toBe(0);
    expect(totals.unpricedCount).toBe(0);
  });

  it("leaves unpriced legs unvalued and excludes them from totals", () => {
    const prices = new Map<string, number | null>([
      ["A", 11], // +1/unit on 5 = +5, cost 50
      ["B", null], // no price
    ]);
    const { legs, totals } = computeLotPnl(lot(), prices);
    expect(legs[1].valueUsd).toBeNull();
    expect(legs[1].pnlPct).toBeNull();
    expect(totals.costUsd).toBe(50); // only A
    expect(totals.valueUsd).toBe(55);
    expect(totals.pnlUsd).toBe(5);
    expect(totals.pnlPct).toBe(10);
    expect(totals.unpricedCount).toBe(1);
  });

  it("ignores legs with no remaining quantity", () => {
    const l = lot({
      legs: [
        { token: "A", assetId: 10001, usdcAllocated: 50, qtyBought: 5, avgEntryPrice: 10, qtyRemaining: 0 },
        { token: "B", assetId: 10002, usdcAllocated: 50, qtyBought: 2, avgEntryPrice: 25, qtyRemaining: 2 },
      ],
    });
    const { legs } = computeLotPnl(l, new Map([["B", 25]]));
    expect(legs).toHaveLength(1);
    expect(legs[0].token).toBe("B");
  });

  it("returns null pnlPct when cost basis is zero", () => {
    const l = lot({
      legs: [{ token: "A", assetId: 10001, usdcAllocated: 0, qtyBought: 5, avgEntryPrice: 0, qtyRemaining: 5 }],
    });
    const { totals } = computeLotPnl(l, new Map([["A", 5]]));
    expect(totals.pnlPct).toBeNull();
  });
});

describe("isPriceStale", () => {
  it("is fresh within the threshold and stale beyond it", () => {
    const now = 1_000_000;
    expect(isPriceStale(now - 1000, now)).toBe(false);
    expect(isPriceStale(now - (PRICE_STALE_MS + 1), now)).toBe(true);
  });
  it("treats an unset or invalid timestamp as stale", () => {
    expect(isPriceStale(0, 1_000_000)).toBe(true);
    expect(isPriceStale(-5, 1_000_000)).toBe(true);
    expect(isPriceStale(NaN, 1_000_000)).toBe(true);
  });
});

describe("isSmallPosition", () => {
  it("flags a lot valued below the threshold", () => {
    // 5 A @ 0.5 = $2.5 value < $5
    const pnl = computeLotPnl(
      { ...lot(), legs: [{ token: "A", assetId: 10001, usdcAllocated: 50, qtyBought: 5, avgEntryPrice: 10, qtyRemaining: 5 }] },
      new Map([["A", 0.5]]),
    );
    expect(isSmallPosition(pnl, 5)).toBe(true);
  });

  it("does not flag a lot at or above the threshold", () => {
    const pnl = computeLotPnl(
      { ...lot(), legs: [{ token: "A", assetId: 10001, usdcAllocated: 50, qtyBought: 5, avgEntryPrice: 10, qtyRemaining: 5 }] },
      new Map([["A", 2]]), // $10 value
    );
    expect(isSmallPosition(pnl, 5)).toBe(false);
  });

  it("never flags a fully-unpriced lot (can't value it)", () => {
    const pnl = computeLotPnl(
      { ...lot(), legs: [{ token: "A", assetId: 10001, usdcAllocated: 50, qtyBought: 5, avgEntryPrice: 10, qtyRemaining: 5 }] },
      new Map([["A", null]]),
    );
    expect(isSmallPosition(pnl, 5)).toBe(false);
  });
});

describe("side-aware unrealized P&L", () => {
  it("keeps long unrealized P&L unchanged when side is explicitly long", () => {
    const prices = new Map<string, number | null>([
      ["A", 12], // +2/unit on 5 = +10
      ["B", 20], // -5/unit on 2 = -10
    ]);
    const { legs, totals } = computeLotPnl(lot({ side: "long" }), prices);
    expect(legs[0]).toMatchObject({ valueUsd: 60, pnlUsd: 10, pnlPct: 20 });
    expect(legs[1]).toMatchObject({ valueUsd: 40, pnlUsd: -10, pnlPct: -20 });
    expect(totals.pnlUsd).toBe(0);
  });

  it("profits a short lot when price falls", () => {
    const shortLot = lot({
      side: "short",
      legs: [
        { token: "A", assetId: 10001, usdcAllocated: 100, qtyBought: 10, avgEntryPrice: 10, qtyRemaining: 10 },
      ],
    });
    const prices = new Map<string, number | null>([["A", 8]]); // price fell 10 -> 8
    const { legs, totals } = computeLotPnl(shortLot, prices);
    // cost 100, value 80; short P&L = cost - value = +20
    expect(legs[0]).toMatchObject({ valueUsd: 80, pnlUsd: 20, pnlPct: 20 });
    expect(totals.pnlUsd).toBe(20);
  });

  it("loses on a short lot when price rises", () => {
    const shortLot = lot({
      side: "short",
      legs: [
        { token: "A", assetId: 10001, usdcAllocated: 100, qtyBought: 10, avgEntryPrice: 10, qtyRemaining: 10 },
      ],
    });
    const prices = new Map<string, number | null>([["A", 12]]); // price rose 10 -> 12
    const { legs } = computeLotPnl(shortLot, prices);
    expect(legs[0]).toMatchObject({ valueUsd: 120, pnlUsd: -20, pnlPct: -20 });
  });

  it("sums mixed long and short lots correctly via aggregateTotals", () => {
    const longLot = lot({
      id: "long1",
      side: "long",
      legs: [{ token: "A", assetId: 10001, usdcAllocated: 100, qtyBought: 10, avgEntryPrice: 10, qtyRemaining: 10 }],
    });
    const shortLot = lot({
      id: "short1",
      side: "short",
      legs: [{ token: "B", assetId: 10002, usdcAllocated: 100, qtyBought: 10, avgEntryPrice: 10, qtyRemaining: 10 }],
    });
    const prices = new Map<string, number | null>([
      ["A", 12], // long A: +2*10 = +20
      ["B", 8], // short B: (10-8)*10 = +20
    ]);
    const longPnl = computeLotPnl(longLot, prices);
    const shortPnl = computeLotPnl(shortLot, prices);
    const agg = aggregateTotals([longPnl, shortPnl]);
    expect(agg.pnlUsd).toBe(40);
  });
});

describe("aggregateTotals", () => {
  it("combines totals across multiple lots", () => {
    const prices = new Map<string, number | null>([["A", 12], ["B", 20]]);
    const a = computeLotPnl(lot({ id: "a" }), prices);
    const b = computeLotPnl(lot({ id: "b" }), prices);
    const agg = aggregateTotals([a, b]);
    expect(agg.costUsd).toBe(200);
    expect(agg.valueUsd).toBe(200);
    expect(agg.pnlUsd).toBe(0);
  });
});
