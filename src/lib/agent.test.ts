import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearAgent,
  generateAgent,
  getAgentExchangeClient,
  getAgentSession,
  getSnapshot,
  isAgentApprovedFor,
  subscribe,
} from "./agent";

const MASTER_A = "0x1111111111111111111111111111111111111111" as const;
const MASTER_B = "0x2222222222222222222222222222222222222222" as const;

describe("agent session state machine", () => {
  beforeEach(() => clearAgent());

  it("starts with no session", () => {
    expect(getAgentSession()).toBeNull();
    expect(isAgentApprovedFor(MASTER_A)).toBe(false);
  });

  it("generates an unapproved session bound to the master", () => {
    const s = generateAgent(MASTER_A);
    expect(s.masterAddress).toBe(MASTER_A);
    expect(s.agentAddress).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(s.approvedAt).toBeNull();
    // Not approved until the master signs.
    expect(isAgentApprovedFor(MASTER_A)).toBe(false);
  });

  it("does not report approval for a different master even after approval", () => {
    const s = generateAgent(MASTER_A);
    s.approvedAt = Date.now(); // simulate approval
    expect(isAgentApprovedFor(MASTER_A)).toBe(true);
    expect(isAgentApprovedFor(MASTER_B)).toBe(false);
    // Address match is case-insensitive.
    expect(isAgentApprovedFor(MASTER_A.toUpperCase() as typeof MASTER_A)).toBe(true);
  });

  it("clears the key from memory", () => {
    generateAgent(MASTER_A);
    clearAgent();
    expect(getAgentSession()).toBeNull();
    expect(isAgentApprovedFor(MASTER_A)).toBe(false);
  });

  it("generates distinct keys each time", () => {
    const a = generateAgent(MASTER_A).agentAddress;
    const b = generateAgent(MASTER_A).agentAddress;
    expect(a).not.toBe(b);
  });
});

describe("reactive snapshot", () => {
  beforeEach(() => clearAgent());

  it("reports not-approved for a freshly generated (unapproved) agent", () => {
    generateAgent(MASTER_A);
    expect(getSnapshot().approved).toBe(false);
  });

  it("returns a referentially stable snapshot when unchanged", () => {
    const first = getSnapshot();
    expect(getSnapshot()).toBe(first);
  });

  it("notifies subscribers on generate and clear", () => {
    const listener = vi.fn();
    const unsub = subscribe(listener);
    generateAgent(MASTER_A);
    clearAgent();
    expect(listener).toHaveBeenCalledTimes(2);
    unsub();
    generateAgent(MASTER_A);
    expect(listener).toHaveBeenCalledTimes(2); // no calls after unsubscribe
  });
});

describe("getAgentExchangeClient (trust boundary)", () => {
  beforeEach(() => clearAgent());

  it("throws when there is no session", () => {
    expect(() => getAgentExchangeClient(MASTER_A)).toThrow(/no approved agent/i);
  });

  it("throws for an unapproved session even if the master matches", () => {
    generateAgent(MASTER_A);
    expect(() => getAgentExchangeClient(MASTER_A)).toThrow(/no approved agent/i);
  });

  it("throws for a different master than the approved one", () => {
    const s = generateAgent(MASTER_A);
    s.approvedAt = Date.now(); // simulate approval for A
    expect(() => getAgentExchangeClient(MASTER_B)).toThrow(/no approved agent/i);
  });
});
