import { useState } from "react";
import type { Address } from "viem";
import { useAvailableFunds } from "../hooks/useAvailableFunds";
import { executeShort } from "../lib/execute";
import { formatUsd } from "../lib/format";
import type { Market, MarketType } from "../lib/markets";
import { minTotalFor, planBuy } from "../lib/orders";
import type { Tokenset } from "../lib/tokensets";
import { LeverageSelector } from "./LeverageSelector";

/**
 * Directional short control for a saved tokenset — the SELL-side mirror of
 * `BuyForm`, tokenset/asset-scoped (not per-lot): opening a short has no
 * pre-existing lot to attach to, unlike a close, so it lives here rather than
 * inside the lot-scoped `SellForm`. Opens or increases a short via
 * `executeShort`; leverage (1x-3x) is selectable, gated by the resolved
 * assets' `maxLeverage`. Perp-only — callers should not mount this for spot.
 */
export function ShortForm({
  tokenset,
  markets,
  marketType,
  masterAddress,
  agentApproved,
  onShorted,
}: {
  tokenset: Tokenset;
  markets: Market[];
  marketType: MarketType;
  masterAddress: Address;
  agentApproved: boolean;
  onShorted: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [leverage, setLeverage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { data: availableUsdc, refetch: refetchBalance } = useAvailableFunds(
    masterAddress,
    marketType,
  );

  const resolved = tokenset.tokens
    .map((t) => markets.find((m) => m.tokenName === t))
    .filter((m): m is Market => m !== undefined);
  const missing = tokenset.tokens.length - resolved.length;

  const maxLeverage = resolved.length > 0 ? Math.min(...resolved.map((m) => m.maxLeverage ?? 1)) : 1;
  const effectiveLeverage = Math.min(leverage, maxLeverage);

  const minTotal = minTotalFor(tokenset.tokens.length);
  const usdc = Number(amount);
  const plan =
    amount && resolved.length
      ? planBuy(resolved, usdc, undefined, availableUsdc, effectiveLeverage, "short")
      : null;

  if (!agentApproved) {
    return <p className="muted small">Enable trading above to short this set.</p>;
  }

  const handleShort = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const fresh = await refetchBalance();
      const balance = fresh.isError ? undefined : fresh.data;
      const res = await executeShort({
        masterAddress,
        marketType,
        tokensetId: tokenset.id,
        tokensetName: tokenset.name,
        markets: resolved,
        usdcTotal: usdc,
        availableUsdc: balance,
        leverage: effectiveLeverage,
      });
      const failedNote =
        res.failed.length > 0
          ? ` Couldn't short ${res.failed.map((f) => f.token).join(", ")} (no fill).`
          : "";
      if (!res.persisted) {
        setError(
          `Order FILLED (${formatUsd(res.record.usdcSpent)}) but could not be saved locally. ` +
            `Record this position manually — do NOT short again.${failedNote}`,
        );
      } else {
        setMessage(
          `Shorted ${res.record.legs.length} token${
            res.record.legs.length > 1 ? "s" : ""
          } — notional ${formatUsd(res.record.usdcSpent)}.${failedNote}`,
        );
      }
      setAmount("");
      onShorted();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canShort = !busy && missing === 0 && plan?.ok === true;

  return (
    <div className="short-form">
      {missing > 0 && (
        <p className="error small">
          {missing} token{missing > 1 ? "s" : ""} in this set have no market — cannot short.
        </p>
      )}
      <LeverageSelector maxLeverage={maxLeverage} value={effectiveLeverage} onChange={setLeverage} />
      <div className="buy-row">
        <input
          type="number"
          inputMode="decimal"
          min={minTotal}
          step="1"
          placeholder={`USDC (min ${minTotal})`}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <button type="button" className="short-btn" onClick={handleShort} disabled={!canShort}>
          {busy ? "Shorting…" : "Short"}
        </button>
      </div>

      {plan && !plan.ok && <p className="error small">{plan.errors[0]}</p>}
      {plan?.ok && (
        <p className="muted small">
          ~{formatUsd(plan.legs[0].allocationUsd)} per token · planned{" "}
          {formatUsd(plan.plannedUsd)} across {plan.legs.length}
          {availableUsdc !== undefined && ` · ${formatUsd(availableUsdc)} available`}
        </p>
      )}
      {message && <p className="ok small">{message}</p>}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
