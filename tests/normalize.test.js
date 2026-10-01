import { describe, expect, it } from "vitest";
import {
  CATEGORY_OPTIONS,
  MODEL_OPTIONS,
  normalizeChoice,
  normalizeLedgerRow,
  normalizeLedgerRows,
  normalizeSanitizeText,
} from "../normalize.js";

const VALID_ROW = {
  service: "Compute Node",
  category: "Compute",
  model: "on-demand",
  qty: 6,
  units: 730,
  price: 0.14,
  discount: 0,
};

describe("normalizeSanitizeText", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeSanitizeText("  a   b  ", "fallback", 20)).toBe("a b");
  });

  it("falls back when empty and truncates when long", () => {
    expect(normalizeSanitizeText("   ", "fallback", 20)).toBe("fallback");
    expect(normalizeSanitizeText(null, "fallback", 20)).toBe("fallback");
    expect(normalizeSanitizeText("abcdefghij", "fallback", 4)).toBe("abcd");
  });
});

describe("normalizeChoice", () => {
  it("keeps known values and replaces unknown ones", () => {
    expect(normalizeChoice("Compute", CATEGORY_OPTIONS, "Other")).toBe(
      "Compute",
    );
    expect(normalizeChoice("Bogus", CATEGORY_OPTIONS, "Other")).toBe("Other");
    expect(normalizeChoice("spot", MODEL_OPTIONS, "on-demand")).toBe("spot");
    expect(normalizeChoice("quantum", MODEL_OPTIONS, "on-demand")).toBe(
      "on-demand",
    );
  });
});

describe("normalizeLedgerRow", () => {
  it("passes a valid USD row through unchanged", () => {
    expect(normalizeLedgerRow(VALID_ROW)).toEqual(VALID_ROW);
  });

  it("converts a display-currency price into base USD", () => {
    // 0.11 EUR at 0.92 is 0.119565... USD. Getting this backwards is what made
    // shared links under-report every non-USD scenario by the FX rate.
    const row = normalizeLedgerRow(
      { ...VALID_ROW, price: 0.11 },
      { currency: "EUR" },
    );
    expect(row.price).toBeCloseTo(0.11 / 0.92, 10);
  });

  it("treats amountsInBaseCurrency as already converted", () => {
    const row = normalizeLedgerRow(
      { ...VALID_ROW, price: 0.14 },
      {
        currency: "EUR",
        amountsInBaseCurrency: true,
      },
    );
    expect(row.price).toBe(0.14);
  });

  it("honours an injected rate table", () => {
    const rates = { USD: 1, EUR: 0.5 };
    const row = normalizeLedgerRow(
      { ...VALID_ROW, price: 1 },
      {
        currency: "EUR",
        rates,
      },
    );
    expect(row.price).toBe(2);
  });

  it("rounds counts, so the stored value matches the displayed one", () => {
    // The row inputs format qty and units with zero fraction digits. Storing
    // 2.6 while showing 3 is how a fractional CSV import silently diverged.
    const row = normalizeLedgerRow({ ...VALID_ROW, qty: 2.6, units: 730.4 });
    expect(row.qty).toBe(3);
    expect(row.units).toBe(730);
  });

  it("clamps every numeric field into range", () => {
    const row = normalizeLedgerRow({
      ...VALID_ROW,
      qty: -5,
      units: 9_999_999,
      discount: 250,
      price: -3,
    });
    expect(row.qty).toBe(0);
    expect(row.units).toBe(1_000_000);
    expect(row.discount).toBe(100);
    expect(row.price).toBe(0);
  });

  it("substitutes defaults for missing or hostile fields", () => {
    const row = normalizeLedgerRow({
      service: "   ",
      category: "Nope",
      model: "x",
    });
    expect(row.service).toBe("Untitled service");
    expect(row.category).toBe("Other");
    expect(row.model).toBe("on-demand");
    expect(row.qty).toBe(0);
    expect(row.price).toBe(0);
  });

  it("survives a completely absent row", () => {
    expect(() => normalizeLedgerRow(undefined)).not.toThrow();
    expect(normalizeLedgerRow(undefined).service).toBe("Untitled service");
  });
});

describe("normalizeLedgerRows", () => {
  it("returns an empty array for a non-array, including an explicitly empty one", () => {
    // An empty ledger is a legitimate state and must not be backfilled.
    expect(normalizeLedgerRows([])).toEqual([]);
    expect(normalizeLedgerRows(null)).toEqual([]);
    expect(normalizeLedgerRows("nope")).toEqual([]);
  });

  it("applies the options to every row", () => {
    const rows = normalizeLedgerRows(
      [
        { ...VALID_ROW, price: 1 },
        { ...VALID_ROW, price: 2 },
      ],
      {
        currency: "GBP",
      },
    );
    expect(rows[0].price).toBeCloseTo(1 / 0.78, 10);
    expect(rows[1].price).toBeCloseTo(2 / 0.78, 10);
  });
});
