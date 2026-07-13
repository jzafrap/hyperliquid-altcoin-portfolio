import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LeverageSelector } from "./LeverageSelector";

describe("LeverageSelector", () => {
  it("shows all options when maxLeverage allows the full range", () => {
    render(<LeverageSelector maxLeverage={3} value={1} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "1x" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2x" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3x" })).toBeInTheDocument();
  });

  it("hides options above the asset's maxLeverage — never silently submits above cap", () => {
    render(<LeverageSelector maxLeverage={2} value={1} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "1x" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2x" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "3x" })).not.toBeInTheDocument();
  });

  it("marks the current value as pressed", () => {
    render(<LeverageSelector maxLeverage={3} value={2} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "2x" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1x" })).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onChange with the selected leverage", () => {
    const onChange = vi.fn();
    render(<LeverageSelector maxLeverage={3} value={1} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "3x" }));
    expect(onChange).toHaveBeenCalledWith(3);
  });

  it("shows only 1x when the asset caps leverage at 1x", () => {
    render(<LeverageSelector maxLeverage={1} value={1} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "1x" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "2x" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "3x" })).not.toBeInTheDocument();
  });
});
