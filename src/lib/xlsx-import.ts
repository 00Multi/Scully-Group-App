// One-time importer for the existing corrosion-review workbook.
//
// Layout assumed (from Corrosion_Literature_Review.xlsx):
//   Row 1  group headers: Paper | Physical | Chemical | Material | Electrochemical | Summary | Notes
//   Row 2+ a bare cell in column A = a material-category section header
//   Definition row (col A starts "Author Last Name…") is skipped
//   Paper rows: col A = "Author Year", group columns hold "Label: value" blocks
//
// Group cells are parsed by the "Label: value" convention and mapped to the
// live schema fields. Unmatched labels and ambiguous rows are logged rather
// than dropped. See PRD §6 — ~90% automatic, 10% manual cleanup.

import * as XLSX from "xlsx";
import type { FieldDef, FieldValue } from "./fields";
import type { ImportPaperInput } from "./db";

export interface ImportResult {
  papers: ImportPaperInput[];
  log: string[];
}

// Normalize a field label for fuzzy matching: lowercase, drop parenthetical
// units, strip non-alphanumerics.
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Spreadsheet abbreviations → schema field keys.
const SYNONYMS: Record<string, string> = {
  temp: "temp_c",
  time: "time_h",
  fs: "flow_static",
  stress: "stress",
  ortn: "orientation",
  orientation: "orientation",
  depth: "depth_um",
  ngba: "ngba",
  brach: "branch",
  branch: "branch",
  salt: "salt",
  atm: "atmosphere",
  atmosphere: "atmosphere",
  impur: "impurities",
  impurities: "impurities",
  crucible: "crucible",
  mcep: "mcep",
  ptlpol: "ptl_pol",
  alloy: "alloy",
  morph: "morphology",
  morphology: "morphology",
  gs: "grain_size_um",
  grainsize: "grain_size_um",
  cw: "cold_work",
  coldwork: "cold_work",
  fab: "fabrication",
  fabrication: "fabrication",
  polish: "polish",
};

function buildLabelMap(fields: FieldDef[]): Map<string, FieldDef> {
  const byKey = new Map(fields.map((f) => [f.key, f]));
  const map = new Map<string, FieldDef>();
  // Schema labels first (so renamed fields still match by their label)…
  for (const f of fields) map.set(norm(f.label), f);
  // …then known abbreviations (only if the target key exists in the schema).
  for (const [syn, key] of Object.entries(SYNONYMS)) {
    const f = byKey.get(key);
    if (f) map.set(syn, f);
  }
  return map;
}

function toFieldValue(raw: string, type: FieldDef["type"]): FieldValue {
  const t = raw.trim();
  if (t === "") return { value: null, state: "missing" };
  const low = t.toLowerCase();
  if (["n/a", "na", "n.a.", "not applicable", "-", "—"].includes(low))
    return { value: null, state: "na" };
  const needsCheck = /check\b|note:|paywall|unclear|ambig|\?$/i.test(t);
  let value: string | number = t;
  if (type === "number") {
    // Only coerce a CLEAN single number (optionally with a trailing unit like
    // "20 µm" or "700C"). Anything with a second number or separators
    // (e.g. "100, 200, 500" — multiple conditions) is kept as text so the
    // values are never silently mangled.
    const m = t.match(/^-?\d+(?:\.\d+)?/);
    const hasSecondNumber = /\d\s*[,;/xX×&]|\d[^0-9.]+\d/.test(t);
    if (m && !hasSecondNumber) {
      const rest = t.slice(m[0].length).trim();
      if (rest === "" || /^[a-zA-Zµ°%/]+$/.test(rest)) value = parseFloat(m[0]);
    }
  }
  const fv: FieldValue = { value, state: needsCheck ? "needs_check" : "filled" };
  if (needsCheck) fv.note = t;
  return fv;
}

// Parse a multi-field group cell ("Salt: X\n\nAtm: Y") into label→value pairs.
function parseGroupCell(cell: string): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const lines = String(cell).split(/\r?\n/);
  let cur: { label: string; value: string } | null = null;
  const labelRe = /^\s*([A-Za-z][\w.\/ ()%-]{0,30}?)\s*:\s*(.*)$/;
  for (const line of lines) {
    const m = line.match(labelRe);
    if (m) {
      if (cur) out.push(cur);
      cur = { label: m[1].trim(), value: m[2] };
    } else if (cur && line.trim() !== "") {
      cur.value += " " + line.trim();
    }
  }
  if (cur) out.push(cur);
  return out;
}

function parseAuthorYear(cellA: string): { author: string; year: number | null } {
  const text = String(cellA).replace(/\s+/g, " ").trim();
  const ym = text.match(/\b(1[89]\d{2}|20\d{2})\b/);
  const year = ym ? Number(ym[1]) : null;
  let author = ym ? text.slice(0, ym.index).trim() : text;
  author = author.replace(/[,;]+$/, "").trim();
  return { author: author || text, year };
}

export async function parseWorkbook(file: File, fields: FieldDef[]): Promise<ImportResult> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: string[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" });

  const labelMap = buildLabelMap(fields);
  // Column groups to scan for "Label: value" blocks (skip col A / Summary / Notes,
  // handled separately). Columns are 0-indexed: 1..4 are the four group columns.
  const groupCols = [1, 2, 3, 4];

  const papers: ImportPaperInput[] = [];
  const log: string[] = [];
  const unmatched = new Set<string>();
  let currentCategory: string | null = null;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const colA = String(row[0] ?? "").trim();
    const rest = row.slice(1).map((c) => String(c ?? "").trim());
    const restHasContent = rest.some((c) => c !== "");

    if (colA === "" && !restHasContent) continue; // blank row
    if (/^author last name/i.test(colA)) continue; // definition row

    // Category section header: lone value in column A.
    if (colA !== "" && !restHasContent && !/\b(1[89]\d{2}|20\d{2})\b/.test(colA) && !colA.includes(":")) {
      currentCategory = colA;
      log.push(`Row ${r + 1}: category section "${colA}".`);
      continue;
    }

    if (colA === "") continue; // stray content without a paper label

    // Paper row.
    const { author, year } = parseAuthorYear(colA);
    const values: Record<string, FieldValue> = {};
    let matchedAny = false;
    for (const col of groupCols) {
      const cell = String(row[col] ?? "");
      if (cell.trim() === "") continue;
      for (const { label, value } of parseGroupCell(cell)) {
        const f = labelMap.get(norm(label));
        if (!f) {
          unmatched.add(label.trim());
          continue;
        }
        values[f.key] = toFieldValue(value, f.type);
        matchedAny = true;
      }
      // Heuristic multi-condition hint.
      if (/\bvs\b|\/ /.test(cell) && /static|flow/i.test(cell)) {
        log.push(
          `Row ${r + 1} (${author} ${year ?? "?"}): a cell may describe multiple conditions — review after import.`,
        );
      }
    }

    const summary = String(row[5] ?? "").trim();
    const notes = String(row[6] ?? "").trim();

    papers.push({
      category_name: currentCategory,
      author,
      year,
      title: "",
      doi: "",
      notes,
      summary,
      experiments: [{ label: "Experiment 1", values }],
    });

    if (!matchedAny) {
      log.push(`Row ${r + 1} (${author} ${year ?? "?"}): no fields matched — imported with all-missing values.`);
    }
  }

  if (unmatched.size) {
    log.push(`Unmatched labels (not in the current schema): ${Array.from(unmatched).sort().join(", ")}.`);
  }
  log.unshift(`Parsed ${papers.length} paper row${papers.length === 1 ? "" : "s"} from "${file.name}".`);
  return { papers, log };
}
