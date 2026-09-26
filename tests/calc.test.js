import { describe, expect, it, vi } from "vitest";
import {
  CALC_MODEL_MULTIPLIERS,
  calcClamp,
  calcConvertCurrency,
  calcFormatInputNumber,
  calcMonthlyCost,
  calcToNumber,
} from "../calc.js";

describe("calcConvertCurrency", () => {
  it("is identity for USD to USD", () => {
    expect(calcConvertCurrency(100, "USD", "USD")).toBe(100);
  });

  it("round-trips through the base currency", () => {
    const eur = calcConvertCurrency(100, "USD", "EUR");
    expect(calcConvertCurrency(eur, "EUR", "USD")).toBeCloseTo(100, 10);
  });

  it("falls back to USD for unknown codes", () => {
    expect(calcConvertCurrency(50, "XXX", "EUR")).toBe(
      calcConvertCurrency(50, "USD", "EUR"),
    );
  });
});

describe("calcMonthlyCost", () => {
  const row = (overrides = {}) => ({
    qty: 2,
    units: 730,
    price: 0.05,
    discount: 0,
    model: "on-demand",
    ...overrides,
  });

  it("multiplies qty × units × price at full rate", () => {
    expect(calcMonthlyCost(row(), CALC_MODEL_MULTIPLIERS)).toBeCloseTo(73);
  });

  it("applies the model multiplier", () => {
    expect(calcMonthlyCost(row({ model: "spot" }), CALC_MODEL_MULTIPLIERS)).toBeCloseTo(73 * 0.35);
  });

  it("applies percentage discounts", () => {
    expect(calcMonthlyCost(row({ discount: 25 }), CALC_MODEL_MULTIPLIERS)).toBeCloseTo(73 * 0.75);
  });

  it("treats unknown models as full price", () => {
    expect(calcMonthlyCost(row({ model: "quantum" }), CALC_MODEL_MULTIPLIERS)).toBeCloseTo(73);
  });
});

describe("calcToNumber / calcClamp", () => {
  it("falls back on garbage input", () => {
    expect(calcToNumber("abc", 5)).toBe(5);
    expect(calcToNumber(null)).toBe(0);
  });

  it("treats an empty field as missing, not as zero", () => {
    // Guards the parser against being "simplified" to Number(): Number("") is
    // 0 and is finite, which would make this fallback unreachable and read a
    // cleared growth-rate slider as a real 0% instead of the 4% default.
    expect(calcToNumber("", 4)).toBe(4);
    expect(calcToNumber("   ", 4)).toBe(4);
    expect(calcToNumber("", 0)).toBe(0);
  });

  it("accepts grouped digits but rejects trailing garbage", () => {
    expect(calcToNumber("1,000")).toBe(1000);
    expect(calcToNumber("1,000.5")).toBe(1000.5);
    expect(calcToNumber("0.11abc", 7)).toBe(7);
  });

  it("clamps into range", () => {
    expect(calcClamp(12, 0, 100)).toBe(12);
    expect(calcClamp(-1, 0, 100)).toBe(0);
    expect(calcClamp(101, 0, 100)).toBe(100);
  });
});

describe("calcFormatInputNumber", () => {
  // An <input type="number"> blanks any value that is not a valid
  // floating-point number, so a comma decimal silently becomes "".
  const survivesInputSanitization = (str) => /^(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/.test(str);

  it("emits a plain ASCII decimal", () => {
    expect(calcFormatInputNumber(0.11)).toBe("0.11");
    expect(calcFormatInputNumber(23)).toBe("23");
    expect(calcFormatInputNumber(0)).toBe("0");
  });

  it("never emits a grouping or decimal separator a number input would reject", () => {
    for (const value of [0.11, 1234.5, 0.005, 1e6, 99.999, 0.1 + 0.2]) {
      for (const digits of [0, 2]) {
        const formatted = calcFormatInputNumber(value, digits);
        expect(survivesInputSanitization(formatted)).toBe(true);
      }
    }
  });

  it("honours the requested precision by rounding", () => {
    expect(calcFormatInputNumber(0.114, 2)).toBe("0.11");
    expect(calcFormatInputNumber(6.4, 0)).toBe("6");
    expect(calcFormatInputNumber(0.25, 0)).toBe("0");
  });

  it("never delegates to locale-sensitive formatting", () => {
    // The regression: toLocaleString(undefined, ...) resolves against the
    // browser's UI locale, so it emitted "0,11" in every comma-decimal
    // locale. That passes in en-US CI and only breaks in the field, so assert
    // the mechanism is absent rather than trying to fake a locale.
    const spy = vi.spyOn(Number.prototype, "toLocaleString");
    try {
      calcFormatInputNumber(0.11);
      calcFormatInputNumber(1234.5, 2);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
