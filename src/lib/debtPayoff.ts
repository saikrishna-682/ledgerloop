/**
 * Avalanche/snowball debt payoff simulation. Pure and client-side — no
 * network round trip needed as the user drags the "extra payment" slider.
 * All money is integer cents; APR is basis points (24.99% -> 2499).
 */

export interface DebtInput {
  id: string;
  name: string;
  balanceCents: number;
  aprBps: number;
  minPaymentCents: number;
}

export interface PayoffMonth {
  monthIndex: number; // 0-based
  totalBalanceCents: number;
  totalInterestCents: number;
}

export interface PayoffResult {
  months: number | null; // null if it never pays off (payments too low)
  totalInterestCents: number;
  schedule: PayoffMonth[];
}

const MAX_MONTHS = 600; // 50 years — a safety cap, not a realistic outcome

/**
 * Simulates minimum payments on every debt plus `extraCents` applied each
 * month to whichever debt `order` picks first among the still-open ones.
 */
function simulate(
  debts: DebtInput[],
  extraCents: number,
  order: (a: DebtInput, b: DebtInput) => number,
): PayoffResult {
  let balances = new Map(debts.map((d) => [d.id, d.balanceCents]));
  const monthlyRate = new Map(debts.map((d) => [d.id, d.aprBps / 10000 / 12]));
  const minPayment = new Map(debts.map((d) => [d.id, d.minPaymentCents]));

  const schedule: PayoffMonth[] = [];
  let totalInterestCents = 0;
  let month = 0;

  while ([...balances.values()].some((b) => b > 0) && month < MAX_MONTHS) {
    // Interest accrues first.
    for (const [id, bal] of balances) {
      if (bal <= 0) continue;
      const interest = Math.round(bal * (monthlyRate.get(id) ?? 0));
      balances.set(id, bal + interest);
      totalInterestCents += interest;
    }

    // Minimum payments on every open debt.
    for (const [id, bal] of balances) {
      if (bal <= 0) continue;
      const pay = Math.min(bal, minPayment.get(id) ?? 0);
      balances.set(id, bal - pay);
    }

    // Extra payment goes to the debt `order` ranks first among open ones.
    let remainingExtra = extraCents;
    const openOrdered = debts
      .filter((d) => (balances.get(d.id) ?? 0) > 0)
      .sort(order);
    for (const d of openOrdered) {
      if (remainingExtra <= 0) break;
      const bal = balances.get(d.id) ?? 0;
      const pay = Math.min(bal, remainingExtra);
      balances.set(d.id, bal - pay);
      remainingExtra -= pay;
    }

    month += 1;
    const totalBalanceCents = [...balances.values()].reduce((s, b) => s + b, 0);
    schedule.push({ monthIndex: month, totalBalanceCents, totalInterestCents });

    // No debt shrank this month (payments too low to cover interest) — bail
    // out rather than looping to MAX_MONTHS pointlessly.
    if (month > 1) {
      const prev = schedule[schedule.length - 2].totalBalanceCents;
      if (totalBalanceCents >= prev) {
        return { months: null, totalInterestCents, schedule };
      }
    }
  }

  const paidOff = [...balances.values()].every((b) => b <= 0);
  return { months: paidOff ? month : null, totalInterestCents, schedule };
}

export function simulateAvalanche(debts: DebtInput[], extraCents: number): PayoffResult {
  // Highest APR first.
  return simulate(debts, extraCents, (a, b) => b.aprBps - a.aprBps);
}

export function simulateSnowball(debts: DebtInput[], extraCents: number): PayoffResult {
  // Smallest balance first.
  return simulate(debts, extraCents, (a, b) => a.balanceCents - b.balanceCents);
}

/** Rough single-month interest estimate for display: balance * APR / 12. */
export function estimateMonthlyInterestCents(debt: DebtInput): number {
  return Math.round(debt.balanceCents * (debt.aprBps / 10000 / 12));
}
