import { describe, expect, it } from "vitest";
import {
  depthWithinPct,
  liquidityTier,
  midFromBook,
  spreadPct,
  spreadTier,
  volumeTier,
  worstTier,
  type Level,
} from "./liquidity";

const bids: Level[] = [
  { px: "99", sz: "10" },
  { px: "98", sz: "20" },
  { px: "90", sz: "100" }, // outside ±2% of mid 100
];
const asks: Level[] = [
  { px: "101", sz: "10" },
  { px: "102", sz: "20" },
  { px: "110", sz: "100" }, // outside ±2% of mid 100
];

describe("midFromBook", () => {
  it("averages best bid and ask", () => {
    expect(midFromBook(bids, asks)).toBe(100);
  });
  it("returns null when a side is empty", () => {
    expect(midFromBook([], asks)).toBeNull();
    expect(midFromBook(bids, [])).toBeNull();
  });
});

describe("spreadPct", () => {
  it("computes spread as a percentage of mid", () => {
    // (101 - 99) / 100 * 100 = 2%
    expect(spreadPct(bids, asks)).toBeCloseTo(2);
  });
  it("returns null for a one-sided book", () => {
    expect(spreadPct([], asks)).toBeNull();
  });
});

describe("depthWithinPct", () => {
  it("sums only levels within the band around mid", () => {
    // bids within ±2% of 100: 99*10 + 98*20 = 990 + 1960 = 2950 (90 excluded)
    expect(depthWithinPct(bids, 100, 0.02)).toBe(2950);
    // asks within ±2%: 101*10 + 102*20 = 1010 + 2040 = 3050 (110 excluded)
    expect(depthWithinPct(asks, 100, 0.02)).toBe(3050);
  });
  it("returns 0 when nothing is within the band", () => {
    expect(depthWithinPct(bids, 100, 0.001)).toBe(0);
  });
});

describe("tiers", () => {
  it("classifies volume", () => {
    expect(volumeTier(2_000_000)).toBe("high");
    expect(volumeTier(500_000)).toBe("medium");
    expect(volumeTier(1_000)).toBe("low");
  });
  it("classifies spread (tighter = better)", () => {
    expect(spreadTier(0.1)).toBe("high");
    expect(spreadTier(0.5)).toBe("medium");
    expect(spreadTier(3)).toBe("low");
  });
  it("worstTier picks the least liquid", () => {
    expect(worstTier("high", "low")).toBe("low");
    expect(worstTier("high", "medium")).toBe("medium");
    expect(worstTier("high", "high")).toBe("high");
  });
  it("combines volume and spread conservatively", () => {
    // high volume but wide spread -> low
    expect(liquidityTier(2_000_000, 5)).toBe("low");
    // high volume, no spread info -> volume tier
    expect(liquidityTier(2_000_000, null)).toBe("high");
    // medium volume, tight spread -> medium (worst of medium/high)
    expect(liquidityTier(500_000, 0.1)).toBe("medium");
  });
});
