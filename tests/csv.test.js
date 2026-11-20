import { describe, expect, it } from "vitest";
import {
  csvEncodeInferenceSection,
  csvEscape,
  csvIsInferenceRow,
  csvParseInferenceSection,
  parseCsvContent,
} from "../csv.js";

describe("csvEscape", () => {
  it("passes plain values through", () => {
    expect(csvEscape("compute")).toBe("compute");
    expect(csvEscape(42)).toBe("42");
    expect(csvEscape(null)).toBe("");
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
    expect(csvEscape("line\nbreak")).toBe('"line\nbreak"');
  });

  it("neutralizes spreadsheet formula injection", () => {
    // Import a CSV whose service name is a formula, export it again, and the
    // recipient's spreadsheet evaluates it. =cmd|... variants are the
    // documented escalation path, so the leading character is defused.
    for (const payload of ["=1+1", "+1+1", "-1+1", "@SUM(A1)", "=cmd|'/c calc'!A0"]) {
      expect(csvEscape(payload)).toBe(`'${payload}`);
    }
  });

  it("only prefixes a leading sigil, not inner or negative numbers", () => {
    expect(csvEscape("a=b")).toBe("a=b");
    expect(csvEscape("cost=high")).toBe("cost=high");
    // A bare negative number is data, not a formula.
    expect(csvEscape(-42)).toBe("-42");
    expect(csvEscape("-")).toBe("'-");
  });

  it("still quotes an escaped formula that also contains a comma", () => {
    expect(csvEscape("=1,2")).toBe(`"'=1,2"`);
  });
});

describe("parseCsvContent", () => {
  it("parses simple rows and skips blank lines", () => {
    const rows = parseCsvContent("a,b,c\n1,2,3\n\n");
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });

  it("handles CRLF line endings", () => {
    expect(parseCsvContent("x,y\r\n1,2\r\n")).toEqual([
      ["x", "y"],
      ["1", "2"],
    ]);
  });

  it("supports quoted fields with commas, escaped quotes, and newlines", () => {
    const rows = parseCsvContent('name,notes\n"Widget, large","said ""ok"""\n"multi\nline",z');
    expect(rows).toEqual([
      ["name", "notes"],
      ["Widget, large", 'said "ok"'],
      ["multi\nline", "z"],
    ]);
  });

  it("throws on unterminated quotes instead of silently truncating", () => {
    expect(() => parseCsvContent('a,"unterminated')).toThrow(/unterminated/i);
  });

  it("treats a lone trailing field without newline as a row", () => {
    expect(parseCsvContent("solo")).toEqual([["solo"]]);
  });

  it("returns no rows for empty input", () => {
    expect(parseCsvContent("")).toEqual([]);
  });
});

describe("inference CSV block", () => {
  const inference = {
    currency: "USD",
    gpuHourlyRate: 4,
    gpuCount: 2,
    gpuHoursPerMonth: 730,
    inputTokensPerMonth: 40_000_000,
    outputTokensPerMonth: 8_000_000,
    hostedInputPricePerMillion: 2.5,
    hostedOutputPricePerMillion: 10,
  };

  it("round-trips through the parser", () => {
    const parsed = parseCsvContent(csvEncodeInferenceSection(inference).join("\n"));
    expect(csvParseInferenceSection(parsed)).toEqual(
      Object.fromEntries(
        Object.entries(inference).map(([key, value]) => [key, String(value)]),
      ),
    );
  });

  it("marks its own rows so they are not imported as services", () => {
    expect(csvIsInferenceRow(["#inference", "USD"])).toBe(true);
    expect(csvIsInferenceRow(["#Inference", "USD"])).toBe(true);
    expect(csvIsInferenceRow(["Compute Node", "Compute"])).toBe(false);
    expect(csvIsInferenceRow([])).toBe(false);
  });

  it("reports no block for a ledger-only file", () => {
    const ledger = parseCsvContent("service,category,model,qty,units,price,discount,currency");
    expect(csvParseInferenceSection(ledger.slice(1))).toBeNull();
  });

  it("keeps an unknown value empty instead of writing a zero", () => {
    const rows = csvEncodeInferenceSection({ ...inference, hostedOutputPricePerMillion: null });
    expect(rows[1].endsWith(",")).toBe(true);
    expect(csvParseInferenceSection(parseCsvContent(rows.join("\n"))).hostedOutputPricePerMillion).toBe("");
  });
});
