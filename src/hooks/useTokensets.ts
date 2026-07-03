import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { ENV } from "../config/env";
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
 * Manage the connected wallet's tokensets, persisted to localStorage scoped by
 * network+wallet (instructions.md §5, §6.2). Reloads whenever the wallet or
 * network changes so lots never leak across accounts/networks.
 */
export function useTokensets(wallet: Address | undefined) {
  const [tokensets, setTokensets] = useState<Tokenset[]>([]);

  useEffect(() => {
    setTokensets(wallet ? loadTokensets(wallet) : []);
    // ENV.network is constant per session, but keep it in deps for correctness.
  }, [wallet]);

  const create = useCallback(
    (input: NewTokenset) => {
      if (!wallet) throw new Error("Connect a wallet first");
      const tokenset = makeTokenset(input, crypto.randomUUID(), Date.now());
      // addTokenset may throw on a duplicate name — do it before mutating state.
      const next = addTokenset(tokensets, tokenset);
      saveTokensets(wallet, next);
      setTokensets(next);
      return tokenset;
    },
    [wallet, tokensets],
  );

  const remove = useCallback(
    (id: string) => {
      if (!wallet) return;
      const next = removeTokenset(tokensets, id);
      saveTokensets(wallet, next);
      setTokensets(next);
    },
    [wallet, tokensets],
  );

  return { tokensets, create, remove, network: ENV.network };
}
