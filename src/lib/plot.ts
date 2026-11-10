// Data model and helpers for the Plot tab.
//
// The Plot tab draws one point per *experiment*: the user picks an X data point
// and a Y data point, and every experiment that has a numeric value for both is
// plotted at (x, y). Experiments missing either value are dropped. On top of
// that the user can define one or more *series* — each a named subset of the
// experiments selected by a set of constraints (e.g. Salt = FLiNaK) — so several
// slices of the data can be compared on the same axes.

import type { Experiment, Paper } from "./db";
import { valueKey, variantLabel, type FieldDef, type FieldVariant } from "./fields";
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
  // When true the series stays defined but isn't drawn (or shown in the legend).
  hidden?: boolean;
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
  bestFit?: boolean; // draw a least-squares trend line per visible series
  // Colour override for the best-fit lines; null uses each series' colour.
  fitColor?: string | null;
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

// How many experiments have a finite numeric value for a given value-key.
function numericCount(experiments: Experiment[], key: string, stopAt = Infinity): number {
  let n = 0;
  for (const e of experiments) {
    if (toNumber(e.values?.[key]?.value) != null) {
      n++;
      if (n >= stopAt) return n;
    }
  }
  return n;
}

// Fields worth offering as an axis: those with at least a couple of numeric
// values across the dataset (used to seed the default X/Y).
export function numericFields(experiments: Experiment[], fieldDefs: FieldDef[]): FieldDef[] {
  return fieldDefs.filter((f) => f.type !== "image" && numericCount(experiments, f.key, 2) >= 2);
}

// ---- "Big" (pooled) axis keys ----
// A data point can be plotted as a single specifier (its plain value or one
// variant) or as a "big" aggregate that pools every specifier of the data point
// — e.g. big Depth gathers plain Depth plus Depth [Max], Depth [Mo], … A big
// axis key is the field key with an `all:` prefix.
export const ALL_PREFIX = "all:";
export function allKey(fieldKey: string): string {
  return `${ALL_PREFIX}${fieldKey}`;
}
export function isAllKey(key: string): boolean {
  return key.startsWith(ALL_PREFIX);
}
export function allFieldKey(key: string): string {
  return key.slice(ALL_PREFIX.length);
}

// The value-keys an axis key reads from an experiment: a big key spreads to the
// data point's plain value plus every variant; any other key is just itself.
export function spreadKeys(fieldDefs: FieldDef[], key: string): string[] {
  if (!isAllKey(key)) return [key];
  const field = fieldDefs.find((f) => f.key === allFieldKey(key));
  if (!field) return [];
  return [field.key, ...(field.variants ?? []).map((v) => valueKey(field.key, v.id))];
}

// Every finite numeric value an experiment holds for an axis key. A plain or
// variant key yields at most one; a big key yields all its specifiers' values.
export function axisValues(e: Experiment, fieldDefs: FieldDef[], key: string): number[] {
  const out: number[] = [];
  for (const k of spreadKeys(fieldDefs, key)) {
    const n = toNumber(e.values?.[k]?.value);
    if (n != null) out.push(n);
  }
  return out;
}

// Split a value-key back into its field key and optional variant id.
export function parseKey(key: string): { fieldKey: string; variantId: string | null } {
  const i = key.indexOf("::");
  return i < 0
    ? { fieldKey: key, variantId: null }
    : { fieldKey: key.slice(0, i), variantId: key.slice(i + 2) };
}

export function keyField(
  fieldDefs: FieldDef[],
  key: string,
): { field: FieldDef | null; variant: FieldVariant | null } {
  if (isAllKey(key)) {
    return { field: fieldDefs.find((f) => f.key === allFieldKey(key)) ?? null, variant: null };
  }
  const { fieldKey, variantId } = parseKey(key);
  const field = fieldDefs.find((f) => f.key === fieldKey) ?? null;
  const variant =
    field && variantId ? ((field.variants ?? []).find((v) => v.id === variantId) ?? null) : null;
  return { field, variant };
}

// The axis title for a value-key, e.g. "Depth (µm) [Min, Mo]". A big key that
// actually pools variants is marked "(all)".
export function keyTitle(fieldDefs: FieldDef[], key: string): string {
  const { field, variant } = keyField(fieldDefs, key);
  if (!field) return key;
  if (isAllKey(key) && (field.variants?.length ?? 0) > 0) return `${fieldTitle(field)} (all)`;
  return variantLabel(field, variant);
}

// Grouped axis options for the X/Y selects. A data point with specifier variants
// becomes an <optgroup> containing its plain value plus each variant; a plain
// data point is a single option. Only numeric-bearing data points are offered.
export interface AxisFieldOptions {
  field: FieldDef;
  options: { key: string; label: string }[];
}
export function axisOptions(experiments: Experiment[], fieldDefs: FieldDef[]): AxisFieldOptions[] {
  const out: AxisFieldOptions[] = [];
  for (const f of fieldDefs) {
    if (f.type === "image") continue;
    const variants = f.variants ?? [];
    // Offer the data point if the plain value or any single variant is numeric,
    // so a field whose numbers live only under specifiers still appears.
    const plottable =
      numericCount(experiments, f.key, 2) >= 2 ||
      variants.some((v) => numericCount(experiments, valueKey(f.key, v.id), 2) >= 2);
    if (!plottable) continue;
    const hasVariants = variants.length > 0;
    const options = [
      // A data point with specifiers also offers a "big" aggregate (all
      // specifiers pooled) and a "plain only" option, so the user can plot the
      // whole category or one specifier.
      ...(hasVariants ? [{ key: allKey(f.key), label: `${fieldTitle(f)} — all specifiers` }] : []),
      { key: f.key, label: hasVariants ? `${fieldTitle(f)} — plain only` : variantLabel(f, null) },
      ...variants.map((v) => ({ key: valueKey(f.key, v.id), label: variantLabel(f, v) })),
    ];
    out.push({ field: f, options });
  }
  return out;
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
  paperId: string;
  label: string; // e.g. "Yang 2022 · Experiment 1"
}

// The plotted points for one series: experiments matching its constraints that
// have finite X and Y values and haven't been individually removed. Sorted by X
// so a connecting line reads left-to-right.
export function seriesPoints(
  series: Series,
  experiments: Experiment[],
  fieldDefs: FieldDef[],
  citeById: Map<string, string>,
  xKey: string,
  yKey: string,
  removed: Set<string>,
): PlotPoint[] {
  const pts: PlotPoint[] = [];
  for (const e of experiments) {
    if (!matchesConstraints(e, series.constraints)) continue;
    const xs = axisValues(e, fieldDefs, xKey);
    if (xs.length === 0) continue;
    const ys = axisValues(e, fieldDefs, yKey);
    if (ys.length === 0) continue;
    // A big axis can yield several values for one experiment; plot each.
    const single = xs.length === 1 && ys.length === 1;
    const cite = citeById.get(e.paper_id) || "Unknown";
    let idx = 0;
    for (const x of xs) {
      for (const y of ys) {
        // Keep the simple id when there's one point per experiment so previously
        // deleted points still match; suffix only when a big axis expands it.
        const key = single ? `${series.id}::${e.id}` : `${series.id}::${e.id}::${idx++}`;
        if (removed.has(key)) continue;
        pts.push({ x, y, key, expId: e.id, paperId: e.paper_id, label: `${cite} · ${e.label}` });
      }
    }
  }
  pts.sort((a, b) => a.x - b.x);
  return pts;
}

// The colour for series `i` of `n`: an explicit override, else the palette ramp.
export function seriesColor(series: Series, i: number, n: number, palette: PaletteName): string {
  return series.color ?? barColor(palette, i, n);
}

// Ordinary least-squares fit of y = slope·x + intercept, plus the Pearson
// correlation r (and r²). Returns null when there aren't at least two points or
// the x-values have no spread (a vertical cloud, where slope is undefined).
export interface FitResult {
  slope: number;
  intercept: number;
  r: number;
  r2: number;
  n: number;
  x0: number; // smallest x among the points
  x1: number; // largest x among the points
  p: number; // two-tailed p-value for the correlation (H0: r = 0)
}

// ---- Significance of a correlation ----
// Natural log of the gamma function (Lanczos approximation).
function logGamma(x: number): number {
  // Published Lanczos coefficients; their final digits aren't exactly
  // representable as doubles, which is immaterial here.
  /* eslint-disable no-loss-of-precision */
  const cof = [
    76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155,
    0.1208650973866179e-2, -0.5395239384953e-5,
  ];
  /* eslint-enable no-loss-of-precision */
  let y = x;
  let tmp = x + 5.5;
  tmp -= (x + 0.5) * Math.log(tmp);
  let ser = 1 + 1.90015e-10;
  for (let j = 0; j < 6; j++) ser += cof[j] / ++y;
  return -tmp + Math.log((Math.sqrt(2 * Math.PI) * ser) / x);
}

// Continued-fraction core of the incomplete beta function (Numerical Recipes).
function betacf(a: number, b: number, x: number): number {
  const MAXIT = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

// Regularized incomplete beta I_x(a, b).
function regIncBeta(a: number, b: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? (bt * betacf(a, b, x)) / a
    : 1 - (bt * betacf(b, a, 1 - x)) / b;
}

// Two-tailed p-value for a Pearson correlation r from n points, testing the null
// hypothesis of no correlation. Uses the t statistic t = r·√((n−2)/(1−r²)) whose
// two-sided tail equals I_{df/(df+t²)}(df/2, 1/2).
export function correlationPValue(r: number, n: number): number {
  const df = n - 2;
  if (df <= 0) return NaN;
  const r2 = Math.min(r * r, 1);
  if (r2 >= 1) return 0;
  const t2 = (r2 * df) / (1 - r2);
  return regIncBeta(df / 2, 0.5, df / (df + t2));
}

// Format a p-value compactly, e.g. "p < 0.001" or "p = 0.042".
export function fmtP(p: number): string {
  if (!Number.isFinite(p)) return "p —";
  if (p < 0.001) return "p < 0.001";
  return `p = ${p.toFixed(3)}`;
}
export function linearFit(points: { x: number; y: number }[]): FitResult | null {
  const n = points.length;
  if (n < 2) return null;
  let sx = 0,
    sy = 0,
    sxx = 0,
    sxy = 0,
    syy = 0,
    x0 = Infinity,
    x1 = -Infinity;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
    sxx += p.x * p.x;
    sxy += p.x * p.y;
    syy += p.y * p.y;
    if (p.x < x0) x0 = p.x;
    if (p.x > x1) x1 = p.x;
  }
  const dxx = n * sxx - sx * sx;
  if (dxx === 0) return null; // no spread in x → slope undefined
  const slope = (n * sxy - sx * sy) / dxx;
  const intercept = (sy - slope * sx) / n;
  const dyy = n * syy - sy * sy;
  const denom = Math.sqrt(dxx * dyy);
  const r = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  return { slope, intercept, r, r2: r * r, n, x0, x1, p: correlationPValue(r, n) };
}

// ---- Correlation ranking ----
// A pair of axis keys and the Pearson correlation of the experiments that have
// both. Pairs with fewer than `minN` points are dropped (a two-point "fit" is
// always ±1).
export interface PairCorrelation {
  xKey: string;
  yKey: string;
  xLabel: string;
  yLabel: string;
  r: number;
  r2: number;
  n: number;
}

// (x, y) points for a key pair; a big key expands to every specifier value
// (crossed with the other axis for that experiment).
function pairPoints(
  experiments: Experiment[],
  fieldDefs: FieldDef[],
  xKey: string,
  yKey: string,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (const e of experiments) {
    const xs = axisValues(e, fieldDefs, xKey);
    if (!xs.length) continue;
    const ys = axisValues(e, fieldDefs, yKey);
    if (!ys.length) continue;
    for (const x of xs) for (const y of ys) pts.push({ x, y });
  }
  return pts;
}

function correlate(
  experiments: Experiment[],
  fieldDefs: FieldDef[],
  x: { key: string; label: string },
  y: { key: string; label: string },
  minN: number,
): PairCorrelation | null {
  const pts = pairPoints(experiments, fieldDefs, x.key, y.key);
  if (pts.length < minN) return null;
  const fit = linearFit(pts);
  if (!fit) return null;
  return {
    xKey: x.key,
    yKey: y.key,
    xLabel: x.label,
    yLabel: y.label,
    r: fit.r,
    r2: fit.r2,
    n: fit.n,
  };
}

// "Big" relationships: one entry per pair of data points, each pooling its plain
// value and every specifier variant. A data point with variants uses its big
// aggregate key; a plain data point uses its own key. Same-field pairs are n/a.
export function bigCorrelations(
  experiments: Experiment[],
  fieldDefs: FieldDef[],
  minN = 3,
): PairCorrelation[] {
  const fields = axisOptions(experiments, fieldDefs).map((g) => g.field);
  const axisFor = (f: FieldDef) => ({
    key: (f.variants?.length ?? 0) > 0 ? allKey(f.key) : f.key,
    label: fieldTitle(f),
  });
  const out: PairCorrelation[] = [];
  for (let i = 0; i < fields.length; i++) {
    for (let j = i + 1; j < fields.length; j++) {
      const c = correlate(experiments, fieldDefs, axisFor(fields[i]), axisFor(fields[j]), minN);
      if (c) out.push(c);
    }
  }
  return out;
}

// "Specifier" relationships: pairs where at least one side is a specific
// specifier variant (across different data points) — the granular counterpart
// to the big view.
export function specifierCorrelations(
  experiments: Experiment[],
  fieldDefs: FieldDef[],
  minN = 3,
): PairCorrelation[] {
  const keys: { key: string; label: string }[] = [];
  for (const g of axisOptions(experiments, fieldDefs)) {
    for (const o of g.options) {
      if (isAllKey(o.key)) continue; // the aggregate option belongs to the big view
      if (numericCount(experiments, o.key, 2) >= 2) keys.push(o);
    }
  }
  const isVariant = (k: string) => k.includes("::");
  const out: PairCorrelation[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i];
      const b = keys[j];
      if (parseKey(a.key).fieldKey === parseKey(b.key).fieldKey) continue;
      if (!isVariant(a.key) && !isVariant(b.key)) continue;
      const c = correlate(experiments, fieldDefs, a, b, minN);
      if (c) out.push(c);
    }
  }
  return out;
}

// Compact human-readable number: fixed for everyday magnitudes, scientific for
// very large or very small ones.
export function fmtNum(v: number): string {
  if (!Number.isFinite(v)) return "—";
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e4 || a < 1e-3)) return v.toExponential(2);
  return String(Math.round(v * 1000) / 1000);
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
    bestFit: false,
    fitColor: null,
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
