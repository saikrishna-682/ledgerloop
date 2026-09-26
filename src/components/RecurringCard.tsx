import { Card, CardContent } from "@/components/ui/card";
import { formatCents } from "@/lib/money";
import type { RecurringCandidate } from "@/lib/recurring";
import { Repeat } from "lucide-react";

export function RecurringCard({ candidates }: { candidates: RecurringCandidate[] }) {
  if (candidates.length === 0) return null;

  const totalMonthlyCents = candidates.reduce((s, c) => s + c.estimatedMonthlyCents, 0);

  return (
    <Card className="card-soft rounded-2xl border-border/60">
      <div className="flex items-center justify-between px-5 pb-1 pt-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Repeat className="size-4 text-primary" />
          Recurring & subscriptions
        </h2>
        <span className="money text-xs text-muted-foreground">
          {formatCents(totalMonthlyCents)}/mo
        </span>
      </div>
      <CardContent className="flex flex-col gap-2 px-5 py-4">
        <p className="text-[11px] text-muted-foreground">
          Detected from repeated charges to the same merchant at a similar amount, roughly
          monthly — not merchant-verified, so double-check anything unfamiliar.
        </p>
        {candidates.map((c) => (
          <div
            key={c.merchant}
            className="flex items-center justify-between rounded-xl border border-border/60 px-3 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{c.merchant}</p>
              <p className="text-xs text-muted-foreground">
                Seen {c.occurrences}x · ~{formatCents(c.estimatedAnnualCents)}/yr
              </p>
            </div>
            <span className="money shrink-0 text-sm font-semibold">
              {formatCents(c.estimatedMonthlyCents)}/mo
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
