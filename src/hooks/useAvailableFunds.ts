import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { ENV } from "../config/env";
import { getAvailableFunds } from "../lib/balances";
import type { MarketType } from "../lib/markets";

/**
 * Available funds for the active market: spot USDC balance for spot, perp account
 * withdrawable margin for perps (instructions.md §6.1). Query key is scoped by
 * network + market type so switching never shows stale data.
 */
export function useAvailableFunds(
  address: Address | undefined,
  marketType: MarketType,
) {
  return useQuery({
    queryKey: ["availableFunds", ENV.network, marketType, address],
    queryFn: () => getAvailableFunds(address!, marketType),
    enabled: Boolean(address),
    refetchInterval: 15_000,
  });
}
