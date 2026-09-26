import { useMemo, useRef, useState } from "react";
import {
  Bar as RBar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Check,
  Clipboard,
  Download,
  LineChart as LineIcon,
  Loader2,
} from "lucide-react";
import { binValues, distinctNumericCount, type Bucket } from "@/lib/trends";
import { barColor, paletteAccent, type PaletteName } from "@/lib/palettes";
import { canCopyImages, captureCardPng, copyPngToClipboard } from "@/lib/chartImage";
import { downloadBlob, sanitizeFilename } from "@/lib/download";
// Approx width (px) of one tick character at fontSize 10.
const CHAR_PX = 6.2;
// Never let the x-axis label band grow past this; longer labels are ellipsized
// in the tick (full text still shows in the tooltip).
const MAX_AXIS_BAND = 160;
// Cap on how many distinct numeric values the specificity slider exposes.
const MAX_LEVEL = 40;

export function TrendChart({
  title,
  data,
  splitData,
  values,
  palette = "default",
  mounted,
  height = 180,
}: {
  title: string;
  data: Bucket[];
  // When provided, a toggle lets the user count comma-separated cell values
  // separately (see buildTrendSections / categoricalDistribution).
  splitData?: Bucket[];
  // Raw numeric values for a number field — enables the specificity slider and
  // the line view (the chart re-bins these live).
  values?: number[];
  // Colour palette for the bars (see lib/palettes).
  palette?: PaletteName;
  mounted: boolean;
  height?: number;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [split, setSplit] = useState(false);
  const [mode, setMode] = useState<"bar" | "line">("bar");
  const [busy, setBusy] = useState<null | "copy" | "download">(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const showCopy = canCopyImages();
  const hasSplit = !!splitData && splitData.length > 0;

  const isNumeric = !!values && values.length > 0;
  const distinct = useMemo(
    () => (isNumeric ? distinctNumericCount(values!) : 0),
    [isNumeric, values],
  );
  const maxLevel = Math.min(distinct, MAX_LEVEL);
  // Specificity: 1 bar → every distinct value. Default to a readable ~8 bins.
  const [level, setLevel] = useState(() => Math.min(8, Math.max(1, maxLevel)));
  const effLevel = Math.min(level, maxLevel || 1);

  const numericShown = useMemo(
    () => (isNumeric ? binValues(values!, effLevel) : []),
    [isNumeric, values, effLevel],
  );

  const shown = isNumeric ? numericShown : split && splitData ? splitData : data;

  const copy = async () => {
    if (!cardRef.current) return;
    setErr(null);
    setBusy("copy");
    try {
      const png = await captureCardPng(cardRef.current, { title });
      await copyPngToClipboard(png);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Copy failed.");
    } finally {
      setBusy(null);
    }
  };

  const download = async () => {
    if (!cardRef.current) return;
    setErr(null);
    setBusy("download");
    try {
      const png = await captureCardPng(cardRef.current, { title });
      downloadBlob(png, `${sanitizeFilename(title) || "chart"}.png`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Download failed.");
    } finally {
      setBusy(null);
    }
  };

  if (data.length === 0) return null;

  // ---- Dynamic axis fitting so no tick label gets clipped ----
  const maxChars = shown.reduce((m, d) => Math.max(m, d.label.length), 1);
  const rotate = shown.length > 5 || maxChars > 6;
  const angle = rotate ? (maxChars > 12 ? -60 : -35) : 0;
  const rad = (Math.abs(angle) * Math.PI) / 180;
  const wantBand = rotate ? Math.round(maxChars * CHAR_PX * Math.sin(rad)) + 16 : 22;
  const xAxisHeight = Math.min(wantBand, MAX_AXIS_BAND);
  const maxTickChars =
    rotate && wantBand > MAX_AXIS_BAND
      ? Math.max(6, Math.floor((xAxisHeight - 16) / (CHAR_PX * Math.sin(rad))))
      : Infinity;
  const fitTick = (v: string) =>
    v.length > maxTickChars ? v.slice(0, Math.max(1, maxTickChars - 1)) + "…" : v;

  const maxCount = shown.reduce((m, d) => Math.max(m, d.count), 0);
  const yAxisWidth = Math.max(30, String(maxCount).length * 8 + 14);
  const containerHeight = height + Math.max(0, xAxisHeight - 30);

  const atExact = isNumeric && effLevel >= distinct;
  const detailLabel = atExact
    ? `${distinct} exact`
    : `${shown.length} bin${shown.length === 1 ? "" : "s"}`;

  const segBtn = (on: boolean) =>
    "inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] transition-colors " +
    (on ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent");

  return (
    <div ref={cardRef} className="group/chart rounded-lg border border-rule bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono">{title}</h3>
        <div className="flex items-center gap-2">
          {isNumeric && (
            <div className="inline-flex overflow-hidden rounded border border-rule">
              <button
                type="button"
                onClick={() => setMode("bar")}
                className={segBtn(mode === "bar")}
                title="Bars"
              >
                <BarChart3 className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={() => setMode("line")}
                className={segBtn(mode === "line")}
                title="Line"
              >
                <LineIcon className="h-3 w-3" />
              </button>
            </div>
          )}
          {hasSplit && (
            <button
              type="button"
              role="switch"
              aria-checked={split}
              onClick={() => setSplit((s) => !s)}
              title={'Split comma-separated cell values (e.g. "Cr, Mo, Ni") into separate bars'}
              className="inline-flex shrink-0 items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <span className="text-[10px] uppercase tracking-wider font-mono">Split</span>
              <span
                className={
                  "relative inline-block h-3.5 w-6 rounded-full transition-colors " +
                  (split ? "bg-copper" : "bg-muted-foreground/30")
                }
              >
                <span
                  className={
                    "absolute top-0.5 h-2.5 w-2.5 rounded-full bg-white shadow transition-all " +
                    (split ? "left-3" : "left-0.5")
                  }
                />
              </span>
            </button>
          )}
          <div className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/chart:opacity-100">
            {showCopy && (
              <button
                type="button"
                onClick={copy}
                disabled={busy !== null}
                title="Copy chart to clipboard"
                aria-label="Copy chart to clipboard"
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
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
              onClick={download}
              disabled={busy !== null}
              title="Download chart as PNG"
              aria-label="Download chart as PNG"
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {busy === "download" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Download className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Specificity slider: left = one bar, right = every exact value. */}
      {isNumeric && maxLevel > 1 && (
        <div className="mb-2 flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground">
            Detail
          </span>
          <input
            type="range"
            min={1}
            max={maxLevel}
            value={effLevel}
            onChange={(e) => setLevel(Number(e.target.value))}
            className="h-1 flex-1 cursor-pointer accent-copper"
            aria-label="Bin specificity"
          />
          <span className="w-16 text-right font-mono text-[10px] text-muted-foreground">
            {detailLabel}
          </span>
        </div>
      )}

      {err && <p className="mb-2 text-[10px] text-destructive">{err}</p>}
      <div style={{ width: "100%", height: containerHeight }}>
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            {isNumeric && mode === "line" ? (
              <LineChart data={shown} margin={{ top: 6, right: 8, left: 4, bottom: 4 }}>
                <CartesianGrid stroke="currentColor" className="text-rule/40" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  tickFormatter={fitTick}
                  interval="preserveStartEnd"
                  angle={angle}
                  textAnchor={rotate ? "end" : "middle"}
                  height={xAxisHeight}
                  tickMargin={6}
                  stroke="currentColor"
                  className="text-muted-foreground"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  width={yAxisWidth}
                  tickMargin={4}
                />
                <RTooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke={paletteAccent(palette)}
                  strokeWidth={2}
                  dot={{ r: 2, fill: paletteAccent(palette) }}
                />
              </LineChart>
            ) : (
              <BarChart data={shown} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  tickFormatter={fitTick}
                  interval={0}
                  angle={angle}
                  textAnchor={rotate ? "end" : "middle"}
                  height={xAxisHeight}
                  tickMargin={6}
                  stroke="currentColor"
                  className="text-muted-foreground"
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: "currentColor" }}
                  stroke="currentColor"
                  className="text-muted-foreground"
                  width={yAxisWidth}
                  tickMargin={4}
                />
                <RTooltip
                  cursor={{ fill: "rgba(184,115,51,0.08)" }}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <RBar dataKey="count" radius={[3, 3, 0, 0]}>
                  {shown.map((_, i) => (
                    <Cell key={i} fill={barColor(palette, i, shown.length)} />
                  ))}
                </RBar>
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
