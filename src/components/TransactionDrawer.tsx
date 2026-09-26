import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { iconByName } from "@/lib/icons";
import { todayStr } from "@/lib/months";
import { centsToInput, formatCents, parseAmountToCents } from "@/lib/money";
import { cn } from "@/lib/utils";
import { useMutation, useQuery } from "convex/react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

export function TransactionDrawer({
  onDone,
  editing,
}: {
  onDone: () => void;
  editing?: Doc<"transactions">;
}) {
  const categories = useQuery(api.finance.listCategories) ?? [];
  const accounts = useQuery(api.finance.listAccounts) ?? [];
  const addTxn = useMutation(api.finance.addTransaction);
  const updateTxn = useMutation(api.finance.updateTransaction);

  const [type, setType] = useState<"income" | "expense">(editing?.type ?? "expense");
  const [amount, setAmount] = useState(editing ? centsToInput(editing.amountCents) : "");
  const [merchant, setMerchant] = useState(editing?.merchant ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [date, setDate] = useState(editing?.date ?? todayStr());
  const [categoryId, setCategoryId] = useState<Id<"categories"> | null>(
    editing?.categoryId ?? null,
  );
  const [accountId, setAccountId] = useState<Id<"accounts"> | null>(
    editing?.accountId ?? null,
  );
  const [saving, setSaving] = useState(false);

  const cats = useMemo(
    () => categories.filter((c) => c.kind === (type === "income" ? "income" : "expense")),
    [categories, type],
  );

  useEffect(() => {
    if (!categoryId && cats.length > 0) setCategoryId(cats[0]._id);
    if (categoryId && !cats.some((c) => c._id === categoryId)) setCategoryId(cats[0]._id);
  }, [cats, categoryId]);

  useEffect(() => {
    if (!accountId && accounts.length > 0) setAccountId(accounts[0]._id);
  }, [accounts, accountId]);

  const canSave =
    parseAmountToCents(amount) !== null &&
    parseAmountToCents(amount)! > 0 &&
    merchant.trim().length > 0 &&
    categoryId !== null &&
    accountId !== null;

  async function save() {
    if (!canSave || saving || categoryId === null || accountId === null) return;
    setSaving(true);
    try {
      const payload = {
        type,
        amountCents: parseAmountToCents(amount)!,
        date,
        merchant: merchant.trim(),
        categoryId,
        accountId,
        note: note.trim() ? note.trim() : undefined,
      };
      if (editing) {
        await updateTxn({ id: editing._id, ...payload });
        toast.success("Transaction updated");
      } else {
        await addTxn(payload);
        toast.success(type === "income" ? "Income logged" : "Expense logged");
      }
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  const amountCents = parseAmountToCents(amount);

  return (
    <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-8 pt-2">
      {/* Type toggle */}
      <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-muted p-1">
        {(["expense", "income"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={cn(
              "flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-all",
              type === t
                ? t === "income"
                  ? "bg-background text-primary shadow-sm ring-1 ring-border/60"
                  : "bg-background text-foreground shadow-sm ring-1 ring-border/60"
                : "text-muted-foreground",
            )}
          >
            {t === "income" ? (
              <ArrowDownLeft className="size-4" />
            ) : (
              <ArrowUpRight className="size-4" />
            )}
            {t === "income" ? "Income" : "Expense"}
          </button>
        ))}
        </div>

      {/* Amount + merchant */}
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold text-muted-foreground">$</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="0.00"
            aria-label="Amount"
            className="money w-full bg-transparent text-5xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/30"
          />
        </div>
        <Input
          value={merchant}
          onChange={(e) => setMerchant(e.target.value)}
          placeholder={type === "income" ? "Source (e.g. September salary)" : "Where did it go?"}
          className="h-11"
        />
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Date</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">Account</span>
            <select
              value={accountId ?? ""}
              onChange={(e) => setAccountId(e.target.value as Id<"accounts">)}
              className="border-input bg-background flex h-9 w-full items-center rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {accounts.map((a) => (
                <option key={a._id} value={a._id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Note</span>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            rows={2}
          />
        </label>
      </div>

      {/* Categories */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium text-muted-foreground">Category</span>
        <div className="grid grid-cols-4 gap-2">
          {cats.map((c) => {
            const Icon = iconByName(c.icon);
            const selected = categoryId === c._id;
            return (
              <button
                key={c._id}
                type="button"
                onClick={() => setCategoryId(c._id)}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-xl border p-2.5 text-center transition-all",
                  selected
                    ? "border-primary bg-accent ring-1 ring-primary/30"
                    : "border-border/70 hover:border-border hover:bg-muted/50",
                )}
              >
                <span
                  className="flex size-8 items-center justify-center rounded-full"
                  style={{ backgroundColor: `${c.color}1f`, color: c.color }}
                >
                  <Icon className="size-4" />
                </span>
                <span className="line-clamp-2 text-[11px] font-medium leading-tight">
                  {c.name}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sticky save */}
      <div className="sticky bottom-0 -mx-4 border-t border-border/60 bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <span className="money text-sm font-semibold">
            {amountCents !== null ? formatCents(amountCents) : "$0.00"}
          </span>
          <Button onClick={save} disabled={!canSave || saving} className="min-w-36">
            {saving ? "Saving…" : editing ? "Save changes" : "Log it"}
          </Button>
        </div>
      </div>
    </div>
  );
}
