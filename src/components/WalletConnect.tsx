import { useAccount, useConnect, useDisconnect } from "wagmi";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Wallet connect / disconnect control (instructions.md §6.1).
 * Uses the injected connector, which covers both Rabby and MetaMask. We never
 * store keys — the wallet only ever signs (no keys leave the wallet).
 */
export function WalletConnect() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending, error } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected && address) {
    return (
      <div className="wallet-connected">
        <span className="wallet-address" title={address}>
          {truncate(address)}
        </span>
        <button type="button" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  const injectedConnector = connectors[0];

  return (
    <div className="wallet-connect">
      <button
        type="button"
        disabled={isPending || !injectedConnector}
        onClick={() =>
          injectedConnector && connect({ connector: injectedConnector })
        }
      >
        {isPending ? "Connecting…" : "Connect wallet"}
      </button>
      {error && <p className="error">{error.message}</p>}
      {!injectedConnector && (
        <p className="error">No injected wallet found (install Rabby or MetaMask).</p>
      )}
    </div>
  );
}
