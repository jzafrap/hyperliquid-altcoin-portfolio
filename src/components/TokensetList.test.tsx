import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../hooks/useAvailableFunds", () => ({
  useAvailableFunds: vi.fn(() => ({ data: 1000, refetch: vi.fn() })),
}));
vi.mock("../lib/execute", () => ({
  executeBuy: vi.fn(),
  executeShort: vi.fn(),
}));

import type { Tokenset } from "../lib/tokensets";
import { TokensetList } from "./TokensetList";

const MASTER = "0x1111111111111111111111111111111111111111" as const;

const tokensets: Tokenset[] = [
  { id: "ts1", name: "Set", tokens: ["BTC"], createdAt: Date.now() },
];

describe("TokensetList — mounts ShortForm alongside BuyForm for perp markets", () => {
  it("shows a directional Short control in perp mode", () => {
    render(
      <TokensetList
        tokensets={tokensets}
        markets={[]}
        marketType="perp"
        masterAddress={MASTER}
        agentApproved
        onDelete={() => {}}
        onBought={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Short/ })).toBeInTheDocument();
  });

  it("does not show a Short control in spot mode", () => {
    render(
      <TokensetList
        tokensets={tokensets}
        markets={[]}
        marketType="spot"
        masterAddress={MASTER}
        agentApproved
        onDelete={() => {}}
        onBought={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /Short/ })).not.toBeInTheDocument();
  });
});
