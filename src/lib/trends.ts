// Trend/distribution helpers shared by the dashboard and the full Trends page.
// Every schema data point and several paper-metadata fields can be reduced to a
// list of {label, count} buckets and drawn as a bar chart.

import type { Experiment, Paper } from "./db";
import type { FieldDef, GroupDef } from "./fields";
import { readInstitutionRefs, type Institution } from "./ror";

export interface Bucket {
  label: string;
  count: number;
}

export const CHART_COLORS = [
  "#b87333", // copper
  "#8c9db5",
  "#6b8f71",
  "#c2a36b",
  "#9a7aa0",
  "#7a9bb0",
  "#b0846b",
  "#7f8ca3",
  "#a0a0a0",
];

export interface TrendSpec {
  id: string;
  title: string;
  data: Bucket[];
}

export interface TrendSection {
  id: string;
  label: string;
  trends: TrendSpec[];
}

function topWithOther(entries: [string, number][], topN: number): Bucket[] {
  const sorted = [...entries].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, topN).map(([label, count]) => ({ label, count }));
  const rest = sorted.slice(topN).reduce((s, [, c]) => s + c, 0);
  if (rest > 0) top.push({ label: "Other", count: rest });
  return top;
}

// Count filled / needs-check values of an experiment field, grouping the long
// tail into "Other" so the chart stays legible.
export function categoricalDistribution(
  experiments: Experiment[],
  key: string,
  topN = 8,
): Bucket[] {
  const m = new Map<string, number>();
  for (const e of experiments) {
    const v = e.values?.[key];
    if (!v || (v.state !== "filled" && v.state !== "needs_check")) continue;
    if (v.value == null || String(v.value).trim() === "") continue;
    const label = String(v.value).trim();
    m.set(label, (m.get(label) ?? 0) + 1);
  }
  return topWithOther(Array.from(m.entries()), topN);
}

function niceStep(range: number, targetBins: number): number {
  if (range <= 0) return 1;
  const raw = range / targetBins;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * mag;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

// Histogram of a numeric experiment field, auto-choosing a readable bin size.
export function numericHistogram(experiments: Experiment[], key: string, targetBins = 8): Bucket[] {
  const nums: number[] = [];
  for (const e of experiments) {
    const v = e.values?.[key];
    if (!v || v.state !== "filled") continue;
    const n = typeof v.value === "number" ? v.value : Number(v.value);
    if (Number.isFinite(n)) nums.push(n);
  }
  if (nums.length === 0) return [];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === max) return [{ label: fmt(min), count: nums.length }];
  const step = niceStep(max - min, targetBins);
  const m = new Map<number, number>();
  for (const n of nums) {
    const bin = Math.floor(n / step) * step;
    m.set(bin, (m.get(bin) ?? 0) + 1);
  }
  return Array.from(m.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([bin, count]) => ({ label: `${fmt(bin)}–${fmt(bin + step)}`, count }));
}

// Distribution of a paper-metadata string, one count per paper. `split` breaks a
// multi-valued cell (e.g. "UVA; ORNL") into separate labels.
export function paperFieldDistribution(
  papers: Paper[],
  accessor: (p: Paper) => string,
  opts: { topN?: number; split?: string } = {},
): Bucket[] {
  const { topN = 8, split } = opts;
  const m = new Map<string, number>();
  for (const p of papers) {
    const raw = (accessor(p) ?? "").trim();
    if (!raw) continue;
    const parts = split
      ? raw
          .split(split)
          .map((s) => s.trim())
          .filter(Boolean)
      : [raw];
    for (const label of parts) m.set(label, (m.get(label) ?? 0) + 1);
  }
  return topWithOther(Array.from(m.entries()), topN);
}

export interface InstitutionCount extends Institution {
  count: number;
}

// Papers per institution, enriched with the best country/domain seen for that
// name across the dataset (so a flag/logo can be shown).
export function institutionCounts(papers: Paper[]): InstitutionCount[] {
  const m = new Map<string, InstitutionCount>();
  for (const p of papers) {
    for (const inst of readInstitutionRefs(p)) {
      const key = inst.name.toLowerCase();
      const prev = m.get(key);
      if (prev) {
        prev.count++;
        if (!prev.domain && inst.domain) prev.domain = inst.domain;
        if (!prev.countryCode && inst.countryCode) {
          prev.countryCode = inst.countryCode;
          prev.countryName = inst.countryName;
        }
      } else {
        m.set(key, { ...inst, count: 1 });
      }
    }
  }
  return Array.from(m.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export function papersPerYear(papers: Paper[]): Bucket[] {
  const m = new Map<number, number>();
  for (const p of papers) if (p.year != null) m.set(p.year, (m.get(p.year) ?? 0) + 1);
  return Array.from(m.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([year, count]) => ({ label: String(year), count }));
}

function keywordDistribution(papers: Paper[], topN = 8): Bucket[] {
  const m = new Map<string, number>();
  for (const p of papers) {
    const kw = p.meta?.keywords;
    if (!Array.isArray(kw)) continue;
    for (const k of kw) {
      const label = String(k).trim();
      if (label) m.set(label, (m.get(label) ?? 0) + 1);
    }
  }
  return topWithOther(Array.from(m.entries()), topN);
}

const fieldTitle = (f: FieldDef) => (f.unit ? `${f.label} (${f.unit})` : f.label);

// How many papers tagged each data point as a "variable studied" (the
// per-paper Variables multi-select). Unknown keys are shown verbatim.
export function variablesDistribution(papers: Paper[], fieldDefs: FieldDef[], topN = 12): Bucket[] {
  const labelByKey = new Map(fieldDefs.map((f) => [f.key, fieldTitle(f)]));
  const m = new Map<string, number>();
  for (const p of papers) {
    for (const key of p.variables ?? []) {
      const label = labelByKey.get(key) ?? key;
      m.set(label, (m.get(label) ?? 0) + 1);
    }
  }
  return topWithOther(Array.from(m.entries()), topN);
}

// Every chartable dimension, grouped into a Metadata section plus one section
// per schema column. Trends with no data are dropped.
export function buildTrendSections(
  papers: Paper[],
  experiments: Experiment[],
  fieldDefs: FieldDef[],
  groups: GroupDef[],
): TrendSection[] {
  const sections: TrendSection[] = [];

  const meta: TrendSpec[] = [
    { id: "meta:year", title: "Papers per year", data: papersPerYear(papers) },
    {
      id: "meta:journal",
      title: "Journals",
      data: paperFieldDistribution(papers, (p) => p.journal),
    },
    // Institutions are shown as a dedicated panel (with logos/flags) on the
    // Trends page, so they are intentionally not duplicated as a bar chart here.
    { id: "meta:author", title: "Authors", data: paperFieldDistribution(papers, (p) => p.author) },
    { id: "meta:keywords", title: "Keywords", data: keywordDistribution(papers) },
  ].filter((t) => t.data.length > 0);
  if (meta.length) sections.push({ id: "metadata", label: "Metadata", trends: meta });

  // Variables studied (the per-paper Variables tags).
  const variables = variablesDistribution(papers, fieldDefs);
  if (variables.length) {
    sections.push({
      id: "variables",
      label: "Variables studied",
      trends: [{ id: "variables:all", title: "Papers per variable", data: variables }],
    });
  }

  for (const g of groups) {
    const trends: TrendSpec[] = [];
    for (const f of fieldDefs) {
      if (f.group !== g.id || f.type === "image") continue;
      const data =
        f.type === "number"
          ? numericHistogram(experiments, f.key)
          : categoricalDistribution(experiments, f.key);
      if (data.length > 0) trends.push({ id: `field:${f.key}`, title: fieldTitle(f), data });
    }
    if (trends.length) sections.push({ id: g.id, label: g.label, trends });
  }

  return sections;
}
