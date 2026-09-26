const STORAGE_KEY = "infra-cost-visualizer-state";
const BASE_CURRENCY = "USD";
const DEFAULT_SCENARIO_NAME = "Q2 Production";
const DEFAULT_MONTHLY_BUDGET_USD = 8000;
const DEFAULT_GROWTH_RATE = 4;

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

const CSV_REQUIRED_HEADERS = ["service", "category", "model", "qty", "units", "price", "discount"];
const CSV_HEADERS = [...CSV_REQUIRED_HEADERS, "currency"];

const exchangeRates = {
  USD: 1,
  EUR: 0.92,
  GBP: 0.78,
};

const modelMultipliers = {
  "on-demand": 1,
  reserved: 0.72,
  spot: 0.35,
};

const modelColors = {
  "on-demand": "#35566d",
  reserved: "#a55a32",
  spot: "#6f8265",
};

const categorySwatches = [
  ["#35566d", "#54718a"],
  ["#a55a32", "#c17a52"],
  ["#6f8265", "#90a384"],
  ["#7f6475", "#a37d98"],
  ["#907242", "#b6935f"],
];

const els = {
  rowTemplate: document.getElementById("rowTemplate"),
  resourceBody: document.getElementById("resourceBody"),
  addRowBtn: document.getElementById("addRowBtn"),
  resetBtn: document.getElementById("resetBtn"),
  currencySelect: document.getElementById("currencySelect"),
  monthlyTotal: document.getElementById("monthlyTotal"),
  annualTotal: document.getElementById("annualTotal"),
  topCategory: document.getElementById("topCategory"),
  resourceCount: document.getElementById("resourceCount"),
  budgetDelta: document.getElementById("budgetDelta"),
  monthlyBudget: document.getElementById("monthlyBudget"),
  scenarioName: document.getElementById("scenarioName"),
  scenarioTag: document.getElementById("scenarioTag"),
  healthNote: document.getElementById("healthNote"),
  forecastTag: document.getElementById("forecastTag"),
  categoryBars: document.getElementById("categoryBars"),
  modelDonut: document.getElementById("modelDonut"),
  donutLegend: document.getElementById("donutLegend"),
  forecastLine: document.getElementById("forecastLine"),
  growthRate: document.getElementById("growthRate"),
  growthValue: document.getElementById("growthValue"),
  presetSaas: document.getElementById("presetSaas"),
  presetData: document.getElementById("presetData"),
  presetEdge: document.getElementById("presetEdge"),
  exportBtn: document.getElementById("exportBtn"),
  importBtn: document.getElementById("importBtn"),
  importFile: document.getElementById("importFile"),
  dropZone: document.getElementById("dropZone"),
  importStatus: document.getElementById("importStatus"),
  recommendationList: document.getElementById("recommendationList"),
  saveServerBtn: document.getElementById("saveServerBtn"),
  loadServerBtn: document.getElementById("loadServerBtn"),
  shareBtn: document.getElementById("shareBtn"),
  compareBtn: document.getElementById("compareBtn"),
  comparePanel: document.getElementById("comparePanel"),
  compareSummary: document.getElementById("compareSummary"),
  compareBody: document.getElementById("compareBody"),
};

let currentDisplayCurrency = BASE_CURRENCY;
let resizeTimer;

const presets = {
  saas: {
    scenarioName: "SaaS Production",
    monthlyBudget: 12000,
    growthRate: 5,
    rows: [
      { service: "Web App Nodes", category: "Compute", model: "reserved", qty: 8, units: 730, price: 0.11, discount: 0 },
      { service: "Managed PostgreSQL", category: "Database", model: "on-demand", qty: 2, units: 730, price: 0.63, discount: 0 },
      { service: "Object Storage", category: "Storage", model: "reserved", qty: 24, units: 1, price: 20, discount: 8 },
      { service: "CDN + WAF Traffic", category: "Networking", model: "spot", qty: 18, units: 100, price: 0.085, discount: 0 },
      { service: "Logging + APM", category: "Monitoring", model: "on-demand", qty: 1, units: 1, price: 780, discount: 0 },
    ],
  },
  data: {
    scenarioName: "Data Platform",
    monthlyBudget: 22000,
    growthRate: 7,
    rows: [
      { service: "ETL Workers", category: "Compute", model: "spot", qty: 22, units: 730, price: 0.1, discount: 0 },
      { service: "Warehouse Cluster", category: "Database", model: "on-demand", qty: 3, units: 730, price: 1.9, discount: 0 },
      { service: "Raw Data Lake", category: "Storage", model: "reserved", qty: 120, units: 1, price: 17, discount: 12 },
      { service: "Streaming Pipeline", category: "Networking", model: "on-demand", qty: 1, units: 1, price: 2600, discount: 0 },
      { service: "Security Scanning", category: "Security", model: "reserved", qty: 1, units: 1, price: 980, discount: 5 },
    ],
  },
  edge: {
    scenarioName: "Edge API Global",
    monthlyBudget: 9000,
    growthRate: 4,
    rows: [
      { service: "Regional API Nodes", category: "Compute", model: "reserved", qty: 10, units: 730, price: 0.13, discount: 0 },
      { service: "Redis Cache", category: "Database", model: "on-demand", qty: 2, units: 730, price: 0.34, discount: 0 },
      { service: "Edge Transfer", category: "Networking", model: "spot", qty: 42, units: 100, price: 0.07, discount: 0 },
      { service: "Image Storage", category: "Storage", model: "reserved", qty: 30, units: 1, price: 19, discount: 5 },
      { service: "Observability", category: "Monitoring", model: "on-demand", qty: 1, units: 1, price: 540, discount: 0 },
    ],
  },
};

// Single parser for the whole app — calc.js owns it so the clamping and
// rounding rules around it are unit-testable.
function toNumber(value, fallback = 0) {
  return calcToNumber(value, fallback);
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function roundTo(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function formatCurrency(amount, currency) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatInputNumber(value, maxFractionDigits = 2) {
  return calcFormatInputNumber(value, maxFractionDigits);
}

function convertCurrency(amount, fromCurrency, toCurrency) {
  return calcConvertCurrency(amount, fromCurrency, toCurrency, exchangeRates);
}

function toBaseCurrency(amount, fromCurrency = currentDisplayCurrency) {
  return convertCurrency(amount, fromCurrency, BASE_CURRENCY);
}

function fromBaseCurrency(amount, toCurrency = currentDisplayCurrency) {
  return convertCurrency(amount, BASE_CURRENCY, toCurrency);
}

function sanitizeText(value, fallback, maxLength) {
  const cleaned = String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return cleaned || fallback;
}

function normalizeChoice(value, options, fallback) {
  return options.includes(value) ? value : fallback;
}

function normalizeRow(row, { currency = currentDisplayCurrency, amountsInBaseCurrency = false } = {}) {
  const priceValue = Math.max(0, toNumber(row?.price));
  return {
    service: sanitizeText(row?.service, "Untitled service", 120),
    category: normalizeChoice(row?.category, CATEGORY_OPTIONS, "Other"),
    model: normalizeChoice(row?.model, MODEL_OPTIONS, "on-demand"),
    qty: clamp(toNumber(row?.qty), 0, 1_000_000),
    units: clamp(toNumber(row?.units), 0, 1_000_000),
    price: amountsInBaseCurrency ? priceValue : Math.max(0, toBaseCurrency(priceValue, currency)),
    discount: clamp(toNumber(row?.discount), 0, 100),
  };
}

function normalizeRows(rows, options = {}) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => normalizeRow(row, options));
}

function sanitizeScenarioName(name) {
  return sanitizeText(name, DEFAULT_SCENARIO_NAME, 80);
}

function buildScenarioFileName(name) {
  const slug = sanitizeScenarioName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "scenario";
}

function formatDateLabel(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function getDefaultRows() {
  return normalizeRows(
    [
      {
        service: "Compute Node",
        category: "Compute",
        model: "on-demand",
        qty: 6,
        units: 730,
        price: 0.14,
        discount: 0,
      },
      {
        service: "Object Storage",
        category: "Storage",
        model: "reserved",
        qty: 18,
        units: 1,
        price: 23,
        discount: 5,
      },
      {
        service: "Managed Database",
        category: "Database",
        model: "on-demand",
        qty: 2,
        units: 730,
        price: 0.55,
        discount: 0,
      },
      {
        service: "CDN Egress",
        category: "Networking",
        model: "spot",
        qty: 12,
        units: 100,
        price: 0.09,
        discount: 0,
      },
    ],
    { amountsInBaseCurrency: true }
  );
}

function setImportStatus(message, type = "") {
  els.importStatus.textContent = message;
  els.importStatus.classList.remove("error", "success");
  if (type) els.importStatus.classList.add(type);
}

function isServedOverHttp() {
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

async function apiFetch(path, options) {
  if (!isServedOverHttp()) {
    throw new Error("Run the app with `npm run dev` to use save and load.");
  }

  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options?.headers || {}) },
    ...options,
  });

  if (response.status === 204) return null;

  let body;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok) {
    throw new Error(body?.error || `Request failed (${response.status})`);
  }

  return body;
}

function readBudgetFromUi(currency = currentDisplayCurrency) {
  const displayValue = Math.max(0, toNumber(els.monthlyBudget.value));
  return toBaseCurrency(displayValue, currency);
}

function setBudgetInput(budgetUsd, currency = currentDisplayCurrency) {
  const displayAmount = fromBaseCurrency(Math.max(0, toNumber(budgetUsd)), currency);
  els.monthlyBudget.value = formatInputNumber(roundTo(displayAmount, 2), 2);
}

function buildScenarioPayloadFromUi() {
  return {
    name: sanitizeScenarioName(els.scenarioName.value),
    currency: currentDisplayCurrency,
    growthRate: clamp(toNumber(els.growthRate.value, DEFAULT_GROWTH_RATE), -10, 25),
    monthlyBudget: readBudgetFromUi(currentDisplayCurrency),
    rows: getRowsFromUI({ currency: currentDisplayCurrency }),
  };
}

async function saveScenarioToServer() {
  els.saveServerBtn.disabled = true;
  try {
    const payload = buildScenarioPayloadFromUi();
    const response = await apiFetch("/api/scenarios", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setImportStatus(`Saved "${response?.item?.name || payload.name}" to the local server.`, "success");
  } catch (error) {
    setImportStatus(error instanceof Error ? error.message : "Save failed.", "error");
  } finally {
    els.saveServerBtn.disabled = false;
  }
}

async function loadScenarioFromServer() {
  els.loadServerBtn.disabled = true;
  try {
    const list = await apiFetch("/api/scenarios");
    const items = Array.isArray(list?.items) ? list.items : [];

    if (!items.length) {
      setImportStatus("No saved scenarios are available on the local server yet.", "error");
      return;
    }

    const visibleItems = items.slice(0, 20);
    const choices = visibleItems
      .map((item, index) => {
        const updated = formatDateLabel(item.updatedAt || item.createdAt);
        return `${index + 1}. ${item.name}${updated ? ` (${updated})` : ""}`;
      })
      .join("\n");

    const response = window.prompt(
      `Choose a saved scenario:\n\n${choices}\n\nEnter 1-${visibleItems.length}:`
    );

    if (response === null) return;

    const choice = Number(response);
    if (!Number.isFinite(choice) || choice < 1 || choice > visibleItems.length) {
      throw new Error("Enter a valid scenario number.");
    }

    const selected = visibleItems[choice - 1];
    const detail = await apiFetch(`/api/scenarios/${selected.id}`);
    const scenario = detail?.item;

    if (!scenario) {
      throw new Error("That saved scenario could not be loaded.");
    }

    applyScenarioState({
      scenarioName: scenario.name,
      monthlyBudget: scenario.monthlyBudget,
      growthRate: scenario.growthRate,
      currency: scenario.currency,
      rows: scenario.rows,
    });

    setImportStatus(`Loaded "${scenario.name}" from the local server.`, "success");
  } catch (error) {
    setImportStatus(error instanceof Error ? error.message : "Load failed.", "error");
  } finally {
    els.loadServerBtn.disabled = false;
  }
}

function exportRowsAsCsv() {
  const rows = getDisplayRowsFromUI().map((row) => ({ ...row, currency: currentDisplayCurrency }));
  const lines = [CSV_HEADERS.join(",")];

  rows.forEach((row) => {
    lines.push(CSV_HEADERS.map((key) => csvEscape(row[key])).join(","));
  });

  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${buildScenarioFileName(els.scenarioName.value)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function importRowsFromCsv(content) {
  const parsedRows = parseCsvContent(content);
  if (parsedRows.length < 2) {
    throw new Error("CSV is empty or missing row data.");
  }

  const headers = parsedRows[0].map((cell) => String(cell).trim().toLowerCase());
  const headerIndex = (name) => headers.indexOf(name);
  const missingHeaders = CSV_REQUIRED_HEADERS.filter((name) => headerIndex(name) === -1);

  if (missingHeaders.length > 0) {
    throw new Error(`Missing required columns: ${missingHeaders.join(", ")}.`);
  }

  const importedRows = parsedRows
    .slice(1)
    .map((cols) => {
      const rawRow = {
        service: cols[headerIndex("service")] ?? "",
        category: cols[headerIndex("category")] ?? "",
        model: cols[headerIndex("model")] ?? "",
        qty: cols[headerIndex("qty")] ?? "",
        units: cols[headerIndex("units")] ?? "",
        price: cols[headerIndex("price")] ?? "",
        discount: cols[headerIndex("discount")] ?? "",
      };

      const hasContent = Object.values(rawRow).some((value) => String(value).trim() !== "");
      if (!hasContent) return null;

      const fileCurrency = String(cols[headerIndex("currency")] ?? "")
        .trim()
        .toUpperCase();
      const rowCurrency = exchangeRates[fileCurrency] ? fileCurrency : currentDisplayCurrency;

      return normalizeRow(rawRow, { currency: rowCurrency });
    })
    .filter(Boolean);

  if (!importedRows.length) {
    throw new Error("No valid data rows were found.");
  }

  renderRows(importedRows);
  recalculateAndRender();
  setImportStatus(`Imported ${importedRows.length} row(s) from CSV.`, "success");
}

async function handleImportFile(file) {
  if (!file) return;

  const fileName = String(file.name || "").toLowerCase();
  const looksLikeCsv = fileName.endsWith(".csv") || String(file.type || "").includes("csv");

  if (!looksLikeCsv) {
    setImportStatus("Please choose a CSV file.", "error");
    return;
  }

  try {
    const text = await file.text();
    importRowsFromCsv(text);
  } catch (error) {
    setImportStatus(
      error instanceof Error ? error.message : "Import failed. Please check the CSV format.",
      "error"
    );
  }
}

function modelLabel(model) {
  if (model === "on-demand") return "On-Demand";
  if (model === "reserved") return "Reserved";
  if (model === "spot") return "Spot";
  return "Other";
}

function readDisplayRow(tr) {
  const value = (selector) => tr.querySelector(selector).value;
  return {
    service: sanitizeText(value(".service"), "Untitled service", 120),
    category: normalizeChoice(value(".category"), CATEGORY_OPTIONS, "Other"),
    model: normalizeChoice(value(".model"), MODEL_OPTIONS, "on-demand"),
    qty: clamp(toNumber(value(".qty")), 0, 1_000_000),
    units: clamp(toNumber(value(".units")), 0, 1_000_000),
    price: Math.max(0, toNumber(value(".price"))),
    discount: clamp(toNumber(value(".discount")), 0, 100),
  };
}

function readRow(tr, { currency = currentDisplayCurrency } = {}) {
  return normalizeRow(readDisplayRow(tr), { currency });
}

function monthlyCost(row) {
  return calcMonthlyCost(row, modelMultipliers);
}

function formatDisplayPrice(usdPrice) {
  const displayPrice = fromBaseCurrency(usdPrice, currentDisplayCurrency);
  const decimals = displayPrice !== 0 && Math.abs(displayPrice) < 1 ? 4 : 2;
  return formatInputNumber(roundTo(displayPrice, decimals), decimals);
}

function renderRow(row) {
  const normalized = normalizeRow(row, { amountsInBaseCurrency: true });
  const fragment = els.rowTemplate.content.cloneNode(true);
  const tr = fragment.querySelector("tr");

  tr.querySelector(".service").value = normalized.service;
  tr.querySelector(".category").value = normalized.category;
  tr.querySelector(".model").value = normalized.model;
  tr.querySelector(".qty").value = formatInputNumber(normalized.qty, 0);
  tr.querySelector(".units").value = formatInputNumber(normalized.units, 0);
  tr.querySelector(".price").value = formatDisplayPrice(normalized.price);
  tr.querySelector(".discount").value = formatInputNumber(normalized.discount, 0);

  tr.querySelector(".remove").addEventListener("click", () => {
    tr.remove();
    recalculateAndRender();
  });

  tr.querySelectorAll("input, select").forEach((input) => {
    input.addEventListener("input", () => recalculateAndRender());
  });

  els.resourceBody.appendChild(fragment);
}

function renderRows(rows) {
  els.resourceBody.innerHTML = "";
  for (const row of rows) {
    renderRow(row);
  }
}

function addRow(row) {
  renderRow(
    row || {
      service: "New Service",
      category: "Compute",
      model: "on-demand",
      qty: 1,
      units: 730,
      price: 0.1,
      discount: 0,
    }
  );
}

function getDisplayRowsFromUI() {
  return [...els.resourceBody.querySelectorAll("tr")].map((tr) => readDisplayRow(tr));
}

function getRowsFromUI({ currency = currentDisplayCurrency } = {}) {
  return [...els.resourceBody.querySelectorAll("tr")].map((tr) => readRow(tr, { currency }));
}

function saveState(rows, currency, growthRate, monthlyBudget) {
  const payload = {
    rows,
    currency,
    growthRate,
    scenarioName: sanitizeScenarioName(els.scenarioName.value),
    monthlyBudget,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures in private browsing or restricted environments.
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function aggregateByKey(rows, key) {
  const map = new Map();
  rows.forEach((row) => {
    const entry = row[key];
    map.set(entry, (map.get(entry) || 0) + monthlyCost(row));
  });
  return map;
}

function getCanvasSurface(canvas) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width));
  const height = Math.max(1, Math.round(rect.height));
  const pixelWidth = Math.round(width * dpr);
  const pixelHeight = Math.round(height * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  return { ctx, width, height };
}

function drawCategoryBars(categoryMap, currency) {
  els.categoryBars.innerHTML = "";
  const entries = [...categoryMap.entries()].sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    els.categoryBars.textContent = "No category data yet.";
    return;
  }

  const maxValue = entries[0][1] || 1;

  entries.forEach(([category, cost], index) => {
    const row = document.createElement("div");
    row.className = "bar-row";

    const label = document.createElement("span");
    label.textContent = category;

    const track = document.createElement("div");
    track.className = "bar-track";

    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.width = `${(cost / maxValue) * 100}%`;
    const [start, end] = categorySwatches[index % categorySwatches.length];
    fill.style.background = `linear-gradient(90deg, ${start}, ${end})`;

    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = formatCurrency(fromBaseCurrency(cost, currency), currency);

    track.appendChild(fill);
    row.append(label, track, value);
    els.categoryBars.appendChild(row);
  });
}

function drawDonut(modelMap, currency) {
  const { ctx, width, height } = getCanvasSurface(els.modelDonut);
  const entries = [...modelMap.entries()];
  const total = entries.reduce((sum, [, value]) => sum + value, 0);

  els.donutLegend.innerHTML = "";

  if (!total) {
    ctx.fillStyle = "#55656c";
    ctx.font = "16px IBM Plex Sans";
    ctx.fillText("No commitment mix yet", 20, 34);
    return;
  }

  const cx = width / 2;
  const cy = height / 2;
  const radius = 88;
  const innerRadius = 54;
  let start = -Math.PI / 2;

  entries.forEach(([model, value]) => {
    const angle = (value / total) * Math.PI * 2;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, radius, start, start + angle);
    ctx.closePath();
    ctx.fillStyle = modelColors[model] || "#68767c";
    ctx.fill();
    start += angle;

    const item = document.createElement("div");
    item.className = "legend-item";

    const dot = document.createElement("span");
    dot.className = "legend-dot";
    dot.style.background = modelColors[model] || "#68767c";

    const label = document.createElement("span");
    label.textContent = `${modelLabel(model)} · ${Math.round((value / total) * 100)}% · ${formatCurrency(
      fromBaseCurrency(value, currency),
      currency
    )}`;

    item.append(dot, label);
    els.donutLegend.appendChild(item);
  });

  ctx.beginPath();
  ctx.arc(cx, cy, innerRadius, 0, Math.PI * 2);
  ctx.fillStyle = "#fffdf9";
  ctx.fill();

  const totalText = formatCurrency(fromBaseCurrency(total, currency), currency);
  ctx.fillStyle = "#33424a";
  ctx.font = "600 14px IBM Plex Mono";
  ctx.fillText(totalText, cx - ctx.measureText(totalText).width / 2, cy + 4);
}

function drawForecast(monthlyBase, growthRate, currency) {
  const { ctx, width, height } = getCanvasSurface(els.forecastLine);
  const pad = { top: 26, right: 26, bottom: 34, left: 52 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;

  const points = [];
  for (let month = 0; month < 12; month += 1) {
    points.push(monthlyBase * Math.pow(1 + growthRate / 100, month));
  }

  const maxY = Math.max(...points, 1);
  const minY = Math.min(...points, 0);
  const domain = maxY - minY || 1;
  const yFor = (value) => pad.top + chartHeight - ((value - minY) / domain) * chartHeight;

  ctx.strokeStyle = "rgba(95, 108, 114, 0.26)";
  ctx.lineWidth = 1;
  for (let step = 0; step <= 4; step += 1) {
    const y = pad.top + (chartHeight * step) / 4;
    const value = maxY - ((maxY - minY) * step) / 4;

    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();

    ctx.fillStyle = "#647177";
    ctx.font = "11px IBM Plex Mono";
    ctx.fillText(formatCurrency(fromBaseCurrency(value, currency), currency), 8, y + 4);
  }

  ctx.beginPath();
  points.forEach((value, index) => {
    const x = pad.left + (chartWidth * index) / 11;
    const y = yFor(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });

  const areaGradient = ctx.createLinearGradient(0, pad.top, 0, pad.top + chartHeight);
  areaGradient.addColorStop(0, "rgba(53, 86, 109, 0.2)");
  areaGradient.addColorStop(1, "rgba(53, 86, 109, 0.02)");
  ctx.lineTo(pad.left + chartWidth, pad.top + chartHeight);
  ctx.lineTo(pad.left, pad.top + chartHeight);
  ctx.closePath();
  ctx.fillStyle = areaGradient;
  ctx.fill();

  ctx.beginPath();
  points.forEach((value, index) => {
    const x = pad.left + (chartWidth * index) / 11;
    const y = yFor(value);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = "#35566d";
  ctx.lineWidth = 2.5;
  ctx.stroke();

  points.forEach((value, index) => {
    const x = pad.left + (chartWidth * index) / 11;
    const y = yFor(value);

    ctx.beginPath();
    ctx.arc(x, y, 3.1, 0, Math.PI * 2);
    ctx.fillStyle = "#a55a32";
    ctx.fill();

    if (index === 0 || index === 11) {
      const marker = index === 0 ? "Now" : "12 mo";
      const markerValue = formatCurrency(fromBaseCurrency(value, currency), currency);
      ctx.fillStyle = "#4d595f";
      ctx.font = "12px IBM Plex Sans";
      ctx.fillText(marker, x - 14, height - 12);
      ctx.fillStyle = "#3f4b52";
      ctx.font = "11px IBM Plex Mono";
      ctx.fillText(markerValue, x - 28, y - 10);
    }
  });

  return points[points.length - 1] || 0;
}

function renderRecommendations(rows, monthlyUsd, topCategory, deltaUsd, budgetUsd) {
  const tips = [];
  const isOnTarget = Math.abs(deltaUsd) < 0.005;

  if (!rows.length) {
    tips.push("Start with the two or three services you understand best. The biggest line items usually matter more than perfect detail.");
    tips.push("Use a quick starting point if you want a realistic first draft before you customize the stack.");
  } else {
    const topService = [...rows].sort((a, b) => monthlyCost(b) - monthlyCost(a))[0];
    const onDemandSpend = rows
      .filter((row) => row.model === "on-demand")
      .reduce((sum, row) => sum + monthlyCost(row), 0);
    const growthRate = clamp(toNumber(els.growthRate.value, DEFAULT_GROWTH_RATE), -10, 25);

    if (topCategory && monthlyUsd > 0) {
      const share = Math.round((topCategory[1] / monthlyUsd) * 100);
      tips.push(`${topCategory[0]} carries about ${share}% of the monthly run rate. That is the first assumption worth pressure-testing.`);
    }

    if (budgetUsd > 0) {
      if (isOnTarget) {
        tips.push("The plan is landing right on budget. Keep a little breathing room anyway because transfer, support, and logging costs rarely stay perfectly flat.");
      } else if (deltaUsd > 0) {
        tips.push(
          `This version is ${formatCurrency(fromBaseCurrency(deltaUsd), currentDisplayCurrency)} over budget. Pull on the biggest always-on services before trimming the small support tools.`
        );
      } else {
        tips.push(
          `You still have ${formatCurrency(fromBaseCurrency(Math.abs(deltaUsd)), currentDisplayCurrency)} of budget headroom. Keep some of that for data transfer, logging, and forecast misses.`
        );
      }
    } else {
      tips.push("No budget guardrail is set yet. Add one if you want the worksheet to flag drift early.");
    }

    if (topService) {
      tips.push(`${topService.service} is the single largest line item. It is a good candidate for a pricing or architecture review.`);
    }

    if (monthlyUsd > 0 && onDemandSpend / monthlyUsd > 0.45) {
      tips.push("A large share of the spend is still on on-demand pricing. Stable workloads may deserve reserved capacity or rightsizing.");
    }

    if (growthRate >= 10) {
      tips.push("The growth slider is in stress-test territory. Treat the month-12 number as a pressure scenario, not a promise.");
    }
  }

  els.recommendationList.innerHTML = "";
  tips.slice(0, 4).forEach((tip) => {
    const item = document.createElement("li");
    item.textContent = tip;
    els.recommendationList.appendChild(item);
  });
}

function recalculateAndRender() {
  const rows = getRowsFromUI({ currency: currentDisplayCurrency });
  const currency = currentDisplayCurrency;
  const growthRate = clamp(toNumber(els.growthRate.value, DEFAULT_GROWTH_RATE), -10, 25);
  const budgetUsd = readBudgetFromUi(currency);

  els.growthRate.value = String(growthRate);
  els.growthValue.value = `${growthRate}%`;
  els.growthValue.textContent = `${growthRate}%`;
  // Don't write the sanitized name back while typing — it eats trailing
  // spaces and jumps the caret. Sanitization happens on save/export/share.

  const costsByRow = rows.map((row) => monthlyCost(row));
  [...els.resourceBody.querySelectorAll("tr")].forEach((tr, index) => {
    tr.querySelector(".cost-cell").textContent = formatCurrency(fromBaseCurrency(costsByRow[index], currency), currency);
  });

  const monthlyUsd = costsByRow.reduce((sum, value) => sum + value, 0);
  const annualUsd = monthlyUsd * 12;
  const categoryMap = aggregateByKey(rows, "category");
  const modelMap = aggregateByKey(rows, "model");
  const topCategory = [...categoryMap.entries()].sort((a, b) => b[1] - a[1])[0];
  const topShare = topCategory && monthlyUsd > 0 ? Math.round((topCategory[1] / monthlyUsd) * 100) : 0;
  const deltaUsd = monthlyUsd - budgetUsd;
  const isOnTarget = Math.abs(deltaUsd) < 0.005;

  els.monthlyTotal.textContent = formatCurrency(fromBaseCurrency(monthlyUsd, currency), currency);
  els.annualTotal.textContent = formatCurrency(fromBaseCurrency(annualUsd, currency), currency);
  els.topCategory.textContent = topCategory ? topCategory[0] : "-";
  els.resourceCount.textContent = String(rows.length);

  const deltaCard = els.budgetDelta.closest(".metric-card");
  deltaCard.classList.toggle("metric-over", deltaUsd > 0 && !isOnTarget);
  deltaCard.classList.toggle("metric-under", deltaUsd < 0 && !isOnTarget);
  els.budgetDelta.textContent = isOnTarget
    ? "On target"
    : `${deltaUsd > 0 ? "Over " : "Under "}${formatCurrency(
        fromBaseCurrency(Math.abs(deltaUsd), currency),
        currency
      )}`;

  if (!rows.length) {
    els.scenarioTag.textContent = "Draft model • start with a few trusted line items";
  } else if (isOnTarget) {
    els.scenarioTag.textContent = `${rows.length} services • on target • ${topCategory ? `${topCategory[0]} leads spend` : "balanced mix"}`;
  } else if (deltaUsd > 0) {
    els.scenarioTag.textContent = `${rows.length} services • over target • ${topCategory ? `${topCategory[0]} leads spend` : "review assumptions"}`;
  } else {
    els.scenarioTag.textContent = `${rows.length} services • inside budget • ${topCategory ? `${topCategory[0]} leads spend` : "healthy mix"}`;
  }

  els.healthNote.textContent = topCategory
    ? `${topCategory[0]} makes up roughly ${topShare}% of the monthly run rate. Validate that estimate against real utilization and transfer patterns.`
    : "Add a few services to start shaping the monthly run rate.";

  drawCategoryBars(categoryMap, currency);
  drawDonut(modelMap, currency);
  const month12Usd = drawForecast(monthlyUsd, growthRate, currency);
  els.forecastTag.textContent = `If this growth holds, month 12 lands at ${formatCurrency(
    fromBaseCurrency(month12Usd, currency),
    currency
  )}.`;

  renderRecommendations(rows, monthlyUsd, topCategory, deltaUsd, budgetUsd);
  saveState(rows, currency, growthRate, budgetUsd);
}

function applyScenarioState({
  scenarioName = DEFAULT_SCENARIO_NAME,
  monthlyBudget = DEFAULT_MONTHLY_BUDGET_USD,
  growthRate = DEFAULT_GROWTH_RATE,
  currency = BASE_CURRENCY,
  rows = getDefaultRows(),
}) {
  currentDisplayCurrency = exchangeRates[currency] ? currency : BASE_CURRENCY;
  els.currencySelect.value = currentDisplayCurrency;
  els.scenarioName.value = sanitizeScenarioName(scenarioName);
  els.growthRate.value = String(clamp(toNumber(growthRate, DEFAULT_GROWTH_RATE), -10, 25));
  setBudgetInput(monthlyBudget, currentDisplayCurrency);

  const normalizedRows = normalizeRows(rows, { amountsInBaseCurrency: true });
  renderRows(normalizedRows.length ? normalizedRows : getDefaultRows());
  recalculateAndRender();
}

function resetApp() {
  applyScenarioState({
    scenarioName: DEFAULT_SCENARIO_NAME,
    monthlyBudget: DEFAULT_MONTHLY_BUDGET_USD,
    growthRate: DEFAULT_GROWTH_RATE,
    currency: BASE_CURRENCY,
    rows: getDefaultRows(),
  });
  setImportStatus("");
}

function applyPreset(name) {
  const preset = presets[name];
  if (!preset) return;

  applyScenarioState({
    scenarioName: preset.scenarioName,
    monthlyBudget: preset.monthlyBudget,
    growthRate: preset.growthRate,
    currency: BASE_CURRENCY,
    rows: normalizeRows(preset.rows, { amountsInBaseCurrency: true }),
  });
  setImportStatus(`Loaded the ${preset.scenarioName} starting point.`, "success");
}

function handleCurrencyChange() {
  const nextCurrency = exchangeRates[els.currencySelect.value] ? els.currencySelect.value : BASE_CURRENCY;
  if (nextCurrency === currentDisplayCurrency) {
    recalculateAndRender();
    return;
  }

  const rows = getRowsFromUI({ currency: currentDisplayCurrency });
  const budgetUsd = readBudgetFromUi(currentDisplayCurrency);
  currentDisplayCurrency = nextCurrency;

  renderRows(rows);
  setBudgetInput(budgetUsd, currentDisplayCurrency);
  recalculateAndRender();
  setImportStatus(`Display currency switched to ${currentDisplayCurrency}.`, "success");
}

function hydrate() {
  // A shared link (#s=...) wins over localStorage so the recipient sees the
  // shared snapshot; afterwards it is stripped and normal editing resumes.
  const shared = decodeShareState(window.location.hash);
  if (shared) {
    applyScenarioState({
      scenarioName: shared.scenarioName,
      monthlyBudget: shared.monthlyBudget,
      growthRate: shared.growthRate,
      currency: shared.currency,
      rows: shared.rows,
    });
    history.replaceState(null, "", window.location.pathname + window.location.search);
    setImportStatus("Loaded shared worksheet from link.", "success");
    return;
  }

  const state = loadState();
  if (state) {
    applyScenarioState({
      scenarioName: state.scenarioName,
      monthlyBudget: state.monthlyBudget,
      growthRate: state.growthRate,
      currency: state.currency,
      rows: state.rows,
    });
    return;
  }

  resetApp();
}

function currentShareState() {
  return {
    rows: getRowsFromUI({ currency: BASE_CURRENCY }),
    currency: BASE_CURRENCY,
    growthRate: Number.parseFloat(els.growthRate.value) || 0,
    scenarioName: sanitizeScenarioName(els.scenarioName.value),
    monthlyBudget: readBudgetFromUi(BASE_CURRENCY),
  };
}

async function shareCurrentScenario() {
  try {
    const hash = encodeShareState(currentShareState());
    const url = `${window.location.origin}${window.location.pathname}${hash}`;
    await navigator.clipboard.writeText(url);
    setImportStatus("Shareable link copied to clipboard.", "success");
  } catch (error) {
    setImportStatus(
      `Could not copy link (${error instanceof Error ? error.message : "unknown"}).`,
      "error",
    );
  }
}

async function openComparison() {
  if (!isServedOverHttp()) {
    setImportStatus("Comparing saved scenarios needs the backend (npm run dev).", "error");
    return;
  }

  let items;
  try {
    const response = await apiFetch("/api/scenarios");
    items = response?.items ?? [];
  } catch (error) {
    setImportStatus(
      `Could not load scenarios (${error instanceof Error ? error.message : "unknown"}).`,
      "error",
    );
    return;
  }

  els.comparePanel.hidden = false;
  els.compareBody.innerHTML = "";
  els.compareSummary.textContent =
    items.length === 0
      ? "No saved scenarios found — save one with “Save Scenario” first."
      : "Pick a saved scenario to compare against the current sheet.";

  const existingSelect = document.getElementById("compareSelect");
  const existingRun = document.getElementById("compareRunBtn");
  if (existingSelect) existingSelect.remove();
  if (existingRun) existingRun.remove();

  if (items.length === 0) return;

  const select = document.createElement("select");
  select.id = "compareSelect";
  select.setAttribute("aria-label", "Saved scenario to compare against");
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = `${item.name} (updated ${String(item.updatedAt || "").slice(0, 10)})`;
    select.appendChild(option);
  }
  select.style.marginRight = "8px";

  const runButton = document.createElement("button");
  runButton.id = "compareRunBtn";
  runButton.type = "button";
  runButton.className = "btn btn-primary";
  runButton.textContent = "Compare against selected";

  runButton.addEventListener("click", async () => {
    try {
      const detail = await apiFetch(`/api/scenarios/${select.value}`);
      renderComparison(detail?.item ?? null);
    } catch (error) {
      setImportStatus(
        `Could not load scenario (${error instanceof Error ? error.message : "unknown"}).`,
        "error",
      );
    }
  });

  els.compareSummary.after(select, runButton);
}

function renderComparison(savedItem) {
  if (!savedItem || !Array.isArray(savedItem.rows)) {
    setImportStatus("Selected scenario has no rows to compare.", "error");
    return;
  }

  const currentRows = getRowsFromUI({ currency: currentDisplayCurrency });
  // Saved scenarios store prices in base USD; treat them as such so the
  // comparison doesn't re-convert them as if they were display currency.
  const savedRows = normalizeRows(savedItem.rows, {
    amountsInBaseCurrency: true,
  });
  const currentByService = aggregateByKey(currentRows, "service");
  const savedByService = aggregateByKey(savedRows, "service");

  const names = [...new Set([...currentByService.keys(), ...savedByService.keys()])].sort();
  const fmt = (amount) => formatCurrency(fromBaseCurrency(amount), currentDisplayCurrency);

  els.compareBody.innerHTML = "";
  let totalDelta = 0;
  for (const service of names) {
    const currentCost = currentByService.get(service) ?? 0;
    const savedCost = savedByService.get(service) ?? 0;
    const delta = currentCost - savedCost;
    totalDelta += delta;

    // Service names come from the server/imported files — build cells via
    // textContent so they can't inject markup.
    const tr = document.createElement("tr");
    const cells = [
      { text: service },
      { text: fmt(currentCost) },
      { text: fmt(savedCost) },
      {
        text: `${delta >= 0 ? "+" : ""}${fmt(delta)}`,
        color: delta > 0 ? "#e05252" : delta < 0 ? "#1a7f37" : "inherit",
      },
    ];
    for (const cell of cells) {
      const td = document.createElement("td");
      td.textContent = cell.text;
      if (cell.color) td.style.color = cell.color;
      tr.appendChild(td);
    }
    els.compareBody.appendChild(tr);
  }

  els.comparePanel.hidden = false;
  els.compareSummary.textContent = `Current sheet vs “${savedItem.name ?? "saved scenario"}” — total Δ ${totalDelta >= 0 ? "+" : ""}${fmt(totalDelta)} per month.`;
}

els.addRowBtn.addEventListener("click", () => {
  addRow();
  recalculateAndRender();
});

els.resetBtn.addEventListener("click", () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore storage failures.
  }
  resetApp();
});

els.currencySelect.addEventListener("change", handleCurrencyChange);
els.growthRate.addEventListener("input", recalculateAndRender);
els.monthlyBudget.addEventListener("input", recalculateAndRender);
els.scenarioName.addEventListener("input", recalculateAndRender);
els.presetSaas.addEventListener("click", () => applyPreset("saas"));
els.presetData.addEventListener("click", () => applyPreset("data"));
els.presetEdge.addEventListener("click", () => applyPreset("edge"));
els.exportBtn.addEventListener("click", exportRowsAsCsv);
els.importBtn.addEventListener("click", () => els.importFile.click());
els.saveServerBtn.addEventListener("click", saveScenarioToServer);
els.loadServerBtn.addEventListener("click", loadScenarioFromServer);
els.shareBtn.addEventListener("click", shareCurrentScenario);
els.compareBtn.addEventListener("click", openComparison);
els.dropZone.addEventListener("click", () => els.importFile.click());
els.dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    els.importFile.click();
  }
});

els.importFile.addEventListener("change", async (event) => {
  const [file] = event.target.files || [];
  await handleImportFile(file);
  event.target.value = "";
});

["dragenter", "dragover"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("is-dragover");
  });
});

els.dropZone.addEventListener("drop", async (event) => {
  const [file] = event.dataTransfer?.files || [];
  await handleImportFile(file);
});

window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(recalculateAndRender, 120);
});

hydrate();
