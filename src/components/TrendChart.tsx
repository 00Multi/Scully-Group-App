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

export function TrendChart({
  title,
  data,
  mounted,
  height = 180,
}: {
  title: string;
  data: Bucket[];
  mounted: boolean;
  height?: number;
}) {
  if (data.length === 0) return null;
  return (
    <div className="rounded-lg border border-rule bg-card p-4">
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono mb-3">{title}</h3>
      <div style={{ width: "100%", height }}>
        {mounted && (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 4, right: 8, left: 4, bottom: 4 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "currentColor" }}
                interval={0}
                angle={data.length > 5 ? -30 : 0}
                textAnchor={data.length > 5 ? "end" : "middle"}
                height={data.length > 5 ? 46 : 20}
                stroke="currentColor"
                className="text-muted-foreground"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: "currentColor" }}
                stroke="currentColor"
                className="text-muted-foreground"
                width={40}
                tickMargin={4}
              />
              <RTooltip
                cursor={{ fill: "rgba(184,115,51,0.08)" }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                labelStyle={{ fontWeight: 600 }}
              />
              <RBar dataKey="count" radius={[3, 3, 0, 0]}>
                {data.map((_, i) => (
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
