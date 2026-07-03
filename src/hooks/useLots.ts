import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { loadLots, type BuyRecord } from "../lib/lots";

/**
 * The connected wallet's buy lots, loaded from localStorage (network+wallet
 * scoped). Call `refresh()` after a buy/sell to re-read persisted state.
 */
export function useLots(wallet: Address | undefined) {
  const [lots, setLots] = useState<BuyRecord[]>([]);

  const refresh = useCallback(() => {
    setLots(wallet ? loadLots(wallet) : []);
  }, [wallet]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { lots, refresh };
}
