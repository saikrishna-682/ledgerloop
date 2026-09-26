import { describe, expect, it } from "vitest";
import {
  daysInMonth,
  formatMonthKey,
  formatMonthKeyShort,
  friendlyDate,
  shiftMonthKey,
} from "./months";

describe("shiftMonthKey", () => {
  it("moves forward within a year", () => {
    expect(shiftMonthKey("2026-03", 1)).toBe("2026-04");
  });

  it("moves backward within a year", () => {
    expect(shiftMonthKey("2026-03", -1)).toBe("2026-02");
  });

  it("rolls over into the next year", () => {
    expect(shiftMonthKey("2026-12", 1)).toBe("2027-01");
  });

  it("rolls back into the previous year", () => {
    expect(shiftMonthKey("2026-01", -1)).toBe("2025-12");
  });

  it("handles multi-month jumps", () => {
    expect(shiftMonthKey("2026-01", 13)).toBe("2027-02");
  });

  it("is a no-op for delta 0", () => {
    expect(shiftMonthKey("2026-06", 0)).toBe("2026-06");
  });
});

describe("daysInMonth", () => {
  it("knows 30-day months", () => {
    expect(daysInMonth("2026-04")).toBe(30);
  });

  it("knows 31-day months", () => {
    expect(daysInMonth("2026-01")).toBe(31);
  });

  it("knows February in a non-leap year", () => {
    expect(daysInMonth("2026-02")).toBe(28);
  });

  it("knows February in a leap year", () => {
    expect(daysInMonth("2024-02")).toBe(29);
  });
});

describe("formatMonthKey / formatMonthKeyShort", () => {
  it("formats the full month and year", () => {
    expect(formatMonthKey("2026-09")).toBe("September 2026");
  });

  it("formats the short month", () => {
    expect(formatMonthKeyShort("2026-09")).toBe("Sep");
  });
});

describe("friendlyDate", () => {
  const today = "2026-09-25";

  it("labels today", () => {
    expect(friendlyDate("2026-09-25", today)).toBe("Today");
  });

  it("labels yesterday", () => {
    expect(friendlyDate("2026-09-24", today)).toBe("Yesterday");
  });

  it("falls back to a weekday + date for anything older", () => {
    expect(friendlyDate("2026-09-01", today)).toMatch(/Sep 1/);
  });

  it("handles yesterday across a month boundary", () => {
    expect(friendlyDate("2026-08-31", "2026-09-01")).toBe("Yesterday");
  });
});
