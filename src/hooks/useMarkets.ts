import { useQuery } from "@tanstack/react-query";
import { ENV } from "../config/env";
import { getMarkets, type MarketType } from "../lib/markets";

/** Markets (spot or perp) with 24h context (instructions.md §6.2). */
export function useMarkets(marketType: MarketType) {
  return useQuery({
    queryKey: ["markets", ENV.network, marketType],
    queryFn: () => getMarkets(marketType),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
