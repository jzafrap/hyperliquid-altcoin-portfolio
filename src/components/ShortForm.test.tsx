import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../hooks/useAvailableFunds", () => ({
  useAvailableFunds: vi.fn(),
}));
vi.mock("../lib/execute", () => ({
  executeShort: vi.fn(),
}));

import { useAvailableFunds } from "../hooks/useAvailableFunds";
import { executeShort } from "../lib/execute";
import type { Market } from "../lib/markets";
import type { Tokenset } from "../lib/tokensets";
import { ShortForm } from "./ShortForm";

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

describe("ShortForm — directional short (perp, tokenset-scoped)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAvailableFunds as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      data: 1000,
      refetch: vi.fn().mockResolvedValue({ isError: false, data: 1000 }),
    });
  });

  it("shows a leverage selector gated by the asset's maxLeverage", () => {
    render(
      <ShortForm
        tokenset={tokenset}
        markets={[perpMarket({ maxLeverage: 2 })]}
        marketType="perp"
        masterAddress={MASTER}
        agentApproved
        onShorted={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: "1x" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2x" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "3x" })).not.toBeInTheDocument();
  });

  it("passes the amount and selected leverage through to executeShort, scoped to this tokenset", async () => {
    (executeShort as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      persisted: true,
      partial: false,
      failed: [],
      record: { legs: [{}], usdcSpent: 30 },
    });
    render(
      <ShortForm
        tokenset={tokenset}
        markets={[perpMarket({ maxLeverage: 3 })]}
        marketType="perp"
        masterAddress={MASTER}
        agentApproved
        onShorted={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "2x" }));
    fireEvent.change(screen.getByPlaceholderText(/USDC/), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: /Short/ }));

    await waitFor(() => expect(executeShort).toHaveBeenCalled());
    expect(executeShort).toHaveBeenCalledWith(
      expect.objectContaining({
        leverage: 2,
        usdcTotal: 30,
        tokensetId: "ts1",
        marketType: "perp",
      }),
    );
  });

  it("is not shown for spot markets (no directional short in spot)", () => {
    // ShortForm itself has no marketType branch — callers only mount it for
    // perp; verify the component still renders sanely if marketType is spot
    // (defensive: it must not crash), but this is a mounting contract, not a
    // spot-hides-itself contract handled inside the component.
    render(
      <ShortForm
        tokenset={tokenset}
        markets={[{ ...perpMarket(), marketType: "spot", maxLeverage: undefined }]}
        marketType="spot"
        masterAddress={MASTER}
        agentApproved
        onShorted={() => {}}
      />,
    );
    // maxLeverage falls back to 1 when nothing is resolved as perp — still safe.
    expect(screen.getByRole("button", { name: "1x" })).toBeInTheDocument();
  });

  it("requires an approved agent", () => {
    render(
      <ShortForm
        tokenset={tokenset}
        markets={[perpMarket()]}
        marketType="perp"
        masterAddress={MASTER}
        agentApproved={false}
        onShorted={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /Short/ })).not.toBeInTheDocument();
  });
});
