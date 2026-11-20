/**
 * Pure cost math for the worksheet.
 *
 * Lives outside app.js so it can be unit-tested: the two worst historical
 * bugs here (an XSS sink and a currency double-conversion) both lived in
 * untestable DOM code. Dual-environment like csv.js: loaded as a classic
 * script by index.html, imported as CJS by vitest.
 */

const CALC_BASE_CURRENCY = "USD";

const CALC_EXCHANGE_RATES = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.78,
};

const CALC_MODEL_MULTIPLIERS = {
  "on-demand": 1,
  reserved: 0.72,
  spot: 0.35,
};

function calcToNumber(value, fallback = 0) {
  if (typeof value === "number") return Number.isFinite(value) ? value : fallback;
  if (typeof value !== "string") return fallback;
  // Empty and whitespace-only input is "no value", not zero. Number("") is 0
  // and passes the isFinite check, so the fallback was previously unreachable
  // and a cleared field read as a real 0.
  const normalized = value.replace(/,/g, "").trim();
  if (normalized === "") return fallback;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Serialize a number for an <input type="number"> value.
 *
 * Must stay locale-independent. The browser blanks any input value that is
 * not a valid floating-point number, so a locale-formatted "0,11" written
 * from a comma-decimal UI locale becomes "" — the row then recalculates as
 * $0 and the zero is persisted. Formatting for humans belongs in the
 * read-only cells, which go through Intl.
 */
function calcFormatInputNumber(value, maxFractionDigits = 2) {
  const factor = 10 ** maxFractionDigits;
  return String(Math.round(calcToNumber(value) * factor) / factor);
}

function calcClamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function calcConvertCurrency(amount, fromCurrency, toCurrency, rates = CALC_EXCHANGE_RATES) {
  const safeFrom = rates[fromCurrency] ? fromCurrency : CALC_BASE_CURRENCY;
  const safeTo = rates[toCurrency] ? toCurrency : CALC_BASE_CURRENCY;
  const usdAmount = calcToNumber(amount) / rates[safeFrom];
  return usdAmount * rates[safeTo];
}

function calcMonthlyCost(row, multipliers = CALC_MODEL_MULTIPLIERS) {
  const base = row.qty * row.units * row.price;
  const discountFactor = 1 - calcClamp(row.discount, 0, 100) / 100;
  const modelFactor = multipliers[row.model] ?? 1;
  return base * discountFactor * modelFactor;
}

const INFERENCE_SIDE = {
  HOSTED: "hosted",
  SELF_HOSTED: "self-hosted",
  TIE: "tie",
};

// Money and volumes for the inference panel are USD per unit of measure at
// rest; the UI converts for display, the same way ledger prices work.
const CALC_INFERENCE_DEFAULTS = {
  gpuHourlyRate: 4,
  gpuCount: 2,
  gpuHoursPerMonth: 730,
  inputTokensPerMonth: 40_000_000,
  outputTokensPerMonth: 8_000_000,
  hostedInputPricePerMillion: 2,
  hostedOutputPricePerMillion: 10,
};

/**
 * Parse an inference input, where unreadable is null rather than 0.
 *
 * calcToNumber's "blank means missing, fall back to zero" contract is right
 * for the ledger, where a cleared price really is free. It is wrong here: a
 * blank hosted price would read as free inference and every break-even would
 * come back as Infinity. Negative amounts are rejected for the same reason,
 * and either one yields null so the caller can print a dash.
 */
function calcInferenceAmount(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").trim();
  if (normalized === "") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function calcInferenceAmounts(values) {
  const parsed = values.map(calcInferenceAmount);
  if (parsed.some((value) => value === null || value < 0)) return null;
  return parsed;
}

function calcGpuHoursCost(gpuHours, hourlyRate) {
  const amounts = calcInferenceAmounts([gpuHours, hourlyRate]);
  if (!amounts) return null;
  const cost = amounts[0] * amounts[1];
  return Number.isFinite(cost) ? cost : null;
}

function calcTokenCost(tokens, pricePerMillion) {
  const amounts = calcInferenceAmounts([tokens, pricePerMillion]);
  if (!amounts) return null;
  const cost = (amounts[0] / 1_000_000) * amounts[1];
  return Number.isFinite(cost) ? cost : null;
}

// Input and output tokens are priced separately, so the two lines are summed
// rather than applying one price to the total volume.
function calcHostedInferenceCost(inference = {}) {
  const inputCost = calcTokenCost(
    inference.inputTokensPerMonth,
    inference.hostedInputPricePerMillion,
  );
  const outputCost = calcTokenCost(
    inference.outputTokensPerMonth,
    inference.hostedOutputPricePerMillion,
  );
  if (inputCost === null || outputCost === null) return null;
  return inputCost + outputCost;
}

function calcSelfHostedInferenceCost(inference = {}) {
  const amounts = calcInferenceAmounts([
    inference.gpuCount,
    inference.gpuHoursPerMonth,
  ]);
  if (!amounts) return null;
  const gpuHours = amounts[0] * amounts[1];
  if (!Number.isFinite(gpuHours)) return null;
  return calcGpuHoursCost(gpuHours, inference.gpuHourlyRate);
}

/**
 * Monthly token volume where hosted and self-hosted spend are equal.
 *
 * The GPU bill is flat, so the break-even is the volume whose hosted bill, at
 * the current input/output mix, reaches it. Hosted cost starts at zero and
 * climbs with traffic, so hosted is cheaper below that volume and self-hosting
 * is cheaper above it. Returns null when the comparison has no answer: an
 * unusable input, no traffic to price a mix from, or hosted inference that is
 * free at any volume.
 */
function calcInferenceBreakEven(inference = {}) {
  const selfHostedCost = calcSelfHostedInferenceCost(inference);
  const hostedCost = calcHostedInferenceCost(inference);
  const tokens = calcInferenceAmounts([
    inference.inputTokensPerMonth,
    inference.outputTokensPerMonth,
  ]);
  if (selfHostedCost === null || hostedCost === null || tokens === null) {
    return null;
  }

  const totalTokens = tokens[0] + tokens[1];
  if (!Number.isFinite(totalTokens) || totalTokens === 0 || hostedCost === 0) {
    return null;
  }

  const tokensPerMonth = totalTokens * (selfHostedCost / hostedCost);
  if (!Number.isFinite(tokensPerMonth)) return null;

  return {
    tokensPerMonth,
    cheaperBelow:
      selfHostedCost === 0 ? INFERENCE_SIDE.SELF_HOSTED : INFERENCE_SIDE.HOSTED,
    cheaperAbove: INFERENCE_SIDE.SELF_HOSTED,
  };
}

function calcInferenceSummary(inference = {}) {
  const hostedCost = calcHostedInferenceCost(inference);
  const selfHostedCost = calcSelfHostedInferenceCost(inference);

  let cheaperSide = null;
  if (hostedCost !== null && selfHostedCost !== null) {
    if (hostedCost === selfHostedCost) cheaperSide = INFERENCE_SIDE.TIE;
    else {
      cheaperSide =
        hostedCost < selfHostedCost
          ? INFERENCE_SIDE.HOSTED
          : INFERENCE_SIDE.SELF_HOSTED;
    }
  }

  return {
    hostedCost,
    selfHostedCost,
    breakEven: calcInferenceBreakEven(inference),
    cheaperSide,
  };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CALC_BASE_CURRENCY,
    CALC_EXCHANGE_RATES,
    CALC_MODEL_MULTIPLIERS,
    CALC_INFERENCE_DEFAULTS,
    INFERENCE_SIDE,
    calcToNumber,
    calcFormatInputNumber,
    calcClamp,
    calcConvertCurrency,
    calcMonthlyCost,
    calcInferenceAmount,
    calcGpuHoursCost,
    calcTokenCost,
    calcHostedInferenceCost,
    calcSelfHostedInferenceCost,
    calcInferenceBreakEven,
    calcInferenceSummary,
  };
}
