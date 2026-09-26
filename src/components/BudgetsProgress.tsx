import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCents } from "@/lib/money";
import { iconByName } from "@/lib/icons";
import { cn } from "@/lib/utils";

export interface BudgetProgress {
  budgetId: string;
  categoryId: string;
  name: string;
  color: string;
  icon: string;
  monthlyCents: number;
  spentCents: number;
  remainingCents: number;
  pctUsed: number;
  projectedCents: number;
  projectedOverBudget: boolean;
}

export function BudgetsProgress({ budgets }: { budgets: BudgetProgress[] }) {
  if (budgets.length === 0) return null;

  return (
    <Card className="card-soft rounded-2xl border-border/60">
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <h2 className="text-sm font-semibold">Budgets</h2>
      </div>
      <CardContent className="flex flex-col gap-4 px-5 py-4">
        {budgets.map((b) => {
          const Icon = iconByName(b.icon);
          return (
            <div key={b.budgetId}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${b.color}1f`, color: b.color }}
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <span className="truncate text-sm font-medium">{b.name}</span>
                </div>
                <span className="money shrink-0 text-xs text-muted-foreground">
                  {formatCents(b.spentCents)} / {formatCents(b.monthlyCents)}
                </span>
              </div>
              <Progress
                value={Math.min(100, b.pctUsed)}
                className={cn("mt-1.5 h-1.5", b.pctUsed >= 100 && "[&>div]:bg-destructive")}
              />
              {b.projectedOverBudget && (
                <p className="mt-1 text-[11px] text-destructive">
                  On pace for {formatCents(b.projectedCents)} — {formatCents(
                    b.projectedCents - b.monthlyCents,
                  )}{" "}
                  over budget
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
