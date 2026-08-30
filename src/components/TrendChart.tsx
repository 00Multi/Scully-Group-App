import { useRef, useState } from "react";
import {
  Bar as RBar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Check, Clipboard, Download, Loader2 } from "lucide-react";
import { CHART_COLORS, type Bucket } from "@/lib/trends";
import { canCopyImages, captureCardPng, copyPngToClipboard } from "@/lib/chartImage";
import { downloadBlob, sanitizeFilename } from "@/lib/download";

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
  const cardRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState<null | "copy" | "download">(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const showCopy = canCopyImages();

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
  return (
    <div ref={cardRef} className="group/chart rounded-lg border border-rule bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono">{title}</h3>
        {/* Export controls — excluded from the captured image via data-export-hide. */}
        <div
          data-export-hide
          className="flex items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover/chart:opacity-100"
        >
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
      {err && <p className="mb-2 text-[10px] text-destructive">{err}</p>}
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
