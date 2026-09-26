export interface SpendingInsights {
  biggestExpense: { merchant: string; amountCents: number } | null;
  topMerchant: { merchant: string; totalCents: number; count: number } | null;
  /** % change in spend vs. the prior month; null if there's no prior-month data to compare. */
  monthOverMonthPct: number | null;
}

/** Pure, client-side insights computed from data the Home page already
 * fetches (recent transactions + the monthly trend) — no extra backend
 * round trip needed. `currentMonthTxns` should already be filtered to the
 * month being viewed; `trend` must be oldest-first (as getTrend returns it). */
export function computeSpendingInsights(
  currentMonthTxns: Array<{ merchant: string; amountCents: number; type: "income" | "expense" }>,
  trend: Array<{ spentCents: number }>,
): SpendingInsights {
  const expenses = currentMonthTxns.filter((t) => t.type === "expense");

  const biggestExpense = expenses.reduce<{ merchant: string; amountCents: number } | null>(
    (max, t) => (!max || t.amountCents > max.amountCents ? { merchant: t.merchant, amountCents: t.amountCents } : max),
    null,
  );

  const byMerchant = new Map<string, { totalCents: number; count: number }>();
  for (const t of expenses) {
    const entry = byMerchant.get(t.merchant) ?? { totalCents: 0, count: 0 };
    entry.totalCents += t.amountCents;
    entry.count += 1;
    byMerchant.set(t.merchant, entry);
  }
  let topMerchant: SpendingInsights["topMerchant"] = null;
  for (const [merchant, entry] of byMerchant) {
    if (!topMerchant || entry.totalCents > topMerchant.totalCents) {
      topMerchant = { merchant, ...entry };
    }
  }

  let monthOverMonthPct: number | null = null;
  if (trend.length >= 2) {
    const prev = trend[trend.length - 2].spentCents;
    const current = trend[trend.length - 1].spentCents;
    if (prev > 0) monthOverMonthPct = Math.round(((current - prev) / prev) * 100);
  }

  return { biggestExpense, topMerchant, monthOverMonthPct };
}
