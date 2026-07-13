import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/execute", () => ({
  executeSell: vi.fn(),
}));

import { executeSell } from "../lib/execute";
import type { BuyRecord } from "../lib/lots";
import type { Market } from "../lib/markets";
import { SellForm } from "./SellForm";

const MASTER = "0x1111111111111111111111111111111111111111" as const;

function lot(overrides: Partial<BuyRecord> = {}): BuyRecord {
  return {
    id: "lot1",
    tokensetId: "ts1",
    tokensetName: "Set",
    wallet: MASTER,
    marketType: "perp",
    usdcSpent: 100,
    status: "open",
    createdAt: 1,
    legs: [
      {
        token: "BTC",
        assetId: 3,
        usdcAllocated: 100,
        qtyBought: 1,
        avgEntryPrice: 100,
        qtyRemaining: 1,
      },
    ],
    ...overrides,
  };
}

const markets: Market[] = [
  {
    marketType: "perp",
    coin: "BTC",
    assetId: 3,
    tokenName: "BTC",
    szDecimals: 5,
    priceMaxDecimals: 1,
    midPx: 100,
    dayNtlVlm: 0,
    change24hPct: null,
    volumeTier: "low",
    maxLeverage: 3,
  },
];

describe("SellForm — side-aware close wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("labels the quick-close action 'Sell' for a long lot (unchanged behavior)", () => {
    render(
      <SellForm
        lot={lot({ side: "long" })}
        markets={markets}
        marketType="perp"
        masterAddress={MASTER}
        agentApproved
        onSold={() => {}}
      />,
    );
    expect(screen.getByText("Sell")).toBeInTheDocument();
    expect(screen.queryByText("Cover")).not.toBeInTheDocument();
  });

  it("labels the quick-close action 'Cover' for a short lot (buy-to-cover)", () => {
    render(
      <SellForm
        lot={lot({ side: "short" })}
        markets={markets}
        marketType="perp"
        masterAddress={MASTER}
        agentApproved
        onSold={() => {}}
      />,
    );
    expect(screen.getByText("Cover")).toBeInTheDocument();
    expect(screen.queryByText("Sell")).not.toBeInTheDocument();
  });

  it("treats a legacy lot with no side field as long (backward compat)", () => {
    render(
      <SellForm
        lot={lot({ side: undefined })}
        markets={markets}
        marketType="perp"
        masterAddress={MASTER}
        agentApproved
        onSold={() => {}}
      />,
    );
    expect(screen.getByText("Sell")).toBeInTheDocument();
  });

  it("passes the full lot (including side) through to executeSell on quick-close, for both long and short", async () => {
    (executeSell as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      realizedPnlUsd: 5,
      partial: false,
      persisted: true,
    });
    const shortLot = lot({ side: "short" });
    render(
      <SellForm
        lot={shortLot}
        markets={markets}
        marketType="perp"
        masterAddress={MASTER}
        agentApproved
        onSold={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "25%" }));

    await waitFor(() => expect(executeSell).toHaveBeenCalled());
    expect(executeSell).toHaveBeenCalledWith(
      expect.objectContaining({ lot: shortLot, pct: 0.25 }),
    );
  });
});
