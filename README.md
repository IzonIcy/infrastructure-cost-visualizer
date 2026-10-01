# Cloud Spend Planning Desk

Interactive dashboard for estimating cloud infrastructure costs. No signup, no build step — just open `index.html` and start modeling.

**Live:** [https://infrastructure-cost-visualizer.vercel.app/](https://infrastructure-cost-visualizer.vercel.app/)

## What it does

Cloud pricing is confusing. Every provider has On-Demand, Reserved, and Spot pricing with different discounts, and figuring out what your bill will actually look like usually means spreadsheets. This is a single-page tool that lets you:

- Add resources with quantities and pricing
- Compare On-Demand vs Reserved vs Spot side by side
- Set a budget and see instant over/under feedback
- View spend breakdowns by category and pricing model
- Project costs 12 months out with adjustable growth rate
- Toggle between USD, EUR, GBP
- Save scenarios to your browser (or to a backend if you want)

## Running it

There is no build step and no runtime dependency. `index.html` loads five
plain scripts and a stylesheet straight off disk:

```
index.html   markup and the row template
styles.css
calc.js      cost math, FX rates, number parsing
csv.js       CSV parse and escape
normalize.js ledger row rules
shareState.js share-link encoding
app.js       DOM wiring
```

Open it directly:

```bash
open index.html
```

A `file://` page is fully functional except for Save, Load and Compare, which
need the backend below.

### Optional backend for saving scenarios

```bash
pnpm install
pnpm dev
```

Then `http://localhost:3000`.

> **Restart the server after adding a file to the public allowlist.**
> `PUBLIC_FILES` in `server/app.js` is read once at startup, so a running
> `pnpm dev` will 404 a newly added script while `pnpm smoke` passes — smoke
> builds a fresh app. Symptom: a blank page and a `ReferenceError` in the
> console for a name you can see in the file.

Prefer this over `npx serve .` for anything beyond a quick look. A generic
static server on the repo root will happily hand out `data/scenarios.json`
and `package.json`; the Express server serves an explicit allowlist and 404s
everything else on purpose.

## How the math works

```
monthly = qty × units_per_month × unit_price × (1 − discount%) × pricing_multiplier
```

| Model     | Multiplier |
|-----------|-----------|
| On-Demand | 1.00      |
| Reserved  | 0.72      |
| Spot      | 0.35      |

Multipliers and FX rates live in `calc.js` and nowhere else — the app reads
them from there so the unit tests cover the values the browser actually uses.
The rates are approximate planning figures, not provider billing rates.

## Why vanilla JS?

This project intentionally has no framework. For a single-page tool that amounts to a fancy calculator, adding React/Vue/Svelte adds more complexity than it removes. There is no bundler, so what you read is what runs.

The cost logic is deliberately split out of `app.js` into `calc.js`,
`csv.js`, `normalize.js` and `shareState.js`. Those files are pure and loaded
as classic scripts, so the same source runs in the browser and under vitest
without a build step. Anything that touches the DOM stays in `app.js`.

## Development

```bash
pnpm lint     # eslint
pnpm test     # vitest
pnpm smoke    # boots the server and exercises the API end to end
```

All three run in CI, and lint and test also run in the pre-commit hook.
`pnpm smoke` additionally asserts that every `<script>` and `<link>` in
`index.html` is actually served — a missing one 404s into a JSON error body,
which the browser refuses to execute, and the app dies at boot with no useful
diagnostics.

## Stack

Frontend: HTML, CSS, JavaScript (zero deps).  
Backend (optional): Node.js, Express, JSON file storage.
