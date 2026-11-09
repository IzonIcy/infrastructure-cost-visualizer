# Cloud Spend Planning Desk

Interactive dashboard for estimating cloud infrastructure costs. No signup, no build step — just open the HTML.

## Quick Start

- Open: just open `index.html` in a browser (zero build step)
- Dev server: `pnpm dev` or `node server/index.js`
- Deploy: Vercel (connected to `infrastructure-cost-visualizer.vercel.app`)

## Project Structure

```
├── index.html       # Main dashboard (vanilla JS)
├── app.js           # Application logic
├── server/          # Backend server
├── data/            # Data files
├── eslint.config.js # ESLint config
└── package.json     # Node deps
```

## Key Notes

- Pure client-side HTML/JS — works by just opening the file
- Optional Node backend in `server/`
- Deployed on Vercel
