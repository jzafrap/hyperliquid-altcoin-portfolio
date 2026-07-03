import { useAccount } from "wagmi";
import { NetworkBanner } from "./components/NetworkBanner";
import { WalletConnect } from "./components/WalletConnect";
import { useUsdcBalance } from "./hooks/useUsdcBalance";

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
      <span className="value">{data?.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}</span>
    </div>
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
          <section className="panel">
            <UsdcBalance />
            <p className="muted">
              Wallet connected. Tokenset creation and trading come next
              (roadmap §9, steps 2–7).
            </p>
          </section>
        ) : (
          <section className="panel empty-state">
            <p>Connect a wallet (Rabby or MetaMask) to get started.</p>
          </section>
        )}
      </main>
    </div>
  );
}
