# Cloud Spend Planning Desk

This is a browser-based cost estimator for engineering leads and founders planning a launch budget, and it answers a what-if about a new service in seconds instead of in a spreadsheet.

Run it from a checkout. There is nothing to install and nothing to build:

```bash
open index.html
```

![Cloud Spend Planning Desk showing the hero headline, the scenario name and monthly budget fields, the three stack presets, and the service ledger with costed line items](docs/images/demo.png)

Live: [https://infrastructure-cost-visualizer.vercel.app/](https://infrastructure-cost-visualizer.vercel.app/)

## How it compares to the AWS Pricing Calculator

The [AWS Pricing Calculator](https://calculator.aws/) is the authoritative one, and this tool is not a replacement for it. That calculator covers every SKU the providers sell, applies the real region, term and tier rules, and its output is the number you can defend to finance. This one is a fast what-if board: three starter stacks, editable line items across seven spend categories, three pricing models with fixed multipliers, and a 12-month runway, all on one page that opens from disk with no account. Use it to find out whether a plan is roughly affordable and where the money concentrates, then price the real build in the AWS calculator. Do not quote its numbers as provider prices.

## What it does

- Add resources with quantities and pricing
- Compare On-Demand vs Reserved vs Spot side by side
- Price hosted inference against your own GPUs, with a break-even token volume
- Set a budget and see instant over/under feedback
- View spend breakdowns by category and pricing model
- Project costs 12 months out with adjustable growth rate
- Toggle between USD, EUR, GBP
- Save scenarios to your browser (or to a backend if you want)

## How the math works

```
monthly = qty × units_per_month × unit_price × (1 − discount%) × pricing_multiplier
```

| Model     | Multiplier |
|-----------|-----------|
| On-Demand | 1.00      |
| Reserved  | 0.72      |
| Spot      | 0.35      |

Multipliers and FX rates live in `calc.js` and nowhere else. The app reads them from there so the unit tests cover the values the browser actually uses. The rates are approximate planning figures, not provider billing rates.

## Inference spend

The inference block prices the same traffic two ways: a hosted API billed per token, and your own GPUs billed per hour. It sits beside the ledger rather than inside it, so neither total is added to the monthly run rate.

```
self_hosted = gpu_count × hours_per_month × gpu_hourly_rate
hosted      = input_tokens / 1M × input_price + output_tokens / 1M × output_price
break_even  = self_hosted × (input_tokens + output_tokens) / hosted
```

Read the break-even as the monthly GPU bill divided by what hosted inference charges per token at your current input/output mix. The GPU bill is flat, so it is the token volume where the hosted bill catches up with it. Hosted is cheaper below that volume and self-hosting is cheaper above it. The mix is held fixed, so the number moves if you change the share of output tokens.

A blank or negative field reads as unknown and prints a dash. Zero traffic, a zero hosted price, or an unreadable input has no break-even and says so instead of returning `Infinity`. The formulas are pure functions in `calc.js`, and `tests/calc.test.js` covers each of those cases.

### Defaults and where they come from

| Field | Default | Basis |
|---|---|---|
| GPU hourly rate | $4.00 per GPU-hour | Rounded from the $3.99 median on-demand H100 price across 45 providers on 20 Nov 2026 ([getdeploying.com](https://getdeploying.com/gpus/nvidia-h100)) |
| GPU count | 2 | This project's placeholder, not a recommendation |
| Hours / month | 730 | 365 days × 24 hours ÷ 12 months, which is the usual "always on" month |
| Input tokens / month | 40,000,000 | Placeholder volume |
| Output tokens / month | 8,000,000 | Placeholder volume, a 5:1 input-to-output ratio |
| Hosted input price | $2.00 per 1M tokens | Mid-tier frontier model list price on 20 Nov 2026 (GPT-6.1 Sol and Gemini 4 Argon both listed there, per the [modelpick.dev](https://modelpick.dev/) snapshot) |
| Hosted output price | $10.00 per 1M tokens | Same listings |

Every one of these is a starting assumption for a first guess, not a quote. Replace them with what you are actually charged: a reserved GPU contract, a committed-use discount, or your provider's rate card for the model you run. GPU rental medians move week to week, and list prices change without notice.

The seven inputs travel with the scenario. Save Scenario, Share Link and localStorage keep them, and Export CSV writes them as a `#inference` block after the ledger rows, which Import CSV reads back.

## What it does not do yet

- The self-hosted side of the inference block is GPU rental only. It leaves out engineering time, idle capacity, utilization below 100%, and the storage and egress around a deployment, so treat it as a floor rather than a total cost of ownership.
- Break-even assumes a fixed input/output ratio and a flat hosted rate per token. Tiered pricing, cached input, batch discounts and context-length surcharges are not modeled.
- The service catalogue is three example stacks (SaaS App Stack, Data Platform, Edge API), not a list of provider SKUs. You supply the unit price.
- Reserved pricing is a single 0.72 multiplier. There is no term length, no upfront or partial-upfront option, and no savings plan.
- FX rates are hardcoded in `calc.js` (EUR 0.92, GBP 0.78) and only USD, EUR and GBP exist.
- Save, Load and Compare need the optional Node backend. On a `file://` page those buttons have nothing to talk to.

## The scripts

`index.html` loads five plain scripts and a stylesheet straight off disk:

| File | Job |
|---|---|
| `index.html` | markup and the row template |
| `styles.css` | layout and theme |
| `calc.js` | cost math for the ledger and inference, FX rates, number parsing |
| `csv.js` | CSV parse and escape, including the inference block |
| `normalize.js` | ledger row rules |
| `shareState.js` | share-link encoding |
| `app.js` | DOM wiring |

## Optional backend for saving scenarios

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3000`.

> **Restart the server after adding a file to the public allowlist.**
> `PUBLIC_FILES` in `server/app.js` is read once at startup, so a running
> `pnpm dev` will 404 a newly added script while `pnpm smoke` passes, because
> smoke builds a fresh app. Symptom: a blank page and a `ReferenceError` in the
> console for a name you can see in the file.

Prefer this over `npx serve .` for anything beyond a quick look. A generic static server on the repo root will happily hand out `data/scenarios.json` and `package.json`. The Express server serves an explicit allowlist and 404s everything else on purpose.

## Why vanilla JS?

This project intentionally has no framework. For a single-page tool that amounts to a fancy calculator, adding React, Vue or Svelte adds more complexity than it removes. There is no bundler, so what you read is what runs.

The cost logic is deliberately split out of `app.js` into `calc.js`, `csv.js`, `normalize.js` and `shareState.js`. Those files are pure and loaded as classic scripts, so the same source runs in the browser and under vitest without a build step. Anything that touches the DOM stays in `app.js`.

## Development

```bash
pnpm lint     # eslint
pnpm test     # vitest
pnpm smoke    # boots the server and exercises the API end to end
```

All three run in CI, and lint and test also run in the pre-commit hook. `pnpm smoke` additionally asserts that every `<script>` and `<link>` in `index.html` is actually served. A missing one 404s into a JSON error body, which the browser refuses to execute, and the app dies at boot with no useful diagnostics.

## Stack

Frontend: HTML, CSS, JavaScript (zero deps).
Backend (optional): Node.js, Express, JSON file storage.
