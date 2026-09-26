// Data model and helpers for the Plot tab.
//
// The Plot tab draws one point per *experiment*: the user picks an X data point
// and a Y data point, and every experiment that has a numeric value for both is
// plotted at (x, y). Experiments missing either value are dropped. On top of
// that the user can define one or more *series* — each a named subset of the
// experiments selected by a set of constraints (e.g. Salt = FLiNaK) — so several
// slices of the data can be compared on the same axes.

import type { Experiment, Paper } from "./db";
import type { FieldDef } from "./fields";
import { barColor, type PaletteName } from "./palettes";

// Recharts' built-in scatter symbols. Used when "vary shapes" is on so each
// series is distinguishable without relying on colour alone.
export type PointShape = "circle" | "square" | "triangle" | "diamond" | "star" | "cross" | "wye";
export const POINT_SHAPES: PointShape[] = [
  "circle",
  "square",
  "triangle",
  "diamond",
  "star",
  "cross",
  "wye",
];

// One filter on a field: the experiment's value must be one of `values`
// (OR within a constraint). An empty `values` list is inactive. Different
// constraints are AND-ed together.
export interface Constraint {
  id: string;
  field: string; // FieldDef.key
  values: string[]; // allowed raw values
}

// A named subset of experiments to draw as its own colour/shape.
export interface Series {
  id: string;
  name: string;
  constraints: Constraint[];
  // Explicit colour override; null means "derive from the palette by position".
  color: string | null;
}

// The whole plot's state — everything the user can change. Kept serializable so
// it can be persisted to localStorage and snapshotted for undo/redo.
export interface PlotState {
  xKey: string;
  yKey: string;
  series: Series[];
  // Keys of individually deleted points: `${seriesId}::${experimentId}`.
  removed: string[];
  palette: PaletteName;
  // Axis-title overrides; null falls back to the field's label. These only
  // affect the plot, never the underlying schema.
  xLabel: string | null;
  yLabel: string | null;
  // Axis limits; null means auto-fit to the data.
  xMin: number | null;
  xMax: number | null;
  yMin: number | null;
  yMax: number | null;
  showGrid: boolean;
  connect: boolean; // connect each series' points with a line
  varyShapes: boolean; // give each series a distinct point shape
}

export const fieldTitle = (f: FieldDef) => (f.unit ? `${f.label} (${f.unit})` : f.label);

let seq = 0;
export function makeId(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now().toString(36)}_${seq++}`;
}

// Parse any stored cell value into a finite number, or null when it isn't one.
export function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const t = v.trim();
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

// The raw stored value of a field for an experiment, as a display string.
export function rawValue(exp: Experiment, key: string): string | null {
  const v = exp.values?.[key]?.value;
  if (v == null || v === "") return null;
  return String(v);
}

// Fields worth offering as an axis: those with at least a couple of numeric
// values across the dataset.
export function numericFields(experiments: Experiment[], fieldDefs: FieldDef[]): FieldDef[] {
  return fieldDefs.filter((f) => {
    if (f.type === "image") return false;
    let n = 0;
    for (const e of experiments) {
      if (toNumber(e.values?.[f.key]?.value) != null) {
        n++;
        if (n >= 2) return true;
      }
    }
    return false;
  });
}

// Fields worth offering as a constraint: anything non-image that has at least
// one distinct value.
export function constrainableFields(experiments: Experiment[], fieldDefs: FieldDef[]): FieldDef[] {
  return fieldDefs.filter(
    (f) => f.type !== "image" && distinctValues(experiments, f.key).length > 0,
  );
}

// Distinct raw values observed for a field, sorted (numbers numerically).
export function distinctValues(experiments: Experiment[], key: string): string[] {
  const set = new Set<string>();
  for (const e of experiments) {
    const r = rawValue(e, key);
    if (r != null) set.add(r);
  }
  const arr = [...set];
  arr.sort((a, b) => {
    const na = Number(a);
    const nb = Number(b);
    if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
    return a.localeCompare(b);
  });
  return arr;
}

export function matchesConstraints(exp: Experiment, constraints: Constraint[]): boolean {
  for (const c of constraints) {
    if (!c.values.length) continue; // inactive
    const r = rawValue(exp, c.field);
    if (r == null || !c.values.includes(r)) return false;
  }
  return true;
}

export interface PlotPoint {
  x: number;
  y: number;
  key: string; // `${seriesId}::${experimentId}`
  expId: string;
  label: string; // e.g. "Yang 2022 · Experiment 1"
}

// The plotted points for one series: experiments matching its constraints that
// have finite X and Y values and haven't been individually removed. Sorted by X
// so a connecting line reads left-to-right.
export function seriesPoints(
  series: Series,
  experiments: Experiment[],
  citeById: Map<string, string>,
  xKey: string,
  yKey: string,
  removed: Set<string>,
): PlotPoint[] {
  const pts: PlotPoint[] = [];
  for (const e of experiments) {
    if (!matchesConstraints(e, series.constraints)) continue;
    const x = toNumber(e.values?.[xKey]?.value);
    const y = toNumber(e.values?.[yKey]?.value);
    if (x == null || y == null) continue;
    const key = `${series.id}::${e.id}`;
    if (removed.has(key)) continue;
    const cite = citeById.get(e.paper_id) || "Unknown";
    pts.push({ x, y, key, expId: e.id, label: `${cite} · ${e.label}` });
  }
  pts.sort((a, b) => a.x - b.x);
  return pts;
}

// The colour for series `i` of `n`: an explicit override, else the palette ramp.
export function seriesColor(series: Series, i: number, n: number, palette: PaletteName): string {
  return series.color ?? barColor(palette, i, n);
}

// A concise auto-name for a series from its active constraints, e.g.
// "Salt = FLiNaK · F/S = Flowing". Falls back to a positional default.
export function autoName(constraints: Constraint[], fieldDefs: FieldDef[], index: number): string {
  const parts: string[] = [];
  for (const c of constraints) {
    if (!c.values.length) continue;
    const f = fieldDefs.find((d) => d.key === c.field);
    parts.push(`${f?.label ?? c.field} = ${c.values.join("/")}`);
  }
  return parts.length ? parts.join(" · ") : `Series ${index + 1}`;
}

export function citationIndex(papers: Paper[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of papers) m.set(p.id, p.citation_key || p.author || "Untitled");
  return m;
}

export function initialPlotState(experiments: Experiment[], fieldDefs: FieldDef[]): PlotState {
  const nums = numericFields(experiments, fieldDefs);
  const xKey = nums[0]?.key ?? fieldDefs[0]?.key ?? "";
  const yKey = nums.find((f) => f.key !== xKey)?.key ?? nums[0]?.key ?? xKey;
  return {
    xKey,
    yKey,
    series: [{ id: makeId("s"), name: "All data", constraints: [], color: null }],
    removed: [],
    palette: "default",
    xLabel: null,
    yLabel: null,
    xMin: null,
    xMax: null,
    yMin: null,
    yMax: null,
    showGrid: true,
    connect: false,
    varyShapes: false,
  };
}

// A blank plot: same axes, but no series at all ("start over from scratch").
export function clearedPlotState(state: PlotState): PlotState {
  return {
    ...state,
    series: [],
    removed: [],
    xLabel: null,
    yLabel: null,
    xMin: null,
    xMax: null,
    yMin: null,
    yMax: null,
  };
}
