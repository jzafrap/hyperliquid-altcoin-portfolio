import type { Address } from "viem";
import { getInfoClient } from "./hyperliquid";

/** The quote asset used across the app for spot buys/sells (instructions.md §2). */
export const QUOTE_COIN = "USDC";

export interface SpotBalance {
  coin: string;
  token: number;
  /** Total balance as a decimal string (as returned by the API). */
  total: string;
  /** Amount on hold (reserved by open orders) as a decimal string. */
  hold: string;
}

/** Fetch all spot token balances for a wallet on the active network (§6.1). */
export async function getSpotBalances(user: Address): Promise<SpotBalance[]> {
  const state = await getInfoClient().spotClearinghouseState({ user });
  // The API returns a union: real token balances carry a numeric `token` id;
  // other entries (e.g. perp-dex style) do not. Keep only true token balances.
  return state.balances
    .filter((b): b is Extract<typeof b, { token: number }> => "token" in b)
    .map((b) => ({
      coin: b.coin,
      token: b.token,
      total: b.total,
      hold: b.hold,
    }));
}

/**
 * Available USDC in the user's Hyperliquid spot balance.
 * Returns 0 when the user holds no USDC. This is the spendable amount validated
 * against in the buy flow (§6.3).
 */
export async function getUsdcSpotBalance(user: Address): Promise<number> {
  const balances = await getSpotBalances(user);
  const usdc = balances.find((b) => b.coin === QUOTE_COIN);
  return usdc ? Number(usdc.total) : 0;
}
