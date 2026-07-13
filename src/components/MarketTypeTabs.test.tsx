import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../app/marketType", () => ({
  useMarketType: () => ({ marketType: "perp", setMarketType: vi.fn() }),
}));

import { MarketTypeTabs } from "./MarketTypeTabs";

describe("MarketTypeTabs", () => {
  it("labels the Perps tab without a fixed-leverage suffix — leverage is now selectable", () => {
    render(<MarketTypeTabs />);
    expect(screen.getByRole("tab", { name: "Perps" })).toBeInTheDocument();
    expect(screen.queryByText(/Perps \(1x\)/)).not.toBeInTheDocument();
  });
});
