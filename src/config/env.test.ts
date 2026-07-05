import { describe, expect, it } from "vitest";
import { ENV, storageNamespace } from "./env";

describe("env config", () => {
  it("defaults to a valid Hyperliquid network with matching endpoints", () => {
    expect(["testnet", "mainnet"]).toContain(ENV.network);
    expect(ENV.isTestnet).toBe(ENV.network === "testnet");
    expect(ENV.apiUrl).toMatch(/^https:\/\/api\.hyperliquid/);
    expect(ENV.wsUrl).toMatch(/^wss:\/\/api\.hyperliquid/);
  });

  it("uses an Arbitrum signature domain", () => {
    expect([42161, 421614]).toContain(ENV.signatureChainId);
  });
});

describe("storageNamespace", () => {
  it("scopes the key by network, market type, and lowercased wallet", () => {
    const ns = storageNamespace("0xAbC123", "spot");
    expect(ns).toBe(`hl-tokensets:${ENV.network}:spot:0xabc123`);
  });

  it("produces distinct keys for distinct wallets and market types", () => {
    expect(storageNamespace("0xaaa", "spot")).not.toBe(storageNamespace("0xbbb", "spot"));
    expect(storageNamespace("0xaaa", "spot")).not.toBe(storageNamespace("0xaaa", "perp"));
  });
});
