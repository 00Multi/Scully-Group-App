import { useEffect, useRef, useState } from "react";
import { Check, Copy, Ruler, Trash2, X } from "lucide-react";

// ASTM E112 grain-size calculator using the intercept method.
//
// Workflow:
//  1. Calibrate — drag a line across the scale bar and enter its real length,
//     which sets the mm-per-pixel scale for everything that follows.
//  2. Measure — drag horizontal/vertical test lines across grains and enter the
//     intercept count N for each. The mean intercept length is
//       L̄ = Σ(line length, mm) / Σ(N)
//     and the ASTM grain-size number (Eq. 5 as supplied) is
//       G = −6.6457·log₁₀(L̄) − 3.298,  with L̄ in mm.

type Line = { x1: number; y1: number; x2: number; y2: number };
type Unit = "µm" | "mm";
interface Test {
  id: number;
  line: Line;
  lengthMm: number;
  count: number;
}

const lineLen = (l: Line) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
const toMm = (value: number, unit: Unit) => (unit === "µm" ? value / 1000 : value);
const fmt = (n: number, d = 3) => {
  if (!Number.isFinite(n)) return "—";
  const r = Number(n.toFixed(d));
  return String(r);
};

export function GrainSizeCalculator({
  imageUrl,
  title,
  onClose,
}: {
  imageUrl: string;
  title?: string;
  onClose: () => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  const [scaleMmPerPx, setScaleMmPerPx] = useState<number | null>(null);
  const [scaleLine, setScaleLine] = useState<Line | null>(null);
  const [scaleLength, setScaleLength] = useState("");
  const [scaleUnit, setScaleUnit] = useState<Unit>("µm");

  const [draft, setDraft] = useState<Line | null>(null);
  const [draftCount, setDraftCount] = useState("");
  const [tests, setTests] = useState<Test[]>([]);
  const [copied, setCopied] = useState(false);

  const drawing = useRef(false);
  const idRef = useRef(1);

  const measuring = scaleMmPerPx != null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Map a pointer event to intrinsic image pixels.
  const toImage = (e: React.PointerEvent) => {
    const box = boxRef.current;
    if (!box || !natural) return null;
    const r = box.getBoundingClientRect();
    const nx = (e.clientX - r.left) / r.width;
    const ny = (e.clientY - r.top) / r.height;
    return {
      x: Math.min(Math.max(nx, 0), 1) * natural.w,
      y: Math.min(Math.max(ny, 0), 1) * natural.h,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const p = toImage(e);
    if (!p) return;
    drawing.current = true;
    setDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    setDraftCount("");
    boxRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = toImage(e);
    if (!p) return;
    setDraft((d) => {
      if (!d) return d;
      // In the measure phase, snap test lines to horizontal or vertical.
      if (measuring) {
        if (Math.abs(p.x - d.x1) >= Math.abs(p.y - d.y1)) return { ...d, x2: p.x, y2: d.y1 };
        return { ...d, x2: d.x1, y2: p.y };
      }
      return { ...d, x2: p.x, y2: p.y };
    });
  };
  const onPointerUp = () => {
    drawing.current = false;
  };

  const setScale = () => {
    const v = Number(scaleLength);
    if (!draft || !Number.isFinite(v) || v <= 0) return;
    const px = lineLen(draft);
    if (px < 2) return;
    setScaleMmPerPx(toMm(v, scaleUnit) / px);
    setScaleLine(draft);
    setDraft(null);
  };
  const recalibrate = () => {
    setScaleMmPerPx(null);
    setScaleLine(null);
    setDraft(null);
  };
  const addTest = () => {
    const n = Number(draftCount);
    if (!draft || scaleMmPerPx == null || !Number.isFinite(n) || n <= 0) return;
    const lengthMm = lineLen(draft) * scaleMmPerPx;
    if (lengthMm <= 0) return;
    setTests((t) => [...t, { id: idRef.current++, line: draft, lengthMm, count: n }]);
    setDraft(null);
    setDraftCount("");
  };
  const removeTest = (id: number) => setTests((t) => t.filter((x) => x.id !== id));

  const totalLen = tests.reduce((s, t) => s + t.lengthMm, 0);
  const totalN = tests.reduce((s, t) => s + t.count, 0);
  const lbarMm = totalN > 0 ? totalLen / totalN : null;
  const g = lbarMm != null && lbarMm > 0 ? -6.6457 * Math.log10(lbarMm) - 3.298 : null;

  const copyResult = async () => {
    if (g == null || lbarMm == null) return;
    const text = `ASTM E112 grain size G = ${fmt(g, 2)} (mean intercept length L̄ = ${fmt(lbarMm * 1000, 2)} µm, ${tests.length} test line${tests.length === 1 ? "" : "s"})`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const draftLenMm = draft && scaleMmPerPx != null ? lineLen(draft) * scaleMmPerPx : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-rule bg-card shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Ruler className="h-4 w-4 text-copper shrink-0" />
            <span className="text-sm font-serif italic truncate">
              Grain size — intercept method{title ? ` · ${title}` : ""}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-accent text-muted-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[1fr_20rem]">
          {/* Image + drawing surface */}
          <div className="min-h-0 overflow-auto bg-muted/30 p-3 flex items-start justify-center">
            <div
              ref={boxRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="relative inline-block select-none touch-none cursor-crosshair"
            >
              <img
                src={imageUrl}
                alt={title || "Micrograph"}
                draggable={false}
                onLoad={(e) =>
                  setNatural({
                    w: e.currentTarget.naturalWidth,
                    h: e.currentTarget.naturalHeight,
                  })
                }
                className="block max-h-[70vh] max-w-full w-auto bg-white"
              />
              {natural && (
                <svg
                  className="absolute inset-0 h-full w-full"
                  viewBox={`0 0 ${natural.w} ${natural.h}`}
                  preserveAspectRatio="none"
                >
                  {scaleLine && (
                    <line
                      x1={scaleLine.x1}
                      y1={scaleLine.y1}
                      x2={scaleLine.x2}
                      y2={scaleLine.y2}
                      stroke="#b87333"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                  {tests.map((t) => (
                    <line
                      key={t.id}
                      x1={t.line.x1}
                      y1={t.line.y1}
                      x2={t.line.x2}
                      y2={t.line.y2}
                      stroke="#6b8f71"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
                  {draft && (
                    <line
                      x1={draft.x1}
                      y1={draft.y1}
                      x2={draft.x2}
                      y2={draft.y2}
                      stroke={measuring ? "#6b8f71" : "#b87333"}
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="min-h-0 overflow-y-auto border-t border-rule md:border-l md:border-t-0 p-4 space-y-4 text-sm">
            {/* Step 1: calibrate */}
            <section>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono mb-1">
                1 · Calibrate scale
              </h3>
              {measuring ? (
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-state-filled inline-flex items-center gap-1">
                    <Check className="h-3.5 w-3.5" /> {fmt((scaleMmPerPx ?? 0) * 1000, 4)} µm/px
                  </span>
                  <button onClick={recalibrate} className="text-copper hover:underline">
                    Recalibrate
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Drag a line across the scale bar, then enter its true length.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      value={scaleLength}
                      onChange={(e) => setScaleLength(e.target.value)}
                      inputMode="decimal"
                      placeholder="length"
                      className="w-20 bg-transparent border-b border-input focus:border-primary focus:outline-none text-sm py-0.5 font-mono"
                    />
                    <select
                      value={scaleUnit}
                      onChange={(e) => setScaleUnit(e.target.value as Unit)}
                      className="bg-background border border-input rounded px-1 py-0.5 text-xs"
                    >
                      <option value="µm">µm</option>
                      <option value="mm">mm</option>
                    </select>
                    <button
                      onClick={setScale}
                      disabled={!draft || !Number(scaleLength)}
                      className="ml-auto rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-40"
                    >
                      Set scale
                    </button>
                  </div>
                </div>
              )}
            </section>

            {/* Step 2: measure */}
            <section className={measuring ? "" : "opacity-40 pointer-events-none"}>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono mb-1">
                2 · Intercept tests
              </h3>
              <p className="text-xs text-muted-foreground">
                Drag a horizontal or vertical test line across the grains, count the intercepts, and
                add the test.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Intercepts N</label>
                <input
                  value={draftCount}
                  onChange={(e) => setDraftCount(e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 12.5"
                  className="w-20 bg-transparent border-b border-input focus:border-primary focus:outline-none text-sm py-0.5 font-mono"
                />
                <button
                  onClick={addTest}
                  disabled={!draft || !Number(draftCount)}
                  className="ml-auto rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-40"
                >
                  Add test
                </button>
              </div>
              {draftLenMm != null && (
                <p className="mt-1 text-[11px] text-muted-foreground font-mono">
                  Line length: {fmt(draftLenMm * 1000, 1)} µm
                </p>
              )}

              {tests.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {tests.map((t, i) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-2 rounded bg-muted/40 px-2 py-1 text-[11px] font-mono"
                    >
                      <span>
                        #{i + 1}: {fmt(t.lengthMm * 1000, 1)} µm / N={fmt(t.count, 1)}
                      </span>
                      <button
                        onClick={() => removeTest(t.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remove test"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Results */}
            <section className="rounded-lg border border-rule bg-muted/30 p-3">
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono mb-2">
                Result
              </h3>
              <div className="space-y-1 font-mono text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Mean intercept L̄</span>
                  <span>{lbarMm != null ? `${fmt(lbarMm * 1000, 2)} µm` : "—"}</span>
                </div>
                <div className="flex justify-between text-base">
                  <span className="text-muted-foreground text-xs self-end">ASTM G</span>
                  <span className="font-semibold">{g != null ? fmt(g, 2) : "—"}</span>
                </div>
              </div>
              <button
                onClick={copyResult}
                disabled={g == null}
                className="mt-2 w-full inline-flex items-center justify-center gap-1 rounded border border-rule px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-state-filled" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy average"}
              </button>
            </section>

            <details className="text-[11px] text-muted-foreground">
              <summary className="cursor-pointer hover:text-foreground">
                How to count intercepts
              </summary>
              <p className="mt-1 leading-relaxed">
                Grain intercept count, N — the number of times a test line cuts through individual
                grains on the plane of polish. Tangent hits are considered as one half an
                interception; test lines that end within a grain are considered as one half an
                interception.
              </p>
              <p className="mt-1 leading-relaxed">
                ASTM E112 Eq. 5: G = −6.6457·log₁₀(L̄) − 3.298, where L̄ is the mean intercept length
                in mm on the specimen.
              </p>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}
