import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import { AgentApproval } from "./components/AgentApproval";
import { LotsList } from "./components/LotsList";
import { NetworkBanner } from "./components/NetworkBanner";
import { SelectedBasket } from "./components/SelectedBasket";
import { TokenPicker } from "./components/TokenPicker";
import { TokensetList } from "./components/TokensetList";
import { WalletConnect } from "./components/WalletConnect";
import { useAgent } from "./hooks/useAgent";
import { useLots } from "./hooks/useLots";
import { useSpotMarkets } from "./hooks/useSpotMarkets";
import { useTokensets } from "./hooks/useTokensets";
import { useUsdcBalance } from "./hooks/useUsdcBalance";
import type { SpotMarket } from "./lib/markets";
import type { NewTokenset } from "./lib/tokensets";

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

function ComposeTokenset({
  onCreate,
}: {
  onCreate: (input: NewTokenset) => void;
}) {
  // Selected markets keyed by token symbol; local to the compose step.
  const [selected, setSelected] = useState<Map<string, SpotMarket>>(new Map());
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const toggle = useCallback((market: SpotMarket) => {
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
        <TokenPicker selected={new Set(selected.keys())} onToggle={toggle} />
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
  const { tokensets, create, remove } = useTokensets(address);
  const { isApproved } = useAgent();
  const { data: markets = [] } = useSpotMarkets();
  const { lots, refresh: refreshLots } = useLots(address);

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

            <section className="panel">
              <AgentApproval />
            </section>

            <ComposeTokenset onCreate={create} />

            <section className="panel">
              <h2>Your tokensets</h2>
              <TokensetList
                tokensets={tokensets}
                markets={markets}
                masterAddress={address}
                agentApproved={isApproved}
                onDelete={remove}
                onBought={refreshLots}
              />
            </section>

            <section className="panel">
              <h2>Open lots</h2>
              <LotsList lots={lots} />
            </section>
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
