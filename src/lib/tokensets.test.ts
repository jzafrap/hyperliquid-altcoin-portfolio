import { beforeEach, describe, expect, it } from "vitest";
import {
  addTokenset,
  isNameTaken,
  loadTokensets,
  makeTokenset,
  normalizeName,
  removeTokenset,
  saveTokensets,
  type Tokenset,
} from "./tokensets";

const sample = (over: Partial<Tokenset> = {}): Tokenset => ({
  id: "id-1",
  name: "Bluechips",
  tokens: ["HYPE", "PURR"],
  createdAt: 1,
  ...over,
});

describe("normalizeName", () => {
  it("trims surrounding whitespace", () => {
    expect(normalizeName("  Set A  ")).toBe("Set A");
  });
});

describe("isNameTaken", () => {
  it("matches case-insensitively against trimmed name", () => {
    const list = [sample({ name: "Bluechips" })];
    expect(isNameTaken(list, "  bluechips ")).toBe(true);
    expect(isNameTaken(list, "Alts")).toBe(false);
  });
});

describe("makeTokenset", () => {
  it("builds a validated tokenset with injected id/time", () => {
    const ts = makeTokenset({ name: " Alts ", tokens: ["A", "B"] }, "x", 42);
    expect(ts).toEqual({ id: "x", name: "Alts", tokens: ["A", "B"], createdAt: 42 });
  });

  it("de-duplicates token symbols", () => {
    const ts = makeTokenset({ name: "Dup", tokens: ["A", "A", "B"] }, "x", 1);
    expect(ts.tokens).toEqual(["A", "B"]);
  });

  it("rejects an empty name", () => {
    expect(() => makeTokenset({ name: "   ", tokens: ["A"] }, "x", 1)).toThrow(
      /name is required/i,
    );
  });

  it("rejects an empty token list", () => {
    expect(() => makeTokenset({ name: "Empty", tokens: [] }, "x", 1)).toThrow(
      /at least one token/i,
    );
  });
});

describe("addTokenset", () => {
  it("prepends the new tokenset", () => {
    const list = [sample({ id: "a", name: "A" })];
    const next = addTokenset(list, sample({ id: "b", name: "B" }));
    expect(next.map((t) => t.id)).toEqual(["b", "a"]);
  });

  it("rejects duplicate names", () => {
    const list = [sample({ name: "Bluechips" })];
    expect(() => addTokenset(list, sample({ id: "b", name: "bluechips" }))).toThrow(
      /already exists/i,
    );
  });
});

describe("removeTokenset", () => {
  it("removes by id and leaves others", () => {
    const list = [sample({ id: "a" }), sample({ id: "b" })];
    expect(removeTokenset(list, "a").map((t) => t.id)).toEqual(["b"]);
  });
});

describe("persistence (localStorage)", () => {
  const wallet = "0xABC";

  beforeEach(() => localStorage.clear());

  it("returns an empty list when nothing is stored", () => {
    expect(loadTokensets(wallet)).toEqual([]);
  });

  it("round-trips saved tokensets", () => {
    const list = [sample({ id: "a", name: "A" })];
    saveTokensets(wallet, list);
    expect(loadTokensets(wallet)).toEqual(list);
  });

  it("scopes storage per wallet (lowercased)", () => {
    saveTokensets(wallet, [sample()]);
    // Different wallet sees nothing; same wallet in a different case sees it.
    expect(loadTokensets("0xdef")).toEqual([]);
    expect(loadTokensets("0xabc")).toHaveLength(1);
  });

  it("recovers from corrupt storage without throwing", () => {
    localStorage.setItem(`hl-tokensets:testnet:${wallet.toLowerCase()}:tokensets`, "{bad json");
    expect(loadTokensets(wallet)).toEqual([]);
  });
});
