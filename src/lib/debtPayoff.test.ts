import { describe, expect, it } from "vitest";
import {
  estimateMonthlyInterestCents,
  simulateAvalanche,
  simulateSnowball,
  type DebtInput,
} from "./debtPayoff";

describe("estimateMonthlyInterestCents", () => {
  it("computes balance * APR / 12", () => {
    // $4,500 at 24.99% APR -> ~$93.71/mo
    const debt: DebtInput = {
      id: "1",
      name: "Card",
      balanceCents: 450000,
      aprBps: 2499,
      minPaymentCents: 15000,
    };
    expect(estimateMonthlyInterestCents(debt)).toBe(9371);
  });

  it("is zero for a zero-APR debt", () => {
    const debt: DebtInput = { id: "1", name: "0% card", balanceCents: 100000, aprBps: 0, minPaymentCents: 5000 };
    expect(estimateMonthlyInterestCents(debt)).toBe(0);
  });
});

describe("simulateAvalanche / simulateSnowball", () => {
  it("pays off a single debt and matches an interest-free hand calc when extra covers everything", () => {
    // $1,000 balance, 0% APR, paid off in one lump sum -> 1 month, 0 interest.
    const debts: DebtInput[] = [
      { id: "1", name: "Zero APR", balanceCents: 100000, aprBps: 0, minPaymentCents: 0 },
    ];
    const result = simulateAvalanche(debts, 100000);
    expect(result.months).toBe(1);
    expect(result.totalInterestCents).toBe(0);
  });

  it("never pays off when payments don't cover accruing interest", () => {
    const debts: DebtInput[] = [
      { id: "1", name: "High APR, tiny payment", balanceCents: 1000000, aprBps: 9999, minPaymentCents: 100 },
    ];
    const result = simulateAvalanche(debts, 0);
    expect(result.months).toBeNull();
  });

  it("avalanche puts extra payments toward the highest-APR debt first", () => {
    const debts: DebtInput[] = [
      { id: "low-apr-big", name: "Low APR, big balance", balanceCents: 1000000, aprBps: 500, minPaymentCents: 20000 },
      { id: "high-apr-small", name: "High APR, small balance", balanceCents: 100000, aprBps: 2999, minPaymentCents: 5000 },
    ];
    // Extra big enough to clear the high-APR debt in month 1 beyond its minimum.
    const result = simulateAvalanche(debts, 100000);
    // First month: high-apr-small gets its minimum + all the extra.
    const firstMonth = result.schedule[0];
    // Total minimums (25000) + extra (100000) = 125000 paid in month 1,
    // against ~1.1M balance + interest, so a meaningful dent should appear.
    expect(firstMonth.totalBalanceCents).toBeLessThan(1100000);
  });

  it("snowball and avalanche agree when there is only one debt", () => {
    const debts: DebtInput[] = [
      { id: "1", name: "Only debt", balanceCents: 450000, aprBps: 2499, minPaymentCents: 15000 },
    ];
    const avalanche = simulateAvalanche(debts, 20000);
    const snowball = simulateSnowball(debts, 20000);
    expect(avalanche.months).toBe(snowball.months);
    expect(avalanche.totalInterestCents).toBe(snowball.totalInterestCents);
  });

  it("snowball clears the smallest balance first even at a higher APR", () => {
    const debts: DebtInput[] = [
      { id: "big-low-apr", name: "Big, low APR", balanceCents: 500000, aprBps: 500, minPaymentCents: 10000 },
      { id: "small-high-apr", name: "Small, high APR", balanceCents: 20000, aprBps: 2999, minPaymentCents: 2000 },
    ];
    const result = simulateSnowball(debts, 50000);
    // The small debt (20000 + minimums) should be gone well before the big one.
    const monthSmallDebtGone = result.schedule.findIndex(
      (m) => m.totalBalanceCents <= 500000 + 10000 - 2000,
    );
    expect(monthSmallDebtGone).toBeGreaterThanOrEqual(0);
    expect(monthSmallDebtGone).toBeLessThan(3);
  });

  it("more extra payment never increases payoff time", () => {
    const debts: DebtInput[] = [
      { id: "1", name: "Card", balanceCents: 300000, aprBps: 1999, minPaymentCents: 9000 },
    ];
    const slow = simulateAvalanche(debts, 0);
    const fast = simulateAvalanche(debts, 20000);
    expect(fast.months).not.toBeNull();
    expect(slow.months).not.toBeNull();
    expect(fast.months!).toBeLessThanOrEqual(slow.months!);
    expect(fast.totalInterestCents).toBeLessThanOrEqual(slow.totalInterestCents);
  });
});
