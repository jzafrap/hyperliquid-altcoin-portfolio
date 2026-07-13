import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../hooks/useBtcCandles", () => ({
  useBtcCandles: vi.fn(),
}));

import { useBtcCandles } from "../hooks/useBtcCandles";
import type { Candle } from "../lib/candles";
import { BtcChart } from "./BtcChart";

const mockUseBtcCandles = useBtcCandles as unknown as ReturnType<typeof vi.fn>;

function candle(overrides: Partial<Candle> = {}): Candle {
  return { t: 0, T: 0, o: 100, c: 100, h: 100, l: 100, v: 0, ...overrides };
}

describe("BtcChart", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a loading state while candles are being fetched", () => {
    mockUseBtcCandles.mockReturnValue({ data: undefined, isLoading: true, isError: false });
    render(<BtcChart />);
    expect(screen.getByText(/Loading BTC price/)).toBeInTheDocument();
  });

  it("shows an error state when the fetch fails", () => {
    mockUseBtcCandles.mockReturnValue({ data: undefined, isLoading: false, isError: true });
    render(<BtcChart />);
    expect(screen.getByText(/Couldn't load BTC price/)).toBeInTheDocument();
  });

  it("renders an up-colored chart and accessible summary when price rose", () => {
    mockUseBtcCandles.mockReturnValue({
      data: [candle({ t: 0, T: 100, o: 100, c: 100 }), candle({ t: 100, T: 200, o: 100, c: 110 })],
      isLoading: false,
      isError: false,
    });
    render(<BtcChart />);

    expect(document.querySelector(".btc-chart--up")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute("aria-label", expect.stringContaining("up"));
    expect(screen.getByText(/up 10\.00% over the last 24 hours/i)).toBeInTheDocument();
  });

  it("renders a down-colored chart and accessible summary when price fell", () => {
    mockUseBtcCandles.mockReturnValue({
      data: [candle({ t: 0, T: 100, o: 100, c: 100 }), candle({ t: 100, T: 200, o: 100, c: 90 })],
      isLoading: false,
      isError: false,
    });
    render(<BtcChart />);

    expect(document.querySelector(".btc-chart--down")).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("down"),
    );
    expect(screen.getByText(/down 10\.00% over the last 24 hours/i)).toBeInTheDocument();
  });

  it("renders nothing chart-wise when there are no candles yet", () => {
    mockUseBtcCandles.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<BtcChart />);
    expect(document.querySelector(".btc-chart")).not.toBeInTheDocument();
  });

  it("titles the panel BTC · 24h", () => {
    mockUseBtcCandles.mockReturnValue({ data: [], isLoading: false, isError: false });
    render(<BtcChart />);
    expect(screen.getByRole("heading", { name: "BTC · 24h" })).toBeInTheDocument();
  });
});
