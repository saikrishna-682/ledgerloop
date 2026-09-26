import { describe, expect, it } from "vitest";
import {
  ageBasedStockAllocation,
  debtToIncome,
  emergencyFund,
  fiftyThirtyTwenty,
} from "./moneyGuidelines";

describe("fiftyThirtyTwenty", () => {
  it("splits income into needs/wants/leftover percentages", () => {
    const result = fiftyThirtyTwenty({
      incomeCents: 500000, // $5,000
      essentialCents: 200000, // $2,000
      discretionaryCents: 100000, // $1,000
      debtMinimumsCents: 50000, // $500
    });
    expect(result).not.toBeNull();
    expect(result!.needsCents).toBe(250000);
    expect(result!.needsPct).toBe(50);
    expect(result!.wantsPct).toBe(20);
    expect(result!.leftoverCents).toBe(150000);
    expect(result!.leftoverPct).toBe(30);
    expect(result!.needsOverTarget).toBe(false);
    expect(result!.leftoverUnderTarget).toBe(false);
  });

  it("flags needs over 50% and leftover under 20%", () => {
    const result = fiftyThirtyTwenty({
      incomeCents: 400000,
      essentialCents: 280000, // 70% needs
      discretionaryCents: 100000, // 25% wants
      debtMinimumsCents: 0,
    });
    expect(result!.needsOverTarget).toBe(true);
    expect(result!.leftoverUnderTarget).toBe(true);
    expect(result!.leftoverPct).toBe(5);
  });

  it("returns null with no income (nothing meaningful to compute)", () => {
    expect(fiftyThirtyTwenty({ incomeCents: 0, essentialCents: 0, discretionaryCents: 0, debtMinimumsCents: 0 })).toBeNull();
  });
});

describe("debtToIncome", () => {
  it("computes the ratio and flags unhealthy above 36%", () => {
    const healthy = debtToIncome({ monthlyDebtPaymentsCents: 100000, incomeCents: 500000 });
    expect(healthy).toEqual({ ratioPct: 20, healthy: true });

    const unhealthy = debtToIncome({ monthlyDebtPaymentsCents: 200000, incomeCents: 500000 });
    expect(unhealthy).toEqual({ ratioPct: 40, healthy: false });
  });

  it("treats exactly 36% as unhealthy (strictly under is healthy)", () => {
    expect(debtToIncome({ monthlyDebtPaymentsCents: 36, incomeCents: 100 })!.healthy).toBe(false);
  });

  it("returns null with no income", () => {
    expect(debtToIncome({ monthlyDebtPaymentsCents: 100, incomeCents: 0 })).toBeNull();
  });
});

describe("emergencyFund", () => {
  it("targets 3-6 months of essential expenses", () => {
    const result = emergencyFund({ essentialCents: 200000, currentSavingsCents: 300000 });
    expect(result!.minTargetCents).toBe(600000);
    expect(result!.maxTargetCents).toBe(1200000);
    expect(result!.monthsCovered).toBe(1.5);
    expect(result!.pctToMin).toBe(50);
  });

  it("caps progress at 100% even when fully funded and beyond", () => {
    const result = emergencyFund({ essentialCents: 100000, currentSavingsCents: 5000000 });
    expect(result!.pctToMin).toBe(100);
  });

  it("returns null with no essential spending to base a target on", () => {
    expect(emergencyFund({ essentialCents: 0, currentSavingsCents: 1000 })).toBeNull();
  });
});

describe("ageBasedStockAllocation", () => {
  it("follows the 110-minus-age heuristic", () => {
    expect(ageBasedStockAllocation(30)).toEqual({ stockPct: 80, bondPct: 20 });
    expect(ageBasedStockAllocation(60)).toEqual({ stockPct: 50, bondPct: 50 });
  });

  it("clamps to a sane floor for very young ages", () => {
    const result = ageBasedStockAllocation(18);
    expect(result.stockPct).toBe(90);
  });

  it("clamps to a sane floor for very old ages", () => {
    const result = ageBasedStockAllocation(100);
    expect(result.stockPct).toBe(10);
  });

  it("stock and bond percentages always sum to 100", () => {
    for (const age of [18, 25, 40, 65, 90, 120]) {
      const { stockPct, bondPct } = ageBasedStockAllocation(age);
      expect(stockPct + bondPct).toBe(100);
    }
  });
});
