import { parseCsv } from "./csvParse";

export interface ParsedTransaction {
  date: string; // "YYYY-MM-DD"
  merchant: string;
  amountCents: number;
  type: "income" | "expense";
}

export interface StatementParseResult {
  transactions: ParsedTransaction[];
  warnings: string[];
  aprCandidatesBps: number[];
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Parses "$1,234.56", "(45.67)" (accounting negative), "-45.67", "45.67"
 * into integer cents. Returns null if the string isn't a recognizable amount. */
function parseAmountToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const negativeParens = /^\(.*\)$/.test(trimmed);
  const cleaned = trimmed.replace(/[()$,]/g, "").trim();
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  const cents = Math.round(Math.abs(value) * 100);
  return negativeParens || value < 0 ? -cents : cents;
}

/** Normalizes common statement date formats to "YYYY-MM-DD". `fallbackYear`
 * covers credit-card statement lines that print "MM/DD" with no year — the
 * statement's own closing-date year (extracted separately) fills the gap. */
function normalizeDate(raw: string, fallbackYear?: number): string | null {
  const s = raw.trim();

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }

  m = /^(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (m && fallbackYear) {
    return `${fallbackYear}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }

  m = /^(\d{1,2})-(\d{1,2})-(\d{2,4})$/.exec(s);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }

  return null;
}

function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/** Bank/APR mentions in statement text, e.g. "Purchase APR: 24.99%". Bounded
 * to a plausible APR range to filter out unrelated percentages. */
export function extractAprCandidatesBps(text: string): number[] {
  const found = new Set<number>();
  const re = /apr[^%\n\d]{0,40}?(\d{1,2}(?:\.\d{1,4})?)\s*%/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const pct = Number(m[1]);
    if (Number.isFinite(pct) && pct > 0 && pct < 60) {
      found.add(Math.round(pct * 100));
    }
  }
  return [...found].sort((a, b) => b - a);
}

// ---------------------------------------------------------------------------
// CSV statements — every bank/card issuer offers this, and it parses
// reliably since columns are unambiguous (unlike PDF layout heuristics).
// ---------------------------------------------------------------------------

const HEADER_KEYWORDS = {
  date: ["date", "posted", "transaction date"],
  merchant: ["description", "merchant", "payee", "name", "memo"],
  amount: ["amount"],
  debit: ["debit", "withdrawal", "withdrawals"],
  credit: ["credit", "deposit", "deposits"],
  type: ["type"],
} as const;

function findColumn(headers: string[], keywords: readonly string[]): number {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const kw of keywords) {
    const idx = lower.findIndex((h) => h === kw || h.includes(kw));
    if (idx !== -1) return idx;
  }
  return -1;
}

/** Some banks list debits as positive and credits as negative (the opposite
 * of the usual convention) — rather than guess wrong silently, the caller
 * (the review UI) offers a "flip" toggle driven by this same flag. */
export function parseCsvStatement(text: string, flipSign = false): StatementParseResult {
  const rows = parseCsv(text);
  const warnings: string[] = [];
  if (rows.length < 2) {
    return { transactions: [], warnings: ["This file doesn't look like a statement CSV."], aprCandidatesBps: [] };
  }

  const headers = rows[0];
  const dateCol = findColumn(headers, HEADER_KEYWORDS.date);
  const merchantCol = findColumn(headers, HEADER_KEYWORDS.merchant);
  const amountCol = findColumn(headers, HEADER_KEYWORDS.amount);
  const debitCol = findColumn(headers, HEADER_KEYWORDS.debit);
  const creditCol = findColumn(headers, HEADER_KEYWORDS.credit);
  const typeCol = findColumn(headers, HEADER_KEYWORDS.type);

  if (dateCol === -1 || merchantCol === -1 || (amountCol === -1 && debitCol === -1 && creditCol === -1)) {
    return {
      transactions: [],
      warnings: ["Couldn't find recognizable date/description/amount columns in this CSV."],
      aprCandidatesBps: [],
    };
  }

  const transactions: ParsedTransaction[] = [];
  for (const row of rows.slice(1)) {
    const date = normalizeDate(row[dateCol] ?? "");
    const merchant = collapseWhitespace(row[merchantCol] ?? "");
    if (!date || !merchant) continue;

    let amountCents: number | null = null;
    let type: "income" | "expense" | null = null;

    if (debitCol !== -1 || creditCol !== -1) {
      const debit = debitCol !== -1 ? parseAmountToCents(row[debitCol] ?? "") : null;
      const credit = creditCol !== -1 ? parseAmountToCents(row[creditCol] ?? "") : null;
      if (debit && Math.abs(debit) > 0) {
        amountCents = Math.abs(debit);
        type = "expense";
      } else if (credit && Math.abs(credit) > 0) {
        amountCents = Math.abs(credit);
        type = "income";
      }
    } else {
      const raw = parseAmountToCents(row[amountCol] ?? "");
      if (raw !== null) {
        const typeHint = typeCol !== -1 ? (row[typeCol] ?? "").toLowerCase() : "";
        if (/credit|deposit|payment|refund/.test(typeHint)) type = "income";
        else if (/debit|purchase|sale|withdrawal/.test(typeHint)) type = "expense";
        else type = raw < 0 ? "expense" : "income";
        amountCents = Math.abs(raw);
      }
    }

    if (amountCents === null || amountCents === 0 || !type) continue;
    if (flipSign) type = type === "income" ? "expense" : "income";
    transactions.push({ date, merchant, amountCents, type });
  }

  if (transactions.length === 0) {
    warnings.push("No transaction rows could be read from this file.");
  }
  return { transactions, warnings, aprCandidatesBps: extractAprCandidatesBps(text) };
}

// ---------------------------------------------------------------------------
// PDF statements — text-based PDFs only (not scanned images). Bank layouts
// vary widely, so this is inherently best-effort: it looks for lines shaped
// like "<date>  <description>  <amount>" and leaves everything else alone.
// The caller always shows a review step before anything is imported.
// ---------------------------------------------------------------------------

const DATE_TOKEN_RE = /^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/;
const AMOUNT_TOKEN_RE = /^\(?-?\$?\d[\d,]*\.\d{2}\)?$/;

/** Splits a statement line into {date, description, amount}, tolerating a
 * trailing running-balance column (a second amount-shaped token at the very
 * end) — a plain "match one amount at the end" regex would silently grab
 * the balance instead of the actual transaction amount on statements laid
 * out as Date | Description | Amount | Balance. */
function splitStatementLine(
  line: string,
): { dateToken: string; description: string; amountToken: string } | null {
  const tokens = line.split(" ").filter(Boolean);
  if (tokens.length < 3 || !DATE_TOKEN_RE.test(tokens[0])) return null;

  let end = tokens.length;
  const trailingAmounts: number[] = [];
  while (end > 1 && AMOUNT_TOKEN_RE.test(tokens[end - 1]) && trailingAmounts.length < 2) {
    trailingAmounts.push(end - 1);
    end--;
  }
  if (trailingAmounts.length === 0) return null;

  // One trailing amount -> that's the transaction. Two -> assume
  // Amount-then-Balance order (the common case) and use the first of the two.
  const amountIndex = trailingAmounts.length === 2 ? trailingAmounts[1] : trailingAmounts[0];
  const description = tokens.slice(1, amountIndex).join(" ");
  if (!description) return null;

  return { dateToken: tokens[0], description, amountToken: tokens[amountIndex] };
}

function extractStatementYear(text: string): number | undefined {
  const m =
    /(?:statement\s+(?:closing\s+)?date|closing\s+date)[:\s]+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i.exec(
      text,
    );
  if (!m) return undefined;
  let year = Number(m[3]);
  if (year < 100) year += 2000;
  return year;
}

export function parsePdfStatementText(text: string, flipSign = false): StatementParseResult {
  const fallbackYear = extractStatementYear(text);
  const transactions: ParsedTransaction[] = [];
  const warnings: string[] = [];

  for (const rawLine of text.split("\n")) {
    const line = collapseWhitespace(rawLine);
    const split = splitStatementLine(line);
    if (!split) continue;
    const date = normalizeDate(split.dateToken, fallbackYear);
    const merchant = collapseWhitespace(split.description);
    const amountCents = parseAmountToCents(split.amountToken);
    if (!date || !merchant || amountCents === null || amountCents === 0) continue;

    // Statement lines rarely say "debit"/"credit" explicitly — parenthesized
    // or minus-signed amounts are the payments/credits; everything else on
    // a purchase line is money out. This is the credit-card-statement
    // convention (opposite of a checking account's), which is why flipSign
    // exists for the reverse case.
    let type: "income" | "expense" =
      split.amountToken.startsWith("(") || split.amountToken.startsWith("-")
        ? "income"
        : "expense";
    if (flipSign) type = type === "income" ? "expense" : "income";

    transactions.push({ date, merchant, amountCents: Math.abs(amountCents), type });
  }

  if (!fallbackYear && transactions.some((t) => t.date.length !== 10)) {
    warnings.push("Couldn't find the statement's year — some dates may need correcting.");
  }
  if (transactions.length === 0) {
    warnings.push(
      "No transaction lines were recognized in this PDF — it may be a scanned image, or use a layout this parser doesn't know yet. Try the CSV export instead if your bank offers one.",
    );
  }
  return { transactions, warnings, aprCandidatesBps: extractAprCandidatesBps(text) };
}

// ---------------------------------------------------------------------------
// Best-effort category guessing — always overridable in the review step.
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  Groceries: ["walmart", "kroger", "safeway", "whole foods", "trader joe", "costco", "aldi", "publix", "grocery", "supermarket"],
  Transport: ["uber", "lyft", "shell", "chevron", "exxon", "gas station", "parking", "transit", "metro"],
  "Dining out": ["starbucks", "mcdonald", "restaurant", "cafe", "chipotle", "pizza", "doordash", "grubhub", "ubereats", "coffee"],
  Subscriptions: ["netflix", "spotify", "hulu", "disney+", "prime video", "subscription", "apple.com/bill", "icloud"],
  Shopping: ["amazon", "target", "ebay", "best buy", "walmart.com"],
  Utilities: ["electric", "water utility", "gas company", "comcast", "at&t", "verizon", "internet", "utility"],
  Entertainment: ["movie", "cinema", "theatre", "concert", "ticketmaster", "spotify"],
  Health: ["pharmacy", "cvs", "walgreens", "clinic", "doctor", "hospital"],
  Rent: ["rent", "landlord", "property management"],
  Salary: ["payroll", "salary", "direct deposit"],
};

export function guessCategoryId<T extends { _id: string; name: string; kind: "income" | "expense" }>(
  merchant: string,
  type: "income" | "expense",
  categories: T[],
): string | null {
  const lower = merchant.toLowerCase();
  for (const [categoryName, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (!keywords.some((kw) => lower.includes(kw))) continue;
    const match = categories.find(
      (c) => c.kind === type && c.name.toLowerCase() === categoryName.toLowerCase(),
    );
    if (match) return match._id;
  }
  return null;
}
