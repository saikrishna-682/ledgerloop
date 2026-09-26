import { useOpenAddTxn } from "@/components/AppShell";
import { BudgetsProgress } from "@/components/BudgetsProgress";
import { GoalsProgress } from "@/components/GoalsProgress";
import { MarketNews } from "@/components/MarketNews";
import { RecurringCard } from "@/components/RecurringCard";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { iconByName } from "@/lib/icons";
import { computeSpendingInsights } from "@/lib/insights";
import { currentMonthKey, friendlyDate, todayStr } from "@/lib/months";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { detectRecurring } from "@/lib/recurring";
import { estimateMonthlyInterestCents } from "@/lib/debtPayoff";
import { useQuery } from "convex/react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Lightbulb,
  PiggyBank,
  Scale,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { lazy, Suspense, useMemo } from "react";
import { Link } from "react-router";

// recharts is the single heaviest dependency on this page — deferring it
// lets the safe-to-spend hero (the number people open the app for) paint
// immediately, with the charts popping in a beat later instead of blocking
// first paint.
const CategoryDonut = lazy(() =>
  import("@/components/CategoryDonut").then((m) => ({ default: m.CategoryDonut })),
);
const TrendChart = lazy(() =>
  import("@/components/TrendChart").then((m) => ({ default: m.TrendChart })),
);

export default function Home() {
  const monthKey = currentMonthKey();
  const stats = useQuery(api.finance.getMonthlyStats, { monthKey });
  const recent = useQuery(api.finance.listTransactions, {}) ?? [];
  const trend = useQuery(api.finance.getTrend, { months: 6 }) ?? [];
  const budgets = useQuery(api.finance.listBudgetsWithProgress, { monthKey }) ?? [];
  const debts = useQuery(api.finance.listDebts) ?? [];
  const accountBalances = useQuery(api.finance.getAccountBalances) ?? [];
  const goals = useQuery(api.finance.listGoals) ?? [];
  const recurring = useMemo(() => detectRecurring(recent), [recent]);
  const openAdd = useOpenAddTxn();

  const insights = useMemo(() => {
    const currentMonthTxns = recent.filter((t) => t.date.startsWith(monthKey));
    return computeSpendingInsights(currentMonthTxns, trend);
  }, [recent, trend, monthKey]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  if (stats === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    );
  }

  const totalDebtCents = debts.reduce((sum, d) => sum + d.balanceCents, 0);
  const totalMonthlyInterestCents = debts.reduce(
    (sum, d) =>
      sum +
      estimateMonthlyInterestCents({
        id: d._id,
        name: d.name,
        balanceCents: d.balanceCents,
        aprBps: d.aprBps,
        minPaymentCents: d.minPaymentCents,
      }),
    0,
  );
  // Sum of every account's own signed balance (getAccountBalances already
  // treats a credit account's balance as negative — what's owed — so this
  // correctly reflects ongoing credit-card spending, unlike stats.balanceCents
  // which is deliberately cash-only for the safe-to-spend calculation).
  const totalAccountsCents = accountBalances.reduce((sum, a) => sum + a.balanceCents, 0);
  const netWorthCents = totalAccountsCents - totalDebtCents;
  const safeRemaining = stats.safeRemainingCents;
  const safeTotal = Math.max(1, stats.safeToSpendCents);
  const usedPct = Math.min(100, Math.round((stats.safeSpentCents / safeTotal) * 100));
  const overPct = Math.round((stats.safeSpentCents / safeTotal) * 100) - 100;
  const recentFive = recent.slice(0, 5);
  const topCats = stats.byCategory.slice(0, 4);
  const catSum = stats.spentCents || 1;
  const hasTxns = recent.length > 0;

  return (
    <div className="flex flex-col gap-5">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {greeting}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Here is where your money stands today.
        </p>
      </div>

      {/* Safe to spend — the hero number */}
      <Card className="card-soft overflow-hidden rounded-2xl border-border/60">
        <div className="bg-primary/5 px-5 pb-5 pt-5">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <ShieldCheck className="size-4" />
            Safe to spend today
          </div>
          <div className="money mt-2 text-[44px] font-bold leading-none tracking-tight">
            {formatCents(safeRemaining)}
          </div>
          {overPct > 0 ? (
            <p className="mt-2 text-sm font-medium text-destructive">
              {formatCents(stats.safeSpentCents - stats.safeToSpendCents)} over your safe
              budget this month
            </p>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              {formatCents(stats.safeToSpendCents)} total · spent{" "}
              {formatCents(stats.safeSpentCents)} so far
            </p>
          )}
          <div className="mt-4">
            <Progress
              value={Math.max(0, usedPct)}
              className={cn("h-2.5 bg-primary/15", overPct > 0 && "[&>div]:bg-destructive")}
            />
            <div className="mt-2 flex justify-between text-xs text-muted-foreground">
              <span>
                {overPct > 0
                  ? `${overPct}% over`
                  : `${100 - usedPct}% left for the month`}
              </span>
              <span className="money">
                {formatCents(stats.safeSpentCents)} / {formatCents(stats.safeToSpendCents)}
              </span>
            </div>
          </div>
        </div>

        {/* Committed breakdown — show the math, per the product philosophy */}
        <div className="grid grid-cols-3 divide-x divide-border/60 border-t border-border/60">
          <BreakdownCell
            icon={Wallet}
            label="Available balance"
            value={stats.balanceCents}
          />
          <BreakdownCell
            icon={PiggyBank}
            label="Committed"
            value={-(stats.essentialCents + stats.bufferCents)}
          />
          <BreakdownCell
            icon={TrendingUp}
            label="Buffer"
            value={-stats.bufferCents}
          />
        </div>
      </Card>

      {/* Net worth */}
      <Card className="card-soft rounded-2xl border-border/60">
        <CardContent className="flex items-center gap-3 px-5 py-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent">
            <Scale className="size-4 text-accent-foreground" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground">Net worth</p>
            <p className="money text-xl font-bold leading-tight">{formatCents(netWorthCents)}</p>
          </div>
          {totalDebtCents > 0 && (
            <span className="text-right text-xs text-muted-foreground">
              {formatCents(totalAccountsCents)} in accounts
              <br />− {formatCents(totalDebtCents)} in other debts
            </span>
          )}
        </CardContent>
      </Card>

      {/* Insights */}
      {(insights.biggestExpense ||
        insights.topMerchant ||
        insights.monthOverMonthPct !== null ||
        totalMonthlyInterestCents > 0) && (
        <Card className="card-soft rounded-2xl border-border/60">
          <div className="flex items-center gap-1.5 px-5 pb-1 pt-4">
            <Lightbulb className="size-4 text-primary" />
            <h2 className="text-sm font-semibold">Insights</h2>
          </div>
          <CardContent className="flex flex-col gap-2 px-5 py-3 text-sm">
            {insights.biggestExpense && (
              <p>
                Biggest expense this month:{" "}
                <span className="font-medium">{insights.biggestExpense.merchant}</span> at{" "}
                <span className="money font-medium">{formatCents(insights.biggestExpense.amountCents)}</span>
              </p>
            )}
            {insights.topMerchant && insights.topMerchant.count > 1 && (
              <p>
                Most spent at <span className="font-medium">{insights.topMerchant.merchant}</span>:{" "}
                <span className="money font-medium">{formatCents(insights.topMerchant.totalCents)}</span> across{" "}
                {insights.topMerchant.count} transactions
              </p>
            )}
            {insights.monthOverMonthPct !== null && (
              <p className="flex items-center gap-1.5">
                {insights.monthOverMonthPct > 0 ? (
                  <TrendingUp className="size-4 shrink-0 text-destructive" />
                ) : (
                  <TrendingDown className="size-4 shrink-0 text-primary" />
                )}
                Spending is{" "}
                <span className="font-medium">
                  {Math.abs(insights.monthOverMonthPct)}% {insights.monthOverMonthPct > 0 ? "higher" : "lower"}
                </span>{" "}
                than last month
              </p>
            )}
            {totalMonthlyInterestCents > 0 && (
              <p>
                Your debts are costing about{" "}
                <span className="money font-medium text-destructive">
                  {formatCents(totalMonthlyInterestCents)}
                </span>{" "}
                in interest this month —{" "}
                <Link to="/profile" className="font-medium text-primary hover:underline">
                  see the payoff plan
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* This month */}
      <Card className="card-soft rounded-2xl border-border/60">
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 className="text-sm font-semibold">This month</h2>
          <Link
            to="/activity"
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            See activity <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <CardContent className="flex flex-col px-5 py-3">
          <SummaryRow label="Income" value={stats.incomeCents} positive />
          <SummaryRow label="Spent" value={-stats.spentCents} />
          <SummaryRow label="Essentials" value={-stats.essentialCents} muted />
          <SummaryRow label="Buffer held back" value={-stats.bufferCents} muted />
          <SummaryRow label="Safe budget" value={stats.safeToSpendCents} strong />
        </CardContent>
      </Card>

      {/* Where money goes */}
      {topCats.length > 0 && (
        <Card className="card-soft rounded-2xl border-border/60">
          <div className="flex items-center justify-between px-5 pb-1 pt-4">
            <h2 className="text-sm font-semibold">Where money went</h2>
            <span className="money text-xs text-muted-foreground">
              {formatCents(stats.spentCents)} total
            </span>
          </div>
          <CardContent className="flex flex-col gap-4 px-5 py-4">
            <Suspense fallback={<Skeleton className="mx-auto h-[160px] w-[160px] rounded-full" />}>
              <CategoryDonut data={stats.byCategory} />
            </Suspense>
            {topCats.map((c) => {
              const Icon = iconByName(c.icon);
              const pct = Math.round((c.cents / catSum) * 100);
              return (
                <div key={c.categoryId} className="flex items-center gap-3">
                  <span
                    className="flex size-9 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${c.color}1f`, color: c.color }}
                  >
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.name}</span>
                      <span className="money shrink-0 text-sm font-semibold">
                        {formatCents(c.cents)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(3, pct)}%`, backgroundColor: c.color }}
                      />
                    </div>
                  </div>
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {pct}%
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Recurring & subscriptions */}
      <RecurringCard candidates={recurring} />

      {/* Budgets */}
      <BudgetsProgress budgets={budgets} />

      {/* Savings goals */}
      <GoalsProgress goals={goals} />

      {/* Monthly trend */}
      {trend.some((t) => t.incomeCents > 0 || t.spentCents > 0) && (
        <Card className="card-soft rounded-2xl border-border/60">
          <div className="flex items-center justify-between px-5 pb-1 pt-4">
            <h2 className="text-sm font-semibold">Monthly trend</h2>
            <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ backgroundColor: "var(--chart-1)" }} />
                Income
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full" style={{ backgroundColor: "var(--chart-4)" }} />
                Spent
              </span>
            </span>
          </div>
          <CardContent className="px-2 py-4">
            <Suspense fallback={<Skeleton className="h-[160px] w-full rounded-xl" />}>
              <TrendChart data={trend} />
            </Suspense>
          </CardContent>
        </Card>
      )}

      {/* Market news */}
      <MarketNews />

      {/* Recent activity */}
      <Card className="card-soft rounded-2xl border-border/60">
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 className="text-sm font-semibold">Recent activity</h2>
          <Link
            to="/activity"
            className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View all <ArrowRight className="size-3.5" />
          </Link>
        </div>
        <CardContent className="px-5 py-3">
          {!hasTxns ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="flex size-12 items-center justify-center rounded-full bg-accent">
                <Wallet className="size-5 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold">Log your first transaction</p>
                <p className="mx-auto mt-1 max-w-[36ch] text-xs text-muted-foreground">
                  Every income and expense sharpens your safe-to-spend number.
                </p>
              </div>
              <button
                type="button"
                onClick={openAdd}
                className="text-sm font-semibold text-primary hover:underline"
              >
                + Add a transaction
              </button>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {recentFive.map((t) => (
                <TxnRow key={t._id} txn={t} today={todayStr()} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* The product promise, in the product's own voice */}
      <p className="mx-auto max-w-[42ch] pb-2 text-center text-xs leading-relaxed text-muted-foreground">
        Safe to spend = balance carried in + income − essentials − buffer. Tap any number to
        see the math behind it in Profile.
      </p>
    </div>
  );
}

function BreakdownCell({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: number;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 bg-card px-2 py-3.5 text-center">
      <Icon className="size-4 text-muted-foreground" />
      <span className="money text-sm font-semibold">{formatCents(value)}</span>
      <span className="text-[10px] leading-tight text-muted-foreground">{label}</span>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  positive,
  muted,
  strong,
}: {
  label: string;
  value: number;
  positive?: boolean;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span
        className={cn(
          "text-sm",
          muted ? "text-muted-foreground" : "font-medium",
          strong && "font-semibold",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "money text-sm font-semibold",
          positive && value > 0 && "text-primary",
          muted && "text-muted-foreground",
        )}
      >
        {positive ? "+" : value < 0 ? "−" : ""}
        {formatCents(Math.abs(value))}
      </span>
    </div>
  );
}

export function TxnRow({ txn, today }: { txn: Doc<"transactions">; today: string }) {
  const isIncome = txn.type === "income";
  const Icon = isIncome ? ArrowDownLeft : ArrowUpRight;
  return (
    <div className="flex items-center gap-3 py-2.5">
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full",
          isIncome ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{txn.merchant}</p>
        <p className="text-xs text-muted-foreground">{friendlyDate(txn.date, today)}</p>
      </div>
      <span
        className={cn(
          "money text-sm font-semibold",
          isIncome && "text-primary",
        )}
      >
        {isIncome ? "+" : "−"}
        {formatCents(txn.amountCents)}
      </span>
    </div>
  );
}
