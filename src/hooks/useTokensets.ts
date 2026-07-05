import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { ENV } from "../config/env";
import type { MarketType } from "../lib/markets";
import {
  addTokenset,
  loadTokensets,
  makeTokenset,
  removeTokenset,
  saveTokensets,
  type NewTokenset,
  type Tokenset,
} from "../lib/tokensets";

/**
 * Manage the connected wallet's tokensets for a given market type, persisted to
 * localStorage scoped by network+market+wallet (instructions.md §5, §6.2).
 * Reloads whenever the wallet, network, or market type changes.
 */
export function useTokensets(wallet: Address | undefined, marketType: MarketType) {
  const [tokensets, setTokensets] = useState<Tokenset[]>([]);

  useEffect(() => {
    setTokensets(wallet ? loadTokensets(wallet, marketType) : []);
  }, [wallet, marketType]);

  const create = useCallback(
    (input: NewTokenset) => {
      if (!wallet) throw new Error("Connect a wallet first");
      const tokenset = makeTokenset(input, crypto.randomUUID(), Date.now());
      const next = addTokenset(tokensets, tokenset);
      saveTokensets(wallet, marketType, next);
      setTokensets(next);
      return tokenset;
    },
    [wallet, marketType, tokensets],
  );

  const remove = useCallback(
    (id: string) => {
      if (!wallet) return;
      const next = removeTokenset(tokensets, id);
      saveTokensets(wallet, marketType, next);
      setTokensets(next);
    },
    [wallet, marketType, tokensets],
  );

  return { tokensets, create, remove, network: ENV.network };
}
