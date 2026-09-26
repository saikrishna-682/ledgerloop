/**
 * Money helpers. Every amount in the system is integer cents — never floats.
 */

export function formatCents(
  cents: number,
  opts?: { signed?: boolean; noCents?: boolean },
): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  if (opts?.noCents && rem === 0) {
    return `${sign}$${dollars.toLocaleString("en-US")}`;
  }
  return `${sign}$${dollars.toLocaleString("en-US")}.${String(rem).padStart(2, "0")}`;
}

/** "+$1,250.00" for income, plain for expenses. */
export function formatSignedCents(cents: number): string {
  const s = formatCents(Math.abs(cents));
  return cents > 0 ? `+${s}` : cents < 0 ? `-${s}` : s;
}

/** "12.34" -> 1234. Returns null for unparseable input. */
export function parseAmountToCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, "");
  if (!/^\d*(\.\d{0,2})?$/.test(cleaned) || cleaned === "" || cleaned === ".") {
    return null;
  }
  const [dollars, cents = ""] = cleaned.split(".");
  return Math.round(Number(dollars || "0") * 100 + Number((cents + "00").slice(0, 2)));
}

export function centsToInput(cents: number): string {
  const abs = Math.abs(Math.round(cents));
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  return rem === 0 ? String(dollars) : `${dollars}.${String(rem).padStart(2, "0")}`;
}
