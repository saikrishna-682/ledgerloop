import { describe, expect, it } from "vitest";
import { parseCsv } from "./csvParse";

describe("parseCsv", () => {
  it("parses comma-delimited rows", () => {
    expect(parseCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("auto-detects a semicolon delimiter (common for European bank exports)", () => {
    expect(parseCsv("Date;Description;Amount\n01/01/2026;Store;10,00")).toEqual([
      ["Date", "Description", "Amount"],
      ["01/01/2026", "Store", "10,00"],
    ]);
  });

  it("auto-detects a tab delimiter", () => {
    expect(parseCsv("a\tb\n1\t2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("strips a leading UTF-8 BOM so it doesn't get glued onto the first header", () => {
    const withBom = "﻿Date,Amount\n01/01/2026,10.00";
    expect(parseCsv(withBom)[0][0]).toBe("Date");
  });

  it("handles quoted fields containing the detected delimiter", () => {
    expect(parseCsv('a;b\n"one; two";3')).toEqual([["a", "b"], ["one; two", "3"]]);
  });

  it("an explicit delimiter overrides auto-detection", () => {
    expect(parseCsv("a,b;c", ";")).toEqual([["a,b", "c"]]);
  });
});
