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
  it("scopes the key by network and lowercased wallet", () => {
    const ns = storageNamespace("0xAbC123");
    expect(ns).toBe(`hl-tokensets:${ENV.network}:0xabc123`);
  });

  it("produces distinct keys for distinct wallets", () => {
    expect(storageNamespace("0xaaa")).not.toBe(storageNamespace("0xbbb"));
  });
});
