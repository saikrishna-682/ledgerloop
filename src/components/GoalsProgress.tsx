import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCents } from "@/lib/money";
import { Target } from "lucide-react";
import { Link } from "react-router";

export interface GoalSummary {
  _id: string;
  name: string;
  targetCents: number;
  savedCents: number;
  targetDate?: string;
}

export function GoalsProgress({ goals }: { goals: GoalSummary[] }) {
  if (goals.length === 0) return null;

  return (
    <Card className="card-soft rounded-2xl border-border/60">
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <h2 className="text-sm font-semibold">Savings goals</h2>
        <Link
          to="/profile"
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          Manage
        </Link>
      </div>
      <CardContent className="flex flex-col gap-4 px-5 py-4">
        {goals.map((g) => {
          const pct = Math.min(100, Math.round((g.savedCents / g.targetCents) * 100));
          return (
            <div key={g._id}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent">
                    <Target className="size-3.5 text-accent-foreground" />
                  </span>
                  <span className="truncate text-sm font-medium">{g.name}</span>
                </div>
                <span className="money shrink-0 text-xs text-muted-foreground">
                  {formatCents(g.savedCents)} / {formatCents(g.targetCents)}
                </span>
              </div>
              <Progress value={pct} className="mt-1.5 h-1.5" />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
