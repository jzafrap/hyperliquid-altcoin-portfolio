import { createContext, useContext, useState, type ReactNode } from "react";
import type { MarketType } from "../lib/markets";

interface MarketTypeContextValue {
  marketType: MarketType;
  setMarketType: (m: MarketType) => void;
}

const MarketTypeContext = createContext<MarketTypeContextValue | null>(null);

/**
 * Holds the active market type (spot | perp). The selector switches the whole
 * view — markets, tokensets, and lots are all scoped to this value.
 */
export function MarketTypeProvider({ children }: { children: ReactNode }) {
  const [marketType, setMarketType] = useState<MarketType>("spot");
  return (
    <MarketTypeContext.Provider value={{ marketType, setMarketType }}>
      {children}
    </MarketTypeContext.Provider>
  );
}

export function useMarketType(): MarketTypeContextValue {
  const ctx = useContext(MarketTypeContext);
  if (!ctx) throw new Error("useMarketType must be used within MarketTypeProvider");
  return ctx;
}
