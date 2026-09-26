import * as pdfjsLib from "pdfjs-dist";
// Vite's ?url import serves the worker as a static asset; this is what
// keeps PDF parsing entirely client-side (no CDN fetch of the worker).
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Extracts all text from a PDF file, entirely in the browser — the file
 * itself is never uploaded anywhere. Only works for text-based PDFs (i.e.
 * not a scanned image with no embedded text layer).
 *
 * pdf.js hands back text items scattered by position, not pre-joined into
 * visual lines — items are grouped here by their y-coordinate (rounded, so
 * items on the same row but at very slightly different baselines still
 * group together) and ordered left-to-right within each row, so line-based
 * parsing downstream (one transaction per line) actually has lines to work
 * with instead of one giant run-on string per page. */
export async function extractPdfText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise;
  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();

    const rows = new Map<number, Array<{ x: number; str: string }>>();
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [, , , , x, y] = item.transform;
      const rowKey = Math.round(y / 3) * 3; // bucket nearby baselines together
      const row = rows.get(rowKey) ?? [];
      row.push({ x, str: item.str });
      rows.set(rowKey, row);
    }

    const lines = [...rows.entries()]
      .sort((a, b) => b[0] - a[0]) // top of page first
      .map(([, cells]) => cells.sort((a, b) => a.x - b.x).map((c) => c.str).join(" "));
    pages.push(lines.join("\n"));
  }
  return pages.join("\n");
}
