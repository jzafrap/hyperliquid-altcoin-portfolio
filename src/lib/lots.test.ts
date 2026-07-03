import { beforeEach, describe, expect, it } from "vitest";
import {
  addLot,
  anyLegFilled,
  buildLegsFromStatuses,
  loadLots,
  makeBuyRecord,
  saveLots,
  spentFromLegs,
  type BuyRecord,
  type OrderStatus,
} from "./lots";
import type { BuyPlan } from "./orders";

const plan: BuyPlan = {
  usdcTotal: 100,
  plannedUsd: 100,
  minTotal: 20,
  ok: true,
  errors: [],
  legs: [
    {
      tokenName: "A",
      coin: "@1",
      assetId: 10001,
      szDecimals: 2,
      allocationUsd: 50,
      price: 10,
      size: 5,
      notionalUsd: 50,
    },
    {
      tokenName: "B",
      coin: "@2",
      assetId: 10002,
      szDecimals: 2,
      allocationUsd: 50,
      price: 20,
      size: 2.5,
      notionalUsd: 50,
    },
  ],
};

describe("buildLegsFromStatuses", () => {
  it("records fills from filled statuses", () => {
    const statuses: OrderStatus[] = [
      { filled: { totalSz: "5", avgPx: "10.1", oid: 1 } },
      { filled: { totalSz: "2.5", avgPx: "20.2", oid: 2 } },
    ];
    const legs = buildLegsFromStatuses(plan, statuses);
    expect(legs[0]).toMatchObject({
      token: "A",
      qtyBought: 5,
      avgEntryPrice: 10.1,
      qtyRemaining: 5,
    });
    expect(legs[1].qtyBought).toBe(2.5);
    expect(legs.every((l) => l.error === undefined)).toBe(true);
  });

  it("keeps a failed leg with zero qty and its error (never drops it)", () => {
    const statuses: OrderStatus[] = [
      { filled: { totalSz: "5", avgPx: "10", oid: 1 } },
      { error: "insufficient liquidity" },
    ];
    const legs = buildLegsFromStatuses(plan, statuses);
    expect(legs).toHaveLength(2);
    expect(legs[1]).toMatchObject({ token: "B", qtyBought: 0, qtyRemaining: 0 });
    expect(legs[1].error).toBe("insufficient liquidity");
  });

  it("treats missing/resting statuses as unfilled", () => {
    const statuses: OrderStatus[] = [
      { resting: { oid: 1 } },
      "waitingForFill",
    ];
    const legs = buildLegsFromStatuses(plan, statuses);
    expect(anyLegFilled(legs)).toBe(false);
    expect(legs.every((l) => l.qtyBought === 0)).toBe(true);
  });
});

describe("spentFromLegs", () => {
  it("sums filled notionals only", () => {
    const legs = buildLegsFromStatuses(plan, [
      { filled: { totalSz: "5", avgPx: "10", oid: 1 } },
      { error: "x" },
    ]);
    expect(spentFromLegs(legs)).toBe(50);
  });
});

describe("makeBuyRecord", () => {
  it("builds an open lot with computed spend", () => {
    const legs = buildLegsFromStatuses(plan, [
      { filled: { totalSz: "5", avgPx: "10", oid: 1 } },
      { filled: { totalSz: "2.5", avgPx: "20", oid: 2 } },
    ]);
    const rec = makeBuyRecord(
      { tokensetId: "ts1", tokensetName: "Set", wallet: "0xabc", legs },
      "lot1",
      123,
    );
    expect(rec).toMatchObject({
      id: "lot1",
      tokensetId: "ts1",
      status: "open",
      usdcSpent: 100,
      createdAt: 123,
    });
  });
});

describe("lots persistence", () => {
  const wallet = "0xABC";
  beforeEach(() => localStorage.clear());

  it("round-trips and prepends lots, scoped per wallet", () => {
    const rec: BuyRecord = makeBuyRecord(
      { tokensetId: "ts1", tokensetName: "Set", wallet, legs: [] },
      "lot1",
      1,
    );
    saveLots(wallet, addLot(loadLots(wallet), rec));
    expect(loadLots(wallet)).toHaveLength(1);
    expect(loadLots("0xother")).toEqual([]);
  });
});
