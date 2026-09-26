import { describe, expect, it } from "vitest";
import { computeSpendingInsights } from "./insights";

describe("computeSpendingInsights", () => {
  it("finds the biggest single expense", () => {
    const txns = [
      { merchant: "Rent", amountCents: 150000, type: "expense" as const },
      { merchant: "Coffee", amountCents: 500, type: "expense" as const },
      { merchant: "Salary", amountCents: 300000, type: "income" as const },
    ];
    const { biggestExpense } = computeSpendingInsights(txns, []);
    expect(biggestExpense).toEqual({ merchant: "Rent", amountCents: 150000 });
  });

  it("aggregates the top merchant by total spend, not transaction count", () => {
    const txns = [
      { merchant: "Coffee Shop", amountCents: 500, type: "expense" as const },
      { merchant: "Coffee Shop", amountCents: 500, type: "expense" as const },
      { merchant: "Coffee Shop", amountCents: 500, type: "expense" as const },
      { merchant: "Rent", amountCents: 150000, type: "expense" as const },
    ];
    const { topMerchant } = computeSpendingInsights(txns, []);
    expect(topMerchant).toEqual({ merchant: "Rent", totalCents: 150000, count: 1 });
  });

  it("computes month-over-month percent change from the trend's last two entries", () => {
    const trend = [
      { spentCents: 100000 },
      { spentCents: 100000 },
      { spentCents: 80000 },
      { spentCents: 120000 },
    ];
    const { monthOverMonthPct } = computeSpendingInsights([], trend);
    expect(monthOverMonthPct).toBe(50); // 80000 -> 120000 is +50%
  });

  it("returns null insights when there's nothing to compute from", () => {
    const result = computeSpendingInsights([], []);
    expect(result).toEqual({ biggestExpense: null, topMerchant: null, monthOverMonthPct: null });
  });

  it("doesn't divide by zero when the prior month had no spending", () => {
    const trend = [{ spentCents: 0 }, { spentCents: 5000 }];
    const { monthOverMonthPct } = computeSpendingInsights([], trend);
    expect(monthOverMonthPct).toBeNull();
  });

  it("ignores income when picking the biggest expense and top merchant", () => {
    const txns = [{ merchant: "Salary", amountCents: 500000, type: "income" as const }];
    const result = computeSpendingInsights(txns, []);
    expect(result.biggestExpense).toBeNull();
    expect(result.topMerchant).toBeNull();
  });
});
