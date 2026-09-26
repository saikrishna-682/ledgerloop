/** Month-key helpers. A month key is "YYYY-MM"; a date is "YYYY-MM-DD". */

export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export function currentMonthKey(): string {
  return todayStr().slice(0, 7);
}

export function shiftMonthKey(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthRange(monthKey: string): { start: string; end: string } {
  const start = `${monthKey}-01`;
  const end = shiftMonthKey(monthKey, 1);
  return { start, end: end };
}

export function formatMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatMonthKeyShort(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

/** "Today", "Yesterday", "Mon", or "Sep 12" — no timestamps. */
export function friendlyDate(date: string, today: string): string {
  if (date === today) return "Today";
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const [ty, tm, td] = today.split("-").map(Number);
  const tdt = new Date(Date.UTC(ty, tm - 1, td));
  tdt.setUTCDate(tdt.getUTCDate() - 1);
  const yesterday = tdt.toISOString().slice(0, 10);
  if (date === yesterday) return "Yesterday";
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function daysInMonth(monthKey: string): number {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10));
}
