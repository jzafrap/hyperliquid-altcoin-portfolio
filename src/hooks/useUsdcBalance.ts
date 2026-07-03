import { useQuery } from "@tanstack/react-query";
import type { Address } from "viem";
import { getUsdcSpotBalance } from "../lib/balances";
import { ENV } from "../config/env";

/**
 * Live USDC spot balance for the connected wallet (instructions.md §6.1).
 * Query key is scoped by network so switching networks never shows stale data.
 */
export function useUsdcBalance(address: Address | undefined) {
  return useQuery({
    queryKey: ["usdcBalance", ENV.network, address],
    queryFn: () => getUsdcSpotBalance(address!),
    enabled: Boolean(address),
    refetchInterval: 15_000,
  });
}
