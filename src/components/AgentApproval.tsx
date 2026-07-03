import { useAgent } from "../hooks/useAgent";

function truncate(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/**
 * Agent (API) wallet approval panel (instructions.md §3).
 * Explains, at approval time, exactly what the delegated key can and cannot do,
 * and that a refresh requires re-approval.
 */
export function AgentApproval() {
  const { isApproved, agentAddress, approve, revoke, isApproving, error, canApprove } =
    useAgent();

  if (isApproved) {
    return (
      <div className="agent-panel approved">
        <div className="agent-status">
          <span className="agent-dot" aria-hidden="true" />
          <strong>Trading enabled</strong>
          {agentAddress && (
            <span className="muted small">agent {truncate(agentAddress)}</span>
          )}
        </div>
        <p className="muted small">
          Orders are signed locally by the in-memory agent key — no more wallet
          popups this session. A page refresh will require re-approval.
        </p>
        <button type="button" className="ghost" onClick={revoke}>
          Revoke agent
        </button>
      </div>
    );
  }

  return (
    <div className="agent-panel">
      <strong>Enable trading</strong>
      <p className="muted small">
        Approve a <b>trade-only agent</b> with a single signature from your wallet.
        The app generates a delegated key kept <b>only in memory</b> — it can place
        and cancel orders but <b>cannot withdraw or move your funds</b>, and your
        wallet's private key is never exposed. A page refresh clears it and asks
        again.
      </p>
      <button type="button" onClick={approve} disabled={!canApprove || isApproving}>
        {isApproving ? "Waiting for signature…" : "Approve trading agent"}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
