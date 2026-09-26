import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("joins headers and rows with commas and CRLF", () => {
    const csv = toCsv(["a", "b"], [[1, "x"], [2, "y"]]);
    expect(csv).toBe("a,b\r\n1,x\r\n2,y");
  });

  it("quotes fields containing a comma", () => {
    const csv = toCsv(["merchant"], [["Whole Foods, Inc."]]);
    expect(csv).toBe('merchant\r\n"Whole Foods, Inc."');
  });

  it("doubles embedded quotes", () => {
    const csv = toCsv(["note"], [['She said "hi"']]);
    expect(csv).toBe('note\r\n"She said ""hi"""');
  });

  it("quotes fields containing a newline", () => {
    const csv = toCsv(["note"], [["line1\nline2"]]);
    expect(csv).toBe('note\r\n"line1\nline2"');
  });

  it("leaves plain fields unquoted", () => {
    const csv = toCsv(["merchant", "amount"], [["Amazon", 1999]]);
    expect(csv).toBe("merchant,amount\r\nAmazon,1999");
  });
});
