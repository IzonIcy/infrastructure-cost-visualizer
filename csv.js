// CSV helpers shared by the browser app (app.js) and the test suite.
// Loaded as a classic script before app.js; also CommonJS-exported so
// vitest can require it without a DOM.

function csvEscape(value) {
  const raw = String(value ?? "");
  // Excel and Sheets evaluate a leading =, +, - or @ as a formula, so a value
  // imported from someone else's CSV would execute on re-export. Prefixing an
  // apostrophe is the spreadsheet convention for "this is text". A bare
  // number is data rather than a formula, so -42 must stay -42.
  const looksNumeric = raw.trim() !== "" && Number.isFinite(Number(raw));
  const safe = !looksNumeric && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

function parseCsvContent(content) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];
    const next = content[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        field += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ",") {
      row.push(field);
      field = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(field);
      if (row.some((cell) => String(cell).trim() !== "")) {
        rows.push(row);
      }
      row = [];
      field = "";
      continue;
    }

    field += char;
  }

  if (inQuotes) {
    throw new Error("CSV contains an unterminated quoted field.");
  }

  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((cell) => String(cell).trim() !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

// The inference block is not a ledger row, so it rides in the same CSV as a
// marked two-line block after the rows. A "#inference" lead cell survives a
// spreadsheet round trip, and the row importer skips those lines instead of
// reading them as a service called "#inference".
const CSV_INFERENCE_MARKER = "#inference";

const CSV_INFERENCE_FIELDS = [
  "currency",
  "gpuHourlyRate",
  "gpuCount",
  "gpuHoursPerMonth",
  "inputTokensPerMonth",
  "outputTokensPerMonth",
  "hostedInputPricePerMillion",
  "hostedOutputPricePerMillion",
];

function csvIsInferenceRow(row) {
  return String(row?.[0] ?? "").trim().toLowerCase() === CSV_INFERENCE_MARKER;
}

function csvEncodeInferenceSection(inference = {}) {
  return [
    [CSV_INFERENCE_MARKER, ...CSV_INFERENCE_FIELDS].join(","),
    [
      CSV_INFERENCE_MARKER,
      ...CSV_INFERENCE_FIELDS.map((field) => csvEscape(inference[field])),
    ].join(","),
  ];
}

/**
 * Raw cells of the inference block, or null when the file has none. Values
 * stay as strings: the caller knows which ones are money and which are counts.
 */
function csvParseInferenceSection(rows) {
  const block = (Array.isArray(rows) ? rows : []).filter(csvIsInferenceRow);
  if (block.length < 2) return null;
  const headers = block[0].map((cell) => String(cell).trim().toLowerCase());
  const values = block[1];
  return Object.fromEntries(
    CSV_INFERENCE_FIELDS.map((field) => [
      field,
      String(values[headers.indexOf(field.toLowerCase())] ?? "").trim(),
    ]),
  );
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    csvEscape,
    parseCsvContent,
    CSV_INFERENCE_MARKER,
    csvIsInferenceRow,
    csvEncodeInferenceSection,
    csvParseInferenceSection,
  };
}
