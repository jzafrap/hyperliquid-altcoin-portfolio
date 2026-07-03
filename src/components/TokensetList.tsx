import type { Tokenset } from "../lib/tokensets";

/**
 * List of the wallet's saved tokensets (instructions.md §6.5, initial view).
 * P&L and open lots are added in later slices; for now this shows the basket
 * definition and lets the user delete a set.
 */
export function TokensetList({
  tokensets,
  onDelete,
}: {
  tokensets: Tokenset[];
  onDelete: (id: string) => void;
}) {
  if (tokensets.length === 0) {
    return <p className="muted">No tokensets yet. Compose one above to get started.</p>;
  }

  return (
    <ul className="tokenset-list">
      {tokensets.map((ts) => (
        <li key={ts.id} className="tokenset-card">
          <div className="tokenset-card-head">
            <div>
              <strong className="tokenset-name">{ts.name}</strong>
              <span className="muted small">
                {" "}
                · {ts.tokens.length} token{ts.tokens.length > 1 ? "s" : ""} ·{" "}
                {new Date(ts.createdAt).toLocaleDateString()}
              </span>
            </div>
            <button
              type="button"
              className="ghost"
              onClick={() => onDelete(ts.id)}
              aria-label={`Delete ${ts.name}`}
            >
              ✕
            </button>
          </div>
          <div className="token-chips">
            {ts.tokens.map((t) => (
              <span key={t} className="token-chip">
                {t}
              </span>
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
