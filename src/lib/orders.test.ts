import { describe, expect, it } from "vitest";
import {
  buildBuyOrders,
  marketablePrice,
  minTotalFor,
  planBuy,
  roundSize,
  roundSpotPrice,
  spotAssetId,
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
});

describe("roundSpotPrice", () => {
  it("limits to 5 significant figures", () => {
    expect(roundSpotPrice(123456, 0)).toBe(123460);
    expect(roundSpotPrice(1.23456, 2)).toBe(1.2346);
  });
  it("limits decimals to 8 - szDecimals", () => {
    // szDecimals 6 -> max 2 decimals
    expect(roundSpotPrice(1.23456, 6)).toBe(1.23);
  });
});

describe("marketablePrice", () => {
  it("prices above mid for buys, below for sells", () => {
    expect(marketablePrice(100, true, 2, 0.02)).toBeCloseTo(102);
    expect(marketablePrice(100, false, 2, 0.02)).toBeCloseTo(98);
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
  it("splits equally across tokens", () => {
    const plan = planBuy([market({ tokenName: "A" }), market({ tokenName: "B" })], 100);
    expect(plan.ok).toBe(true);
    expect(plan.legs).toHaveLength(2);
    expect(plan.legs[0].allocationUsd).toBe(50);
    // 50 / 10 = 5 units
    expect(plan.legs[0].size).toBe(5);
    expect(plan.legs[0].notionalUsd).toBeCloseTo(50);
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
  it("builds IOC buy orders with correct asset id and marketable price", () => {
    const plan = planBuy([market({ universeIndex: 5, midPx: 10, szDecimals: 2 })], 50);
    const orders = buildBuyOrders(plan, 0.02);
    expect(orders).toHaveLength(1);
    expect(orders[0].a).toBe(10005);
    expect(orders[0].b).toBe(true);
    expect(orders[0].r).toBe(false);
    expect(orders[0].t).toEqual({ limit: { tif: "Ioc" } });
    expect(Number(orders[0].p)).toBeCloseTo(10.2);
    expect(orders[0].s).toBe("5");
  });
});
