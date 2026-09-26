import { useAuth } from "@/hooks/use-auth";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { iconByName, ICON_CHOICES } from "@/lib/icons";
import { formatCents, parseAmountToCents, centsToInput } from "@/lib/money";
import { currentMonthKey, todayStr } from "@/lib/months";
import { cn } from "@/lib/utils";
import {
  estimateMonthlyInterestCents,
  simulateAvalanche,
  simulateSnowball,
  type DebtInput,
  type PayoffResult,
} from "@/lib/debtPayoff";
import {
  ageBasedStockAllocation,
  debtToIncome,
  emergencyFund,
  fiftyThirtyTwenty,
} from "@/lib/moneyGuidelines";
import { Progress } from "@/components/ui/progress";
import type { MonthStats } from "@/convex/finance";
import { toCsv, downloadTextFile } from "@/lib/csv";
import { useMutation, useQuery } from "convex/react";
import {
  Banknote,
  Check,
  CreditCard,
  Download,
  Info,
  Landmark,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const ACCOUNT_KINDS = [
  { value: "checking", label: "Checking", icon: Landmark },
  { value: "savings", label: "Savings", icon: Banknote },
  { value: "cash", label: "Cash", icon: Wallet },
  { value: "credit", label: "Credit card", icon: CreditCard },
] as const;

export default function Profile() {
  const { user, signOut } = useAuth();
  const settings = useQuery(api.finance.getSettings);
  const stats = useQuery(api.finance.getMonthlyStats, { monthKey: currentMonthKey() });
  const accounts = useQuery(api.finance.listAccounts) ?? [];
  const categories = useQuery(api.finance.listCategories) ?? [];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profile</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Your setup</p>
      </div>

      <DisplayNameCard user={user ?? null} />

      {/* Buffer setting */}
      <Card className="card-soft rounded-2xl border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="size-4 text-primary" />
            Buffer
          </CardTitle>
          <CardDescription>
            The share of your income kept untouched each month before anything is counted as
            safe to spend.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {settings === undefined || stats === undefined ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <BufferSetting bufferPct={settings.bufferPct} incomeCents={stats.incomeCents} />
          )}
        </CardContent>
      </Card>

      {/* How the number works */}
      <Card className="card-soft rounded-2xl border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="size-4 text-primary" />
            How safe-to-spend works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">
            Balance carried in + this month's income − essentials − buffer
          </p>
          <p className="mt-2">
            "Balance carried in" is what you had before this month started, so this month's
            income and essentials are each counted once. Essentials are expenses in categories
            marked essential. Credit-card spending is a liability, so it does not reduce your
            cash balance until you pay the bill. All amounts are stored as integer cents —
            never floating point.
          </p>
        </CardContent>
      </Card>

      {/* Accounts */}
      <AccountsCard accounts={accounts} />
      {/* Categories */}
      <CategoriesCard categories={categories} />
      {/* Budgets */}
      <BudgetsCard categories={categories} />
      {/* Debts */}
      <DebtsCard />
      {/* Money guidelines */}
      {stats && <MoneyGuidelinesCard stats={stats} age={settings?.age} />}
      {/* Export */}
      <ExportDataCard />

      <Button
        variant="outline"
        className="text-destructive hover:bg-destructive/5 hover:text-destructive"
        onClick={async () => {
          await signOut();
          window.location.href = "/";
        }}
      >
        Sign out
      </Button>
    </div>
  );
}

function DisplayNameCard({ user }: { user: Doc<"users"> | null }) {
  const save = useMutation(api.finance.updateProfileName);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(user?.name ?? "");
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  async function commit() {
    if (!value.trim()) {
      toast.error("Name can't be empty");
      return;
    }
    setSaving(true);
    try {
      await save({ name: value.trim() });
      toast.success("Name updated");
      setEditing(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="card-soft rounded-2xl border-border/60">
      <CardContent className="flex items-center gap-3 py-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">
          {(user.name ?? user.email ?? "?").slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                onFocus={(e) => e.currentTarget.select()}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void commit();
                  if (e.key === "Escape") {
                    setValue(user.name ?? "");
                    setEditing(false);
                  }
                }}
                className="h-8"
              />
              <Button size="sm" onClick={() => void commit()} disabled={saving}>
                <Check className="size-4" />
              </Button>
            </div>
          ) : (
            <>
              <p className="truncate text-sm font-semibold">{user.name ?? "Add your name"}</p>
              <p className="truncate text-xs text-muted-foreground">
                {user.email ?? (user.isAnonymous ? "Guest account" : "")}
              </p>
            </>
          )}
        </div>
        {!editing && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0"
            aria-label="Edit name"
            onClick={() => {
              setValue(user.name ?? "");
              setEditing(true);
            }}
          >
            <Pencil className="size-3.5 text-muted-foreground" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function BufferSetting({
  bufferPct,
  incomeCents,
}: {
  bufferPct: number;
  incomeCents: number;
}) {
  const [value, setValue] = useState(bufferPct);
  const [saving, setSaving] = useState(false);
  const save = useMutation(api.finance.setBufferPct);

  async function commit(next: number) {
    setSaving(true);
    try {
      await save({ bufferPct: next });
      toast.success(`Buffer set to ${next}%`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const preview = Math.round((incomeCents * value) / 100);

  return (
    <>
      <div className="flex items-center justify-between">
        <Label htmlFor="buffer" className="text-sm">
          Percentage of income
        </Label>
        <span className="money text-lg font-bold text-primary">{value}%</span>
      </div>
      <input
        id="buffer"
        type="range"
        min={0}
        max={50}
        step={1}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
        onMouseUp={() => value !== bufferPct && commit(value)}
        onTouchEnd={() => value !== bufferPct && commit(value)}
        onKeyUp={() => value !== bufferPct && commit(value)}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
        style={{
          background: `linear-gradient(to right, var(--primary) ${value * 2}%, var(--muted) ${value * 2}%)`,
        }}
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>0%</span>
        <span>25%</span>
        <span>50%</span>
      </div>
      <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
        With this month's income of <span className="money font-medium">{formatCents(incomeCents)}</span>,
        the buffer holds back <span className="money font-medium text-foreground">{formatCents(preview)}</span>.
      </p>
    </>
  );
}

function AccountsCard({ accounts }: { accounts: Doc<"accounts">[] }) {
  const create = useMutation(api.finance.createAccount);
  const update = useMutation(api.finance.updateAccount);
  const remove = useMutation(api.finance.deleteAccount);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"accounts"> | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<(typeof ACCOUNT_KINDS)[number]["value"]>("checking");
  const [balance, setBalance] = useState("");
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null);
    setName("");
    setKind("checking");
    setBalance("");
    setOpen(true);
  }

  function openEdit(a: Doc<"accounts">) {
    setEditing(a);
    setName(a.name);
    setKind(a.kind);
    setBalance(centsToInput(Math.abs(a.startingBalanceCents)));
    setOpen(true);
  }

  async function submit() {
    const cents = parseAmountToCents(balance || "0");
    if (!name.trim() || cents === null) {
      toast.error("Enter a name and a valid balance");
      return;
    }
    setSaving(true);
    try {
      const signed = kind === "credit" ? -cents : cents;
      if (editing) {
        await update({
          id: editing._id,
          name: name.trim(),
          kind,
          startingBalanceCents: signed,
        });
        toast.success("Account updated");
      } else {
        await create({ name: name.trim(), kind, startingBalanceCents: signed });
        toast.success("Account added");
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(a: Doc<"accounts">) {
    try {
      const result = await remove({ id: a._id });
      toast.success(
        result === "archived"
          ? "Account has transactions — archived instead of deleted"
          : "Account deleted",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  const kindIcon = (k: string) =>
    ACCOUNT_KINDS.find((x) => x.value === k)?.icon ?? Landmark;

  return (
    <Card className="card-soft rounded-2xl border-border/60">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">Accounts</CardTitle>
          <CardDescription>
            Starting balances anchor your available balance.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={openNew}>
          <Plus className="size-4" /> Add
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {accounts.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">No accounts yet.</p>
        )}
        {accounts.map((a) => {
          const Icon = kindIcon(a.kind);
          return (
            <div
              key={a._id}
              className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-muted">
                <Icon className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.name}</p>
                <p className="text-xs capitalize text-muted-foreground">{a.kind}</p>
              </div>
              <span className="money text-sm font-semibold">
                {a.kind === "credit" ? "−" : ""}
                {formatCents(Math.abs(a.startingBalanceCents))}
              </span>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(a)}>
                <Pencil className="size-3.5 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Delete ${a.name}`}
                onClick={() => void handleDelete(a)}
              >
                <Trash2 className="size-3.5 text-muted-foreground" />
              </Button>
            </div>
          );
        })}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit account" : "Add account"}</DialogTitle>
            <DialogDescription>
              Starting balance is your balance before any logged transactions.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acct-name">Name</Label>
              <Input
                id="acct-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Main checking"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Kind</Label>
              <div className="grid grid-cols-2 gap-2">
                {ACCOUNT_KINDS.map((k) => (
                  <button
                    key={k.value}
                    type="button"
                    onClick={() => setKind(k.value)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      kind === k.value
                        ? "border-primary bg-accent"
                        : "border-border/70 hover:bg-muted/50",
                    )}
                  >
                    <k.icon className="size-4" />
                    {k.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="acct-balance">Starting balance</Label>
              <Input
                id="acct-balance"
                inputMode="decimal"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save" : "Add account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CategoriesCard({ categories }: { categories: Doc<"categories">[] }) {
  const create = useMutation(api.finance.createCategory);
  const update = useMutation(api.finance.updateCategory);
  const remove = useMutation(api.finance.deleteCategory);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"categories"> | null>(null);
  const [name, setName] = useState("");
  const [essential, setEssential] = useState(false);
  const [icon, setIcon] = useState("CircleDot");
  const [color, setColor] = useState("#64748b");
  const [saving, setSaving] = useState(false);

  function openNew() {
    setEditing(null);
    setName("");
    setEssential(false);
    setIcon("CircleDot");
    setColor("#64748b");
    setOpen(true);
  }

  function openEdit(c: Doc<"categories">) {
    setEditing(c);
    setName(c.name);
    setEssential(c.essential === true);
    setIcon(c.icon);
    setColor(c.color);
    setOpen(true);
  }

  async function submit() {
    if (!name.trim()) {
      toast.error("Enter a category name");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await update({ id: editing._id, name: name.trim(), essential });
        if (editing.isSystem) {
          toast.success("System categories can only rename/essential-toggle");
        }
      } else {
        await create({
          name: name.trim(),
          kind: "expense",
          icon,
          color,
          essential,
        });
      }
      toast.success(editing ? "Category updated" : "Category added");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(c: Doc<"categories">) {
    try {
      const result = await remove({ id: c._id });
      toast.success(
        result === "archived"
          ? "Category has transactions — archived instead of deleted"
          : "Category deleted",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  const expenseCats = categories.filter((c) => c.kind === "expense");
  const incomeCats = categories.filter((c) => c.kind === "income");

  return (
    <Card className="card-soft rounded-2xl border-border/60">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">Categories</CardTitle>
          <CardDescription>Essential categories are excluded from safe-to-spend.</CardDescription>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={openNew}>
          <Plus className="size-4" /> Add
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <CategoryGroup
          title="Income"
          cats={incomeCats}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
        <CategoryGroup
          title="Expenses"
          cats={expenseCats}
          onEdit={openEdit}
          onDelete={handleDelete}
        />
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit category" : "Add category"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Rename or change whether it counts as essential."
                : "New categories are expense categories."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cat-name">Name</Label>
              <Input
                id="cat-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Pet care"
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
              <div>
                <Label htmlFor="cat-essential" className="text-sm">
                  Essential
                </Label>
                <p className="text-xs text-muted-foreground">
                  Counted as committed, not safe-to-spend
                </p>
              </div>
              <Switch
                id="cat-essential"
                checked={essential}
                onCheckedChange={setEssential}
              />
            </div>
            {!editing && (
              <>
                <div className="flex flex-col gap-1.5">
                  <Label>Icon</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {ICON_CHOICES.map((name2) => {
                      const Icon = iconByName(name2);
                      return (
                        <button
                          key={name2}
                          type="button"
                          onClick={() => setIcon(name2)}
                          aria-label={name2}
                          className={cn(
                            "flex size-9 items-center justify-center rounded-lg border transition-colors",
                            icon === name2
                              ? "border-primary bg-accent"
                              : "border-border/70 hover:bg-muted/50",
                          )}
                        >
                          <Icon className="size-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>Color</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {PALETTE.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setColor(c)}
                        aria-label={`Color ${c}`}
                        className={cn(
                          "flex size-8 items-center justify-center rounded-full border-2 transition-transform",
                          color === c ? "border-foreground scale-110" : "border-transparent",
                        )}
                        style={{ backgroundColor: c }}
                      >
                        {color === c && <Check className="size-3.5 text-white" />}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save" : "Add category"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function CategoryGroup({
  title,
  cats,
  onEdit,
  onDelete,
}: {
  title: string;
  cats: Doc<"categories">[];
  onEdit: (c: Doc<"categories">) => void;
  onDelete: (c: Doc<"categories">) => Promise<void>;
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {cats.map((c) => {
          const Icon = iconByName(c.icon);
          return (
            <div
              key={c._id}
              className="group flex items-center gap-1.5 rounded-full border border-border/60 bg-card py-1.5 pl-2.5 pr-1.5"
            >
              <span
                className="flex size-5 items-center justify-center rounded-full"
                style={{ backgroundColor: `${c.color}1f`, color: c.color }}
              >
                <Icon className="size-3" />
              </span>
              <span className="text-xs font-medium">{c.name}</span>
              {c.essential && (
                <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-semibold uppercase text-accent-foreground">
                  Ess
                </span>
              )}
              <button
                type="button"
                onClick={() => onEdit(c)}
                aria-label={`Edit ${c.name}`}
                className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
              >
                <Pencil className="size-3" />
              </button>
              <button
                type="button"
                onClick={() => void onDelete(c)}
                aria-label={`Delete ${c.name}`}
                className="flex size-5 items-center justify-center rounded-full text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const PALETTE = [
  "#059669",
  "#0d9488",
  "#0ea5e9",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#64748b",
];

function BudgetsCard({ categories }: { categories: Doc<"categories">[] }) {
  const monthKey = currentMonthKey();
  const budgets = useQuery(api.finance.listBudgetsWithProgress, { monthKey }) ?? [];
  const setBudgetMut = useMutation(api.finance.setBudget);
  const removeBudget = useMutation(api.finance.deleteBudget);
  const [open, setOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<Id<"categories"> | null>(null);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const expenseCats = categories.filter((c) => c.kind === "expense");
  const budgetByCategory = new Map(budgets.map((b) => [b.categoryId, b]));

  function openFor(cat: Doc<"categories">) {
    setCategoryId(cat._id);
    const existing = budgetByCategory.get(cat._id);
    setAmount(existing ? centsToInput(existing.monthlyCents) : "");
    setOpen(true);
  }

  async function submit() {
    if (!categoryId) return;
    const cents = parseAmountToCents(amount || "0");
    if (cents === null || cents < 0) {
      toast.error("Enter a valid amount");
      return;
    }
    setSaving(true);
    try {
      await setBudgetMut({ categoryId, monthlyCents: cents });
      toast.success("Budget saved");
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(budgetId: Id<"budgets">) {
    try {
      await removeBudget({ id: budgetId });
      toast.success("Budget removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  const editingCat = expenseCats.find((c) => c._id === categoryId);

  return (
    <Card className="card-soft rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Budgets</CardTitle>
        <CardDescription>Set a monthly target per category — tracked on Home.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {expenseCats.length === 0 && (
          <p className="py-2 text-sm text-muted-foreground">Add an expense category first.</p>
        )}
        {expenseCats.map((c) => {
          const b = budgetByCategory.get(c._id);
          const Icon = iconByName(c.icon);
          return (
            <div
              key={c._id}
              className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5"
            >
              <span
                className="flex size-9 items-center justify-center rounded-full"
                style={{ backgroundColor: `${c.color}1f`, color: c.color }}
              >
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
              {b ? (
                <>
                  <span className="money text-sm font-semibold">
                    {formatCents(b.monthlyCents)}/mo
                  </span>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => openFor(c)}>
                    <Pencil className="size-3.5 text-muted-foreground" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    aria-label={`Remove ${c.name} budget`}
                    onClick={() => void handleRemove(b.budgetId as Id<"budgets">)}
                  >
                    <Trash2 className="size-3.5 text-muted-foreground" />
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => openFor(c)}>
                  Set budget
                </Button>
              )}
            </div>
          );
        })}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingCat?.name ?? "Budget"}</DialogTitle>
            <DialogDescription>Monthly target for this category.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-amount">Monthly amount</Label>
            <Input
              id="budget-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function DebtsCard() {
  const debts = useQuery(api.finance.listDebts) ?? [];
  const create = useMutation(api.finance.createDebt);
  const update = useMutation(api.finance.updateDebt);
  const remove = useMutation(api.finance.deleteDebt);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Doc<"debts"> | null>(null);
  const [name, setName] = useState("");
  const [balance, setBalance] = useState("");
  const [apr, setApr] = useState("");
  const [minPayment, setMinPayment] = useState("");
  const [saving, setSaving] = useState(false);
  const [extra, setExtra] = useState(0);

  function openNew() {
    setEditing(null);
    setName("");
    setBalance("");
    setApr("");
    setMinPayment("");
    setOpen(true);
  }

  function openEdit(d: Doc<"debts">) {
    setEditing(d);
    setName(d.name);
    setBalance(centsToInput(d.balanceCents));
    setApr((d.aprBps / 100).toString());
    setMinPayment(centsToInput(d.minPaymentCents));
    setOpen(true);
  }

  async function submit() {
    const balCents = parseAmountToCents(balance || "0");
    const minCents = parseAmountToCents(minPayment || "0");
    const aprNum = Number(apr);
    if (
      !name.trim() ||
      balCents === null ||
      minCents === null ||
      !Number.isFinite(aprNum) ||
      aprNum < 0
    ) {
      toast.error("Fill in all fields with valid numbers");
      return;
    }
    const aprBps = Math.round(aprNum * 100);
    setSaving(true);
    try {
      if (editing) {
        await update({
          id: editing._id,
          name: name.trim(),
          balanceCents: balCents,
          aprBps,
          minPaymentCents: minCents,
        });
        toast.success("Debt updated");
      } else {
        await create({ name: name.trim(), balanceCents: balCents, aprBps, minPaymentCents: minCents });
        toast.success("Debt added");
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(d: Doc<"debts">) {
    try {
      await remove({ id: d._id });
      toast.success("Debt removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove");
    }
  }

  const debtInputs: DebtInput[] = debts.map((d) => ({
    id: d._id,
    name: d.name,
    balanceCents: d.balanceCents,
    aprBps: d.aprBps,
    minPaymentCents: d.minPaymentCents,
  }));
  const totalMinPayment = debtInputs.reduce((s, d) => s + d.minPaymentCents, 0);
  const avalanche = debtInputs.length > 0 ? simulateAvalanche(debtInputs, extra) : null;
  const snowball = debtInputs.length > 0 ? simulateSnowball(debtInputs, extra) : null;

  return (
    <>
      <Card className="card-soft rounded-2xl border-border/60">
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle className="text-base">Debts</CardTitle>
            <CardDescription>Balance, APR, and minimum payment per debt.</CardDescription>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openNew}>
            <Plus className="size-4" /> Add
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {debts.length === 0 && (
            <p className="py-2 text-sm text-muted-foreground">
              No debts tracked — add one to see a payoff plan.
            </p>
          )}
          {debts.map((d) => (
            <div
              key={d._id}
              className="flex items-center gap-3 rounded-xl border border-border/60 px-3 py-2.5"
            >
              <span className="flex size-9 items-center justify-center rounded-full bg-muted">
                <CreditCard className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{d.name}</p>
                <p className="text-xs text-muted-foreground">
                  {(d.aprBps / 100).toFixed(2)}% APR · min {formatCents(d.minPaymentCents)} · ~
                  {formatCents(
                    estimateMonthlyInterestCents({
                      id: d._id,
                      name: d.name,
                      balanceCents: d.balanceCents,
                      aprBps: d.aprBps,
                      minPaymentCents: d.minPaymentCents,
                    }),
                  )}
                  /mo interest
                </p>
              </div>
              <span className="money text-sm font-semibold">{formatCents(d.balanceCents)}</span>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(d)}>
                <Pencil className="size-3.5 text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                aria-label={`Delete ${d.name}`}
                onClick={() => void handleDelete(d)}
              >
                <Trash2 className="size-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </CardContent>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{editing ? "Edit debt" : "Add debt"}</DialogTitle>
              <DialogDescription>
                APR is an estimate (balance × APR ÷ 12) — actual lenders may compute interest
                differently.
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="debt-name">Name</Label>
                <Input
                  id="debt-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Chase Credit Card"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="debt-balance">Balance</Label>
                <Input
                  id="debt-balance"
                  inputMode="decimal"
                  value={balance}
                  onChange={(e) => setBalance(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="debt-apr">APR %</Label>
                <Input
                  id="debt-apr"
                  inputMode="decimal"
                  value={apr}
                  onChange={(e) => setApr(e.target.value)}
                  placeholder="24.99"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="debt-min">Minimum payment</Label>
                <Input
                  id="debt-min"
                  inputMode="decimal"
                  value={minPayment}
                  onChange={(e) => setMinPayment(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void submit()} disabled={saving}>
                {saving ? "Saving…" : editing ? "Save" : "Add debt"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>

      {debtInputs.length > 0 && avalanche && snowball && (
        <PayoffCalculator
          extra={extra}
          onExtraChange={setExtra}
          totalMinPayment={totalMinPayment}
          avalanche={avalanche}
          snowball={snowball}
        />
      )}
    </>
  );
}

function PayoffCalculator({
  extra,
  onExtraChange,
  totalMinPayment,
  avalanche,
  snowball,
}: {
  extra: number;
  onExtraChange: (n: number) => void;
  totalMinPayment: number;
  avalanche: PayoffResult;
  snowball: PayoffResult;
}) {
  return (
    <Card className="card-soft rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Payoff calculator</CardTitle>
        <CardDescription>
          Minimums total {formatCents(totalMinPayment)}/mo. Add extra to see the payoff speed up.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div>
          <div className="flex items-center justify-between">
            <Label className="text-sm">Extra payment / month</Label>
            <span className="money text-sm font-semibold text-primary">{formatCents(extra)}</span>
          </div>
          <input
            type="range"
            min={0}
            max={100000}
            step={2500}
            value={extra}
            onChange={(e) => onExtraChange(Number(e.target.value))}
            className="mt-2 h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary"
          />
          <div className="mt-1 flex justify-between text-xs text-muted-foreground">
            <span>$0</span>
            <span>$500</span>
            <span>$1,000</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <PayoffStrategy label="Avalanche" hint="Highest APR first" result={avalanche} />
          <PayoffStrategy label="Snowball" hint="Smallest balance first" result={snowball} />
        </div>
      </CardContent>
    </Card>
  );
}

function PayoffStrategy({
  label,
  hint,
  result,
}: {
  label: string;
  hint: string;
  result: PayoffResult;
}) {
  return (
    <div className="rounded-xl border border-border/60 p-3">
      <p className="text-sm font-semibold">{label}</p>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
      <p className="money mt-2 text-lg font-bold">
        {result.months === null ? "—" : `${result.months} mo`}
      </p>
      <p className="text-xs text-muted-foreground">
        {result.months === null
          ? "Payments too low to pay off"
          : `${formatCents(result.totalInterestCents)} interest`}
      </p>
    </div>
  );
}

function MoneyGuidelinesCard({
  stats,
  age,
}: {
  stats: MonthStats;
  age: number | undefined;
}) {
  const debts = useQuery(api.finance.listDebts) ?? [];
  const savingsBalanceCents = useQuery(api.finance.getSavingsBalanceCents);
  const setAgeMut = useMutation(api.finance.setAge);
  const [ageInput, setAgeInput] = useState(age?.toString() ?? "");
  const [savingAge, setSavingAge] = useState(false);

  const debtMinimumsCents = debts.reduce((s, d) => s + d.minPaymentCents, 0);
  const split = fiftyThirtyTwenty({
    incomeCents: stats.incomeCents,
    essentialCents: stats.essentialCents,
    discretionaryCents: stats.discretionaryCents,
    debtMinimumsCents,
  });
  const dti = debtToIncome({ monthlyDebtPaymentsCents: debtMinimumsCents, incomeCents: stats.incomeCents });
  const fund =
    savingsBalanceCents !== undefined
      ? emergencyFund({ essentialCents: stats.essentialCents, currentSavingsCents: savingsBalanceCents })
      : null;
  const allocation = age !== undefined ? ageBasedStockAllocation(age) : null;

  async function commitAge() {
    const n = Number(ageInput);
    if (!ageInput || !Number.isFinite(n) || n < 0 || n > 120) {
      toast.error("Enter a valid age");
      return;
    }
    setSavingAge(true);
    try {
      await setAgeMut({ age: n });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingAge(false);
    }
  }

  return (
    <Card className="card-soft rounded-2xl border-border/60">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4 text-primary" />
          Money guidelines
        </CardTitle>
        <CardDescription>
          General rules of thumb from mainstream financial planning, computed against your own
          numbers — not personalized advice.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!split ? (
          <p className="text-sm text-muted-foreground">
            Log income this month to see your guidelines.
          </p>
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Needs / Wants / Leftover</p>
                <span className="text-[11px] text-muted-foreground">the 50/30/20 rule</span>
              </div>
              <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full bg-foreground/70"
                  style={{ width: `${Math.max(0, Math.min(100, split.needsPct))}%` }}
                />
                <div
                  className="h-full bg-primary/60"
                  style={{ width: `${Math.max(0, Math.min(100, split.wantsPct))}%` }}
                />
                <div
                  className="h-full bg-primary"
                  style={{ width: `${Math.max(0, Math.min(100, split.leftoverPct))}%` }}
                />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                <div>
                  <p className="font-semibold">{split.needsPct}%</p>
                  <p className="text-muted-foreground">Needs (target ≤50%)</p>
                </div>
                <div>
                  <p className="font-semibold">{split.wantsPct}%</p>
                  <p className="text-muted-foreground">Wants (target ≤30%)</p>
                </div>
                <div>
                  <p className="font-semibold">{split.leftoverPct}%</p>
                  <p className="text-muted-foreground">Leftover (target ≥20%)</p>
                </div>
              </div>
              {(split.needsOverTarget || split.leftoverUnderTarget) && (
                <p className="mt-2 rounded-lg bg-muted/60 px-3 py-2 text-[11px] text-muted-foreground">
                  You have {formatCents(split.leftoverCents)} left over this month (
                  {split.leftoverPct}%) after needs and wants — the rule suggests aiming for at
                  least 20% toward savings or debt payoff.
                </p>
              )}
            </div>

            {dti && (
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Debt-to-income</p>
                  <span
                    className={cn(
                      "text-sm font-semibold",
                      dti.healthy ? "text-primary" : "text-destructive",
                    )}
                  >
                    {dti.ratioPct}%
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {dti.healthy
                    ? "Under the 36% threshold lenders typically consider healthy."
                    : "Above the 36% threshold lenders typically flag — consider prioritizing debt payoff above."}
                </p>
              </div>
            )}

            {fund && (
              <div>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">Emergency fund</p>
                  <span className="text-xs text-muted-foreground">
                    {fund.monthsCovered} mo covered
                  </span>
                </div>
                <Progress value={fund.pctToMin} className="mt-2 h-2" />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {formatCents(fund.currentCents)} in savings-kind accounts toward a{" "}
                  {formatCents(fund.minTargetCents)}–{formatCents(fund.maxTargetCents)} target
                  (3–6 months of essential expenses).
                </p>
              </div>
            )}
          </>
        )}

        <div className="rounded-xl border border-border/60 p-3">
          <p className="text-sm font-semibold">Stock vs. bond allocation</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            A common glide-path heuristic: roughly (110 − age)% in stocks, the rest in
            bonds/cash.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Input
              value={ageInput}
              onChange={(e) => setAgeInput(e.target.value)}
              placeholder="Your age"
              inputMode="numeric"
              className="h-8 w-24"
            />
            <Button size="sm" variant="outline" onClick={() => void commitAge()} disabled={savingAge}>
              Save
            </Button>
          </div>
          {allocation && (
            <div className="mt-3">
              <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary" style={{ width: `${allocation.stockPct}%` }} />
                <div
                  className="h-full bg-foreground/50"
                  style={{ width: `${allocation.bondPct}%` }}
                />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                <span>{allocation.stockPct}% stocks</span>
                <span>{allocation.bondPct}% bonds/cash</span>
              </div>
            </div>
          )}
        </div>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          These are general rules of thumb, not personalized financial advice. Your goals, risk
          tolerance, and circumstances matter more than any formula — consider a licensed
          financial advisor for decisions specific to you.
        </p>
      </CardContent>
    </Card>
  );
}

function ExportDataCard() {
  const rows = useQuery(api.finance.exportTransactions);
  const [exporting, setExporting] = useState(false);

  function handleExport() {
    if (!rows || rows.length === 0) {
      toast.error("No transactions to export yet");
      return;
    }
    setExporting(true);
    try {
      const csv = toCsv(
        ["Date", "Type", "Merchant", "Category", "Account", "Amount", "Note"],
        rows.map((t) => [
          t.date,
          t.type,
          t.merchant,
          t.category,
          t.account,
          (t.amountCents / 100).toFixed(2),
          t.note,
        ]),
      );
      downloadTextFile(`ledgerloop-transactions-${todayStr()}.csv`, csv);
      toast.success(`Exported ${rows.length} transaction${rows.length === 1 ? "" : "s"}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card className="card-soft rounded-2xl border-border/60">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base">Export data</CardTitle>
          <CardDescription>Download every transaction as a CSV file.</CardDescription>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={handleExport}
          disabled={exporting || rows === undefined}
        >
          <Download className="size-4" /> Export CSV
        </Button>
      </CardHeader>
    </Card>
  );
}

