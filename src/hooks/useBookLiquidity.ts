import { useQuery } from "@tanstack/react-query";
import { ENV } from "../config/env";
import { getBookLiquidity } from "../lib/markets";

/**
 * On-demand order-book liquidity (spread + depth) for a single market.
 * Fetched only for tokens the user is composing into a set, not the whole list.
 */
export function useBookLiquidity(
  coin: string | undefined,
  dayNtlVlm: number,
  enabled = true,
) {
  return useQuery({
    queryKey: ["bookLiquidity", ENV.network, coin],
    queryFn: () => getBookLiquidity(coin!, dayNtlVlm),
    enabled: Boolean(coin) && enabled,
    staleTime: 15_000,
    refetchInterval: 20_000,
  });
}
