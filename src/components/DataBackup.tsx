import { useRef, useState } from "react";
import {
  applyBackupData,
  collectBackupData,
  parseBackupFile,
  serializeBackup,
} from "../lib/backup";

function downloadFileName(): string {
  const date = new Date().toISOString().slice(0, 10);
  return `hyperliquid-tokensets-backup-${date}.json`;
}

/**
 * Export/import for all locally-saved tokensets and lots (any wallet, any
 * network stored in this browser) — not gated behind wallet connection, since
 * a backup is origin-scoped, not wallet-scoped.
 */
export function DataBackup() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    setError(null);
    const backup = collectBackupData(localStorage);
    const blob = new Blob([serializeBackup(backup)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFileName();
    a.click();
    URL.revokeObjectURL(url);
    setMessage(`Exported ${Object.keys(backup.data).length} key(s).`);
  };

  const handleImportClick = () => {
    setError(null);
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setError(null);
    setMessage(null);
    try {
      const raw = await file.text();
      const backup = parseBackupFile(raw);
      const confirmed = window.confirm(
        "Importing will overwrite any existing saved tokensets/lots with the same keys. Continue?",
      );
      if (!confirmed) return;

      const { imported } = applyBackupData(localStorage, backup);
      setMessage(`Imported ${imported} key(s). Reloading…`);
      // Reload so every hook (useTokensets, useLots) re-reads localStorage
      // cleanly, instead of manually invalidating each hook's state.
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="agent-panel">
      <p className="muted small">
        Saved tokensets and lots live in this browser only. Export a backup, or
        restore one, to move data across a different port or deployment URL.
      </p>
      <div className="buy-row">
        <button type="button" onClick={handleExport}>
          Export data
        </button>
        <button type="button" className="ghost" onClick={handleImportClick}>
          Import data
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        className="visually-hidden"
        onChange={handleFileSelected}
      />
      {message && <p className="muted small">{message}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
