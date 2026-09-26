import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": "off",
    },
  },
  {
    ignores: ["node_modules/"],
  },
  {
    // Browser dashboard code
    files: ["app.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Provided by calc.js / csv.js / shareState.js classic scripts loaded
        // before app.js.
        csvEscape: "readonly",
        parseCsvContent: "readonly",
        encodeShareState: "readonly",
        decodeShareState: "readonly",
        calcConvertCurrency: "readonly",
        calcMonthlyCost: "readonly",
        calcToNumber: "readonly",
        calcFormatInputNumber: "readonly",
      },
    },
  },
  {
    // Dual-environment helpers: loaded as classic scripts in the browser,
    // CommonJS-required by tests.
    files: ["calc.js", "csv.js", "shareState.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    // Node server, build config, and tests
    files: ["server/**/*.js", "tests/**/*.js", "*.config.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
];
