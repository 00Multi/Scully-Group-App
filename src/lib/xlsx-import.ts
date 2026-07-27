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
import type { FieldDef, FieldState, FieldValue } from "./fields";
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
const SPLITTABLE_KEYS = ["flow_static", "crucible", "atmosphere"];
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
  // The old "material category" column is now the per-experiment alloy type.
  category: "alloy_type",
  materialcategory: "alloy_type",
  alloytype: "alloy_type",
  alloysystem: "alloy_type",
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
      log.push(`Row ${r + 1}: alloy-type section "${colA}".`);
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
      author,
      year,
      title: "",
      doi: "",
      notes,
      summary,
      experiments: experiments.map((e, i) => {
        const values = { ...e.values };
        // The category section header becomes the per-experiment alloy type,
        // unless a row cell already provided one.
        if (currentCategory && !values.alloy_type) {
          values.alloy_type = { value: currentCategory, state: "filled" };
        }
        return {
          label: e.label || `Experiment ${i + 1}`,
          values,
        };
      }),
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

// ---------- CSV / JSON / JSONL import ----------
//
// These read the app's own export shapes (so exports round-trip), plus generic
// flat CSVs. A CSV is one row per experiment with paper columns + one column
// per data point. JSON is a { schema, records } document; JSONL is a schema
// header line followed by one record object per line.

function asObj(x: unknown): Record<string, unknown> {
  return x && typeof x === "object" ? (x as Record<string, unknown>) : {};
}
function asStr(x: unknown): string {
  return x == null ? "" : String(x);
}
function asNum(x: unknown): number | null {
  if (x == null || x === "") return null;
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}
function asState(x: unknown): FieldState {
  return x === "filled" || x === "missing" || x === "na" || x === "needs_check" ? x : "filled";
}

// Minimal RFC-4180 CSV parser: handles quoted fields, escaped quotes, and CRLF.
function parseCsvText(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(cur);
      cur = "";
    } else if (ch === "\r") {
      /* ignore */
    } else if (ch === "\n") {
      row.push(cur);
      rows.push(row);
      row = [];
      cur = "";
    } else cur += ch;
  }
  if (cur !== "" || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

// Normalized CSV header names that map to paper-level columns.
// Note: "category" / "alloy type" are intentionally NOT paper columns — they
// map to the per-experiment `alloy_type` field via SYNONYMS.
const PAPER_COL: Record<string, string> = {
  author: "author",
  year: "year",
  title: "title",
  doi: "doi",
  journal: "journal",
  institution: "institution",
  abstract: "abstract",
  experiment: "experiment",
  label: "experiment",
  summary: "summary",
  notes: "notes",
  // Recognized bibliographic columns we don't map to a dedicated field — listed
  // here so they're treated as paper metadata and NOT turned into new fields.
  citationkey: "citation_key",
  volume: "volume",
  issue: "issue",
  pages: "pages",
  publisher: "publisher",
  url: "url",
  keywords: "keywords",
};

function parseCsv(text: string, fileName: string, fields: FieldDef[]): ImportResult {
  const rows = parseCsvText(text).filter((r) => r.some((c) => c.trim() !== ""));
  const log: string[] = [];
  const newFields: FieldDef[] = [];
  if (rows.length < 2) {
    return { papers: [], newFields, log: [`No data rows found in "${fileName}".`] };
  }
  const header = rows[0].map((h) => h.trim());
  const labelMap = buildLabelMap(fields);
  const takenKeys = new Set(fields.map((f) => f.key));

  type Col = { kind: "paper"; key: string } | { kind: "field"; field: FieldDef } | { kind: "skip" };
  const cols: Col[] = header.map((h) => {
    const n = norm(h);
    if (PAPER_COL[n]) return { kind: "paper", key: PAPER_COL[n] };
    if (!n) return { kind: "skip" };
    let f = labelMap.get(n);
    if (!f) {
      let key = slugify(h) || "field";
      let i = 2;
      while (takenKeys.has(key)) key = `${slugify(h) || "field"}_${i++}`;
      takenKeys.add(key);
      f = {
        key,
        label: h,
        group: "physical",
        type: "text",
        definition: `Imported from CSV column "${h}".`,
      };
      newFields.push(f);
      labelMap.set(n, f);
    }
    return { kind: "field", field: f };
  });

  const paperIdx = (key: string) => cols.findIndex((c) => c.kind === "paper" && c.key === key);
  const idx = {
    author: paperIdx("author"),
    year: paperIdx("year"),
    title: paperIdx("title"),
    doi: paperIdx("doi"),
    journal: paperIdx("journal"),
    institution: paperIdx("institution"),
    abstract: paperIdx("abstract"),
    notes: paperIdx("notes"),
    summary: paperIdx("summary"),
    experiment: paperIdx("experiment"),
  };
  const cell = (row: string[], i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");

  const byPaper = new Map<string, ImportPaperInput>();
  const order: string[] = [];
  let expCount = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const author = cell(row, idx.author);
    const title = cell(row, idx.title);
    if (!author && !title) continue;
    const year = asNum(cell(row, idx.year));
    // A paper may now span several alloy types, so the alloy type is NOT part of
    // the paper key — experiments with different alloy types roll up together.
    const pk = `${author}|${year ?? ""}|${title}`;
    let paper = byPaper.get(pk);
    if (!paper) {
      paper = {
        author,
        year,
        title,
        doi: cell(row, idx.doi),
        journal: cell(row, idx.journal),
        institution: cell(row, idx.institution),
        abstract: cell(row, idx.abstract),
        notes: cell(row, idx.notes),
        summary: cell(row, idx.summary),
        experiments: [],
      };
      byPaper.set(pk, paper);
      order.push(pk);
    }
    const values: Record<string, FieldValue> = {};
    cols.forEach((c, i) => {
      if (c.kind !== "field") return;
      const raw = (row[i] ?? "").trim();
      if (raw !== "") values[c.field.key] = toFieldValue(raw, c.field.type);
    });
    const label = cell(row, idx.experiment) || `Experiment ${paper.experiments.length + 1}`;
    paper.experiments.push({ label, values });
    expCount++;
  }

  const papers = order.map((k) => byPaper.get(k)!);
  log.push(
    `Parsed ${papers.length} paper(s) and ${expCount} experiment row(s) from CSV "${fileName}".`,
  );
  if (newFields.length) {
    log.push(
      `Created ${newFields.length} new data point(s) from unmatched columns: ${newFields.map((f) => f.label).join(", ")}.`,
    );
  }
  return { papers, newFields, log };
}

function parseJson(text: string, fileName: string, fields: FieldDef[]): ImportResult {
  const log: string[] = [];
  const newFields: FieldDef[] = [];
  const trimmed = text.trim();

  let records: unknown[] = [];
  let schemaFields: unknown[] | null = null;

  let parsedWhole: unknown;
  try {
    parsedWhole = JSON.parse(trimmed);
  } catch {
    parsedWhole = undefined;
  }
  if (parsedWhole !== undefined) {
    if (Array.isArray(parsedWhole)) records = parsedWhole;
    else {
      const o = asObj(parsedWhole);
      records = Array.isArray(o.records) ? (o.records as unknown[]) : [];
      const sf = asObj(o.schema).fields;
      if (Array.isArray(sf)) schemaFields = sf;
    }
  } else {
    // JSONL: one JSON object per line; a $meta:"schema" line is the header.
    for (const line of trimmed.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      let obj: unknown;
      try {
        obj = JSON.parse(t);
      } catch {
        continue;
      }
      const o = asObj(obj);
      if (o.$meta === "schema") {
        if (Array.isArray(o.fields)) schemaFields = o.fields as unknown[];
        continue;
      }
      records.push(obj);
    }
  }

  const takenKeys = new Set(fields.map((f) => f.key));
  const registerField = (key: string, def: Record<string, unknown>) => {
    if (takenKeys.has(key)) return;
    takenKeys.add(key);
    const type = def.type;
    const validType =
      type === "number" || type === "select" || type === "image"
        ? type
        : ("text" as FieldDef["type"]);
    const f: FieldDef = {
      key,
      label: asStr(def.label) || key,
      group: asStr(def.group) || "physical",
      type: validType,
      definition: asStr(def.definition),
      ...(def.unit ? { unit: asStr(def.unit) } : {}),
      ...(Array.isArray(def.options) && def.options.length
        ? { options: (def.options as unknown[]).map(asStr) }
        : {}),
    };
    newFields.push(f);
  };
  if (schemaFields) {
    for (const sf of schemaFields) {
      const o = asObj(sf);
      if (o.key) registerField(asStr(o.key), o);
    }
  }

  const byPaper = new Map<string, ImportPaperInput>();
  const order: string[] = [];
  let expCount = 0;
  for (const rec of records) {
    const o = asObj(rec);
    const p = asObj(o.paper);
    const author = asStr(p.author);
    const title = asStr(p.title);
    const year = asNum(p.year);
    const pk = asStr(p.citation_key || p.id) || `${author}|${year ?? ""}|${title}`;
    let paper = byPaper.get(pk);
    if (!paper) {
      paper = {
        author,
        year,
        title,
        doi: asStr(p.doi),
        journal: asStr(p.journal),
        institution: asStr(p.institution),
        abstract: asStr(p.abstract),
        notes: asStr(p.notes),
        summary: asStr(p.summary || p.abstract),
        experiments: [],
      };
      byPaper.set(pk, paper);
      order.push(pk);
    }
    const values: Record<string, FieldValue> = {};
    // Alloy type may arrive as a top-level record field, or on legacy exports as
    // the paper's `material_category`. Either seeds the experiment's alloy_type
    // (an explicit `fields.alloy_type` below still wins).
    const alloyType = asStr(o.alloy_type || p.material_category).trim();
    if (alloyType) values.alloy_type = { value: alloyType, state: "filled" };
    const flds = asObj(o.fields);
    for (const [key, raw] of Object.entries(flds)) {
      if (!takenKeys.has(key)) registerField(key, { label: key });
      if (raw && typeof raw === "object" && "state" in (raw as object)) {
        const ro = asObj(raw);
        const state = asState(ro.state);
        const fv: FieldValue = {
          value: (ro.value as string | number | null) ?? null,
          state,
        };
        if (ro.note) fv.note = asStr(ro.note);
        values[key] = fv;
      } else {
        values[key] = toFieldValue(asStr(raw), "text");
      }
    }
    paper.experiments.push({
      label: asStr(o.label) || `Experiment ${paper.experiments.length + 1}`,
      values,
    });
    expCount++;
  }
  for (const paper of byPaper.values()) {
    if (paper.experiments.length === 0)
      paper.experiments.push({ label: "Experiment 1", values: {} });
  }

  const papers = order.map((k) => byPaper.get(k)!);
  log.push(`Parsed ${papers.length} paper(s) and ${expCount} experiment(s) from "${fileName}".`);
  if (newFields.length) {
    log.push(`Registered ${newFields.length} data point(s) from the file's schema/fields.`);
  }
  if (!records.length) {
    log.push("No experiment records found — expected the app's JSON/JSONL export shape.");
  }
  return { papers, newFields, log };
}

// Entry point: dispatch by file extension. Supports .xlsx/.xls, .csv, .json,
// and .jsonl/.ndjson.
export async function parseImportFile(file: File, fields: FieldDef[]): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".csv")) return parseCsv(await file.text(), file.name, fields);
  if (name.endsWith(".jsonl") || name.endsWith(".ndjson") || name.endsWith(".json")) {
    return parseJson(await file.text(), file.name, fields);
  }
  return parseWorkbook(file, fields);
}
