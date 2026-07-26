// Human-readable XLSX export reproducing the four-column-group layout, and a
// printable PDF report grouped by material category. See PRD §F8.

import * as XLSX from "xlsx";
import type { Category, Experiment, Paper } from "./db";
import type { FieldDef, FieldValue, GroupDef } from "./fields";

export interface ExportData {
  groups: GroupDef[];
  fields: FieldDef[];
  papers: Paper[];
  experiments: Experiment[];
  categories: Category[];
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

export function downloadXlsx(data: ExportData, filename: string) {
  const catById = new Map(data.categories.map((c) => [c.id, c.name]));
  const paperById = new Map(data.papers.map((p) => [p.id, p]));

  const paperCols = ["Author", "Year", "Category", "Title", "DOI", "Journal", "Experiment"];
  const orderedFields = data.groups.flatMap((g) => data.fields.filter((f) => f.group === g.id));
  const tailCols = ["Summary", "Notes"];

  // Row 1: group band. Row 2: column labels.
  const band: string[] = [];
  const labels: string[] = [];
  paperCols.forEach((c) => {
    band.push("Paper");
    labels.push(c);
  });
  const groupLabelById = new Map(data.groups.map((g) => [g.id, g.label]));
  orderedFields.forEach((f) => {
    band.push(groupLabelById.get(f.group) ?? f.group);
    labels.push(fieldHeader(f));
  });
  tailCols.forEach((c) => {
    band.push(c);
    labels.push(c);
  });

  const aoa: (string | number | null)[][] = [band, labels];

  for (const exp of data.experiments) {
    const p = paperById.get(exp.paper_id);
    if (!p) continue;
    const row: (string | number | null)[] = [
      p.author,
      p.year ?? "",
      (p.category_id && catById.get(p.category_id)) || "",
      p.title,
      p.doi,
      p.journal ?? "",
      exp.label,
    ];
    for (const f of orderedFields) row.push(displayValue(exp.values?.[f.key]));
    row.push(p.summary ?? "", p.notes ?? "");
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
  const catById = new Map(data.categories.map((c) => [c.id, c.name]));
  const paperById = new Map(data.papers.map((p) => [p.id, p]));
  const orderedFields = data.groups.flatMap((g) => data.fields.filter((f) => f.group === g.id));

  const header = [
    "Author",
    "Year",
    "Category",
    "Title",
    "DOI",
    "Journal",
    "Experiment",
    ...orderedFields.map(fieldHeader),
    "Summary",
    "Notes",
  ];
  const lines = [header.map(csvCell).join(",")];
  for (const exp of data.experiments) {
    const p = paperById.get(exp.paper_id);
    if (!p) continue;
    const row: unknown[] = [
      p.author,
      p.year ?? "",
      (p.category_id && catById.get(p.category_id)) || "",
      p.title,
      p.doi,
      p.journal ?? "",
      exp.label,
      ...orderedFields.map((f) => displayValue(exp.values?.[f.key])),
      p.summary ?? "",
      p.notes ?? "",
    ];
    lines.push(row.map(csvCell).join(","));
  }
  return lines.join("\r\n");
}

// ---------- Printable PDF report ----------

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
}

export function buildReportHtml(data: ExportData): string {
  const paperById = new Map(data.papers.map((p) => [p.id, p]));
  const expsByPaper = new Map<string, Experiment[]>();
  for (const e of data.experiments) {
    if (!expsByPaper.has(e.paper_id)) expsByPaper.set(e.paper_id, []);
    expsByPaper.get(e.paper_id)!.push(e);
  }
  const orderedFields = data.groups.flatMap((g) => data.fields.filter((f) => f.group === g.id));

  const cats = [...data.categories, { id: "__uncat__", name: "Uncategorized", sort_order: 9999 }];

  let body = "";
  for (const cat of cats) {
    const papers = data.papers.filter((p) =>
      cat.id === "__uncat__" ? !p.category_id : p.category_id === cat.id,
    );
    if (papers.length === 0) continue;
    body += `<h2>${esc(cat.name)}</h2>`;
    for (const p of papers) {
      const exps = (expsByPaper.get(p.id) ?? []).sort((a, b) => a.position - b.position);
      body += `<div class="paper"><h3>${esc(p.citation_key || p.author || "Untitled")}</h3>`;
      const meta = [p.title, p.journal, p.year, p.doi].filter(Boolean).map(esc).join(" · ");
      if (meta) body += `<p class="meta">${meta}</p>`;
      if (p.summary) body += `<p class="summary">${esc(p.summary)}</p>`;
      for (const e of exps) {
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
      body += `</div>`;
    }
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
<p class="generated">Report grouped by material category.</p>
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
