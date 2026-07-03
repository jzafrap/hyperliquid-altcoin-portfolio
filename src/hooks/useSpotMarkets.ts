import { useQuery } from "@tanstack/react-query";
import { ENV } from "../config/env";
import { getSpotMarkets } from "../lib/markets";

/** All USDC-quoted spot markets with 24h context (instructions.md §6.2). */
export function useSpotMarkets() {
  return useQuery({
    queryKey: ["spotMarkets", ENV.network],
    queryFn: getSpotMarkets,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
}
