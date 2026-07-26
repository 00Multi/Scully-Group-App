// One-time importer for the existing corrosion-review workbook.
//
// Layout assumed (from Corrosion_Literature_Review.xlsx):
//   Row 1  group headers: Paper | Physical | Chemical | Material | Electrochemical | Summary | Notes
//   Row 2+ a bare cell in column A = a material-category section header
//   Definition row (col A starts "Author Last Name…") is skipped
//   Paper rows: col A = "Author Year", group columns hold "Label: value" blocks
//
// Group cells are parsed by the "Label: value" convention and mapped to the
// live schema fields. Unmatched labels become NEW schema fields (created as
// Missing everywhere else) rather than being dropped, and cells that describe
// several conditions are split into separate experiment rows. Ambiguous rows
// are logged. See PRD §6 — ~90% automatic, 10% manual cleanup.

import * as XLSX from "xlsx";
import type { FieldDef, FieldValue } from "./fields";
import type { ImportPaperInput } from "./db";

export interface ImportResult {
  papers: ImportPaperInput[];
  // Fields discovered in the spreadsheet that were not in the schema. The
  // import page registers these so the imported values are visible/editable.
  newFields: FieldDef[];
  log: string[];
}

// Fields whose cell may pack several conditions ("static vs flowing",
// "Ni / graphite") that should become separate experiment rows.
const SPLITTABLE_KEYS = ["flow_static", "test_type", "crucible", "atmosphere"];
// Cap the combinations from one row so a messy cell can't explode into dozens
// of experiments; beyond this we keep a single row and log it.
const MAX_SPLIT_ROWS = 8;

// Column index (0-based) → schema group for fields we have to create.
const COL_GROUP: Record<number, string> = {
  1: "physical",
  2: "chemical",
  3: "material",
  4: "chemical",
};

// Normalize a field label for fuzzy matching: lowercase, drop parenthetical
// units, strip non-alphanumerics.
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
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
  testtype: "test_type",
  test: "test_type",
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
  const labelRe = /^\s*([A-Za-z][\w./ ()%-]{0,30}?)\s*:\s*(.*)$/;
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

// Split a raw condition value into distinct tokens, or null if it doesn't look
// like several conditions. Conservative: 2–4 short tokens only.
function splitConditionTokens(raw: string): string[] | null {
  const parts = raw
    .split(/\s*(?:\bvs\.?\b|\band\b|[/,&;])\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (
    parts.length >= 2 &&
    parts.length <= 4 &&
    parts.every((p) => p.length > 0 && p.length <= 24)
  ) {
    return parts;
  }
  return null;
}

interface ParsedField {
  field: FieldDef;
  raw: string;
}

// Turn a row's parsed fields into one or more experiments, splitting the
// cartesian product of any multi-condition fields. Returns the experiments and
// a short note describing the split (or null).
function buildExperiments(
  parsed: ParsedField[],
  rowLabel: string,
): { experiments: { label: string; values: Record<string, FieldValue> }[]; note: string | null } {
  // Base values (single-condition fields).
  const base: Record<string, FieldValue> = {};
  const splits: { key: string; label: string; tokens: string[] }[] = [];

  for (const { field, raw } of parsed) {
    const tokens = SPLITTABLE_KEYS.includes(field.key) ? splitConditionTokens(raw) : null;
    if (tokens && tokens.length > 1) {
      splits.push({ key: field.key, label: field.label, tokens });
    } else {
      base[field.key] = toFieldValue(raw, field.type);
    }
  }

  if (splits.length === 0) {
    return { experiments: [{ label: "Experiment 1", values: base }], note: null };
  }

  // Cartesian product across all splittable fields.
  let combos: { key: string; token: string }[][] = [[]];
  for (const s of splits) {
    const next: { key: string; token: string }[][] = [];
    for (const combo of combos) {
      for (const token of s.tokens) next.push([...combo, { key: s.key, token }]);
    }
    combos = next;
  }

  if (combos.length > MAX_SPLIT_ROWS) {
    // Too many combinations — keep one row with the raw values, flag for review.
    for (const s of splits) base[s.key] = toFieldValue(s.tokens.join(" / "), "text");
    return {
      experiments: [{ label: "Experiment 1", values: base }],
      note: `${rowLabel}: cell(s) describe ${combos.length} condition combinations (${splits
        .map((s) => s.label)
        .join(", ")}) — left as one row to review by hand.`,
    };
  }

  const experiments = combos.map((combo, i) => {
    const values: Record<string, FieldValue> = { ...base };
    for (const { key, token } of combo) values[key] = toFieldValue(token, "text");
    const label = combo.map((c) => c.token).join(" / ") || `Experiment ${i + 1}`;
    return { label, values };
  });

  return {
    experiments,
    note: `${rowLabel}: split into ${experiments.length} experiments by ${splits
      .map((s) => s.label)
      .join(" × ")}.`,
  };
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
  // Unmatched labels become new fields. Track by normalized label so repeats
  // across rows reuse the same generated field.
  const newFields: FieldDef[] = [];
  const newByNorm = new Map<string, FieldDef>();
  const takenKeys = new Set(fields.map((f) => f.key));

  const ensureField = (label: string, col: number): FieldDef => {
    const n = norm(label);
    const existing = newByNorm.get(n);
    if (existing) return existing;
    let key = slugify(label) || "field";
    let i = 2;
    while (takenKeys.has(key)) key = `${slugify(label) || "field"}_${i++}`;
    takenKeys.add(key);
    const field: FieldDef = {
      key,
      label: label.trim(),
      group: COL_GROUP[col] ?? "chemical",
      type: "text",
      definition: `Imported from the spreadsheet (column ${col}). Edit this definition in the Dashboard.`,
    };
    newByNorm.set(n, field);
    newFields.push(field);
    labelMap.set(n, field);
    return field;
  };

  let currentCategory: string | null = null;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r] ?? [];
    const colA = String(row[0] ?? "").trim();
    const rest = row.slice(1).map((c) => String(c ?? "").trim());
    const restHasContent = rest.some((c) => c !== "");

    if (colA === "" && !restHasContent) continue; // blank row
    if (/^author last name/i.test(colA)) continue; // definition row

    // Category section header: lone value in column A.
    if (
      colA !== "" &&
      !restHasContent &&
      !/\b(1[89]\d{2}|20\d{2})\b/.test(colA) &&
      !colA.includes(":")
    ) {
      currentCategory = colA;
      log.push(`Row ${r + 1}: category section "${colA}".`);
      continue;
    }

    if (colA === "") continue; // stray content without a paper label

    // Paper row.
    const { author, year } = parseAuthorYear(colA);
    const rowLabel = `Row ${r + 1} (${author} ${year ?? "?"})`;
    const parsed: ParsedField[] = [];
    let matchedAny = false;

    for (const col of groupCols) {
      const cell = String(row[col] ?? "");
      if (cell.trim() === "") continue;
      for (const { label, value } of parseGroupCell(cell)) {
        let f = labelMap.get(norm(label));
        if (!f) {
          // Create a new schema field so the value is kept, not dropped.
          f = ensureField(label, col);
        }
        parsed.push({ field: f, raw: value });
        matchedAny = true;
      }
    }

    const { experiments, note } = buildExperiments(parsed, rowLabel);
    if (note) log.push(note);

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
      experiments: experiments.map((e, i) => ({
        label: e.label || `Experiment ${i + 1}`,
        values: e.values,
      })),
    });

    if (!matchedAny) {
      log.push(`${rowLabel}: no fields matched — imported with all-missing values.`);
    }
  }

  if (newFields.length) {
    log.push(
      `Created ${newFields.length} new data point${newFields.length === 1 ? "" : "s"} from unmatched labels: ${newFields
        .map((f) => f.label)
        .sort()
        .join(", ")}. They are Missing on every other experiment until filled.`,
    );
  }
  log.unshift(
    `Parsed ${papers.length} paper row${papers.length === 1 ? "" : "s"} from "${file.name}".`,
  );
  return { papers, newFields, log };
}
