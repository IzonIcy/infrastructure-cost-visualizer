import js from "@eslint/js";
import globals from "globals";
import { readFileSync } from "node:fs";

// calc.js / csv.js / shareState.js are loaded as classic scripts, so their
// top-level declarations become globals that app.js may reference. Deriving
// the list keeps it from drifting: a hand-maintained one had already gone
// stale twice, and a stale entry only surfaces as a no-undef failure in CI.
const SHARED_SCRIPT_FILES = ["calc.js", "csv.js", "shareState.js"];

const sharedScriptGlobals = Object.fromEntries(
  SHARED_SCRIPT_FILES.flatMap((name) =>
    readFileSync(new URL(name, import.meta.url), "utf8")
      // Top-level declarations sit at column 0; nested ones are indented.
      .split("\n")
      .map((line) => /^(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/.exec(line))
      .filter(Boolean)
      .map((match) => [match[1], "readonly"]),
  ),
);

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
        ...sharedScriptGlobals,
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
