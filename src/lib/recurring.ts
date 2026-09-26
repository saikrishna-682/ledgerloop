/**
 * Flags expense transactions that look like a recurring subscription:
 * the same merchant charging a consistent amount on a roughly monthly
 * cadence. Pure pattern-matching over the user's own transaction history —
 * no external data, no guessing at merchants we don't have evidence for.
 */

export interface RecurringTxnInput {
  merchant: string;
  amountCents: number;
  date: string; // "YYYY-MM-DD"
  type: "income" | "expense";
}

export interface RecurringCandidate {
  merchant: string;
  occurrences: number;
  averageAmountCents: number;
  lastDate: string;
  estimatedMonthlyCents: number;
  estimatedAnnualCents: number;
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const ta = Date.UTC(ay, am - 1, ad);
  const tb = Date.UTC(by, bm - 1, bd);
  return Math.abs(tb - ta) / (1000 * 60 * 60 * 24);
}

const MAX_AMOUNT_VARIANCE_PCT = 15;
const MONTHLY_GAP_MIN_DAYS = 21;
const MONTHLY_GAP_MAX_DAYS = 40;

export function detectRecurring(
  transactions: RecurringTxnInput[],
  opts?: { minOccurrences?: number },
): RecurringCandidate[] {
  const minOccurrences = opts?.minOccurrences ?? 2;

  const byMerchant = new Map<string, RecurringTxnInput[]>();
  for (const t of transactions) {
    if (t.type !== "expense") continue;
    const key = t.merchant.trim().toLowerCase();
    if (!key) continue;
    const list = byMerchant.get(key) ?? [];
    list.push(t);
    byMerchant.set(key, list);
  }

  const results: RecurringCandidate[] = [];
  for (const txns of byMerchant.values()) {
    if (txns.length < minOccurrences) continue;
    const sorted = [...txns].sort((a, b) => a.date.localeCompare(b.date));

    const amounts = sorted.map((t) => t.amountCents);
    const min = Math.min(...amounts);
    const max = Math.max(...amounts);
    if (min <= 0) continue;
    if (((max - min) / min) * 100 > MAX_AMOUNT_VARIANCE_PCT) continue;

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      gaps.push(daysBetween(sorted[i - 1].date, sorted[i].date));
    }
    const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
    if (avgGap < MONTHLY_GAP_MIN_DAYS || avgGap > MONTHLY_GAP_MAX_DAYS) continue;

    const averageAmountCents = Math.round(amounts.reduce((s, a) => s + a, 0) / amounts.length);
    results.push({
      merchant: sorted[sorted.length - 1].merchant,
      occurrences: sorted.length,
      averageAmountCents,
      lastDate: sorted[sorted.length - 1].date,
      estimatedMonthlyCents: averageAmountCents,
      estimatedAnnualCents: averageAmountCents * 12,
    });
  }

  return results.sort((a, b) => b.estimatedAnnualCents - a.estimatedAnnualCents);
}
