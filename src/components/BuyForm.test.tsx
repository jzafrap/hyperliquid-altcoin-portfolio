import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../hooks/useAvailableFunds", () => ({
  useAvailableFunds: vi.fn(),
}));
vi.mock("../lib/execute", () => ({
  executeBuy: vi.fn(),
}));

import { useAvailableFunds } from "../hooks/useAvailableFunds";
import { executeBuy } from "../lib/execute";
import type { Market } from "../lib/markets";
import type { Tokenset } from "../lib/tokensets";
import { BuyForm } from "./BuyForm";

const MASTER = "0x1111111111111111111111111111111111111111" as const;

function perpMarket(overrides: Partial<Market> = {}): Market {
  return {
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
    ...overrides,
  };
}

const tokenset: Tokenset = {
  id: "ts1",
  name: "Set",
  tokens: ["BTC"],
  createdAt: Date.now(),
};

describe("BuyForm — leverage (perp)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAvailableFunds as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: 1000,
      refetch: vi.fn().mockResolvedValue({ isError: false, data: 1000 }),
    });
  });

  it("shows the leverage selector for perp markets, gated by the asset's maxLeverage", () => {
    render(
      <BuyForm
        tokenset={tokenset}
        markets={[perpMarket({ maxLeverage: 2 })]}
        marketType="perp"
        masterAddress={MASTER}
        agentApproved
        onBought={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "1x" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2x" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "3x" })).not.toBeInTheDocument();
  });

  it("does not show a leverage selector in spot mode", () => {
    render(
      <BuyForm
        tokenset={tokenset}
        markets={[{ ...perpMarket(), marketType: "spot", maxLeverage: undefined }]}
        marketType="spot"
        masterAddress={MASTER}
        agentApproved
        onBought={() => {}}
      />,
    );
    expect(screen.queryByRole("group", { name: "Leverage" })).not.toBeInTheDocument();
  });

  it("passes the selected leverage through to executeBuy", async () => {
    (executeBuy as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      persisted: true,
      partial: false,
      failed: [],
      record: { legs: [{}], usdcSpent: 30 },
    });
    render(
      <BuyForm
        tokenset={tokenset}
        markets={[perpMarket({ maxLeverage: 3 })]}
        marketType="perp"
        masterAddress={MASTER}
        agentApproved
        onBought={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "3x" }));
    fireEvent.change(screen.getByPlaceholderText(/USDC/), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /Buy/ }));

    await waitFor(() => expect(executeBuy).toHaveBeenCalled());
    expect(executeBuy).toHaveBeenCalledWith(expect.objectContaining({ leverage: 3 }));
  });

  it("defaults to 1x leverage when nothing is selected", async () => {
    (executeBuy as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      persisted: true,
      partial: false,
      failed: [],
      record: { legs: [{}], usdcSpent: 30 },
    });
    render(
      <BuyForm
        tokenset={tokenset}
        markets={[perpMarket({ maxLeverage: 3 })]}
        marketType="perp"
        masterAddress={MASTER}
        agentApproved
        onBought={() => {}}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/USDC/), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /Buy/ }));

    await waitFor(() => expect(executeBuy).toHaveBeenCalled());
    expect(executeBuy).toHaveBeenCalledWith(expect.objectContaining({ leverage: 1 }));
  });

  it("clamps the effective leverage to the asset's maxLeverage when the market changes under a higher selection", () => {
    const { rerender } = render(
      <BuyForm
        tokenset={tokenset}
        markets={[perpMarket({ maxLeverage: 3 })]}
        marketType="perp"
        masterAddress={MASTER}
        agentApproved
        onBought={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "3x" }));
    rerender(
      <BuyForm
        tokenset={tokenset}
        markets={[perpMarket({ maxLeverage: 2 })]}
        marketType="perp"
        masterAddress={MASTER}
        agentApproved
        onBought={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "2x" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: "3x" })).not.toBeInTheDocument();
  });

  it("does not affect spot buys — leverage is not sent for spot", async () => {
    (executeBuy as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      persisted: true,
      partial: false,
      failed: [],
      record: { legs: [{}], usdcSpent: 30 },
    });
    render(
      <BuyForm
        tokenset={tokenset}
        markets={[{ ...perpMarket(), marketType: "spot", maxLeverage: undefined }]}
        marketType="spot"
        masterAddress={MASTER}
        agentApproved
        onBought={() => {}}
      />,
    );
    fireEvent.change(screen.getByPlaceholderText(/USDC/), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /Buy/ }));

    await waitFor(() => expect(executeBuy).toHaveBeenCalled());
    expect(executeBuy).toHaveBeenCalledWith(expect.objectContaining({ leverage: 1 }));
  });
});
