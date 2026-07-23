/**
 * Export/import of all app-owned localStorage data (backup across origins).
 *
 * localStorage is scoped per browser origin (protocol+host+port), so changing
 * the dev server port or deploying to a new URL makes saved tokensets/lots
 * unreachable. This module lets the user back up and restore that data.
 *
 * Security boundary: only keys starting with "hl-tokensets:" are ever read or
 * written here — never the agent's in-memory private key (agent.ts never
 * persists it) and never unrelated storage (e.g. wagmi's own keys).
 *
 * Pure collect/serialize/parse/apply operations are separated from real IO
 * (window.localStorage, Blob/File, download triggering), which lives in the
 * DataBackup component, mirroring the tokensets.ts/lots.ts split.
 */

const KEY_PREFIX = "hl-tokensets:";

export const BACKUP_VERSION = 1;

export interface BackupFile {
  version: number;
  exportedAt: number;
  data: Record<string, string>;
}

/** Storage subset needed to enumerate keys (matches window.localStorage). */
type ReadableStorage = Pick<Storage, "length" | "key" | "getItem">;

/** Storage subset needed to write keys (matches window.localStorage). */
type WritableStorage = Pick<Storage, "setItem">;

/** Collect every "hl-tokensets:"-prefixed key/value pair from `storage`. */
export function collectBackupData(storage: ReadableStorage): BackupFile {
  const data: Record<string, string> = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key || !key.startsWith(KEY_PREFIX)) continue;
    const value = storage.getItem(key);
    if (value !== null) data[key] = value;
  }
  return { version: BACKUP_VERSION, exportedAt: Date.now(), data };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((v) => typeof v === "string");
}

/** Parse and validate a backup file's shape. Throws a descriptive Error. */
export function parseBackupFile(raw: string): BackupFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Invalid backup file: not valid JSON");
  }

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as Record<string, unknown>).version !== "number" ||
    typeof (parsed as Record<string, unknown>).exportedAt !== "number" ||
    !isStringRecord((parsed as Record<string, unknown>).data)
  ) {
    throw new Error("Invalid backup file: unrecognized shape");
  }

  const backup = parsed as BackupFile;
  if (backup.version > BACKUP_VERSION) {
    throw new Error(
      `Unrecognized backup version (${backup.version}) — please update the app`,
    );
  }

  return backup;
}

/**
 * Write a backup's data into `storage`, restricted to "hl-tokensets:"-prefixed
 * keys — defense in depth so a hand-edited or malicious file can never touch
 * unrelated storage even if it slipped past parseBackupFile.
 */
export function applyBackupData(
  storage: WritableStorage,
  backup: BackupFile,
): { imported: number; skipped: string[] } {
  const skipped: string[] = [];
  let imported = 0;
  for (const [key, value] of Object.entries(backup.data)) {
    if (!key.startsWith(KEY_PREFIX)) {
      skipped.push(key);
      continue;
    }
    storage.setItem(key, value);
    imported++;
  }
  return { imported, skipped };
}
