import { beforeEach, describe, expect, it } from "vitest";
import {
  addLot,
  anyLegFilled,
  applySellFills,
  buildLegsFromStatuses,
  loadLots,
  makeBuyRecord,
  replaceLot,
  saveLots,
  spentFromLegs,
  type BuyRecord,
  type OrderStatus,
} from "./lots";
import type { BuyPlan } from "./orders";

function lotFixture(): BuyRecord {
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
  };
}

const plan: BuyPlan = {
  usdcTotal: 100,
  plannedUsd: 100,
  minTotal: 20,
  slippage: 0.02,
  ok: true,
  errors: [],
  legs: [
    {
      tokenName: "A",
      coin: "@1",
      assetId: 10001,
      szDecimals: 2,
      allocationUsd: 50,
      mid: 10,
      limitPrice: 10.2,
      size: 5,
      maxNotionalUsd: 51,
    },
    {
      tokenName: "B",
      coin: "@2",
      assetId: 10002,
      szDecimals: 2,
      allocationUsd: 50,
      mid: 20,
      limitPrice: 20.4,
      size: 2.5,
      maxNotionalUsd: 51,
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

describe("applySellFills", () => {
  it("reduces qtyRemaining, accrues realized P&L, and sets partially_sold", () => {
    const { lot, realizedPnlUsd } = applySellFills(lotFixture(), [
      { token: "A", soldQty: 2.5, avgPx: 12 }, // pnl = 2.5*(12-10)=5
    ]);
    const legA = lot.legs.find((l) => l.token === "A")!;
    expect(legA.qtyRemaining).toBe(2.5);
    expect(legA.realizedPnlUsd).toBe(5);
    expect(realizedPnlUsd).toBe(5);
    expect(lot.status).toBe("partially_sold");
  });

  it("closes the lot when everything is sold", () => {
    const { lot } = applySellFills(lotFixture(), [
      { token: "A", soldQty: 5, avgPx: 9 }, // pnl -5
      { token: "B", soldQty: 2, avgPx: 30 }, // pnl +10
    ]);
    expect(lot.status).toBe("closed");
    expect(lot.legs.every((l) => l.qtyRemaining === 0)).toBe(true);
  });

  it("does not touch legs that were not sold", () => {
    const { lot } = applySellFills(lotFixture(), [{ token: "A", soldQty: 1, avgPx: 11 }]);
    const legB = lot.legs.find((l) => l.token === "B")!;
    expect(legB.qtyRemaining).toBe(2);
    expect(legB.realizedPnlUsd).toBeUndefined();
  });

  it("accrues realized P&L across successive sells", () => {
    const first = applySellFills(lotFixture(), [{ token: "A", soldQty: 1, avgPx: 12 }]);
    const second = applySellFills(first.lot, [{ token: "A", soldQty: 1, avgPx: 13 }]);
    const legA = second.lot.legs.find((l) => l.token === "A")!;
    expect(legA.qtyRemaining).toBe(3);
    expect(legA.realizedPnlUsd).toBe(2 + 3); // 1*(12-10) + 1*(13-10)
  });
});

describe("replaceLot", () => {
  it("replaces by id and leaves others", () => {
    const a = { ...lotFixture(), id: "a" };
    const b = { ...lotFixture(), id: "b" };
    const updated = { ...a, status: "closed" as const };
    const result = replaceLot([a, b], updated);
    expect(result.find((l) => l.id === "a")?.status).toBe("closed");
    expect(result.find((l) => l.id === "b")?.status).toBe("open");
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
