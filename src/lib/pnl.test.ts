import { describe, expect, it } from "vitest";
import type { BuyRecord } from "./lots";
import { aggregateTotals, computeLotPnl, isPriceStale, PRICE_STALE_MS } from "./pnl";

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
