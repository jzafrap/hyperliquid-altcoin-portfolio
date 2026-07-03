import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock the agent trust boundary so we can drive order responses deterministically.
vi.mock("./agent", () => ({
  getAgentExchangeClient: vi.fn(),
}));

import { getAgentExchangeClient } from "./agent";
import { executeBuy } from "./execute";
import { loadLots } from "./lots";
import type { BuyMarketInput } from "./orders";

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
