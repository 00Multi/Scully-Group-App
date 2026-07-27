// Human-readable XLSX export reproducing the column-group layout, a printable
// PDF report grouped by alloy type, plus flat CSV and metadata-only exports.
// See PRD §F8.

import * as XLSX from "xlsx";
import type { Experiment, Paper } from "./db";
import type { FieldDef, FieldValue, GroupDef } from "./fields";

// A selectable paper-metadata column. `key` is either a top-level Paper column
// or a key inside paper.meta (see metaValue).
export interface MetaColumn {
  key: string;
  label: string;
}

// Canonical order of exportable metadata columns.
export const META_COLUMNS: MetaColumn[] = [
  { key: "citation_key", label: "Citation key" },
  { key: "author", label: "Author" },
  { key: "year", label: "Year" },
  { key: "title", label: "Title" },
  { key: "doi", label: "DOI" },
  { key: "journal", label: "Journal" },
  { key: "institution", label: "Institution" },
  { key: "volume", label: "Volume" },
  { key: "issue", label: "Issue" },
  { key: "pages", label: "Pages" },
  { key: "publisher", label: "Publisher" },
  { key: "url", label: "URL" },
  { key: "keywords", label: "Keywords" },
  { key: "abstract", label: "Abstract" },
  { key: "summary", label: "Summary" },
  { key: "notes", label: "Notes" },
];

export function metaValue(p: Paper, key: string): string {
  switch (key) {
    case "citation_key":
      return p.citation_key ?? "";
    case "author":
      return p.author ?? "";
    case "year":
      return p.year != null ? String(p.year) : "";
    case "title":
      return p.title ?? "";
    case "doi":
      return p.doi ?? "";
    case "journal":
      return p.journal ?? "";
    case "institution":
      return p.institution ?? "";
    case "abstract":
      return p.abstract ?? "";
    case "summary":
      return p.summary ?? "";
    case "notes":
      return p.notes ?? "";
    default: {
      const v = p.meta?.[key];
      if (v == null) return "";
      return Array.isArray(v) ? v.join("; ") : String(v);
    }
  }
}

export interface ExportData {
  groups: GroupDef[];
  fields: FieldDef[];
  papers: Paper[];
  experiments: Experiment[];
  // Selected paper-metadata columns, in display order.
  meta: MetaColumn[];
}

const ALLOY_TYPE_KEY = "alloy_type";

function alloyTypeOf(e: Experiment): string {
  const v = e.values?.[ALLOY_TYPE_KEY]?.value;
  return typeof v === "string" ? v.trim() : "";
}

function displayValue(v: FieldValue | undefined): string {
  if (!v) return "";
  if (v.state === "na") return "N/A";
  if (v.state === "missing") return "";
  if (v.state === "needs_check")
    return `${v.value ?? ""}${v.note ? ` (NOTE: ${v.note})` : " (?)"}`.trim();
  return v.value == null ? "" : String(v.value);
}

function fieldHeader(f: FieldDef): string {
  return f.unit ? `${f.label} (${f.unit})` : f.label;
}

// Experiment data-point fields, excluding alloy_type (emitted as its own column).
function orderedFieldsOf(data: ExportData): FieldDef[] {
  return data.groups.flatMap((g) =>
    data.fields.filter((f) => f.group === g.id && f.key !== ALLOY_TYPE_KEY),
  );
}

export function downloadXlsx(data: ExportData, filename: string) {
  const paperById = new Map(data.papers.map((p) => [p.id, p]));
  const orderedFields = orderedFieldsOf(data);

  // Row 1: group band. Row 2: column labels.
  const band: string[] = [];
  const labels: string[] = [];
  data.meta.forEach((m) => {
    band.push("Paper");
    labels.push(m.label);
  });
  ["Alloy type", "Experiment"].forEach((c) => {
    band.push("Paper");
    labels.push(c);
  });
  const groupLabelById = new Map(data.groups.map((g) => [g.id, g.label]));
  orderedFields.forEach((f) => {
    band.push(groupLabelById.get(f.group) ?? f.group);
    labels.push(fieldHeader(f));
  });

  const aoa: (string | number | null)[][] = [band, labels];

  for (const exp of data.experiments) {
    const p = paperById.get(exp.paper_id);
    if (!p) continue;
    const row: (string | number | null)[] = [
      ...data.meta.map((m) => metaValue(p, m.key)),
      alloyTypeOf(exp),
      exp.label,
    ];
    for (const f of orderedFields) row.push(displayValue(exp.values?.[f.key]));
    aoa.push(row);
  }

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Merge the group band across each contiguous band label.
  const merges: XLSX.Range[] = [];
  let start = 0;
  for (let c = 1; c <= band.length; c++) {
    if (c === band.length || band[c] !== band[start]) {
      if (c - 1 > start) merges.push({ s: { r: 0, c: start }, e: { r: 0, c: c - 1 } });
      start = c;
    }
  }
  ws["!merges"] = merges;
  ws["!cols"] = labels.map((l) => ({ wch: Math.min(Math.max(l.length + 2, 10), 40) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Corrosion review");
  XLSX.writeFile(wb, filename);
}

// ---------- CSV (flat, one row per experiment; round-trips the importer) ----------

function csvCell(s: unknown): string {
  const t = String(s ?? "");
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function buildCsv(data: ExportData): string {
  const paperById = new Map(data.papers.map((p) => [p.id, p]));
  const orderedFields = orderedFieldsOf(data);

  const header = [
    ...data.meta.map((m) => m.label),
    "Alloy type",
    "Experiment",
    ...orderedFields.map(fieldHeader),
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const exp of data.experiments) {
    const p = paperById.get(exp.paper_id);
    if (!p) continue;
    const row: unknown[] = [
      ...data.meta.map((m) => metaValue(p, m.key)),
      alloyTypeOf(exp),
      exp.label,
      ...orderedFields.map((f) => displayValue(exp.values?.[f.key])),
    ];
    lines.push(row.map(csvCell).join(","));
  }
  return lines.join("\r\n");
}

// ---------- Metadata-only exports (one row per paper) ----------

export function buildPapersCsv(papers: Paper[], meta: MetaColumn[]): string {
  const header = meta.map((m) => m.label);
  const lines = [header.map(csvCell).join(",")];
  for (const p of papers) {
    lines.push(meta.map((m) => csvCell(metaValue(p, m.key))).join(","));
  }
  return lines.join("\r\n");
}

export function downloadPapersXlsx(papers: Paper[], meta: MetaColumn[], filename: string) {
  const aoa: (string | number)[][] = [meta.map((m) => m.label)];
  for (const p of papers) aoa.push(meta.map((m) => metaValue(p, m.key)));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = meta.map((m) => ({ wch: Math.min(Math.max(m.label.length + 2, 12), 50) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Paper metadata");
  XLSX.writeFile(wb, filename);
}

// A typed paper-metadata record: year stays numeric, keywords stays an array.
export function paperMetaRecord(p: Paper, meta: MetaColumn[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of meta) {
    if (m.key === "year") out.year = p.year;
    else if (m.key === "keywords")
      out.keywords = Array.isArray(p.meta?.keywords) ? p.meta.keywords : [];
    else out[m.key] = metaValue(p, m.key);
  }
  return out;
}

// ---------- Printable PDF report ----------

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

export function buildReportHtml(data: ExportData): string {
  const paperById = new Map(data.papers.map((p) => [p.id, p]));
  const orderedFields = orderedFieldsOf(data);

  // Group experiments by their alloy type. One experiment belongs to exactly one
  // group (a paper's experiments can span several alloy types).
  const byAlloy = new Map<string, Experiment[]>();
  for (const e of data.experiments) {
    const key = alloyTypeOf(e) || "No alloy type";
    if (!byAlloy.has(key)) byAlloy.set(key, []);
    byAlloy.get(key)!.push(e);
  }
  const alloyKeys = Array.from(byAlloy.keys()).sort((a, b) => {
    if (a === "No alloy type") return 1;
    if (b === "No alloy type") return -1;
    return a.localeCompare(b);
  });

  let body = "";
  for (const alloy of alloyKeys) {
    const exps = byAlloy.get(alloy)!;
    // Preserve paper order, then experiment position, within each alloy group.
    const paperOrder = new Map(data.papers.map((p, i) => [p.id, i]));
    exps.sort(
      (a, b) =>
        (paperOrder.get(a.paper_id) ?? 0) - (paperOrder.get(b.paper_id) ?? 0) ||
        a.position - b.position,
    );
    body += `<h2>${esc(alloy)}</h2>`;
    let lastPaperId: string | null = null;
    for (const e of exps) {
      const p = paperById.get(e.paper_id);
      if (!p) continue;
      if (p.id !== lastPaperId) {
        if (lastPaperId !== null) body += `</div>`;
        body += `<div class="paper"><h3>${esc(p.citation_key || p.author || "Untitled")}</h3>`;
        const meta = [p.title, p.journal, p.institution, p.year, p.doi]
          .filter(Boolean)
          .map(esc)
          .join(" · ");
        if (meta) body += `<p class="meta">${meta}</p>`;
        if (p.summary) body += `<p class="summary">${esc(p.summary)}</p>`;
        lastPaperId = p.id;
      }
      body += `<table><caption>${esc(e.label)}</caption><tbody>`;
      for (const g of data.groups) {
        const fs = orderedFields.filter((f) => f.group === g.id);
        const cells = fs
          .map((f) => {
            const fv = e.values?.[f.key];
            if (f.type === "image") {
              const src =
                fv && fv.state === "filled" && typeof fv.value === "string" ? fv.value : "";
              return src
                ? `<tr><th>${esc(f.label)}</th><td><img src="${esc(src)}" style="max-height:200px;max-width:100%"/></td></tr>`
                : "";
            }
            const v = displayValue(fv);
            return v ? `<tr><th>${esc(f.label)}</th><td>${esc(v)}</td></tr>` : "";
          })
          .join("");
        if (cells) body += `<tr class="group"><td colspan="2">${esc(g.label)}</td></tr>${cells}`;
      }
      body += `</tbody></table>`;
    }
    if (lastPaperId !== null) body += `</div>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"><title>Corrosion Literature Review — Report</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: Georgia, "Times New Roman", serif; color: #1a1a1a; margin: 2rem; line-height: 1.5; }
  h1 { font-size: 24pt; font-style: italic; margin: 0 0 0.25rem; }
  h2 { font-size: 15pt; border-bottom: 2px solid #b5651d; color: #b5651d; margin: 1.75rem 0 0.75rem; page-break-after: avoid; }
  h3 { font-size: 12pt; font-style: italic; margin: 0 0 0.15rem; }
  .paper { margin: 0 0 1rem; page-break-inside: avoid; }
  .meta { font-size: 9pt; color: #555; margin: 0 0 0.4rem; font-family: "Courier New", monospace; }
  .summary { font-size: 10pt; margin: 0 0 0.5rem; }
  table { border-collapse: collapse; width: 100%; margin: 0 0 0.6rem; font-family: Arial, sans-serif; }
  caption { text-align: left; font-size: 9pt; font-style: italic; color: #666; padding: 0.2rem 0; }
  td, th { border: 1px solid #ddd; padding: 2px 6px; font-size: 9pt; text-align: left; vertical-align: top; }
  th { width: 12rem; font-weight: 600; background: #faf7f2; }
  tr.group td { background: #f0ebe2; font-weight: 700; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.08em; color: #b5651d; }
  .generated { font-size: 8pt; color: #999; margin-top: 0.25rem; }
  @media print { body { margin: 0.75in; } }
</style></head><body>
<h1>Corrosion Literature Review</h1>
<p class="generated">Report grouped by alloy type.</p>
${body || "<p>No records to report.</p>"}
</body></html>`;
}

export function openPrintReport(data: ExportData) {
  const html = buildReportHtml(data);
  const w = window.open("", "_blank");
  if (!w) {
    alert("Please allow pop-ups to open the printable report.");
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Give the new document a tick to lay out before invoking print.
  w.onload = () => setTimeout(() => w.print(), 300);
}
