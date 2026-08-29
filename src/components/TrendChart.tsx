import { useState } from "react";
import {
  Bar as RBar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS, type Bucket } from "@/lib/trends";

// Approx width (px) of one tick character at fontSize 10.
const CHAR_PX = 6.2;
// Never let the x-axis label band grow past this; longer labels are ellipsized
// in the tick (full text still shows in the tooltip).
const MAX_AXIS_BAND = 160;

export function TrendChart({
  title,
  data,
  splitData,
  mounted,
  height = 180,
}: {
  title: string;
  data: Bucket[];
  // When provided, a toggle lets the user count comma-separated cell values
  // separately (see buildTrendSections / categoricalDistribution).
  splitData?: Bucket[];
  mounted: boolean;
  height?: number;
}) {
  const [split, setSplit] = useState(false);
  const hasSplit = !!splitData && splitData.length > 0;
  const shown = split && splitData ? splitData : data;

  if (data.length === 0) return null;

  // ---- Dynamic axis fitting so no tick label gets clipped ----
  const maxChars = shown.reduce((m, d) => Math.max(m, d.label.length), 1);
  const rotate = shown.length > 5 || maxChars > 6;
  const angle = rotate ? (maxChars > 12 ? -60 : -35) : 0;
  const rad = (Math.abs(angle) * Math.PI) / 180;
  // Vertical room a rotated label needs, capped so one runaway label can't take
  // over the whole card.
  const wantBand = rotate ? Math.round(maxChars * CHAR_PX * Math.sin(rad)) + 16 : 22;
  const xAxisHeight = Math.min(wantBand, MAX_AXIS_BAND);
  // How many characters actually fit in the (possibly capped) band; longer ones
  // are ellipsized so the text never overruns the card edge.
  const maxTickChars =
    rotate && wantBand > MAX_AXIS_BAND
      ? Math.max(6, Math.floor((xAxisHeight - 16) / (CHAR_PX * Math.sin(rad))))
      : Infinity;
  const fitTick = (v: string) =>
    v.length > maxTickChars ? v.slice(0, Math.max(1, maxTickChars - 1)) + "…" : v;

  const maxCount = shown.reduce((m, d) => Math.max(m, d.count), 0);
  const yAxisWidth = Math.max(30, String(maxCount).length * 8 + 14);
  // Grow the card when the label band needs more than the default room, so the
  // bars themselves keep a stable height instead of being squeezed.
  const containerHeight = height + Math.max(0, xAxisHeight - 30);

  return (
    <div className="rounded-lg border border-rule bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono">{title}</h3>
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
      </div>
      <div style={{ width: "100%", height: containerHeight }}>
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
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
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </RBar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
