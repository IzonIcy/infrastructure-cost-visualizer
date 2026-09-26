import express from "express";
import helmet from "helmet";
import path from "node:path";
import { createScenariosRouter } from "./scenarios/router.js";

// Explicit allowlist rather than express.static(repoRoot): a static mount on
// the repo root would happily serve data/scenarios.json and package.json.
// Keeping the list here means a file can never be exposed by accident — it has
// to be added on purpose, and smoke.js asserts every <script>/<link> in
// index.html resolves, so forgetting one fails the smoke test.
const PUBLIC_FILES = new Set([
  "index.html",
  "styles.css",
  "app.js",
  "calc.js",
  "csv.js",
  "shareState.js",
]);

export function createApp({ repoRoot }) {
  const app = express();
  const sendFrontendFile = (res, fileName) => {
    res.sendFile(path.join(repoRoot, fileName));
  };

  app.disable("x-powered-by");
  // Trust proxy headers only when actually deployed behind one. Enabled
  // unconditionally, any client could spoof X-Forwarded-For on a direct
  // connection — harmless today, wrong the moment client IPs matter.
  if (process.env.TRUST_PROXY === "1") {
    app.set("trust proxy", true);
  }

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: "same-site" },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://cdn.vercel-insights.com"],
          styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
        },
      },
    })
  );

  app.use(express.json({ limit: "256kb" }));

  app.get("/api/health", (_req, res) => {
    res.status(200).json({ ok: true });
  });

  app.use("/api/scenarios", createScenariosRouter({ repoRoot }));

  app.get("/", (_req, res) => {
    sendFrontendFile(res, "index.html");
  });

  app.get("/:file", (req, res, next) => {
    if (!PUBLIC_FILES.has(req.params.file)) return next();
    sendFrontendFile(res, req.params.file);
  });

  app.use((req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  app.use((err, _req, res, _next) => {
    const status = Number(err?.status) || 500;
    const safeMessage =
      status >= 500 ? "Internal server error" : String(err?.message || "Request failed");
    res.status(status).json({ error: safeMessage });
  });

  return app;
}
