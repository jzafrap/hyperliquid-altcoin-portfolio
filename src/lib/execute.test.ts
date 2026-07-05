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
  { tokenName: "A", coin: "@1", assetId: 10001, szDecimals: 2, priceMaxDecimals: 6, midPx: 10 },
];

let updateLeverageMock: ReturnType<typeof vi.fn>;

function mockOrder(statuses: unknown[]) {
  updateLeverageMock = vi.fn().mockResolvedValue({ status: "ok" });
  (getAgentExchangeClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    order: vi.fn().mockResolvedValue({
      response: { data: { statuses } },
    }),
    updateLeverage: updateLeverageMock,
  });
}

/** Simulate the SDK throwing ApiRequestError on a bulk-partial (some legs errored). */
function mockOrderThrows(statuses: unknown[]) {
  updateLeverageMock = vi.fn().mockResolvedValue({ status: "ok" });
  const err = Object.assign(new Error("bulk partial"), {
    response: { type: "order", data: { statuses } },
  });
  (getAgentExchangeClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    order: vi.fn().mockRejectedValue(err),
    updateLeverage: updateLeverageMock,
  });
}

const twoMarkets: BuyMarketInput[] = [
  { tokenName: "A", coin: "@1", assetId: 10001, szDecimals: 2, priceMaxDecimals: 6, midPx: 10 },
  { tokenName: "B", coin: "@2", assetId: 10002, szDecimals: 2, priceMaxDecimals: 6, midPx: 10 },
];

describe("executeBuy", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("records a lot on a full fill", async () => {
    mockOrder([{ filled: { totalSz: "1.96", avgPx: "10.1", oid: 1 } }]);
    const res = await executeBuy({
      masterAddress: MASTER,
        marketType: "spot",
      tokensetId: "ts1",
      tokensetName: "Set",
      markets,
      usdcTotal: 20,
    });
    expect(res.partial).toBe(false);
    expect(res.persisted).toBe(true);
    expect(res.record.legs[0].qtyBought).toBe(1.96);
    expect(loadLots(MASTER, "spot")).toHaveLength(1);
    expect(updateLeverageMock).not.toHaveBeenCalled(); // spot never sets leverage
  });

  it("sets 1x leverage per asset before opening a perp buy", async () => {
    mockOrder([{ filled: { totalSz: "0.0098", avgPx: "60500", oid: 1 } }]);
    const perpMarkets: BuyMarketInput[] = [
      { tokenName: "BTC", coin: "BTC", assetId: 3, szDecimals: 5, priceMaxDecimals: 1, midPx: 60000 },
    ];
    const res = await executeBuy({
      masterAddress: MASTER,
      marketType: "perp",
      tokensetId: "ts1",
      tokensetName: "Perps",
      markets: perpMarkets,
      usdcTotal: 600,
    });
    expect(updateLeverageMock).toHaveBeenCalledWith({
      asset: 3,
      isCross: true,
      leverage: 1,
    });
    expect(res.persisted).toBe(true);
    // Perp lot is stored under the perp namespace, separate from spot.
    expect(loadLots(MASTER, "perp")).toHaveLength(1);
    expect(loadLots(MASTER, "spot")).toHaveLength(0);
  });

  it("uses isolated margin for assets that disallow cross", async () => {
    mockOrder([{ filled: { totalSz: "10", avgPx: "1.5", oid: 1 } }]);
    const perpMarkets: BuyMarketInput[] = [
      {
        tokenName: "OX",
        coin: "OX",
        assetId: 42,
        szDecimals: 0,
        priceMaxDecimals: 4,
        midPx: 1.5,
        isolatedOnly: true,
      },
    ];
    await executeBuy({
      masterAddress: MASTER,
      marketType: "perp",
      tokensetId: "ts1",
      tokensetName: "Perps",
      markets: perpMarkets,
      usdcTotal: 15,
    });
    expect(updateLeverageMock).toHaveBeenCalledWith({
      asset: 42,
      isCross: false, // isolated, since cross is not allowed
      leverage: 1,
    });
  });

  it("recovers filled legs when the batch throws on a partial (records only fills)", async () => {
    // 2-token buy: A fills, B errors → SDK throws, but we keep A.
    mockOrderThrows([
      { filled: { totalSz: "1.96", avgPx: "10.1", oid: 1 } },
      { error: "Order could not immediately match against any resting orders" },
    ]);
    const res = await executeBuy({
      masterAddress: MASTER,
      marketType: "spot",
      tokensetId: "ts1",
      tokensetName: "Set",
      markets: twoMarkets,
      usdcTotal: 40,
    });
    expect(res.record.legs).toHaveLength(1); // only the filled token
    expect(res.record.legs[0].token).toBe("A");
    expect(res.partial).toBe(true);
    expect(res.persisted).toBe(true);
    expect(res.failed).toEqual([
      { token: "B", error: "Order could not immediately match against any resting orders" },
    ]);
    expect(loadLots(MASTER, "spot")).toHaveLength(1);
  });

  it("throws before recording when nothing fills (safe to retry)", async () => {
    mockOrder([{ error: "insufficient liquidity" }]);
    await expect(
      executeBuy({
        masterAddress: MASTER,
        marketType: "spot",
        tokensetId: "ts1",
        tokensetName: "Set",
        markets,
        usdcTotal: 20,
      }),
    ).rejects.toThrow(/did not fill/i);
    expect(loadLots(MASTER, "spot")).toHaveLength(0);
  });

  it("throws on an invalid plan before touching the exchange", async () => {
    mockOrder([]);
    await expect(
      executeBuy({
        masterAddress: MASTER,
        marketType: "spot",
        tokensetId: "ts1",
        tokensetName: "Set",
        markets,
        usdcTotal: 1, // below min (10)
      }),
    ).rejects.toThrow(/at least 10/i);
    expect(getAgentExchangeClient).not.toHaveBeenCalled();
  });

  it("throws (before the exchange) when the total exceeds available USDC", async () => {
    mockOrder([]);
    await expect(
      executeBuy({
        masterAddress: MASTER,
        marketType: "spot",
        tokensetId: "ts1",
        tokensetName: "Set",
        markets,
        usdcTotal: 20,
        availableUsdc: 10,
      }),
    ).rejects.toThrow(/insufficient usdc/i);
    expect(getAgentExchangeClient).not.toHaveBeenCalled();
  });

  it("flags partial when a leg under-fills but does not throw", async () => {
    // planned size ~1.96; fill only 1.0 → partial, still recorded.
    mockOrder([{ filled: { totalSz: "1.0", avgPx: "10.1", oid: 1 } }]);
    const res = await executeBuy({
      masterAddress: MASTER,
        marketType: "spot",
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
        marketType: "spot",
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
  { tokenName: "A", coin: "@1", marketType: "spot", assetId: 10001, szDecimals: 2, priceMaxDecimals: 6, midPx: 12 },
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
  saveLots(MASTER, "spot", [lot]);
  return lot;
}

describe("executeSell", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("refuses to sell a lot on the wrong market type", async () => {
    mockOrder([]);
    const perpLot: BuyRecord = { ...seedLot(), marketType: "perp" };
    await expect(
      executeSell({ masterAddress: MASTER, marketType: "spot", lot: perpLot, pct: 1, markets: sellMarkets }),
    ).rejects.toThrow(/perp position.*spot market/i);
    expect(getAgentExchangeClient).not.toHaveBeenCalled();
  });

  it("sells, updates the lot, and returns realized P&L", async () => {
    const lot = seedLot();
    mockOrder([{ filled: { totalSz: "2.5", avgPx: "12", oid: 9 } }]);
    const res = await executeSell({ masterAddress: MASTER,
        marketType: "spot", lot, pct: 0.5, markets: sellMarkets });
    expect(res.realizedPnlUsd).toBe(5); // 2.5 * (12 - 10)
    expect(res.partial).toBe(false);
    expect(res.persisted).toBe(true);
    // Persisted lot reflects reduced remaining + partially_sold.
    const stored = loadLots(MASTER, "spot")[0];
    expect(stored.legs[0].qtyRemaining).toBe(2.5);
    expect(stored.status).toBe("partially_sold");
  });

  it("throws when nothing sells (safe)", async () => {
    const lot = seedLot();
    mockOrder([{ error: "no liquidity" }]);
    await expect(
      executeSell({ masterAddress: MASTER,
        marketType: "spot", lot, pct: 1, markets: sellMarkets }),
    ).rejects.toThrow(/did not fill/i);
    // Lot unchanged.
    expect(loadLots(MASTER, "spot")[0].status).toBe("open");
  });

  it("throws on an invalid plan before hitting the exchange", async () => {
    const lot = seedLot();
    await expect(
      executeSell({ masterAddress: MASTER,
        marketType: "spot", lot, pct: 2, markets: sellMarkets }),
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
        marketType: "spot",
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
    saveLots(MASTER, "spot", [lot]);
    // Sell 100%: sellQty must be 0.58 (not 0.57 via float truncation).
    mockOrder([{ filled: { totalSz: "0.58", avgPx: "11", oid: 1 } }]);
    const res = await executeSell({
      masterAddress: MASTER,
        marketType: "spot",
      lot,
      pct: 1,
      markets: [{ tokenName: "A", coin: "@1", marketType: "spot", assetId: 10001, szDecimals: 2, priceMaxDecimals: 6, midPx: 25 }],
    });
    expect(res.lot.status).toBe("closed");
    expect(res.lot.legs[0].qtyRemaining).toBe(0);
    expect(loadLots(MASTER, "spot")[0].status).toBe("closed");
  });
});
