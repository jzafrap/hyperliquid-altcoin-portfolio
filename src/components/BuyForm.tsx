import { useState } from "react";
import type { Address } from "viem";
import { executeBuy } from "../lib/execute";
import { formatUsd } from "../lib/format";
import type { SpotMarket } from "../lib/markets";
import { minTotalFor, planBuy } from "../lib/orders";
import type { Tokenset } from "../lib/tokensets";

/**
 * Buy control for a saved tokenset (§6.3): equal-split market buy with the
 * minimum-total guard and a live split preview. Requires an approved agent.
 */
export function BuyForm({
  tokenset,
  markets,
  masterAddress,
  agentApproved,
  onBought,
}: {
  tokenset: Tokenset;
  markets: SpotMarket[];
  masterAddress: Address;
  agentApproved: boolean;
  onBought: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Resolve the set's tokens to current markets, preserving basket order.
  const resolved = tokenset.tokens
    .map((t) => markets.find((m) => m.tokenName === t))
    .filter((m): m is SpotMarket => m !== undefined);
  const missing = tokenset.tokens.length - resolved.length;

  const minTotal = minTotalFor(tokenset.tokens.length);
  const usdc = Number(amount);
  const plan = amount && resolved.length ? planBuy(resolved, usdc) : null;

  if (!agentApproved) {
    return <p className="muted small">Enable trading above to buy this set.</p>;
  }

  const handleBuy = async () => {
    if (busy) return; // reentrancy guard (defense beyond the disabled attribute)
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await executeBuy({
        masterAddress,
        tokensetId: tokenset.id,
        tokensetName: tokenset.name,
        markets: resolved,
        usdcTotal: usdc,
      });
      if (!res.persisted) {
        // Order filled but the lot could not be saved — warn loudly, do NOT retry.
        setError(
          `Order FILLED (${formatUsd(res.record.usdcSpent)}) but could not be saved locally. ` +
            `Record this position manually — do NOT buy again.`,
        );
      } else {
        setMessage(
          `Bought — spent ${formatUsd(res.record.usdcSpent)}${
            res.partial ? " (partial basket — some legs did not fully fill)" : ""
          }`,
        );
      }
      setAmount("");
      onBought();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const canBuy = !busy && missing === 0 && plan?.ok === true;

  return (
    <div className="buy-form">
      {missing > 0 && (
        <p className="error small">
          {missing} token{missing > 1 ? "s" : ""} in this set have no market — cannot buy.
        </p>
      )}
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
        <button type="button" onClick={handleBuy} disabled={!canBuy}>
          {busy ? "Buying…" : "Buy"}
        </button>
      </div>

      {plan && !plan.ok && (
        <p className="error small">{plan.errors[0]}</p>
      )}
      {plan?.ok && (
        <p className="muted small">
          ~{formatUsd(plan.legs[0].allocationUsd)} per token · planned{" "}
          {formatUsd(plan.plannedUsd)} across {plan.legs.length}
        </p>
      )}
      {message && <p className="ok small">{message}</p>}
      {error && <p className="error small">{error}</p>}
    </div>
  );
}
