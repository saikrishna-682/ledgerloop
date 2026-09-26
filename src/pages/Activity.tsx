import { useOpenAddTxn } from "@/components/AppShell";
import { TransactionDrawer } from "@/components/TransactionDrawer";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock";
import { currentMonthKey, daysInMonth, formatMonthKey, friendlyDate, shiftMonthKey, todayStr } from "@/lib/months";
import { formatCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ChevronLeft, ChevronRight, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export default function Activity() {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [editing, setEditing] = useState<Doc<"transactions"> | null>(null);
  useBodyScrollLock(editing !== null);
  const [deleting, setDeleting] = useState<Doc<"transactions"> | null>(null);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const openAdd = useOpenAddTxn();

  const stats = useQuery(api.finance.getMonthlyStats, { monthKey });
  const categories = useQuery(api.finance.listCategories) ?? [];
  const txns = useQuery(api.finance.listTransactions, {
    fromDate: `${monthKey}-01`,
    toDate: `${monthKey}-${String(daysInMonth(monthKey)).padStart(2, "0")}`,
  });
  const removeTxn = useMutation(api.finance.deleteTransaction);
  const addTxn = useMutation(api.finance.addTransaction);
  const isCurrent = monthKey === currentMonthKey();

  const filteredTxns = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (txns ?? []).filter((t) => {
      if (categoryFilter !== "all" && t.categoryId !== categoryFilter) return false;
      if (q && !t.merchant.toLowerCase().includes(q) && !(t.note ?? "").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [txns, search, categoryFilter]);

  const grouped = groupByDate(filteredTxns);
  const today = todayStr();
  const catName = (id: Id<"categories">) =>
    categories.find((c) => c._id === id)?.name ?? "Uncategorized";

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Activity</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Every dollar in and out.</p>
      </div>

      {/* Month switcher + totals */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous month"
          onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <div className="text-center">
          <p className="text-sm font-semibold">{formatMonthKey(monthKey)}</p>
          {stats && (
            <p className="money mt-0.5 text-xs text-muted-foreground">
              {formatCents(stats.incomeCents)} in · {formatCents(stats.spentCents)} out
            </p>
          )}
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next month"
          disabled={isCurrent}
          onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Search + category filter */}
      {txns !== undefined && txns.length > 0 && (
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search merchant or note"
              className="pl-9"
            />
            {search && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[140px] shrink-0">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c._id} value={c._id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {txns === undefined ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : txns.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border/70 py-14 text-center">
          <p className="text-sm font-semibold">Nothing logged in {formatMonthKey(monthKey)}</p>
          <p className="max-w-[40ch] text-xs text-muted-foreground">
            Log income and expenses to see your month take shape.
          </p>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="size-4" /> Add a transaction
          </Button>
        </div>
      ) : filteredTxns.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border/70 py-14 text-center">
          <p className="text-sm font-semibold">No matches</p>
          <p className="max-w-[40ch] text-xs text-muted-foreground">
            Nothing in {formatMonthKey(monthKey)} matches that search or category.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {grouped.map(([date, rows]) => {
            const dayTotal = rows.reduce(
              (s, t) => s + (t.type === "income" ? t.amountCents : -t.amountCents),
              0,
            );
            return (
              <div key={date}>
                <div className="mb-1 flex items-baseline justify-between px-1">
                  <span className="text-xs font-semibold text-muted-foreground">
                    {friendlyDate(date, today)}
                  </span>
                  <span
                    className={cn(
                      "money text-xs font-medium",
                      dayTotal > 0 ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {dayTotal > 0 ? "+" : "−"}
                    {formatCents(Math.abs(dayTotal))}
                  </span>
                </div>
                <div className="card-soft divide-y divide-border/50 rounded-2xl border border-border/60 bg-card">
                  {rows.map((t) => (
                    <button
                      key={t._id}
                      type="button"
                      onClick={() => setEditing(t)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
                    >
                      <span
                        className={cn(
                          "money flex-1 truncate text-sm font-medium",
                          t.type === "income" && "text-primary",
                        )}
                      >
                        {t.merchant}
                      </span>
                      <span className="hidden text-xs text-muted-foreground sm:inline">
                        {catName(t.categoryId)}
                      </span>
                      <span
                        className={cn(
                          "money text-sm font-semibold",
                          t.type === "income" && "text-primary",
                        )}
                      >
                        {t.type === "income" ? "+" : "−"}
                        {formatCents(t.amountCents)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit drawer */}
      <Drawer open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DrawerContent>
          <DrawerHeader className="sr-only">
            <DrawerTitle>Edit transaction</DrawerTitle>
            <DrawerDescription>Update or remove this entry</DrawerDescription>
          </DrawerHeader>
          {editing && (
            <div className="flex flex-col gap-4">
              <div className="px-4 pt-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-destructive hover:text-destructive"
                  onClick={() => {
                    setDeleting(editing);
                    setEditing(null);
                  }}
                >
                  <Trash2 className="size-4" /> Delete transaction
                </Button>
              </div>
              <TransactionDrawer editing={editing} onDone={() => setEditing(null)} />
            </div>
          )}
        </DrawerContent>
      </Drawer>

      {/* Delete confirm */}
      <DeleteConfirm
        target={deleting}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          const restore = {
            type: deleting.type,
            amountCents: deleting.amountCents,
            date: deleting.date,
            merchant: deleting.merchant,
            categoryId: deleting.categoryId,
            accountId: deleting.accountId,
            note: deleting.note,
          };
          try {
            await removeTxn({ id: deleting._id });
            toast.success("Transaction deleted", {
              action: {
                label: "Undo",
                onClick: () => {
                  addTxn(restore).catch(() =>
                    toast.error("Couldn't restore that transaction"),
                  );
                },
              },
              duration: 6000,
            });
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete");
          } finally {
            setDeleting(null);
          }
        }}
      />
    </div>
  );
}

function DeleteConfirm({
  target,
  onClose,
  onConfirm,
}: {
  target: Doc<"transactions"> | null;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  return (
    <Drawer open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Delete this transaction?</DrawerTitle>
          <DrawerDescription>
            {target ? `${target.merchant} · ${formatCents(target.amountCents)}` : ""} — you'll
            get a few seconds to undo this after.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex gap-2 px-4 pb-6 pt-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Keep it
          </Button>
          <Button variant="destructive" className="flex-1" onClick={() => void onConfirm()}>
            Delete
          </Button>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function groupByDate(txns: Doc<"transactions">[]): Array<[string, Doc<"transactions">[]]> {
  const map = new Map<string, Doc<"transactions">[]>();
  for (const t of txns) {
    const list = map.get(t.date) ?? [];
    list.push(t);
    map.set(t.date, list);
  }
  return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]));
}
