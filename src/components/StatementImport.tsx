import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { formatCents } from "@/lib/money";
import {
  guessCategoryId,
  parseCsvStatement,
  parsePdfStatementText,
  type ParsedTransaction,
  type StatementParseResult,
} from "@/lib/statementImport";
import { useMutation, useQuery } from "convex/react";
import { FileUp, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";

interface ReviewRow extends ParsedTransaction {
  include: boolean;
  categoryId: Id<"categories"> | "";
}

export function StatementImportCard() {
  const categories = useQuery(api.finance.listCategories) ?? [];
  const accounts = useQuery(api.finance.listAccounts) ?? [];
  const debts = useQuery(api.finance.listDebts) ?? [];
  const addTransaction = useMutation(api.finance.addTransaction);
  const updateDebt = useMutation(api.finance.updateDebt);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parsing, setParsing] = useState(false);
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [aprCandidatesBps, setAprCandidatesBps] = useState<number[]>([]);
  const [accountId, setAccountId] = useState<Id<"accounts"> | "">("");
  const [importing, setImporting] = useState(false);
  const [lastResult, setLastResult] = useState<StatementParseResult | null>(null);

  async function handleFile(file: File) {
    setParsing(true);
    setLastResult(null);
    try {
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      // pdfjs-dist is a large dependency — only fetched when a PDF is
      // actually selected, instead of shipping it to every Profile visit.
      const result = isPdf
        ? parsePdfStatementText(await (await import("@/lib/pdfText")).extractPdfText(file))
        : parseCsvStatement(await file.text());

      setLastResult(result);
      if (result.transactions.length === 0) {
        toast.error(result.warnings[0] ?? "Couldn't find any transactions in that file.");
        return;
      }
      for (const w of result.warnings) toast.warning(w);

      setRows(
        result.transactions.map((t) => ({
          ...t,
          include: true,
          categoryId: (guessCategoryId(t.merchant, t.type, categories) ?? "") as Id<"categories"> | "",
        })),
      );
      setAprCandidatesBps(result.aprCandidatesBps);
      setAccountId((accounts[0]?._id as Id<"accounts">) ?? "");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that file");
    } finally {
      setParsing(false);
    }
  }

  function reflip() {
    if (!lastResult) return;
    setRows((prev) =>
      prev
        ? prev.map((r) => ({ ...r, type: r.type === "income" ? "expense" : "income" }))
        : prev,
    );
  }

  function closeReview() {
    setRows(null);
    setLastResult(null);
    setAprCandidatesBps([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function confirmImport() {
    if (!rows || !accountId) {
      toast.error("Pick which account these transactions belong to");
      return;
    }
    const toImport = rows.filter((r) => r.include);
    if (toImport.length === 0) {
      toast.error("Nothing selected to import");
      return;
    }
    setImporting(true);
    let succeeded = 0;
    for (const r of toImport) {
      const categoryId = r.categoryId || fallbackCategoryId(r.type, categories);
      if (!categoryId) continue;
      try {
        await addTransaction({
          type: r.type,
          amountCents: r.amountCents,
          date: r.date,
          merchant: r.merchant,
          categoryId,
          accountId,
        });
        succeeded++;
      } catch {
        // Keep going — a single bad row (e.g. a category deleted mid-import)
        // shouldn't abort the whole batch; the summary below reports the count.
      }
    }
    setImporting(false);
    toast.success(`Imported ${succeeded} of ${toImport.length} transactions`);
    closeReview();
  }

  async function applyApr(bps: number, debtId: Id<"debts">) {
    const debt = debts.find((d) => d._id === debtId);
    if (!debt) return;
    try {
      await updateDebt({
        id: debtId,
        name: debt.name,
        balanceCents: debt.balanceCents,
        minPaymentCents: debt.minPaymentCents,
        aprBps: bps,
      });
      toast.success(`Updated ${debt.name}'s APR to ${(bps / 100).toFixed(2)}%`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update APR");
    }
  }

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.pdf,application/pdf,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
        }}
      />
      <Button
        variant="outline"
        className="w-full"
        onClick={() => fileInputRef.current?.click()}
        disabled={parsing}
      >
        <FileUp className="size-4" />
        {parsing ? "Reading statement…" : "Import bank/card statement"}
      </Button>

      <Drawer open={rows !== null} onOpenChange={(o) => !o && closeReview()}>
        <DrawerContent className="max-h-[92dvh]">
          <DrawerHeader>
            <DrawerTitle>Review before importing</DrawerTitle>
            <DrawerDescription>
              Best-effort extraction — check dates, amounts, and categories before confirming.
              Nothing is saved until you tap Import below.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-col gap-3 overflow-y-auto px-4 pb-4">
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
                Post to account
                <Select value={accountId} onValueChange={(v) => setAccountId(v as Id<"accounts">)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a._id} value={a._id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <Button variant="ghost" size="sm" className="self-start" onClick={reflip}>
                Signs look backwards? Flip all
              </Button>
            </div>

            {aprCandidatesBps.length > 0 && (
              <AprBanner aprCandidatesBps={aprCandidatesBps} debts={debts} onApply={applyApr} />
            )}

            <div className="flex flex-col divide-y divide-border/60 rounded-lg border border-border/60">
              {rows?.map((r, i) => (
                <div key={i} className="flex flex-col gap-2 p-3">
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={r.include}
                      onCheckedChange={(v) =>
                        setRows((prev) =>
                          prev!.map((row, idx) => (idx === i ? { ...row, include: v === true } : row)),
                        )
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{r.merchant}</p>
                      <p className="text-xs text-muted-foreground">{r.date}</p>
                    </div>
                    <span
                      className={
                        "money shrink-0 text-sm font-semibold " +
                        (r.type === "income" ? "text-primary" : "text-foreground")
                      }
                    >
                      {r.type === "income" ? "+" : "-"}
                      {formatCents(r.amountCents)}
                    </span>
                  </div>
                  <Select
                    value={r.categoryId}
                    onValueChange={(v) =>
                      setRows((prev) =>
                        prev!.map((row, idx) =>
                          idx === i ? { ...row, categoryId: v as Id<"categories"> } : row,
                        ),
                      )
                    }
                  >
                    <SelectTrigger className="ml-7 h-8 w-[calc(100%-1.75rem)]">
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories
                        .filter((c) => c.kind === r.type)
                        .map((c) => (
                          <SelectItem key={c._id} value={c._id}>
                            {c.name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="sticky bottom-0 border-t border-border/60 bg-background/95 p-4 backdrop-blur">
            <Button className="w-full" disabled={importing} onClick={() => void confirmImport()}>
              <Upload className="size-4" />
              {importing
                ? "Importing…"
                : `Import ${rows?.filter((r) => r.include).length ?? 0} transactions`}
            </Button>
          </div>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function fallbackCategoryId(
  type: "income" | "expense",
  categories: Doc<"categories">[],
): Id<"categories"> | null {
  const match = categories.find((c) => c.kind === type && !c.archived);
  return match?._id ?? null;
}

function AprBanner({
  aprCandidatesBps,
  debts,
  onApply,
}: {
  aprCandidatesBps: number[];
  debts: Doc<"debts">[];
  onApply: (bps: number, debtId: Id<"debts">) => void;
}) {
  const [debtId, setDebtId] = useState<Id<"debts"> | "">((debts[0]?._id as Id<"debts">) ?? "");
  const topApr = aprCandidatesBps[0];

  if (debts.length === 0) return null;

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <p className="font-medium">
        This statement mentions an APR of {(topApr / 100).toFixed(2)}%.
      </p>
      <div className="mt-2 flex items-center gap-2">
        <Select value={debtId} onValueChange={(v) => setDebtId(v as Id<"debts">)}>
          <SelectTrigger className="h-8 flex-1">
            <SelectValue placeholder="Apply to which debt?" />
          </SelectTrigger>
          <SelectContent>
            {debts.map((d) => (
              <SelectItem key={d._id} value={d._id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" disabled={!debtId} onClick={() => debtId && onApply(topApr, debtId)}>
          Apply
        </Button>
      </div>
    </div>
  );
}
