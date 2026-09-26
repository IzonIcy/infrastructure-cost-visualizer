// calc.js / csv.js / shareState.js / normalize.js are loaded as classic
// scripts in the browser, where their top-level declarations share one global
// scope. Vitest imports them as isolated ES modules, so a file that calls
// another (normalize.js -> calc.js) would not resolve. Publish calc.js's
// exports on globalThis to reproduce the browser's actual scoping.
import * as calc from "../calc.js";

Object.assign(globalThis, calc);
