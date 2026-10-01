/**
 * Row normalization for the service ledger.
 *
 * Lives outside app.js so it can be unit-tested. Every rule here has been a
 * shipped bug at least once: prices silently zeroed in comma-decimal
 * locales, fractional counts stored differently from how they displayed, and
 * display-currency amounts persisted labelled as base currency. All three
 * lived in DOM-coupled functions that no test could reach.
 *
 * Pure by construction — no module-level state, no DOM, and the display
 * currency arrives as an argument. Dual-environment like calc.js: loaded as a
 * classic script by index.html, imported by vitest.
 */

const CATEGORY_OPTIONS = [
  "Compute",
  "Storage",
  "Database",
  "Networking",
  "Monitoring",
  "Security",
  "Other",
];

const MODEL_OPTIONS = ["on-demand", "reserved", "spot"];

function normalizeSanitizeText(value, fallback, maxLength) {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return cleaned || fallback;
}

function normalizeChoice(value, options, fallback) {
  return options.includes(value) ? value : fallback;
}

function normalizeLedgerRow(
  row,
  {
    currency = CALC_BASE_CURRENCY,
    amountsInBaseCurrency = false,
    rates = CALC_EXCHANGE_RATES,
  } = {},
) {
  const priceValue = Math.max(0, calcToNumber(row?.price));
  return {
    service: normalizeSanitizeText(row?.service, "Untitled service", 120),
    category: normalizeChoice(row?.category, CATEGORY_OPTIONS, "Other"),
    model: normalizeChoice(row?.model, MODEL_OPTIONS, "on-demand"),
    // qty and units are counts (nodes, hours/month) and the row inputs format
    // them with zero fraction digits, so round here too. Otherwise the stored
    // value and the displayed value disagree, and a fractional CSV import
    // persists a fraction the UI then re-rounds.
    qty: calcClamp(Math.round(calcToNumber(row?.qty)), 0, 1_000_000),
    units: calcClamp(Math.round(calcToNumber(row?.units)), 0, 1_000_000),
    price: amountsInBaseCurrency
      ? priceValue
      : Math.max(
          0,
          calcConvertCurrency(priceValue, currency, CALC_BASE_CURRENCY, rates),
        ),
    discount: calcClamp(calcToNumber(row?.discount), 0, 100),
  };
}

function normalizeLedgerRows(rows, options = {}) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizeLedgerRow(row, options));
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CATEGORY_OPTIONS,
    MODEL_OPTIONS,
    normalizeSanitizeText,
    normalizeChoice,
    normalizeLedgerRow,
    normalizeLedgerRows,
  };
}
