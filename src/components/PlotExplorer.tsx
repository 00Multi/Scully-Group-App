import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import {
  Check,
  Clipboard,
  Download,
  Eye,
  EyeOff,
  Grid3x3,
  Loader2,
  Pencil,
  Plus,
  RotateCcw,
  Shapes,
  Spline,
  Trash2,
  X,
} from "lucide-react";
import type { Experiment, Paper } from "@/lib/db";
import type { FieldDef } from "@/lib/fields";
import {
  autoName,
  citationIndex,
  clearedPlotState,
  constrainableFields,
  distinctValues,
  fieldTitle,
  initialPlotState,
  makeId,
  numericFields,
  POINT_SHAPES,
  seriesColor,
  seriesPoints,
  type Constraint,
  type PlotPoint,
  type PlotState,
  type Series,
} from "@/lib/plot";
import { PALETTES, type PaletteName } from "@/lib/palettes";
import { useHistory } from "@/lib/history";
import { canCopyImages, captureCardPng, copyPngToClipboard } from "@/lib/chartImage";
import { downloadBlob, sanitizeFilename } from "@/lib/download";

const STORAGE_KEY = "plot.state.v1";

// A compact set of swatches for the per-series colour picker, plus a native
// colour input for anything else.
const SWATCHES = [
  "#b87333",
  "#c0392b",
  "#e67e22",
  "#f1c40f",
  "#2ecc71",
  "#16a085",
  "#2980b9",
  "#34495e",
  "#8e44ad",
  "#e84393",
  "#7f8c8d",
  "#111827",
];

export function PlotExplorer({
  experiments,
  papers,
  fieldDefs,
  mounted,
}: {
  experiments: Experiment[];
  papers: Paper[];
  fieldDefs: FieldDef[];
  mounted: boolean;
}) {
  const { record } = useHistory();
  const navigate = useNavigate();
  const cardRef = useRef<HTMLDivElement>(null);
  // Last cursor position over the chart, so the point menu opens where clicked.
  const clickPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  // The point the user clicked — drives the delete/edit menu.
  const [menu, setMenu] = useState<{ x: number; y: number; point: PlotPoint } | null>(null);

  const numFields = useMemo(() => numericFields(experiments, fieldDefs), [experiments, fieldDefs]);
  const filterFields = useMemo(
    () => constrainableFields(experiments, fieldDefs),
    [experiments, fieldDefs],
  );
  const citeById = useMemo(() => citationIndex(papers), [papers]);

  const [state, setStateRaw] = useState<PlotState>(() => initialPlotState([], fieldDefs));
  const [loaded, setLoaded] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;

  // Load persisted state (client only) once, else seed from the live data.
  useEffect(() => {
    let restored: PlotState | null = null;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) restored = JSON.parse(raw) as PlotState;
    } catch {
      /* ignore */
    }
    if (restored && restored.xKey && Array.isArray(restored.series)) {
      setStateRaw(restored);
    } else {
      setStateRaw(initialPlotState(experiments, fieldDefs));
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once data arrives, fill in axis defaults if we still have none.
  useEffect(() => {
    if (!loaded) return;
    if (!stateRef.current.xKey && experiments.length) {
      setStateRaw(initialPlotState(experiments, fieldDefs));
    }
  }, [loaded, experiments, fieldDefs]);

  // Persist on change.
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, loaded]);

  // Apply a new state and record a reversible history entry (drives the
  // top-bar undo/redo arrows and Ctrl/Cmd+Z). The producer always runs against
  // the freshest state (the ref, not a render-closure snapshot) so several
  // commits batched before a re-render each build on the last.
  const commit = useCallback(
    (producer: PlotState | ((prev: PlotState) => PlotState), label: string) => {
      const prev = stateRef.current;
      const value = typeof producer === "function" ? producer(prev) : producer;
      if (value === prev) return;
      stateRef.current = value;
      setStateRaw(value);
      record({
        label,
        undo: () => {
          stateRef.current = prev;
          setStateRaw(prev);
        },
        redo: () => {
          stateRef.current = value;
          setStateRaw(value);
        },
      });
    },
    [record],
  );
  const patch = useCallback(
    (p: Partial<PlotState>, label: string) => commit((prev) => ({ ...prev, ...p }), label),
    [commit],
  );

  // --- Text/number fields: edit live, record one history entry on blur. ---
  const editSnapshot = useRef<PlotState | null>(null);
  const beginEdit = () => {
    editSnapshot.current = stateRef.current;
  };
  const live = (p: Partial<PlotState>) => {
    const value = { ...stateRef.current, ...p };
    stateRef.current = value;
    setStateRaw(value);
  };
  const endEdit = (label: string) => {
    const before = editSnapshot.current;
    editSnapshot.current = null;
    if (!before || before === stateRef.current) return;
    const after = stateRef.current;
    record({
      label,
      undo: () => {
        stateRef.current = before;
        setStateRaw(before);
      },
      redo: () => {
        stateRef.current = after;
        setStateRaw(after);
      },
    });
  };

  const xField = fieldDefs.find((f) => f.key === state.xKey);
  const yField = fieldDefs.find((f) => f.key === state.yKey);
  const xTitle = state.xLabel ?? (xField ? fieldTitle(xField) : "X");
  const yTitle = state.yLabel ?? (yField ? fieldTitle(yField) : "Y");

  const removedSet = useMemo(() => new Set(state.removed), [state.removed]);
  const seriesData = useMemo(
    () =>
      state.series.map((s, i) => ({
        series: s,
        color: seriesColor(s, i, state.series.length, state.palette),
        shape: state.varyShapes ? POINT_SHAPES[i % POINT_SHAPES.length] : "circle",
        points: seriesPoints(s, experiments, citeById, state.xKey, state.yKey, removedSet),
      })),
    [
      state.series,
      state.palette,
      state.varyShapes,
      state.xKey,
      state.yKey,
      experiments,
      citeById,
      removedSet,
    ],
  );
  const visibleCount = seriesData.filter(({ series }) => !series.hidden).length;
  const totalPoints = seriesData.reduce((n, s) => n + (s.series.hidden ? 0 : s.points.length), 0);

  // ---- Series operations (all read fresh state via the producer form) ----
  const addSeries = () =>
    commit(
      (prev) => ({
        ...prev,
        series: [
          ...prev.series,
          {
            id: makeId("s"),
            name: `Series ${prev.series.length + 1}`,
            constraints: [],
            color: null,
          },
        ],
      }),
      "Add series",
    );
  const removeSeries = (id: string) =>
    commit(
      (prev) => ({
        ...prev,
        series: prev.series.filter((s) => s.id !== id),
        removed: prev.removed.filter((k) => !k.startsWith(`${id}::`)),
      }),
      "Remove series",
    );
  const setSeries = (id: string, next: Series, label: string) =>
    commit(
      (prev) => ({ ...prev, series: prev.series.map((s) => (s.id === id ? next : s)) }),
      label,
    );

  const removePoint = (key: string | undefined) => {
    if (!key) return;
    commit(
      (prev) => (prev.removed.includes(key) ? prev : { ...prev, removed: [...prev.removed, key] }),
      "Delete point",
    );
  };

  // Clicking a point opens a small menu (delete / edit in Browse) at the cursor.
  const openPointMenu = (point: PlotPoint | undefined) => {
    if (!point) return;
    setMenu({ x: clickPos.current.x, y: clickPos.current.y, point });
  };
  const editInBrowse = (point: PlotPoint) => {
    setMenu(null);
    navigate({
      to: "/browse",
      search: { paper: point.paperId, exp: point.expId, view: "data" },
    });
  };
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menu]);

  // ---- Reset ("start over") with confirmation ----
  const [confirmReset, setConfirmReset] = useState(false);
  useEffect(() => {
    if (!confirmReset) return;
    const t = setTimeout(() => setConfirmReset(false), 4000);
    return () => clearTimeout(t);
  }, [confirmReset]);
  const doReset = () => {
    commit(clearedPlotState(stateRef.current), "Reset plot");
    setConfirmReset(false);
  };

  // ---- Export ----
  const [busy, setBusy] = useState<null | "copy" | "download">(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const exportPng = async (how: "copy" | "download") => {
    if (!cardRef.current) return;
    setErr(null);
    setBusy(how);
    try {
      const title = `${yTitle} vs ${xTitle}`;
      const png = await captureCardPng(cardRef.current, { title });
      if (how === "copy") {
        await copyPngToClipboard(png);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } else {
        downloadBlob(png, `${sanitizeFilename(title) || "plot"}.png`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  };

  const xDomain: [number | "auto", number | "auto"] = [state.xMin ?? "auto", state.xMax ?? "auto"];
  const yDomain: [number | "auto", number | "auto"] = [state.yMin ?? "auto", state.yMax ?? "auto"];
  const clipX = state.xMin != null || state.xMax != null;
  const clipY = state.yMin != null || state.yMax != null;

  const toggle = (on: boolean) =>
    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs transition-colors " +
    (on
      ? "border-copper/50 bg-copper/10 text-foreground"
      : "border-rule text-muted-foreground hover:bg-accent");
  const iconBtn =
    "rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50";

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      {/* ---- Chart card ---- */}
      <div ref={cardRef} className="rounded-lg border border-rule bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <AxisSelect
              label="Y"
              value={state.yKey}
              fields={numFields.length ? numFields : fieldDefs}
              onChange={(v) => patch({ yKey: v }, "Change Y field")}
            />
            <span className="text-xs text-muted-foreground">vs</span>
            <AxisSelect
              label="X"
              value={state.xKey}
              fields={numFields.length ? numFields : fieldDefs}
              onChange={(v) => patch({ xKey: v }, "Change X field")}
            />
          </div>
          <div className="flex items-center gap-1">
            {canCopyImages() && (
              <button
                type="button"
                onClick={() => exportPng("copy")}
                disabled={busy !== null}
                title="Copy chart to clipboard"
                aria-label="Copy chart to clipboard"
                className={iconBtn}
              >
                {busy === "copy" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : copied ? (
                  <Check className="h-3.5 w-3.5 text-state-filled" />
                ) : (
                  <Clipboard className="h-3.5 w-3.5" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => exportPng("download")}
              disabled={busy !== null}
              title="Download chart as PNG"
              aria-label="Download chart as PNG"
              className={iconBtn}
            >
              {busy === "download" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>

        {err && <p className="mb-2 text-[10px] text-destructive">{err}</p>}

        <div className="mb-1 text-[10px] text-muted-foreground">
          {totalPoints} point{totalPoints === 1 ? "" : "s"} · one per experiment with both values ·
          click a point to delete it or edit it in Browse
        </div>

        <div
          style={{ width: "100%", height: 460 }}
          onClickCapture={(e) => {
            clickPos.current = { x: e.clientX, y: e.clientY };
          }}
        >
          {mounted && (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 20, left: 12, bottom: 28 }}>
                {state.showGrid && <CartesianGrid stroke="currentColor" className="text-rule/40" />}
                <XAxis
                  type="number"
                  dataKey="x"
                  name={xTitle}
                  domain={xDomain}
                  allowDataOverflow={clipX}
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  height={46}
                  tickMargin={6}
                  label={{
                    value: xTitle,
                    position: "insideBottom",
                    offset: 4,
                    style: { fontSize: 11, fill: "currentColor", textAnchor: "middle" },
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name={yTitle}
                  domain={yDomain}
                  allowDataOverflow={clipY}
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  width={64}
                  tickMargin={4}
                  label={{
                    value: yTitle,
                    angle: -90,
                    position: "insideLeft",
                    style: { fontSize: 11, fill: "currentColor", textAnchor: "middle" },
                  }}
                />
                <ZAxis type="number" range={[46, 46]} />
                <RTooltip content={<PlotTooltip xTitle={xTitle} yTitle={yTitle} />} />
                {visibleCount > 1 && (
                  <Legend
                    verticalAlign="bottom"
                    height={24}
                    wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  />
                )}
                {seriesData
                  .filter(({ series }) => !series.hidden)
                  .map(({ series, color, shape, points }) => (
                    <Scatter
                      key={series.id}
                      name={series.name}
                      data={points}
                      fill={color}
                      line={state.connect ? { stroke: color, strokeWidth: 2 } : false}
                      lineJointType="linear"
                      shape={shape}
                      legendType={shape}
                      isAnimationActive={false}
                      onClick={(node: { payload?: PlotPoint }) => openPointMenu(node?.payload)}
                      style={{ cursor: "pointer" }}
                    />
                  ))}
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* ---- Toggles & palette ---- */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className={toggle(state.showGrid)}
            onClick={() => patch({ showGrid: !state.showGrid }, "Toggle grid")}
          >
            <Grid3x3 className="h-3.5 w-3.5" /> Grid
          </button>
          <button
            type="button"
            className={toggle(state.connect)}
            onClick={() => patch({ connect: !state.connect }, "Toggle connect")}
          >
            <Spline className="h-3.5 w-3.5" /> Connect dots
          </button>
          <button
            type="button"
            className={toggle(state.varyShapes)}
            onClick={() => patch({ varyShapes: !state.varyShapes }, "Toggle shapes")}
          >
            <Shapes className="h-3.5 w-3.5" /> Vary shapes
          </button>
          <label className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            Palette
            <select
              value={state.palette}
              onChange={(e) => patch({ palette: e.target.value as PaletteName }, "Change palette")}
              className="rounded border border-input bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
              title="Colour gradient applied across all series (unless a series has a custom colour)"
            >
              {PALETTES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* ---- Controls column ---- */}
      <div className="flex flex-col gap-4">
        {/* Axes */}
        <div className="rounded-lg border border-rule bg-card p-4">
          <h3 className="mb-3 text-[10px] uppercase tracking-[0.2em] text-copper font-mono">
            Axes
          </h3>
          <AxisControls
            axis="X"
            title="X axis"
            labelValue={state.xLabel}
            labelPlaceholder={xField ? fieldTitle(xField) : "X"}
            min={state.xMin}
            max={state.xMax}
            onLabel={(v) => live({ xLabel: v })}
            onMin={(v) => live({ xMin: v })}
            onMax={(v) => live({ xMax: v })}
            onFocus={beginEdit}
            onBlur={endEdit}
          />
          <div className="my-3 h-px bg-rule/60" />
          <AxisControls
            axis="Y"
            title="Y axis"
            labelValue={state.yLabel}
            labelPlaceholder={yField ? fieldTitle(yField) : "Y"}
            min={state.yMin}
            max={state.yMax}
            onLabel={(v) => live({ yLabel: v })}
            onMin={(v) => live({ yMin: v })}
            onMax={(v) => live({ yMax: v })}
            onFocus={beginEdit}
            onBlur={endEdit}
          />
          <p className="mt-2 text-[10px] text-muted-foreground">
            Limits auto-fit the data when left blank. Renaming an axis changes only this plot.
          </p>
        </div>

        {/* Series */}
        <div className="rounded-lg border border-rule bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono">Series</h3>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => (confirmReset ? doReset() : setConfirmReset(true))}
                className={
                  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition-colors " +
                  (confirmReset
                    ? "border-destructive/60 bg-destructive/10 text-destructive"
                    : "border-rule text-muted-foreground hover:bg-accent")
                }
                title="Start the plot over from scratch"
              >
                <RotateCcw className="h-3 w-3" /> {confirmReset ? "Sure?" : "Reset"}
              </button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            {state.series.length === 0 && (
              <p className="rounded-md border border-dashed border-rule p-3 text-center text-xs italic text-muted-foreground">
                No series. Add one to plot data.
              </p>
            )}
            {state.series.map((s, i) => (
              <SeriesRow
                key={s.id}
                series={s}
                index={i}
                count={seriesData[i]?.points.length ?? 0}
                color={seriesData[i]?.color ?? "#b87333"}
                fields={filterFields}
                experiments={experiments}
                fieldDefs={fieldDefs}
                onChange={(next, label) => setSeries(s.id, next, label)}
                onRemove={() => removeSeries(s.id)}
                onBeginEdit={beginEdit}
                onLiveName={(name) =>
                  live({
                    series: stateRef.current.series.map((x) =>
                      x.id === s.id ? { ...x, name } : x,
                    ),
                  })
                }
                onEndEdit={endEdit}
              />
            ))}
            <button
              type="button"
              onClick={addSeries}
              className="inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-rule px-3 py-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Add series
            </button>
          </div>
        </div>
      </div>

      {menu && (
        <PointMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onDelete={() => {
            removePoint(menu.point.key);
            setMenu(null);
          }}
          onEdit={() => editInBrowse(menu.point)}
        />
      )}
    </div>
  );
}

// A small menu anchored at the clicked point: delete it, or jump to that
// experiment in Browse to edit its cell values.
function PointMenu({
  menu,
  onClose,
  onDelete,
  onEdit,
}: {
  menu: { x: number; y: number; point: PlotPoint };
  onClose: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const { x, y, point } = menu;
  // Keep the menu on-screen near the cursor.
  const left = Math.min(x, (typeof window !== "undefined" ? window.innerWidth : x) - 232);
  const top = Math.min(y, (typeof window !== "undefined" ? window.innerHeight : y) - 150);
  return (
    <div className="fixed inset-0 z-50" onMouseDown={onClose}>
      <div
        className="absolute w-56 rounded-lg border border-rule bg-card p-1.5 shadow-xl"
        style={{ left, top }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="px-2 py-1.5">
          <div className="truncate text-xs font-medium text-foreground">{point.label}</div>
          <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
            ({point.x}, {point.y})
          </div>
        </div>
        <div className="my-1 h-px bg-rule/60" />
        <button
          type="button"
          onClick={onEdit}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-foreground hover:bg-accent"
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
          Edit in Browse
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete point
        </button>
      </div>
    </div>
  );
}

// ---- Axis field <select> ----
function AxisSelect({
  label,
  value,
  fields,
  onChange,
}: {
  label: string;
  value: string;
  fields: FieldDef[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <span className="font-mono text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[12rem] rounded border border-input bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
      >
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {fieldTitle(f)}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---- Per-axis label + min/max ----
function AxisControls({
  axis,
  title,
  labelValue,
  labelPlaceholder,
  min,
  max,
  onLabel,
  onMin,
  onMax,
  onFocus,
  onBlur,
}: {
  axis: string;
  title: string;
  labelValue: string | null;
  labelPlaceholder: string;
  min: number | null;
  max: number | null;
  onLabel: (v: string | null) => void;
  onMin: (v: number | null) => void;
  onMax: (v: number | null) => void;
  onFocus: () => void;
  onBlur: (label: string) => void;
}) {
  const num = (s: string): number | null => {
    const t = s.trim();
    if (t === "") return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  const inp =
    "w-full rounded border border-input bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none";
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium text-foreground">{title}</div>
      <input
        className={inp + " mb-2"}
        placeholder={labelPlaceholder}
        value={labelValue ?? ""}
        onFocus={onFocus}
        onChange={(e) => onLabel(e.target.value === "" ? null : e.target.value)}
        onBlur={() => onBlur(`Rename ${axis} axis`)}
      />
      <div className="flex items-center gap-2">
        <input
          className={inp}
          type="number"
          placeholder="min (auto)"
          value={min ?? ""}
          onFocus={onFocus}
          onChange={(e) => onMin(num(e.target.value))}
          onBlur={() => onBlur(`Set ${axis} min`)}
        />
        <input
          className={inp}
          type="number"
          placeholder="max (auto)"
          value={max ?? ""}
          onFocus={onFocus}
          onChange={(e) => onMax(num(e.target.value))}
          onBlur={() => onBlur(`Set ${axis} max`)}
        />
      </div>
    </div>
  );
}

// ---- One series: colour, name, shape hint, constraints ----
function SeriesRow({
  series,
  index,
  count,
  color,
  fields,
  experiments,
  fieldDefs,
  onChange,
  onRemove,
  onBeginEdit,
  onLiveName,
  onEndEdit,
}: {
  series: Series;
  index: number;
  count: number;
  color: string;
  fields: FieldDef[];
  experiments: Experiment[];
  fieldDefs: FieldDef[];
  onChange: (next: Series, label: string) => void;
  onRemove: () => void;
  onBeginEdit: () => void;
  onLiveName: (name: string) => void;
  onEndEdit: (label: string) => void;
}) {
  const [pickOpen, setPickOpen] = useState(false);
  const setColor = (c: string | null) => {
    onChange({ ...series, color: c }, "Recolour series");
    setPickOpen(false);
  };

  const dim = series.hidden ? "opacity-40" : "";

  return (
    <div
      className={"rounded-md border border-rule/70 p-2.5" + (series.hidden ? " bg-muted/30" : "")}
    >
      <div className="flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            aria-label="Series colour"
            title="Change this series' colour"
            onClick={() => setPickOpen((o) => !o)}
            className={"h-5 w-5 shrink-0 rounded-full border border-black/10 shadow-sm " + dim}
            style={{ backgroundColor: color }}
          />
          {pickOpen && (
            <ColorPopover
              current={series.color}
              onPick={setColor}
              onClose={() => setPickOpen(false)}
            />
          )}
        </div>
        <input
          className={
            "min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm hover:border-input focus:border-primary focus:outline-none " +
            dim
          }
          value={series.name}
          onFocus={onBeginEdit}
          onChange={(e) => onLiveName(e.target.value)}
          onBlur={() => onEndEdit("Rename series")}
          placeholder={autoName(series.constraints, fieldDefs, index)}
        />
        <span className={"shrink-0 font-mono text-[10px] text-muted-foreground " + dim}>
          {count}
        </span>
        <button
          type="button"
          onClick={() =>
            onChange(
              { ...series, hidden: !series.hidden },
              series.hidden ? "Show series" : "Hide series",
            )
          }
          aria-label={series.hidden ? "Show series" : "Hide series"}
          title={series.hidden ? "Show series" : "Hide series"}
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {series.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove series"
          title="Remove series"
          className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <ConstraintEditor
        series={series}
        fields={fields}
        experiments={experiments}
        fieldDefs={fieldDefs}
        onChange={(constraints, label) => onChange({ ...series, constraints }, label)}
      />
    </div>
  );
}

function ColorPopover({
  current,
  onPick,
  onClose,
}: {
  current: string | null;
  onPick: (c: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="absolute left-0 top-7 z-30 w-44 rounded-md border border-rule bg-card p-2 shadow-lg"
    >
      <div className="grid grid-cols-6 gap-1.5">
        {SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onPick(c)}
            className="h-5 w-5 rounded-full border border-black/10"
            style={{ backgroundColor: c }}
            aria-label={c}
          />
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <label className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
          Custom
          <input
            type="color"
            value={current ?? "#b87333"}
            onChange={(e) => onPick(e.target.value)}
            className="h-5 w-6 cursor-pointer rounded border border-input bg-background"
          />
        </label>
        <button
          type="button"
          onClick={() => onPick(null)}
          className="rounded border border-rule px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent"
          title="Use the palette colour"
        >
          Auto
        </button>
      </div>
    </div>
  );
}

function ConstraintEditor({
  series,
  fields,
  experiments,
  fieldDefs,
  onChange,
}: {
  series: Series;
  fields: FieldDef[];
  experiments: Experiment[];
  fieldDefs: FieldDef[];
  onChange: (constraints: Constraint[], label: string) => void;
}) {
  const [field, setField] = useState(fields[0]?.key ?? "");
  const values = useMemo(() => distinctValues(experiments, field), [experiments, field]);
  const fieldLabel = (key: string) => fieldDefs.find((f) => f.key === key)?.label ?? key;

  const addValue = (val: string) => {
    if (!val) return;
    const cs = series.constraints.map((c) => ({ ...c, values: [...c.values] }));
    let c = cs.find((x) => x.field === field);
    if (!c) {
      c = { id: makeId("c"), field, values: [] };
      cs.push(c);
    }
    if (!c.values.includes(val)) c.values.push(val);
    onChange(cs, `Filter ${fieldLabel(field)} = ${val}`);
  };
  const removeValue = (fieldKey: string, val: string) => {
    const cs = series.constraints
      .map((c) => (c.field === fieldKey ? { ...c, values: c.values.filter((v) => v !== val) } : c))
      .filter((c) => c.values.length > 0);
    onChange(cs, `Remove filter ${fieldLabel(fieldKey)} = ${val}`);
  };

  const active = series.constraints.filter((c) => c.values.length > 0);

  return (
    <div className="mt-2">
      {active.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          {active.flatMap((c) =>
            c.values.map((v) => (
              <span
                key={`${c.field}:${v}`}
                className="inline-flex items-center gap-1 rounded-full bg-copper/10 px-2 py-0.5 text-[10px] text-foreground"
              >
                <span className="text-muted-foreground">{fieldLabel(c.field)}:</span> {v}
                <button
                  type="button"
                  onClick={() => removeValue(c.field, v)}
                  aria-label="Remove filter"
                  className="text-muted-foreground hover:text-destructive"
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            )),
          )}
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <select
          value={field}
          onChange={(e) => setField(e.target.value)}
          className="min-w-0 flex-1 rounded border border-input bg-background px-1.5 py-1 text-[11px] focus:border-primary focus:outline-none"
          aria-label="Filter field"
        >
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          value=""
          onChange={(e) => addValue(e.target.value)}
          className="min-w-0 flex-1 rounded border border-input bg-background px-1.5 py-1 text-[11px] focus:border-primary focus:outline-none"
          aria-label="Filter value"
        >
          <option value="">+ value…</option>
          {values.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

// Tooltip: one experiment's coordinates and where it came from.
function PlotTooltip({
  active,
  payload,
  xTitle,
  yTitle,
}: {
  active?: boolean;
  payload?: { name?: string; payload: { x: number; y: number; label: string } }[];
  xTitle: string;
  yTitle: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-rule bg-card px-2.5 py-1.5 text-xs shadow">
      <div className="font-medium">{p.label}</div>
      <div className="mt-0.5 text-muted-foreground">
        {xTitle}: <span className="font-mono text-foreground">{p.x}</span>
      </div>
      <div className="text-muted-foreground">
        {yTitle}: <span className="font-mono text-foreground">{p.y}</span>
      </div>
    </div>
  );
}
