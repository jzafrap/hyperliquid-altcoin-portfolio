import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { useMarketType } from "./app/marketType";
import { AgentApproval } from "./components/AgentApproval";
import { MarketTypeTabs } from "./components/MarketTypeTabs";
import { NetworkBanner } from "./components/NetworkBanner";
import { PortfolioDashboard } from "./components/PortfolioDashboard";
import { SelectedBasket } from "./components/SelectedBasket";
import { TokenPicker } from "./components/TokenPicker";
import { TokensetList } from "./components/TokensetList";
import { WalletConnect } from "./components/WalletConnect";
import { ENV } from "./config/env";
import { useAgent } from "./hooks/useAgent";
import { useAvailableFunds } from "./hooks/useAvailableFunds";
import { useLots } from "./hooks/useLots";
import { useMarkets } from "./hooks/useMarkets";
import { useTokensets } from "./hooks/useTokensets";
import type { Market, MarketType } from "./lib/markets";
import type { NewTokenset } from "./lib/tokensets";

function FundsBalance({ marketType }: { marketType: MarketType }) {
  const { address } = useAccount();
  const { data, isLoading, isError, error } = useAvailableFunds(address, marketType);
  const label = marketType === "perp" ? "Perp margin (USDC)" : "Spot USDC";

  if (!address) return null;
  if (isLoading) return <p className="muted">Loading balance…</p>;
  if (isError) return <p className="error">Failed to load balance: {String(error)}</p>;

  return (
    <div className="usdc-balance-row">
      <div className="usdc-balance">
        <span className="label">{label}</span>
        <span className="value">
          {data?.toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>
      {data !== undefined && data <= 0 && (
        <p className="muted small">
          No {marketType === "perp" ? "perp margin" : "USDC"} available yet.{" "}
          <a href={ENV.webAppUrl} target="_blank" rel="noreferrer">
            {marketType === "perp" ? "Deposit / transfer to perps" : "Deposit"} on
            Hyperliquid ({ENV.label}) →
          </a>
        </p>
      )}
    </div>
  );
}

function ComposeTokenset({
  marketType,
  onCreate,
}: {
  marketType: MarketType;
  onCreate: (input: NewTokenset) => void;
}) {
  // Selected markets keyed by token symbol; local to the compose step.
  const [selected, setSelected] = useState<Map<string, Market>>(new Map());
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback((market: Market) => {
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(market.tokenName)) next.delete(market.tokenName);
      else next.set(market.tokenName, market);
      return next;
    });
  }, []);

  const selectedMarkets = [...selected.values()];

  const handleCreate = () => {
    setError(null);
    try {
      onCreate({ name, tokens: selectedMarkets.map((m) => m.tokenName) });
      setSelected(new Map());
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const canCreate = name.trim().length > 0 && selectedMarkets.length > 0;

  return (
    <section className="compose">
      <div className="compose-col">
        <h2>Tokens</h2>
        <TokenPicker
          marketType={marketType}
          selected={new Set(selected.keys())}
          onToggle={toggle}
        />
      </div>
      <div className="compose-col">
        <h2>New tokenset</h2>
        <input
          className="token-search"
          type="text"
          placeholder="Name this tokenset (e.g. tokenset1)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <SelectedBasket markets={selectedMarkets} onRemove={toggle} />
        {error && <p className="error">{error}</p>}
        <button
          type="button"
          className="create-btn"
          disabled={!canCreate}
          onClick={handleCreate}
        >
          Create tokenset
        </button>
      </div>
    </section>
  );
}

export default function App() {
  const { address, isConnected } = useAccount();
  const { marketType } = useMarketType();
  const { tokensets, create, remove } = useTokensets(address, marketType);
  const { isApproved } = useAgent();
  const {
    data: markets = [],
    dataUpdatedAt: pricesUpdatedAt,
    isError: pricesError,
    isLoading: marketsLoading,
  } = useMarkets(marketType);
  const { lots, refresh: refreshLots } = useLots(address, marketType);

  const marketLabel = marketType === "perp" ? "perp" : "spot";

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
        <MarketTypeTabs />

        {isConnected ? (
          <>
            <section className="panel">
              <FundsBalance marketType={marketType} />
            </section>

            <section className="panel">
              <AgentApproval />
            </section>

            {marketsLoading && (
              <p className="muted small">Loading Hyperliquid {marketLabel} markets…</p>
            )}
            {pricesError && !marketsLoading && (
              <p className="error small">
                Couldn't load {marketLabel} markets — check your connection and retry.
              </p>
            )}

            <ComposeTokenset marketType={marketType} onCreate={create} />

            <section className="panel">
              <h2>Your tokensets</h2>
              <TokensetList
                tokensets={tokensets}
                markets={markets}
                marketType={marketType}
                masterAddress={address}
                agentApproved={isApproved}
                onDelete={remove}
                onBought={refreshLots}
              />
            </section>

            <section className="panel">
              <h2>Portfolio</h2>
              <PortfolioDashboard
                lots={lots}
                markets={markets}
                marketType={marketType}
                masterAddress={address}
                agentApproved={isApproved}
                onSold={refreshLots}
                pricesUpdatedAt={pricesUpdatedAt}
                pricesError={pricesError}
              />
            </section>
          </>
        ) : (
          <section className="panel empty-state">
            <p>Connect a wallet (Rabby or MetaMask) to get started.</p>
          </section>
        )}
      </main>

      <footer className="app-footer muted small">
        <span>
          {ENV.label} · trade-only agent, no keys stored ·{" "}
          <a href={ENV.webAppUrl} target="_blank" rel="noreferrer">
            Hyperliquid
          </a>
        </span>
      </footer>
    </div>
  );
}
