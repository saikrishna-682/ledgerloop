/**
 * Widely-used personal-finance rules of thumb, computed against the user's
 * own numbers. These are general heuristics from mainstream financial
 * planning practice — cited per function — not personalized financial
 * advice, and not a "proven" formula: no such formula exists, since the
 * right numbers depend on goals, risk tolerance, and circumstances no app
 * can know. Every UI surface using these must say so.
 */

// Elizabeth Warren & Amelia Warren Tyagi, "All Your Worth: The Ultimate
// Lifetime Money Plan" (2005): 50% needs, 30% wants, 20% savings/debt payoff.
export interface FiftyThirtyTwentyResult {
  incomeCents: number;
  needsCents: number;
  needsPct: number;
  wantsCents: number;
  wantsPct: number;
  leftoverCents: number;
  leftoverPct: number;
  needsOverTarget: boolean;
  leftoverUnderTarget: boolean;
}

export function fiftyThirtyTwenty(opts: {
  incomeCents: number;
  essentialCents: number;
  discretionaryCents: number;
  debtMinimumsCents: number;
}): FiftyThirtyTwentyResult | null {
  if (opts.incomeCents <= 0) return null;
  const needsCents = opts.essentialCents + opts.debtMinimumsCents;
  const wantsCents = opts.discretionaryCents;
  const leftoverCents = opts.incomeCents - needsCents - wantsCents;
  const pct = (c: number) => Math.round((c / opts.incomeCents) * 100);
  return {
    incomeCents: opts.incomeCents,
    needsCents,
    needsPct: pct(needsCents),
    wantsCents,
    wantsPct: pct(wantsCents),
    leftoverCents,
    leftoverPct: pct(leftoverCents),
    needsOverTarget: pct(needsCents) > 50,
    leftoverUnderTarget: pct(leftoverCents) < 20,
  };
}

// Standard consumer-lending guidance (the threshold U.S. mortgage
// underwriting commonly treats as "healthy," per CFPB qualified-mortgage
// rules): total monthly debt payments should stay under ~36% of income.
export interface DebtToIncomeResult {
  ratioPct: number;
  healthy: boolean;
}

export function debtToIncome(opts: {
  monthlyDebtPaymentsCents: number;
  incomeCents: number;
}): DebtToIncomeResult | null {
  if (opts.incomeCents <= 0) return null;
  const ratioPct = Math.round((opts.monthlyDebtPaymentsCents / opts.incomeCents) * 100);
  return { ratioPct, healthy: ratioPct < 36 };
}

// Near-universal financial-planning guidance (CFP Board, Dave Ramsey,
// Fidelity, etc., all converge here even if the exact number varies):
// keep 3-6 months of essential expenses accessible as an emergency fund.
export interface EmergencyFundResult {
  minTargetCents: number;
  maxTargetCents: number;
  currentCents: number;
  monthsCovered: number;
  pctToMin: number;
}

export function emergencyFund(opts: {
  essentialCents: number;
  currentSavingsCents: number;
}): EmergencyFundResult | null {
  if (opts.essentialCents <= 0) return null;
  const minTargetCents = opts.essentialCents * 3;
  const maxTargetCents = opts.essentialCents * 6;
  const monthsCovered = opts.currentSavingsCents / opts.essentialCents;
  return {
    minTargetCents,
    maxTargetCents,
    currentCents: opts.currentSavingsCents,
    monthsCovered: Math.round(monthsCovered * 10) / 10,
    pctToMin: Math.max(0, Math.min(100, Math.round((opts.currentSavingsCents / minTargetCents) * 100))),
  };
}

// A common glide-path heuristic in mainstream retirement-planning guidance
// (popularized in index-investing communities, e.g. the Bogleheads wiki):
// roughly (110 - age)% in stocks, the rest in bonds/cash — trading some
// upside for stability as retirement gets closer. Many variants exist
// (100-age is the more conservative classic version); this is not a
// personalized recommendation.
export interface StockAllocationResult {
  stockPct: number;
  bondPct: number;
}

export function ageBasedStockAllocation(age: number): StockAllocationResult {
  const clampedAge = Math.max(18, Math.min(100, age));
  const stockPct = Math.max(10, Math.min(90, 110 - clampedAge));
  return { stockPct, bondPct: 100 - stockPct };
}
