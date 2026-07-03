import { storageNamespace } from "../config/env";

/**
 * Tokenset definitions and their persistence (instructions.md §5, §6.2).
 *
 * A tokenset is just a named basket of spot token symbols — no chain state.
 * Buy lots and P&L are layered on later (slices 4+). Persistence is serverless:
 * localStorage, scoped by network+wallet so testnet and mainnet never mix.
 *
 * Pure list operations (make/add/remove/validate) are separated from the IO
 * helpers so they can be unit-tested without a DOM.
 */

export interface Tokenset {
  id: string;
  name: string;
  /** Spot token symbols, e.g. ["HYPE", "PURR"]. Resolved to markets at runtime. */
  tokens: string[];
  createdAt: number;
}

export interface NewTokenset {
  name: string;
  tokens: string[];
}

// --- Pure operations -------------------------------------------------------

export function normalizeName(name: string): string {
  return name.trim();
}

export function isNameTaken(list: Tokenset[], name: string): boolean {
  const target = normalizeName(name).toLowerCase();
  return list.some((t) => t.name.toLowerCase() === target);
}

/**
 * Build a validated Tokenset. `id` and `createdAt` are injected so this stays
 * pure and testable (the hook supplies crypto.randomUUID() / Date.now()).
 * Throws on empty name or empty token list; token symbols are de-duplicated.
 */
export function makeTokenset(
  input: NewTokenset,
  id: string,
  createdAt: number,
): Tokenset {
  const name = normalizeName(input.name);
  if (!name) throw new Error("Tokenset name is required");
  const tokens = [...new Set(input.tokens)];
  if (tokens.length === 0) throw new Error("Select at least one token");
  return { id, name, tokens, createdAt };
}

/** Prepend a tokenset, rejecting duplicate names (case-insensitive). */
export function addTokenset(list: Tokenset[], tokenset: Tokenset): Tokenset[] {
  if (isNameTaken(list, tokenset.name)) {
    throw new Error(`A tokenset named "${tokenset.name}" already exists`);
  }
  return [tokenset, ...list];
}

export function removeTokenset(list: Tokenset[], id: string): Tokenset[] {
  return list.filter((t) => t.id !== id);
}

// --- Persistence (localStorage, network+wallet scoped) ---------------------

function storageKey(wallet: string): string {
  return `${storageNamespace(wallet)}:tokensets`;
}

export function loadTokensets(wallet: string): Tokenset[] {
  try {
    const raw = localStorage.getItem(storageKey(wallet));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Tokenset[]) : [];
  } catch {
    return [];
  }
}

export function saveTokensets(wallet: string, list: Tokenset[]): void {
  try {
    localStorage.setItem(storageKey(wallet), JSON.stringify(list));
  } catch {
    // Ignore quota / unavailable storage — the in-memory list still works.
  }
}
