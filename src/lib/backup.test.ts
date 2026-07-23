import { beforeEach, describe, expect, it } from "vitest";
import {
  applyBackupData,
  BACKUP_VERSION,
  collectBackupData,
  parseBackupFile,
  serializeBackup,
  type BackupFile,
} from "./backup";

/** Minimal in-memory Storage-like fake — no jsdom involved. */
class FakeStorage {
  private map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  seed(entries: Record<string, string>): void {
    for (const [k, v] of Object.entries(entries)) this.map.set(k, v);
  }
}

describe("collectBackupData", () => {
  it("collects only hl-tokensets:-prefixed keys and ignores others", () => {
    const storage = new FakeStorage();
    storage.seed({
      "hl-tokensets:testnet:spot:0xabc:tokensets": '[{"id":"a"}]',
      "hl-tokensets:testnet:spot:0xabc:lots": "[]",
      "wagmi.store": '{"state":{}}',
      "someOtherApp:key": "value",
    });

    const backup = collectBackupData(storage);

    expect(backup.version).toBe(BACKUP_VERSION);
    expect(typeof backup.exportedAt).toBe("number");
    expect(backup.data).toEqual({
      "hl-tokensets:testnet:spot:0xabc:tokensets": '[{"id":"a"}]',
      "hl-tokensets:testnet:spot:0xabc:lots": "[]",
    });
  });

  it("returns an empty data object when no matching keys exist", () => {
    const storage = new FakeStorage();
    storage.seed({ "wagmi.store": "{}" });

    const backup = collectBackupData(storage);

    expect(backup.data).toEqual({});
  });
});

describe("serializeBackup / parseBackupFile round-trip", () => {
  it("round-trips a backup through serialize and parse", () => {
    const backup: BackupFile = {
      version: BACKUP_VERSION,
      exportedAt: 12345,
      data: { "hl-tokensets:testnet:spot:0xabc:tokensets": '[{"id":"a"}]' },
    };

    const raw = serializeBackup(backup);
    const parsed = parseBackupFile(raw);

    expect(parsed).toEqual(backup);
  });
});

describe("parseBackupFile", () => {
  it("throws a descriptive error on malformed JSON", () => {
    expect(() => parseBackupFile("{not json")).toThrow(/invalid backup file/i);
  });

  it("throws when the version field is missing or not a number", () => {
    expect(() =>
      parseBackupFile(JSON.stringify({ exportedAt: 1, data: {} })),
    ).toThrow(/invalid backup file/i);
  });

  it("throws when data is not a plain object of string->string", () => {
    expect(() =>
      parseBackupFile(
        JSON.stringify({ version: 1, exportedAt: 1, data: { a: 42 } }),
      ),
    ).toThrow(/invalid backup file/i);
  });

  it("throws when exportedAt is missing or not a number", () => {
    expect(() =>
      parseBackupFile(JSON.stringify({ version: 1, data: {} })),
    ).toThrow(/invalid backup file/i);
  });

  it("rejects a future/unrecognized backup version", () => {
    expect(() =>
      parseBackupFile(
        JSON.stringify({ version: BACKUP_VERSION + 1, exportedAt: 1, data: {} }),
      ),
    ).toThrow(/unrecognized backup version/i);
  });
});

describe("applyBackupData", () => {
  let storage: FakeStorage;

  beforeEach(() => {
    storage = new FakeStorage();
  });

  it("writes only hl-tokensets:-prefixed keys and reports skipped others", () => {
    const backup: BackupFile = {
      version: BACKUP_VERSION,
      exportedAt: 1,
      data: {
        "hl-tokensets:testnet:spot:0xabc:tokensets": '[{"id":"a"}]',
        "hl-tokensets:testnet:spot:0xabc:lots": "[]",
        "wagmi.store": '{"state":{}}',
      },
    };

    const result = applyBackupData(storage, backup);

    expect(storage.getItem("hl-tokensets:testnet:spot:0xabc:tokensets")).toBe(
      '[{"id":"a"}]',
    );
    expect(storage.getItem("hl-tokensets:testnet:spot:0xabc:lots")).toBe("[]");
    expect(storage.getItem("wagmi.store")).toBeNull();
    expect(result.imported).toBe(2);
    expect(result.skipped).toEqual(["wagmi.store"]);
  });

  it("returns zero imported and all keys skipped when nothing is prefixed", () => {
    const backup: BackupFile = {
      version: BACKUP_VERSION,
      exportedAt: 1,
      data: { "someOtherApp:key": "value" },
    };

    const result = applyBackupData(storage, backup);

    expect(result.imported).toBe(0);
    expect(result.skipped).toEqual(["someOtherApp:key"]);
  });
});
