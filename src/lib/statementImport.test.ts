import { describe, expect, it } from "vitest";
import {
  extractAprCandidatesBps,
  guessCategoryId,
  parseCsvStatement,
  parsePdfStatementText,
} from "./statementImport";

describe("parseCsvStatement", () => {
  it("parses a single-amount-column CSV using the sign convention", () => {
    const csv = [
      "Date,Description,Amount",
      "09/12/2026,WHOLE FOODS MARKET,-45.67",
      "09/13/2026,PAYROLL DEPOSIT,1234.56",
    ].join("\n");
    const { transactions, warnings } = parseCsvStatement(csv);
    expect(warnings).toEqual([]);
    expect(transactions).toEqual([
      { date: "2026-09-12", merchant: "WHOLE FOODS MARKET", amountCents: 4567, type: "expense" },
      { date: "2026-09-13", merchant: "PAYROLL DEPOSIT", amountCents: 123456, type: "income" },
    ]);
  });

  it("flips sign convention when flipSign is set", () => {
    const csv = "Date,Description,Amount\n09/12/2026,STORE,-45.67";
    const { transactions } = parseCsvStatement(csv, true);
    expect(transactions[0].type).toBe("income");
  });

  it("parses separate Debit/Credit columns", () => {
    const csv = [
      "Date,Description,Debit,Credit",
      "09/12/2026,COFFEE SHOP,5.25,",
      "09/13/2026,REFUND,,12.00",
    ].join("\n");
    const { transactions } = parseCsvStatement(csv);
    expect(transactions).toEqual([
      { date: "2026-09-12", merchant: "COFFEE SHOP", amountCents: 525, type: "expense" },
      { date: "2026-09-13", merchant: "REFUND", amountCents: 1200, type: "income" },
    ]);
  });

  it("handles quoted fields containing commas", () => {
    const csv = 'Date,Description,Amount\n09/12/2026,"STORE, INC",-10.00';
    const { transactions } = parseCsvStatement(csv);
    expect(transactions[0].merchant).toBe("STORE, INC");
  });

  it("uses a Type column hint over the raw sign when present", () => {
    const csv = "Date,Description,Amount,Type\n09/12/2026,PURCHASE,45.67,debit";
    const { transactions } = parseCsvStatement(csv);
    expect(transactions[0].type).toBe("expense");
  });

  it("warns instead of throwing when columns aren't recognizable", () => {
    const csv = "Foo,Bar\n1,2";
    const { transactions, warnings } = parseCsvStatement(csv);
    expect(transactions).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it("skips rows with unparseable dates or empty amounts rather than crashing", () => {
    const csv = "Date,Description,Amount\nnot-a-date,STORE,10.00\n09/12/2026,STORE2,";
    const { transactions } = parseCsvStatement(csv);
    expect(transactions).toEqual([]);
  });

  it("handles a semicolon-delimited CSV with European-formatted amounts (comma decimal)", () => {
    // Day > 12 sidesteps the separate, unrelated DD/MM-vs-MM/DD ambiguity —
    // this test is only about delimiter and decimal-format handling.
    const csv = "Date;Description;Amount\n03/15/2026;Grocery Store;-45,67\n03/16/2026;Salary;1.500,00";
    const { transactions } = parseCsvStatement(csv);
    expect(transactions).toEqual([
      { date: "2026-03-15", merchant: "Grocery Store", amountCents: 4567, type: "expense" },
      { date: "2026-03-16", merchant: "Salary", amountCents: 150000, type: "income" },
    ]);
  });
});

describe("parsePdfStatementText", () => {
  it("extracts transaction-shaped lines and infers direction from sign/parens", () => {
    const text = [
      "Statement Closing Date: 09/30/2026",
      "Transactions",
      "09/12 AMAZON.COM*AB12CD 45.67",
      "09/13 PAYMENT RECEIVED THANK YOU (200.00)",
    ].join("\n");
    const { transactions } = parsePdfStatementText(text);
    expect(transactions).toEqual([
      { date: "2026-09-12", merchant: "AMAZON.COM*AB12CD", amountCents: 4567, type: "expense" },
      { date: "2026-09-13", merchant: "PAYMENT RECEIVED THANK YOU", amountCents: 20000, type: "income" },
    ]);
  });

  it("uses the amount column, not the running balance, when both trail the line", () => {
    const text = "Statement Closing Date: 09/30/2026\n09/12 AMAZON.COM*AB12CD 45.67 1204.33";
    const { transactions } = parsePdfStatementText(text);
    expect(transactions).toEqual([
      { date: expect.any(String), merchant: "AMAZON.COM*AB12CD", amountCents: 4567, type: "expense" },
    ]);
  });

  it("parses dash-separated day-month-name dates and prefers trailing remarks text as the merchant (e.g. GTBank-style statements)", () => {
    const text = "03-Mar-2017 3310001885 03-Mar-2017 3,000.00 39.82 CASH WITHDRAWAL FROM OUR ATM";
    const { transactions } = parsePdfStatementText(text);
    expect(transactions).toEqual([
      {
        date: "2017-03-03",
        merchant: expect.stringContaining("CASH WITHDRAWAL"),
        amountCents: 300000,
        type: "expense",
      },
    ]);
  });

  it("finds the amount even when a non-decimal reference number follows it", () => {
    // Real "Checks Paid" row shape: Date | Check # | Amount | Reference Number.
    // A naive "amount must be the last token" parser drops this row entirely
    // because the reference number (no decimal point) is what's actually last.
    const text = "Statement Date: June 5, 2003\n05-12 1001 75.00 00012576589";
    const { transactions } = parsePdfStatementText(text);
    expect(transactions).toEqual([
      { date: "2003-05-12", merchant: expect.any(String), amountCents: 7500, type: "expense" },
    ]);
  });

  it("finds the date even when it's not the first token on the line", () => {
    // Real deposit-row shape: "Deposit  Ref Nbr: 130012345   05-15   $3,615.08"
    // — the description precedes the date instead of following it.
    const text = "Statement Date: June 5, 2003\nDeposit Ref Nbr: 130012345 05-15 $3,615.08";
    const { transactions } = parsePdfStatementText(text);
    expect(transactions).toEqual([
      {
        date: "2003-05-15",
        merchant: expect.stringContaining("Deposit"),
        amountCents: 361508,
        type: "income", // "Deposit" in the description is a strong direction signal on its own
      },
    ]);
  });

  it("uses description keywords for direction when the amount has no sign (many checking-account statements never sign amounts at all)", () => {
    const text = "01-Mar-2017 0 01-Mar-2017 5,000.00 8,039.82 TRANSFER inward FBNMOBILE received";
    const { transactions } = parsePdfStatementText(text);
    expect(transactions[0].type).toBe("income");
  });

  it("warns when nothing matches (e.g. a scanned/image PDF)", () => {
    const { transactions, warnings } = parsePdfStatementText("just some prose, no line items here");
    expect(transactions).toEqual([]);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

describe("extractAprCandidatesBps", () => {
  it("finds a plain APR mention", () => {
    expect(extractAprCandidatesBps("Purchase APR: 24.99%")).toEqual([2499]);
  });

  it("ignores unrelated percentages and out-of-range values", () => {
    expect(extractAprCandidatesBps("Cashback rate: 5% on groceries")).toEqual([]);
    expect(extractAprCandidatesBps("apr 999%")).toEqual([]);
  });

  it("dedupes and sorts multiple APRs highest first", () => {
    expect(extractAprCandidatesBps("Purchase APR 19.99% Cash Advance APR 27.99%")).toEqual([2799, 1999]);
  });
});

describe("guessCategoryId", () => {
  const categories = [
    { _id: "c1", name: "Groceries", kind: "expense" as const },
    { _id: "c2", name: "Dining out", kind: "expense" as const },
    { _id: "c3", name: "Salary", kind: "income" as const },
  ];

  it("matches a known merchant keyword to an existing category of the right kind", () => {
    expect(guessCategoryId("WHOLE FOODS MKT #123", "expense", categories)).toBe("c1");
    expect(guessCategoryId("STARBUCKS STORE 456", "expense", categories)).toBe("c2");
    expect(guessCategoryId("PAYROLL DIRECT DEP", "income", categories)).toBe("c3");
  });

  it("returns null when nothing matches, rather than guessing", () => {
    expect(guessCategoryId("SOME RANDOM VENDOR LLC", "expense", categories)).toBeNull();
  });

  it("doesn't cross income/expense kinds even if the keyword matches", () => {
    // "Salary" keyword matches "payroll", but requesting expense kind must not return it.
    expect(guessCategoryId("PAYROLL DIRECT DEP", "expense", categories)).toBeNull();
  });
});
