import { describe, expect, it } from "vitest";
import type { BuyRecord } from "./lots";
import { buildSellOrders, planSell, type SellMarketInput } from "./sell";

const lot: BuyRecord = {
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
};

/** Same lot but opened short — closing it must buy-to-cover, never plain-sell. */
const shortLot: BuyRecord = {
  ...lot,
  id: "lot-short",
  side: "short",
};

const spotM = (over: Partial<SellMarketInput>): SellMarketInput => ({
  tokenName: "A",
  coin: "@1",
  marketType: "spot",
  assetId: 10001,
  szDecimals: 2,
  priceMaxDecimals: 6,
  midPx: 12,
  ...over,
});

const markets = new Map<string, SellMarketInput>([
  ["A", spotM({ tokenName: "A", coin: "@1", assetId: 10001, midPx: 12 })],
  ["B", spotM({ tokenName: "B", coin: "@2", assetId: 10002, midPx: 30 })],
]);

describe("planSell", () => {
  it("sells the given percentage of each leg's remaining qty", () => {
    const plan = planSell(lot, 0.5, markets);
    expect(plan.ok).toBe(true);
    expect(plan.legs).toHaveLength(2);
    expect(plan.legs[0].sellQty).toBe(2.5); // 50% of 5
    expect(plan.legs[1].sellQty).toBe(1); // 50% of 2
    expect(plan.legs.every((l) => l.sellable)).toBe(true);
  });

  it("prices sells below mid (marketable)", () => {
    const plan = planSell(lot, 1, markets);
    expect(plan.legs[0].limitPrice).toBeLessThan(12);
  });

  it("rejects an out-of-range percentage", () => {
    expect(planSell(lot, 0, markets).ok).toBe(false);
    expect(planSell(lot, 1.5, markets).ok).toBe(false);
  });

  it("flags a leg with no market as not sellable (never dropped)", () => {
    const plan = planSell(lot, 1, new Map([["A", markets.get("A")!]]));
    const legB = plan.legs.find((l) => l.token === "B");
    expect(legB?.sellable).toBe(false);
    expect(legB?.reason).toMatch(/no market/i);
    // A is still sellable, so the plan is ok overall.
    expect(plan.ok).toBe(true);
    expect(plan.sellableCount).toBe(1);
  });

  it("flags a leg below the $10 minimum as not sellable", () => {
    // 10% of B (2 units) = 0.2 @ mid 30 = $6 < $10
    const plan = planSell(lot, 0.1, markets);
    const legB = plan.legs.find((l) => l.token === "B");
    expect(legB?.sellable).toBe(false);
    expect(legB?.reason).toMatch(/min/i);
  });

  it("skips already-sold legs (zero remaining)", () => {
    const partial: BuyRecord = {
      ...lot,
      legs: [{ ...lot.legs[0], qtyRemaining: 0 }, lot.legs[1]],
    };
    const plan = planSell(partial, 1, markets);
    expect(plan.legs).toHaveLength(1);
    expect(plan.legs[0].token).toBe("B");
  });
});

describe("buildSellOrders", () => {
  it("builds IOC sell orders (b=false) for sellable legs only", () => {
    const plan = planSell(lot, 1, new Map([["A", markets.get("A")!]]));
    const orders = buildSellOrders(plan.legs);
    expect(orders).toHaveLength(1);
    expect(orders[0].a).toBe(10001);
    expect(orders[0].b).toBe(false);
    expect(orders[0].t).toEqual({ limit: { tif: "Ioc" } });
    expect(orders[0].s).toBe("5");
    expect(orders[0].r).toBe(false); // spot sell is not reduceOnly
  });

  it("marks perp sells as reduceOnly (closing a long)", () => {
    const perpMarket: SellMarketInput = {
      tokenName: "A",
      coin: "A",
      marketType: "perp",
      assetId: 3,
      szDecimals: 2,
      priceMaxDecimals: 4,
      midPx: 12,
    };
    const plan = planSell(lot, 1, new Map([["A", perpMarket]]));
    const orders = buildSellOrders(plan.legs);
    expect(orders[0].a).toBe(3);
    expect(orders[0].r).toBe(true); // perp sell = reduceOnly
  });
});

describe("planSell — side-aware close pricing", () => {
  it("long-lot close still prices below mid (sell direction, rounds down) — unchanged", () => {
    const plan = planSell(lot, 1, markets);
    expect(plan.legs[0].side).toBe("long");
    expect(plan.legs[0].limitPrice).toBeLessThan(12);
  });

  it("short-lot close prices ABOVE mid (buy-to-cover direction, rounds up)", () => {
    const plan = planSell(shortLot, 1, markets);
    expect(plan.legs[0].side).toBe("short");
    expect(plan.legs[0].limitPrice).toBeGreaterThan(12);
  });
});

describe("buildSellOrders — side-aware close (correctness fix)", () => {
  const perpMarket: SellMarketInput = {
    tokenName: "A",
    coin: "A",
    marketType: "perp",
    assetId: 3,
    szDecimals: 2,
    priceMaxDecimals: 4,
    midPx: 12,
  };

  it("long-lot close sells (b=false) — unchanged regression", () => {
    const plan = planSell(lot, 1, new Map([["A", perpMarket]]));
    const orders = buildSellOrders(plan.legs);
    expect(orders[0].b).toBe(false);
    expect(orders[0].r).toBe(true);
  });

  it("short-lot close BUYS to cover (b=true), and stays reduceOnly on perp", () => {
    // This is the bug this phase fixes: closing a short via a plain sell (b=false)
    // would GROW the short instead of covering it. A correct close must flip `b`.
    const plan = planSell(shortLot, 1, new Map([["A", perpMarket]]));
    const orders = buildSellOrders(plan.legs);
    expect(orders[0].b).toBe(true); // buy-to-cover, NOT sell
    expect(orders[0].r).toBe(true); // reduceOnly stays true both ways
  });
});
