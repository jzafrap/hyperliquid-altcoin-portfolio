import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the agent trust boundary so we can drive order responses deterministically.
vi.mock("./agent", () => ({
  getAgentExchangeClient: vi.fn(),
}));

import { getAgentExchangeClient } from "./agent";
import { executeBuy, executeSell } from "./execute";
import { loadLots, saveLots, type BuyRecord } from "./lots";
import type { BuyMarketInput } from "./orders";
import type { SellMarketInput } from "./sell";

const MASTER = "0x1111111111111111111111111111111111111111" as const;

const markets: BuyMarketInput[] = [
  { tokenName: "A", coin: "@1", universeIndex: 1, szDecimals: 2, midPx: 10 },
];

function mockOrder(statuses: unknown[]) {
  (getAgentExchangeClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    order: vi.fn().mockResolvedValue({
      response: { data: { statuses } },
    }),
  });
}

describe("executeBuy", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("records a lot on a full fill", async () => {
    mockOrder([{ filled: { totalSz: "1.96", avgPx: "10.1", oid: 1 } }]);
    const res = await executeBuy({
      masterAddress: MASTER,
      tokensetId: "ts1",
      tokensetName: "Set",
      markets,
      usdcTotal: 20,
    });
    expect(res.partial).toBe(false);
    expect(res.persisted).toBe(true);
    expect(res.record.legs[0].qtyBought).toBe(1.96);
    expect(loadLots(MASTER)).toHaveLength(1);
  });

  it("throws before recording when nothing fills (safe to retry)", async () => {
    mockOrder([{ error: "insufficient liquidity" }]);
    await expect(
      executeBuy({
        masterAddress: MASTER,
        tokensetId: "ts1",
        tokensetName: "Set",
        markets,
        usdcTotal: 20,
      }),
    ).rejects.toThrow(/did not fill/i);
    expect(loadLots(MASTER)).toHaveLength(0);
  });

  it("throws on an invalid plan before touching the exchange", async () => {
    mockOrder([]);
    await expect(
      executeBuy({
        masterAddress: MASTER,
        tokensetId: "ts1",
        tokensetName: "Set",
        markets,
        usdcTotal: 1, // below min (10)
      }),
    ).rejects.toThrow(/at least 10/i);
    expect(getAgentExchangeClient).not.toHaveBeenCalled();
  });

  it("flags partial when a leg under-fills but does not throw", async () => {
    // planned size ~1.96; fill only 1.0 → partial, still recorded.
    mockOrder([{ filled: { totalSz: "1.0", avgPx: "10.1", oid: 1 } }]);
    const res = await executeBuy({
      masterAddress: MASTER,
      tokensetId: "ts1",
      tokensetName: "Set",
      markets,
      usdcTotal: 20,
    });
    expect(res.partial).toBe(true);
    expect(res.persisted).toBe(true);
  });

  it("reports persisted=false (not a throw) when the order filled but save fails", async () => {
    mockOrder([{ filled: { totalSz: "1.96", avgPx: "10.1", oid: 1 } }]);
    const original = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => {
      throw new Error("quota exceeded");
    };
    try {
      const res = await executeBuy({
        masterAddress: MASTER,
        tokensetId: "ts1",
        tokensetName: "Set",
        markets,
        usdcTotal: 20,
      });
      expect(res.persisted).toBe(false);
      expect(res.record.legs[0].qtyBought).toBe(1.96);
    } finally {
      localStorage.setItem = original;
    }
  });
});

const sellMarkets: SellMarketInput[] = [
  { tokenName: "A", coin: "@1", universeIndex: 1, szDecimals: 2, midPx: 12 },
];

function seedLot(): BuyRecord {
  const lot: BuyRecord = {
    id: "lot1",
    tokensetId: "ts1",
    tokensetName: "Set",
    wallet: MASTER,
    usdcSpent: 50,
    status: "open",
    createdAt: 1,
    legs: [
      { token: "A", assetId: 10001, usdcAllocated: 50, qtyBought: 5, avgEntryPrice: 10, qtyRemaining: 5 },
    ],
  };
  saveLots(MASTER, [lot]);
  return lot;
}

describe("executeSell", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("sells, updates the lot, and returns realized P&L", async () => {
    const lot = seedLot();
    mockOrder([{ filled: { totalSz: "2.5", avgPx: "12", oid: 9 } }]);
    const res = await executeSell({ masterAddress: MASTER, lot, pct: 0.5, markets: sellMarkets });
    expect(res.realizedPnlUsd).toBe(5); // 2.5 * (12 - 10)
    expect(res.partial).toBe(false);
    expect(res.persisted).toBe(true);
    // Persisted lot reflects reduced remaining + partially_sold.
    const stored = loadLots(MASTER)[0];
    expect(stored.legs[0].qtyRemaining).toBe(2.5);
    expect(stored.status).toBe("partially_sold");
  });

  it("throws when nothing sells (safe)", async () => {
    const lot = seedLot();
    mockOrder([{ error: "no liquidity" }]);
    await expect(
      executeSell({ masterAddress: MASTER, lot, pct: 1, markets: sellMarkets }),
    ).rejects.toThrow(/did not fill/i);
    // Lot unchanged.
    expect(loadLots(MASTER)[0].status).toBe("open");
  });

  it("throws on an invalid plan before hitting the exchange", async () => {
    const lot = seedLot();
    await expect(
      executeSell({ masterAddress: MASTER, lot, pct: 2, markets: sellMarkets }),
    ).rejects.toThrow();
    expect(getAgentExchangeClient).not.toHaveBeenCalled();
  });

  it("reports persisted=false (not a throw) when the sell filled but save fails", async () => {
    const lot = seedLot();
    mockOrder([{ filled: { totalSz: "2.5", avgPx: "12", oid: 9 } }]);
    const original = localStorage.setItem.bind(localStorage);
    localStorage.setItem = () => {
      throw new Error("quota exceeded");
    };
    try {
      const res = await executeSell({
        masterAddress: MASTER,
        lot,
        pct: 0.5,
        markets: sellMarkets,
      });
      expect(res.persisted).toBe(false);
      expect(res.realizedPnlUsd).toBe(5);
    } finally {
      localStorage.setItem = original;
    }
  });

  it("fully closes a lot on a 100% sell (no float dust)", async () => {
    const lot: BuyRecord = {
      ...seedLot(),
      legs: [
        { token: "A", assetId: 10001, usdcAllocated: 50, qtyBought: 0.58, avgEntryPrice: 10, qtyRemaining: 0.58 },
      ],
    };
    saveLots(MASTER, [lot]);
    // Sell 100%: sellQty must be 0.58 (not 0.57 via float truncation).
    mockOrder([{ filled: { totalSz: "0.58", avgPx: "11", oid: 1 } }]);
    const res = await executeSell({
      masterAddress: MASTER,
      lot,
      pct: 1,
      markets: [{ tokenName: "A", coin: "@1", universeIndex: 1, szDecimals: 2, midPx: 25 }],
    });
    expect(res.lot.status).toBe("closed");
    expect(res.lot.legs[0].qtyRemaining).toBe(0);
    expect(loadLots(MASTER)[0].status).toBe("closed");
  });
});
