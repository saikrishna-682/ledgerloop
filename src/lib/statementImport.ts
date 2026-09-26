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

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/** Normalizes common statement date formats to "YYYY-MM-DD" — slash- or
 * dash-separated numeric dates ("05/12/2026", "05-12-2026"), day-month-name
 * dates ("01-Mar-2017"), and date-only fragments with no year ("05-12",
 * "05/12"). `fallbackYear` covers that last case — the statement's own
 * closing/statement-date year (extracted separately) fills the gap. */
function normalizeDate(raw: string, fallbackYear?: number): string | null {
  const s = raw.trim();

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;

  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/.exec(s);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return `${year}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  }

  // "01-Mar-2017" / "01-Mar-17"
  m = /^(\d{1,2})-([A-Za-z]{3,9})-(\d{2,4})$/.exec(s);
  if (m) {
    const month = MONTH_NAMES[m[2].slice(0, 3).toLowerCase()];
    if (month) {
      let year = Number(m[3]);
      if (year < 100) year += 2000;
      return `${year}-${String(month).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    }
  }

  m = /^(\d{1,2})[/-](\d{1,2})$/.exec(s);
  if (m && fallbackYear) {
    return `${fallbackYear}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
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

const DATE_TOKEN_RE =
  /^\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?$|^\d{1,2}-[A-Za-z]{3,9}-\d{2,4}$/;
const AMOUNT_TOKEN_RE = /^\(?-?\$?\d[\d,]*\.\d{2}\)?$/;

/** Splits a statement line into {date, description, amount}. Two things
 * real statements do that break a naive "date first, amount last" regex:
 *
 * 1. The date isn't always the first token — a wrapped description or a
 *    label ("Deposit", "ATM Withdrawal") can precede it. The first
 *    date-shaped token anywhere in the line is used, and everything before
 *    it is folded into the description rather than discarded.
 * 2. The amount isn't always the last token — some statements print a
 *    reference number *after* the amount (e.g. a check's reference number),
 *    which isn't amount-shaped (no decimal point) so it's harmless to
 *    ignore. The first amount-shaped token after the date is used, unless
 *    the line ends with two adjacent amount-shaped tokens (Amount then a
 *    trailing running Balance column), in which case the first of that
 *    pair is the actual transaction amount. */
function splitStatementLine(
  line: string,
): { dateToken: string; description: string; amountToken: string } | null {
  const tokens = line.split(" ").filter(Boolean);
  const dateIdx = tokens.findIndex((t) => DATE_TOKEN_RE.test(t));
  if (dateIdx === -1) return null;

  const amountIdxs: number[] = [];
  for (let i = dateIdx + 1; i < tokens.length; i++) {
    if (AMOUNT_TOKEN_RE.test(tokens[i])) amountIdxs.push(i);
  }
  if (amountIdxs.length === 0) return null;

  const last = amountIdxs[amountIdxs.length - 1];
  const secondLast = amountIdxs.length >= 2 ? amountIdxs[amountIdxs.length - 2] : -1;
  const endsWithAdjacentPair = last === tokens.length - 1 && secondLast === tokens.length - 2;
  const amountIndex = endsWithAdjacentPair ? secondLast : amountIdxs[0];

  // Column-based statements (Date | Ref | Debit | Credit | Balance | Remarks)
  // often put the actual human-readable description *after* every number on
  // the row, not between the date and the amount — prefer that trailing text
  // when it contains real words, since a bare reference number ("1001") or
  // nothing at all isn't a useful merchant label.
  const leading = collapseWhitespace(
    tokens.slice(0, dateIdx).join(" ") + " " + tokens.slice(dateIdx + 1, amountIndex).join(" "),
  );
  const trailing = collapseWhitespace(tokens.slice(last + 1).join(" "));
  // A date fragment like "01-Mar-2017" contains letters ("Mar") but isn't a
  // useful description — strip date-shaped tokens before judging whether a
  // candidate actually has real words in it.
  const hasWords = (s: string) =>
    /[A-Za-z]{2,}/.test(
      s.split(" ").filter((t) => !DATE_TOKEN_RE.test(t)).join(" "),
    );
  const description = hasWords(trailing) ? trailing : hasWords(leading) ? leading : leading || trailing;

  return {
    dateToken: tokens[dateIdx],
    description: description || "Transaction",
    amountToken: tokens[amountIndex],
  };
}

function extractStatementYear(text: string): number | undefined {
  const label = /(?:statement\s+(?:closing\s+)?date|closing\s+date)[:\s]+/i;

  let m = new RegExp(label.source + /(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/.source, "i").exec(text);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return year;
  }

  // "Statement Date: June 5, 2003"
  m = new RegExp(label.source + /[A-Za-z]{3,9}\s+\d{1,2},?\s+(\d{4})/.source, "i").exec(text);
  if (m) return Number(m[1]);

  return undefined;
}

// A negative/parenthesized amount is an unambiguous signal, but plenty of
// statements (checking accounts especially) print every amount as a plain
// positive number and rely on which section/column it's in instead — that
// structure is lost once everything's flattened to lines, so the
// description text itself is the next-best signal: "Deposit"/"Withdrawal"
// style wording is common across many banks even when column position isn't
// recoverable from extracted text.
const INCOME_KEYWORDS = /\b(deposit|salary|payroll|refund|inward|received)\b/i;
const EXPENSE_KEYWORDS = /\b(withdrawal|purchase|outward|commission|charge|fee|tax)\b/i;

function inferDirection(amountToken: string, description: string): "income" | "expense" {
  if (amountToken.startsWith("(") || amountToken.startsWith("-")) return "income";
  const isIncome = INCOME_KEYWORDS.test(description);
  const isExpense = EXPENSE_KEYWORDS.test(description);
  if (isIncome && !isExpense) return "income";
  if (isExpense && !isIncome) return "expense";
  return "expense"; // default: most statement lines are purchases/debits
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

    let type = inferDirection(split.amountToken, merchant);
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
