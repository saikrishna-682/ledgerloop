/** Bank CSV exports don't all use commas — many European/international banks
 * (and Excel's own regional export settings) use semicolons instead, since a
 * comma is the decimal separator there; some use tabs. Counting occurrences
 * on the header line (the one row we can be confident has no delimiter
 * embedded inside a quoted field yet) picks the delimiter actually in use
 * instead of assuming comma and silently mis-splitting every row. */
function detectDelimiter(text: string): string {
  const headerLine = text.split(/\r\n|\r|\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const count = headerLine.split(c).length - 1;
    if (count > bestCount) {
      best = c;
      bestCount = count;
    }
  }
  return best;
}

/** RFC 4180 CSV parser — handles quoted fields containing the delimiter,
 * quotes (doubled), and embedded newlines. Bank-exported CSVs commonly quote
 * descriptions that contain the delimiter ("STORE, INC"), so a naive
 * split(",") would silently misalign every column after the first one.
 * The delimiter is auto-detected when not given explicitly (see
 * detectDelimiter) so semicolon- and tab-separated exports work too. */
export function parseCsv(text: string, delimiter?: string): string[][] {
  // Strip a UTF-8 BOM — common in CSVs exported from Excel — which would
  // otherwise get glued onto the first header's name and break column matching.
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const delim = delimiter ?? detectDelimiter(withoutBom);

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  // Normalize line endings so \r\n and \r alone behave like \n.
  const src = withoutBom.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // Final field/row (files don't always end with a trailing newline).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}
