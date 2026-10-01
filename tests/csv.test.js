import { describe, expect, it } from "vitest";
import { csvEscape, parseCsvContent } from "../csv.js";

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
