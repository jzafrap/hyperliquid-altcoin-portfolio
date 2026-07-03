import { describe, expect, it } from "vitest";
import {
  buildBuyOrders,
  marketablePrice,
  minTotalFor,
  planBuy,
  roundSize,
  spotAssetId,
  toDecimalString,
  type BuyMarketInput,
} from "./orders";

describe("spotAssetId", () => {
  it("is 10000 + universe index (PURR=10000, @1=10001)", () => {
    expect(spotAssetId(0)).toBe(10000);
    expect(spotAssetId(1)).toBe(10001);
    expect(spotAssetId(1204)).toBe(11204);
  });
});

describe("roundSize", () => {
  it("rounds down to szDecimals (never up)", () => {
    expect(roundSize(1.23456, 2)).toBe(1.23);
    expect(roundSize(1.239, 2)).toBe(1.23);
    expect(roundSize(5, 0)).toBe(5);
    expect(roundSize(5.9, 0)).toBe(5);
  });
  it("returns 0 for non-positive sizes", () => {
    expect(roundSize(0, 2)).toBe(0);
    expect(roundSize(-1, 2)).toBe(0);
  });
  it("does not truncate already-aligned values via float error", () => {
    // 0.58*100 = 57.99999999999999 — must stay 0.58, not 0.57.
    expect(roundSize(0.58, 2)).toBe(0.58);
    expect(roundSize(0.0029, 4)).toBe(0.0029);
    expect(roundSize(2.5, 2)).toBe(2.5);
    // genuine extra precision is still floored down
    expect(roundSize(0.579999, 2)).toBe(0.57);
  });
});

describe("toDecimalString", () => {
  it("never uses exponential notation for tiny values", () => {
    expect(toDecimalString(5.1e-7, 8)).toBe("0.00000051");
    expect(toDecimalString(0.0000005, 8)).toBe("0.0000005");
  });
  it("trims trailing zeros but keeps integer digits", () => {
    expect(toDecimalString(10.2, 4)).toBe("10.2");
    expect(toDecimalString(100, 0)).toBe("100");
    expect(toDecimalString(5, 2)).toBe("5");
  });
});

describe("marketablePrice", () => {
  it("prices above mid for buys, below for sells", () => {
    expect(marketablePrice(100, true, 2, 0.02)).toBeCloseTo(102);
    expect(marketablePrice(100, false, 2, 0.02)).toBeCloseTo(98);
  });
  it("stays strictly marketable even with a coarse decimal cap (buy > mid)", () => {
    // mid 0.012345, szDecimals 6 -> max 2 decimals; nearest rounding would give
    // 0.01 (below mid) — ceil keeps the buy marketable.
    const px = marketablePrice(0.012345, true, 6, 0.02);
    expect(px).toBeGreaterThan(0.012345);
  });
});

describe("minTotalFor", () => {
  it("is 10 USDC per token", () => {
    expect(minTotalFor(3)).toBe(30);
    expect(minTotalFor(1)).toBe(10);
  });
});

const market = (over: Partial<BuyMarketInput> = {}): BuyMarketInput => ({
  tokenName: "TKN",
  coin: "@1",
  universeIndex: 1,
  szDecimals: 2,
  midPx: 10,
  ...over,
});

describe("planBuy", () => {
  it("splits equally and sizes off the limit price (never overspends)", () => {
    const plan = planBuy([market({ tokenName: "A" }), market({ tokenName: "B" })], 100);
    expect(plan.ok).toBe(true);
    expect(plan.legs).toHaveLength(2);
    expect(plan.legs[0].allocationUsd).toBe(50);
    // Sized off limit (mid*1.02=10.2): floor(50/10.2, 2dp) = 4.90 units.
    expect(plan.legs[0].size).toBe(4.9);
    // Worst-case spend must not exceed the allocation.
    expect(plan.legs[0].maxNotionalUsd).toBeLessThanOrEqual(50);
  });

  it("rejects a total below the minimum (min × n)", () => {
    const plan = planBuy([market(), market(), market()], 20); // need 30
    expect(plan.ok).toBe(false);
    expect(plan.minTotal).toBe(30);
    expect(plan.errors.some((e) => /at least 30/i.test(e))).toBe(true);
  });

  it("rejects when a leg falls below the minimum after rounding", () => {
    // price 10, szDecimals 0 -> per-token 12 USDC -> size floor(1.2)=1 -> notional 10 OK
    // but per-token 11 -> size floor(1.1)=1 -> notional 10 OK; use a case that rounds under:
    // price 30, szDecimals 0, total 40 over 2 tokens -> per-token 20 -> size floor(0.66)=0 -> fail
    const plan = planBuy(
      [market({ midPx: 30, szDecimals: 0 }), market({ midPx: 30, szDecimals: 0 })],
      40,
    );
    expect(plan.ok).toBe(false);
    expect(plan.errors.some((e) => /too small after rounding/i.test(e))).toBe(true);
  });

  it("flags a leg with no price", () => {
    const plan = planBuy([market({ midPx: null })], 50);
    expect(plan.ok).toBe(false);
    expect(plan.errors.some((e) => /no price/i.test(e))).toBe(true);
  });

  it("reports plannedUsd from rounded notionals (may differ from total)", () => {
    // price 3, szDecimals 0, total 20, 1 token -> size floor(20/3)=6 -> notional 18
    const plan = planBuy([market({ midPx: 3, szDecimals: 0 })], 20);
    expect(plan.legs[0].size).toBe(6);
    expect(plan.plannedUsd).toBe(18);
  });
});

describe("buildBuyOrders", () => {
  it("builds IOC buy orders with correct asset id, decimal-string price and size", () => {
    const plan = planBuy([market({ universeIndex: 5, midPx: 10, szDecimals: 2 })], 50);
    const orders = buildBuyOrders(plan);
    expect(orders).toHaveLength(1);
    expect(orders[0].a).toBe(10005);
    expect(orders[0].b).toBe(true);
    expect(orders[0].r).toBe(false);
    expect(orders[0].t).toEqual({ limit: { tif: "Ioc" } });
    expect(orders[0].p).toBe("10.2"); // mid*1.02, plain decimal string
    expect(orders[0].s).toBe("4.9"); // floor(50/10.2, 2dp)
    expect(orders[0].p).not.toMatch(/e/i); // never exponential
  });
});
