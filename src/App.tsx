import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { NetworkBanner } from "./components/NetworkBanner";
import { SelectedBasket } from "./components/SelectedBasket";
import { TokenPicker } from "./components/TokenPicker";
import { WalletConnect } from "./components/WalletConnect";
import { useUsdcBalance } from "./hooks/useUsdcBalance";
import type { SpotMarket } from "./lib/markets";

function UsdcBalance() {
  const { address } = useAccount();
  const { data, isLoading, isError, error } = useUsdcBalance(address);

  if (!address) return null;
  if (isLoading) return <p className="muted">Loading USDC balance…</p>;
  if (isError) {
    return <p className="error">Failed to load balance: {String(error)}</p>;
  }

  return (
    <div className="usdc-balance">
      <span className="label">Spot USDC</span>
      <span className="value">
        {data?.toLocaleString(undefined, {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    </div>
  );
}

function ComposeTokenset() {
  // Selected markets keyed by token symbol. Local for now; tokenset persistence
  // is slice 3 (§6.3). Keeping the full market object avoids a second lookup.
  const [selected, setSelected] = useState<Map<string, SpotMarket>>(new Map());

  const toggle = useCallback((market: SpotMarket) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(market.tokenName)) next.delete(market.tokenName);
      else next.set(market.tokenName, market);
      return next;
    });
  }, []);

  const selectedNames = new Set(selected.keys());
  const selectedMarkets = [...selected.values()];

  return (
    <section className="compose">
      <div className="compose-col">
        <h2>Tokens</h2>
        <TokenPicker selected={selectedNames} onToggle={toggle} />
      </div>
      <div className="compose-col">
        <h2>New tokenset</h2>
        <SelectedBasket markets={selectedMarkets} onRemove={toggle} />
      </div>
    </section>
  );
}

export default function App() {
  const { isConnected } = useAccount();

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <h1>Hyperliquid Tokensets</h1>
          <NetworkBanner />
        </div>
        <WalletConnect />
      </header>

      <main className="app-main">
        {isConnected ? (
          <>
            <section className="panel">
              <UsdcBalance />
            </section>
            <ComposeTokenset />
          </>
        ) : (
          <section className="panel empty-state">
            <p>Connect a wallet (Rabby or MetaMask) to get started.</p>
          </section>
        )}
      </main>
    </div>
  );
}
