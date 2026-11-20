import { describe, expect, it, vi } from "vitest";
import {
  CALC_INFERENCE_DEFAULTS,
  CALC_MODEL_MULTIPLIERS,
  INFERENCE_SIDE,
  calcClamp,
  calcConvertCurrency,
  calcFormatInputNumber,
  calcGpuHoursCost,
  calcHostedInferenceCost,
  calcInferenceAmount,
  calcInferenceBreakEven,
  calcInferenceSummary,
  calcMonthlyCost,
  calcSelfHostedInferenceCost,
  calcToNumber,
  calcTokenCost,
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

describe("calcInferenceAmount", () => {
  it("treats a blank field as missing, not as free inference", () => {
    expect(calcInferenceAmount("")).toBeNull();
    expect(calcInferenceAmount("   ")).toBeNull();
    expect(calcInferenceAmount("abc")).toBeNull();
    expect(calcInferenceAmount(null)).toBeNull();
    expect(calcInferenceAmount(0)).toBe(0);
    expect(calcInferenceAmount("0")).toBe(0);
  });

  it("accepts grouped digits, the way the token fields are written", () => {
    expect(calcInferenceAmount("40,000,000")).toBe(40_000_000);
  });
});

describe("calcGpuHoursCost", () => {
  it("multiplies GPU hours by the hourly rate", () => {
    expect(calcGpuHoursCost(1460, 4)).toBe(5840);
  });

  it("prices an idle GPU at zero rather than refusing the input", () => {
    expect(calcGpuHoursCost(0, 4)).toBe(0);
    expect(calcGpuHoursCost(730, 0)).toBe(0);
  });

  it("returns null for negative hours or rates", () => {
    expect(calcGpuHoursCost(-1, 4)).toBeNull();
    expect(calcGpuHoursCost(730, -4)).toBeNull();
  });

  it("returns null instead of Infinity when the product overflows", () => {
    expect(calcGpuHoursCost(Number.MAX_VALUE, 2)).toBeNull();
  });
});

describe("calcTokenCost", () => {
  it("prices tokens per million", () => {
    expect(calcTokenCost(40_000_000, 2)).toBeCloseTo(80);
    expect(calcTokenCost(1_000_000, 10)).toBeCloseTo(10);
  });

  it("returns null for negative tokens or prices", () => {
    expect(calcTokenCost(-1_000_000, 2)).toBeNull();
    expect(calcTokenCost(1_000_000, -2)).toBeNull();
  });

  it("returns null instead of Infinity when the product overflows", () => {
    expect(calcTokenCost(1e308, 1e308)).toBeNull();
  });
});

describe("calcHostedInferenceCost", () => {
  it("prices input and output tokens at their own rates", () => {
    const cost = calcHostedInferenceCost({
      inputTokensPerMonth: 40_000_000,
      outputTokensPerMonth: 8_000_000,
      hostedInputPricePerMillion: 2,
      hostedOutputPricePerMillion: 10,
    });
    // 40M × $2 = $80 and 8M × $10 = $80. Charging one blended rate would
    // give $96 at the input price or $480 at the output price.
    expect(cost).toBeCloseTo(160);
  });

  it("returns null when either price is unset", () => {
    expect(
      calcHostedInferenceCost({
        inputTokensPerMonth: 40_000_000,
        outputTokensPerMonth: 8_000_000,
        hostedInputPricePerMillion: 2,
        hostedOutputPricePerMillion: "",
      }),
    ).toBeNull();
  });
});

describe("calcSelfHostedInferenceCost", () => {
  it("multiplies GPU count, hours and rate", () => {
    const cost = calcSelfHostedInferenceCost({
      gpuCount: 2,
      gpuHoursPerMonth: 730,
      gpuHourlyRate: 4,
    });
    expect(cost).toBeCloseTo(5840);
  });

  it("returns null when the GPU count is unreadable", () => {
    expect(
      calcSelfHostedInferenceCost({
        gpuCount: "two",
        gpuHoursPerMonth: 730,
        gpuHourlyRate: 4,
      }),
    ).toBeNull();
  });
});

describe("calcInferenceBreakEven", () => {
  const inference = (overrides = {}) => ({
    ...CALC_INFERENCE_DEFAULTS,
    ...overrides,
  });

  it("places the break-even where the hosted bill reaches the GPU bill", () => {
    // $5,840 of GPUs against a $160 hosted bill for 48M tokens, so the
    // hosted mix is $3.3333 per million tokens and 5,840 / 3.3333e-6 =
    // 1.752B tokens a month.
    expect(calcInferenceBreakEven(inference()).tokensPerMonth).toBeCloseTo(
      1_752_000_000,
      0,
    );
  });

  it("agrees with itself: hosted cost at the break-even equals the GPU bill", () => {
    const { tokensPerMonth } = calcInferenceBreakEven(inference());
    const selfHosted = calcSelfHostedInferenceCost(inference());
    const scale = tokensPerMonth / 48_000_000;
    const hostedAtBreakEven = calcHostedInferenceCost({
      ...inference(),
      inputTokensPerMonth: 40_000_000 * scale,
      outputTokensPerMonth: 8_000_000 * scale,
    });
    expect(hostedAtBreakEven).toBeCloseTo(selfHosted, 6);
  });

  it("names the cheaper side on each side of the break-even", () => {
    const result = calcInferenceBreakEven(inference());
    expect(result.cheaperBelow).toBe(INFERENCE_SIDE.HOSTED);
    expect(result.cheaperAbove).toBe(INFERENCE_SIDE.SELF_HOSTED);
  });

  it("has no break-even without traffic to price a mix from", () => {
    expect(
      calcInferenceBreakEven(
        inference({ inputTokensPerMonth: 0, outputTokensPerMonth: 0 }),
      ),
    ).toBeNull();
  });

  it("has no break-even when hosted inference is free", () => {
    expect(
      calcInferenceBreakEven(
        inference({
          hostedInputPricePerMillion: 0,
          hostedOutputPricePerMillion: 0,
        }),
      ),
    ).toBeNull();
  });

  it("breaks even at zero when the GPUs cost nothing", () => {
    const result = calcInferenceBreakEven(inference({ gpuCount: 0 }));
    expect(result.tokensPerMonth).toBe(0);
    expect(result.cheaperBelow).toBe(INFERENCE_SIDE.SELF_HOSTED);
    expect(result.cheaperAbove).toBe(INFERENCE_SIDE.SELF_HOSTED);
  });

  it("refuses negative inputs rather than reporting a negative volume", () => {
    const result = calcInferenceBreakEven(
      inference({ inputTokensPerMonth: -1_000_000 }),
    );
    expect(result).toBeNull();
  });
});

describe("calcInferenceSummary", () => {
  const inference = (overrides = {}) => ({
    ...CALC_INFERENCE_DEFAULTS,
    ...overrides,
  });

  it("says hosted wins at the default traffic", () => {
    const summary = calcInferenceSummary(inference());
    expect(summary.hostedCost).toBeCloseTo(160);
    expect(summary.selfHostedCost).toBeCloseTo(5840);
    expect(summary.cheaperSide).toBe(INFERENCE_SIDE.HOSTED);
  });

  it("says self-hosting wins above the break-even volume", () => {
    const summary = calcInferenceSummary(
      inference({
        inputTokensPerMonth: 2_500_000_000,
        outputTokensPerMonth: 500_000_000,
      }),
    );
    expect(summary.hostedCost).toBeCloseTo(10_000);
    expect(summary.cheaperSide).toBe(INFERENCE_SIDE.SELF_HOSTED);
  });

  it("calls an exact match a tie", () => {
    const summary = calcInferenceSummary(
      inference({ gpuCount: 1, gpuHoursPerMonth: 40, gpuHourlyRate: 4 }),
    );
    expect(summary.selfHostedCost).toBeCloseTo(160);
    expect(summary.cheaperSide).toBe(INFERENCE_SIDE.TIE);
  });

  it("leaves the cheaper side undefined when a cost is unknown", () => {
    const summary = calcInferenceSummary(
      inference({ hostedOutputPricePerMillion: "" }),
    );
    expect(summary.hostedCost).toBeNull();
    expect(summary.cheaperSide).toBeNull();
  });
});
