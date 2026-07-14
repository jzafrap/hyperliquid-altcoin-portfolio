import { useQuery } from "@tanstack/react-query";
import { ENV } from "../config/env";
import { getBtcCandles } from "../lib/candles";

/**
 * Last 24h of BTC candles for the "BTC · 24h" panel. A slow-moving window —
 * a few minutes of staleness is fine, no need to poll aggressively.
 */
export function useBtcCandles() {
  return useQuery({
    queryKey: ["btcCandles", ENV.network],
    queryFn: getBtcCandles,
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
  });
}
