/** Minimal CSV builder — quotes any field containing a comma, quote, or
 * newline, and escapes embedded quotes by doubling them (RFC 4180). */
export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  function escapeField(value: string | number): string {
    const s = String(value);
    if (/[",\n]/.test(s)) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }
  const lines = [headers, ...rows].map((row) => row.map(escapeField).join(","));
  return lines.join("\r\n");
}

/** Triggers a browser download of the given text as a file. */
export function downloadTextFile(filename: string, content: string, mimeType = "text/csv") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
