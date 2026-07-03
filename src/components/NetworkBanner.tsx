import { ENV } from "../config/env";

/**
 * Always-visible banner showing the active Hyperliquid network (instructions.md §4.1).
 * Mainnet is highlighted as a deliberate, real-funds state; testnet reads as safe.
 */
export function NetworkBanner() {
  const isMainnet = ENV.network === "mainnet";
  return (
    <div className={`network-banner ${isMainnet ? "is-mainnet" : "is-testnet"}`}>
      <span className="network-dot" aria-hidden="true" />
      <strong>{ENV.label}</strong>
      <span className="network-hint">
        {isMainnet
          ? "Live network — real funds at risk"
          : "Test network — no real funds"}
      </span>
    </div>
  );
}
