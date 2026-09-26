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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CALC_BASE_CURRENCY,
    CALC_EXCHANGE_RATES,
    CALC_MODEL_MULTIPLIERS,
    calcToNumber,
    calcFormatInputNumber,
    calcClamp,
    calcConvertCurrency,
    calcMonthlyCost,
  };
}
