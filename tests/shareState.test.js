import { describe, expect, it } from "vitest";
import { decodeShareState, encodeShareState } from "../shareState.js";

const SAMPLE_STATE = {
  rows: [
    { service: "API", category: "Compute", model: "on-demand", qty: 2, units: 730, price: 0.1, discount: 0 },
    { service: "DB", category: "Database", model: "reserved", qty: 1, units: 730, price: 0.2, discount: 10 },
  ],
  currency: "USD",
  growthRate: 5,
  scenarioName: "prod baseline",
  monthlyBudget: 500,
};

describe("encodeShareState / decodeShareState", () => {
  it("roundtrips a state object through a hash fragment", () => {
    const hash = encodeShareState(SAMPLE_STATE);
    expect(hash.startsWith("#s=")).toBe(true);
    expect(decodeShareState(hash)).toEqual(SAMPLE_STATE);
  });

  it("produces URL-safe output with no padding or reserved characters", () => {
    const hash = encodeShareState({ rows: [], note: "a+b/c=d" });
    const encoded = hash.slice(3);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeShareState(hash)).toEqual({ rows: [], note: "a+b/c=d" });
  });

  it("returns null for absent, foreign, or corrupt hashes", () => {
    expect(decodeShareState("")).toBeNull();
    expect(decodeShareState(null)).toBeNull();
    expect(decodeShareState("#section-anchor")).toBeNull();
    // Truncated base64 payload must not throw.
    const hash = encodeShareState(SAMPLE_STATE);
    expect(decodeShareState(hash.slice(0, hash.length - 8))).toBeNull();
  });

  it("rejects payloads whose rows are not an array", () => {
    const hash = encodeShareState({ rows: "nope" });
    // Encoder accepts any object; decoder validates structure.
    expect(decodeShareState(hash)).toBeNull();
  });

  it("preserves a non-USD display currency through the roundtrip", () => {
    // The share payload stores base-USD amounts plus the display currency so
    // the recipient renders the same figures the sender saw. If the currency
    // field were dropped the link would silently reinterpret those amounts as
    // USD, which is the bug this guards.
    const state = { ...SAMPLE_STATE, currency: "EUR", monthlyBudget: 8695.65 };
    const decoded = decodeShareState(encodeShareState(state));
    expect(decoded.currency).toBe("EUR");
    expect(decoded.monthlyBudget).toBe(8695.65);
  });

  it("throws when encoding a non-object", () => {
    expect(() => encodeShareState(null)).toThrow();
    expect(() => encodeShareState("state")).toThrow();
  });
});
