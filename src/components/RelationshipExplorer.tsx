import { useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
import type { Experiment } from "@/lib/db";
import type { FieldDef } from "@/lib/fields";
import { relationshipData } from "@/lib/trends";
import { canCopyImages, captureCardPng, copyPngToClipboard } from "@/lib/chartImage";
import { downloadBlob, sanitizeFilename } from "@/lib/download";

const COPPER = "#b87333";
const fieldTitle = (f: FieldDef) => (f.unit ? `${f.label} (${f.unit})` : f.label);

type Mode = "bar" | "line";

function FieldSelect({
  value,
  onChange,
  label,
  fields,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  fields: FieldDef[];
}) {
  return (
    <label className="inline-flex items-center gap-1.5 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="max-w-[11rem] rounded border border-input bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
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

export function RelationshipExplorer({
  experiments,
  fieldDefs,
  mounted,
}: {
  experiments: Experiment[];
  fieldDefs: FieldDef[];
  mounted: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  // Only fields that hold a value worth plotting (images can't be charted).
  const fields = useMemo(() => fieldDefs.filter((f) => f.type !== "image"), [fieldDefs]);
  const numericKeys = fields.filter((f) => f.type === "number").map((f) => f.key);

  // Default to the first two numeric fields when available, else the first two.
  const [xKey, setXKey] = useState(() => numericKeys[0] ?? fields[0]?.key ?? "");
  const [yKey, setYKey] = useState(
    () => numericKeys.find((k) => k !== (numericKeys[0] ?? fields[0]?.key)) ?? fields[1]?.key ?? "",
  );
  const [mode, setMode] = useState<Mode>("bar");
  const [busy, setBusy] = useState<null | "copy" | "download">(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const xField = fields.find((f) => f.key === xKey);
  const yField = fields.find((f) => f.key === yKey);

  const result = useMemo(
    () => (xField && yField ? relationshipData(experiments, xField, yField) : null),
    [experiments, xField, yField],
  );

  // A line only makes sense when the x-axis is ordered (a numeric field, binned).
  const canLine = !!result?.numericX;
  const effectiveMode: Mode = mode === "line" && canLine ? "line" : "bar";

  const title =
    xField && yField ? `${fieldTitle(yField)} vs ${fieldTitle(xField)}` : "Relationship";

  const exportPng = async (how: "copy" | "download") => {
    if (!cardRef.current) return;
    setErr(null);
    setBusy(how);
    try {
      const png = await captureCardPng(cardRef.current, { title });
      if (how === "copy") {
        await copyPngToClipboard(png);
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      } else {
        downloadBlob(png, `${sanitizeFilename(title) || "relationship"}.png`);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  };

  const points = result?.points ?? [];
  const maxChars = points.reduce((m, p) => Math.max(m, p.label.length), 1);
  const rotate = points.length > 5 || maxChars > 6;

  const iconBtn =
    "rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50";

  return (
    <div ref={cardRef} className="rounded-lg border border-rule bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono">
          Relationship explorer
        </h3>
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

      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <FieldSelect label="Y:" value={yKey} onChange={setYKey} fields={fields} />
        <FieldSelect label="vs X:" value={xKey} onChange={setXKey} fields={fields} />
        <div className="inline-flex overflow-hidden rounded-md border border-rule">
          <button
            onClick={() => setMode("bar")}
            className={
              "inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors " +
              (effectiveMode === "bar"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent")
            }
            title="Histogram"
          >
            <BarChart3 className="h-3 w-3" /> Bars
          </button>
          <button
            onClick={() => setMode("line")}
            disabled={!canLine}
            className={
              "inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors disabled:opacity-40 " +
              (effectiveMode === "line"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent")
            }
            title={canLine ? "Line" : "Line needs a numeric X field"}
          >
            <LineIcon className="h-3 w-3" /> Line
          </button>
        </div>
      </div>

      {err && <p className="mb-2 text-[10px] text-destructive">{err}</p>}

      {points.length === 0 ? (
        <div className="flex h-[220px] items-center justify-center text-xs italic text-muted-foreground">
          {xKey === yKey
            ? "Pick two different fields."
            : "No experiments have both of these fields filled in."}
        </div>
      ) : (
        <>
          <div className="mb-1 text-[10px] text-muted-foreground">
            {result?.yLabel} by {xField ? fieldTitle(xField) : ""} · {result?.total} experiment
            {result?.total === 1 ? "" : "s"}
          </div>
          <div style={{ width: "100%", height: 240 }}>
            {mounted && (
              <ResponsiveContainer width="100%" height="100%">
                {effectiveMode === "line" ? (
                  <LineChart data={points} margin={{ top: 6, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid
                      stroke="currentColor"
                      className="text-rule/40"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "currentColor" }}
                      interval={0}
                      angle={rotate ? -35 : 0}
                      textAnchor={rotate ? "end" : "middle"}
                      height={rotate ? 60 : 22}
                      tickMargin={6}
                      stroke="currentColor"
                      className="text-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "currentColor" }}
                      stroke="currentColor"
                      className="text-muted-foreground"
                      width={44}
                      tickMargin={4}
                    />
                    <RTooltip content={<RelTooltip yLabel={result?.yLabel ?? ""} />} />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke={COPPER}
                      strokeWidth={2}
                      dot={{ r: 3, fill: COPPER }}
                    />
                  </LineChart>
                ) : (
                  <BarChart data={points} margin={{ top: 6, right: 12, left: 4, bottom: 4 }}>
                    <CartesianGrid
                      stroke="currentColor"
                      className="text-rule/40"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "currentColor" }}
                      interval={0}
                      angle={rotate ? -35 : 0}
                      textAnchor={rotate ? "end" : "middle"}
                      height={rotate ? 60 : 22}
                      tickMargin={6}
                      stroke="currentColor"
                      className="text-muted-foreground"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "currentColor" }}
                      stroke="currentColor"
                      className="text-muted-foreground"
                      width={44}
                      tickMargin={4}
                    />
                    <RTooltip
                      cursor={{ fill: "rgba(184,115,51,0.08)" }}
                      content={<RelTooltip yLabel={result?.yLabel ?? ""} />}
                    />
                    <Bar dataKey="value" fill={COPPER} radius={[3, 3, 0, 0]} />
                  </BarChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Tooltip showing the aggregated value plus the sample size for the group.
function RelTooltip({
  active,
  payload,
  label,
  yLabel,
}: {
  active?: boolean;
  payload?: { payload: { value: number; n: number } }[];
  label?: string;
  yLabel: string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-md border border-rule bg-card px-2 py-1 text-xs shadow">
      <div className="font-medium">{label}</div>
      <div>
        {yLabel}: <span className="font-mono">{p.value}</span>
      </div>
      <div className="text-muted-foreground">n = {p.n}</div>
    </div>
  );
}
