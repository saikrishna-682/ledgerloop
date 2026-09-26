import { describe, expect, it } from "vitest";
import { centsToInput, formatCents, formatSignedCents, parseAmountToCents } from "./money";

describe("formatCents", () => {
  it("formats whole dollars with cents", () => {
    expect(formatCents(125000)).toBe("$1,250.00");
  });

  it("formats negative amounts with a leading minus", () => {
    expect(formatCents(-500)).toBe("-$5.00");
  });

  it("drops cents when noCents is set and there are none", () => {
    expect(formatCents(125000, { noCents: true })).toBe("$1,250");
  });

  it("keeps cents when noCents is set but cents are non-zero", () => {
    expect(formatCents(125050, { noCents: true })).toBe("$1,250.50");
  });

  it("rounds fractional cents", () => {
    expect(formatCents(100.6)).toBe("$1.01");
  });
});

describe("formatSignedCents", () => {
  it("prefixes a plus sign for positive amounts", () => {
    expect(formatSignedCents(1250)).toBe("+$12.50");
  });

  it("prefixes a minus sign for negative amounts", () => {
    expect(formatSignedCents(-1250)).toBe("-$12.50");
  });

  it("has no sign for zero", () => {
    expect(formatSignedCents(0)).toBe("$0.00");
  });
});

describe("parseAmountToCents", () => {
  it("parses a plain dollar amount", () => {
    expect(parseAmountToCents("12.34")).toBe(1234);
  });

  it("parses an amount with no cents", () => {
    expect(parseAmountToCents("12")).toBe(1200);
  });

  it("parses an amount with a trailing decimal point", () => {
    expect(parseAmountToCents("12.")).toBe(1200);
  });

  it("pads a single decimal digit", () => {
    expect(parseAmountToCents("12.5")).toBe(1250);
  });

  it("strips a leading dollar sign and thousands separators", () => {
    expect(parseAmountToCents("$1,234.56")).toBe(123456);
  });

  it("rejects empty input", () => {
    expect(parseAmountToCents("")).toBeNull();
  });

  it("rejects a bare decimal point", () => {
    expect(parseAmountToCents(".")).toBeNull();
  });

  it("rejects more than two decimal places", () => {
    expect(parseAmountToCents("12.345")).toBeNull();
  });

  it("rejects non-numeric input", () => {
    expect(parseAmountToCents("abc")).toBeNull();
  });

  it("rejects negative input (amounts are always positive; sign is via type)", () => {
    expect(parseAmountToCents("-5")).toBeNull();
  });
});

describe("centsToInput", () => {
  it("renders whole dollars with no decimal", () => {
    expect(centsToInput(1200)).toBe("12");
  });

  it("renders cents with two digits", () => {
    expect(centsToInput(1205)).toBe("12.05");
  });

  it("takes the absolute value (sign is handled by the caller)", () => {
    expect(centsToInput(-1250)).toBe("12.50");
  });
});

describe("parseAmountToCents / centsToInput round-trip", () => {
  it.each([
    ["1", 100],
    ["0.01", 1],
    ["1250.99", 125099],
    ["999999.99", 99999999],
  ])("parses %s to %d cents and back", (input, cents) => {
    expect(parseAmountToCents(input)).toBe(cents);
    expect(parseAmountToCents(centsToInput(cents))).toBe(cents);
  });
});
