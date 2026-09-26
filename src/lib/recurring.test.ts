import { describe, expect, it } from "vitest";
import { detectRecurring, type RecurringTxnInput } from "./recurring";

function txn(merchant: string, amountCents: number, date: string, type: "income" | "expense" = "expense"): RecurringTxnInput {
  return { merchant, amountCents, date, type };
}

describe("detectRecurring", () => {
  it("flags a merchant charging the same amount roughly monthly", () => {
    const transactions = [
      txn("Netflix", 1599, "2026-06-05"),
      txn("Netflix", 1599, "2026-07-05"),
      txn("Netflix", 1599, "2026-08-05"),
      txn("Netflix", 1599, "2026-09-05"),
    ];
    const result = detectRecurring(transactions);
    expect(result).toHaveLength(1);
    expect(result[0].merchant).toBe("Netflix");
    expect(result[0].occurrences).toBe(4);
    expect(result[0].estimatedMonthlyCents).toBe(1599);
    expect(result[0].estimatedAnnualCents).toBe(1599 * 12);
  });

  it("tolerates small price changes (e.g. a subscription price increase)", () => {
    const transactions = [
      txn("Spotify", 999, "2026-06-10"),
      txn("Spotify", 1099, "2026-07-10"),
      txn("Spotify", 1099, "2026-08-10"),
    ];
    expect(detectRecurring(transactions)).toHaveLength(1);
  });

  it("does not flag wildly varying amounts", () => {
    const transactions = [
      txn("Amazon", 500, "2026-06-10"),
      txn("Amazon", 8000, "2026-07-10"),
      txn("Amazon", 1200, "2026-08-10"),
    ];
    expect(detectRecurring(transactions)).toHaveLength(0);
  });

  it("does not flag a merchant charged only once", () => {
    expect(detectRecurring([txn("One-off Store", 1000, "2026-09-01")])).toHaveLength(0);
  });

  it("does not flag weekly grocery runs (gap too short for 'monthly')", () => {
    const transactions = [
      txn("Whole Foods", 6000, "2026-09-01"),
      txn("Whole Foods", 6100, "2026-09-08"),
      txn("Whole Foods", 5900, "2026-09-15"),
      txn("Whole Foods", 6000, "2026-09-22"),
    ];
    expect(detectRecurring(transactions)).toHaveLength(0);
  });

  it("does not flag a one-time large purchase split across irregular dates", () => {
    const transactions = [
      txn("Furniture Co", 50000, "2026-01-15"),
      txn("Furniture Co", 50000, "2026-09-02"),
    ];
    expect(detectRecurring(transactions)).toHaveLength(0);
  });

  it("ignores income transactions entirely", () => {
    const transactions = [
      txn("Employer", 500000, "2026-07-01", "income"),
      txn("Employer", 500000, "2026-08-01", "income"),
      txn("Employer", 500000, "2026-09-01", "income"),
    ];
    expect(detectRecurring(transactions)).toHaveLength(0);
  });

  it("sorts multiple candidates by estimated annual cost, highest first", () => {
    const transactions = [
      txn("Netflix", 1599, "2026-07-05"),
      txn("Netflix", 1599, "2026-08-05"),
      txn("Netflix", 1599, "2026-09-05"),
      txn("Gym", 4999, "2026-07-01"),
      txn("Gym", 4999, "2026-08-01"),
      txn("Gym", 4999, "2026-09-01"),
    ];
    const result = detectRecurring(transactions);
    expect(result.map((r) => r.merchant)).toEqual(["Gym", "Netflix"]);
  });

  it("is case-insensitive when grouping by merchant", () => {
    const transactions = [
      txn("netflix", 1599, "2026-07-05"),
      txn("Netflix", 1599, "2026-08-05"),
      txn("NETFLIX", 1599, "2026-09-05"),
    ];
    expect(detectRecurring(transactions)).toHaveLength(1);
  });
});
