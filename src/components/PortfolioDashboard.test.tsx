import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { BuyRecord } from "../lib/lots";
import type { Market } from "../lib/markets";
import { PortfolioDashboard } from "./PortfolioDashboard";

function lot(overrides: Partial<BuyRecord> = {}): BuyRecord {
  return {
    id: "lot1",
    tokensetId: "ts1",
    tokensetName: "Set",
    wallet: "0xabc",
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

const markets: Market[] = [];

describe("PortfolioDashboard — leverage badge", () => {
  it("shows a colored 'PERPS · BUY 2x' badge for an open perp long lot", () => {
    render(
      <PortfolioDashboard
        lots={[lot({ marketType: "perp", side: "long", leverage: 2 })]}
        markets={markets}
        marketType="perp"
        masterAddress={undefined}
        agentApproved={false}
        onSold={() => {}}
      />,
    );
    const badge = screen.getByText("PERPS · BUY 2x");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("up");
  });

  it("shows a colored 'PERPS · SELL 3x' badge for an open perp short lot", () => {
    render(
      <PortfolioDashboard
        lots={[lot({ marketType: "perp", side: "short", leverage: 3 })]}
        markets={markets}
        marketType="perp"
        masterAddress={undefined}
        agentApproved={false}
        onSold={() => {}}
      />,
    );
    const badge = screen.getByText("PERPS · SELL 3x");
    expect(badge).toBeInTheDocument();
    expect(badge.className).toContain("down");
  });

  it("shows no leverage badge for a spot lot", () => {
    render(
      <PortfolioDashboard
        lots={[lot({ marketType: "spot" })]}
        markets={markets}
        marketType="spot"
        masterAddress={undefined}
        agentApproved={false}
        onSold={() => {}}
      />,
    );
    expect(screen.queryByText(/PERPS ·/)).not.toBeInTheDocument();
  });

  it("defaults to 1x for a legacy perp lot with no recorded leverage", () => {
    render(
      <PortfolioDashboard
        lots={[lot({ marketType: "perp", side: "long", leverage: undefined })]}
        markets={markets}
        marketType="perp"
        masterAddress={undefined}
        agentApproved={false}
        onSold={() => {}}
      />,
    );
    expect(screen.getByText("PERPS · BUY 1x")).toBeInTheDocument();
  });
});
