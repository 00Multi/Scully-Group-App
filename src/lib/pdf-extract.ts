// Client-side PDF text extraction for metadata autofill. Runs entirely in the
// browser via pdf.js — no backend function needed. We pull the first pages of
// text, find the DOI, and let Crossref supply reliable bibliographic metadata
// (per PRD §10: DOI → Crossref is more reliable than parsing the page).

// Dynamically imported so pdf.js (which touches browser-only globals) never
// loads during SSR.
export async function extractPdfText(file: File, maxPages = 4): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
    pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  }
  const data = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data }).promise;
  const pages = Math.min(doc.numPages, maxPages);
  let text = "";
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map((it: any) => it.str ?? "").join(" ") + "\n";
  }
  return text;
}

// Find the first DOI in extracted text, trimmed of trailing punctuation.
export function findDoi(text: string): string | null {
  const m = text.match(/\b10\.\d{4,9}\/[-._;()/:a-z0-9<>]+/i);
  if (!m) return null;
  return m[0].replace(/[.,;)>]+$/, "");
}

// Very rough title guess for PDFs with no DOI: the longest line near the top
// that looks like a title (used only as a fallback suggestion).
export function guessTitle(text: string): string {
  const lines = text
    .split(/\n|\s{4,}/)
    .map((l) => l.trim())
    .filter((l) => l.length > 20 && l.length < 200 && /[a-z]/.test(l));
  return lines[0] ?? "";
}
