import { useEffect, useRef, useState } from "react";
import { Check, Copy, Maximize2, Ruler, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";

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
//
// All geometry is stored in intrinsic image pixels and mapped from pointer
// events through the element's live bounding rect, so zooming (a display-only
// transform) never changes any measurement.

type Line = { x1: number; y1: number; x2: number; y2: number };
type Unit = "µm" | "mm";
interface Test {
  id: number;
  line: Line;
  lengthMm: number;
  count: number;
}

const COLORS = ["#ff0000", "#ffd400", "#00e000", "#00e5ff", "#ff00ff", "#ffffff", "#000000"];
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;

const lineLen = (l: Line) => Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
const toMm = (value: number, unit: Unit) => (unit === "µm" ? value / 1000 : value);
const clampZoom = (z: number) => Math.min(Math.max(z, ZOOM_MIN), ZOOM_MAX);
const fmt = (n: number, d = 3) => {
  if (!Number.isFinite(n)) return "—";
  return String(Number(n.toFixed(d)));
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
  const paneRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);

  const [zoom, setZoom] = useState(1);
  const [fitZoom, setFitZoom] = useState(1);

  const [color, setColor] = useState("#ff0000");

  // Counting box: a Z×Z square (Z = average grain size × a user factor) to count
  // grain boundaries attacked inside. `tool` decides what the pointer does.
  const [tool, setTool] = useState<"line" | "box">("line");
  const [scaleFactor, setScaleFactor] = useState("5");
  const [boxCenter, setBoxCenter] = useState<{ x: number; y: number } | null>(null);
  const [boxCount, setBoxCount] = useState("");

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

  // Ctrl/⌘ + wheel zooms; a plain wheel still scrolls the pane. Attached as a
  // non-passive listener so preventDefault actually blocks browser zoom.
  useEffect(() => {
    const pane = paneRef.current;
    if (!pane) return;
    const handler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    };
    pane.addEventListener("wheel", handler, { passive: false });
    return () => pane.removeEventListener("wheel", handler);
  }, []);

  // Fit the image to the pane on load.
  const onImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const w = e.currentTarget.naturalWidth;
    const h = e.currentTarget.naturalHeight;
    setNatural({ w, h });
    const pane = paneRef.current;
    const availW = (pane?.clientWidth ?? 800) - 32;
    const availH = (pane?.clientHeight ?? 500) - 32;
    const fit = clampZoom(Math.min(availW / w, availH / h, 1));
    setFitZoom(fit);
    setZoom(fit);
  };

  // Map a pointer event to intrinsic image pixels via the live bounding rect,
  // so the current zoom is already accounted for.
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
    // Box tool: click/drag positions the counting square instead of drawing.
    if (tool === "box") {
      if (boxSidePx == null) return;
      drawing.current = true;
      setBoxCenter(clampBoxCenter(p, boxSidePx));
      boxRef.current?.setPointerCapture(e.pointerId);
      return;
    }
    drawing.current = true;
    setDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
    setDraftCount("");
    boxRef.current?.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const p = toImage(e);
    if (!p) return;
    if (tool === "box") {
      if (boxSidePx != null) setBoxCenter(clampBoxCenter(p, boxSidePx));
      return;
    }
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
  const lbarUm = lbarMm != null ? lbarMm * 1000 : null;
  const g = lbarMm != null && lbarMm > 0 ? -6.6457 * Math.log10(lbarMm) - 3.298 : null;

  // Z = average grain size (µm) × factor; box side in intrinsic pixels.
  const xFactor = Number(scaleFactor);
  const zUm = lbarUm != null && Number.isFinite(xFactor) && xFactor > 0 ? lbarUm * xFactor : null;
  const boxSidePx = zUm != null && scaleMmPerPx ? zUm / 1000 / scaleMmPerPx : null;
  // Keep the box's centre so the square stays inside the image.
  const clampBoxCenter = (p: { x: number; y: number }, side: number) => {
    if (!natural) return p;
    const hx = Math.min(side, natural.w) / 2;
    const hy = Math.min(side, natural.h) / 2;
    return {
      x: Math.min(Math.max(p.x, hx), natural.w - hx),
      y: Math.min(Math.max(p.y, hy), natural.h - hy),
    };
  };

  // The user copies just the average grain (intercept) size in microns — a bare
  // number, no unit.
  const copyResult = async () => {
    if (lbarUm == null) return;
    try {
      await navigator.clipboard.writeText(fmt(lbarUm, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  };

  const draftLenMm = draft && scaleMmPerPx != null ? lineLen(draft) * scaleMmPerPx : null;

  const zoomBy = (factor: number) => setZoom((z) => clampZoom(z * factor));

  const displayW = natural ? natural.w * zoom : undefined;

  const strokeFor = (l: Line, dash?: string) => (
    <line
      x1={l.x1}
      y1={l.y1}
      x2={l.x2}
      y2={l.y2}
      stroke={color}
      strokeWidth={2}
      strokeDasharray={dash}
      vectorEffect="non-scaling-stroke"
    />
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-4"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[96vh] w-full max-w-[92rem] flex-col overflow-hidden rounded-lg border border-rule bg-card shadow-xl">
        <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Ruler className="h-4 w-4 text-copper shrink-0" />
            <span className="text-sm font-serif italic truncate">
              Grain size — intercept method{title ? ` · ${title}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-1">
            {/* Zoom controls (visual aid only — measurements are unaffected). */}
            <button
              onClick={() => zoomBy(1 / 1.25)}
              className="p-1 rounded hover:bg-accent text-muted-foreground"
              title="Zoom out"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="w-12 text-center tabular-nums text-xs text-muted-foreground">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => zoomBy(1.25)}
              className="p-1 rounded hover:bg-accent text-muted-foreground"
              title="Zoom in"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              onClick={() => setZoom(fitZoom)}
              className="p-1 rounded hover:bg-accent text-muted-foreground"
              title="Fit to window"
              aria-label="Fit to window"
            >
              <Maximize2 className="h-4 w-4" />
            </button>
            <span className="mx-1 h-4 w-px bg-rule" />
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-accent text-muted-foreground"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 overflow-hidden md:grid-cols-[1fr_21rem]">
          {/* Image + drawing surface */}
          <div
            ref={paneRef}
            className="min-h-0 overflow-auto bg-muted/30 p-4 flex items-start"
            style={{ justifyContent: "safe center" }}
          >
            <div
              ref={boxRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="relative inline-block select-none touch-none cursor-crosshair shrink-0"
              style={displayW ? { width: displayW } : undefined}
            >
              <img
                src={imageUrl}
                alt={title || "Micrograph"}
                draggable={false}
                onLoad={onImageLoad}
                style={displayW ? { width: displayW } : { maxWidth: "100%" }}
                className="block bg-white"
              />
              {natural && (
                <svg
                  className="absolute inset-0 h-full w-full pointer-events-none"
                  viewBox={`0 0 ${natural.w} ${natural.h}`}
                  preserveAspectRatio="none"
                >
                  {scaleLine && strokeFor(scaleLine, "5 3")}
                  {tests.map((t) => (
                    <g key={t.id}>{strokeFor(t.line)}</g>
                  ))}
                  {draft && strokeFor(draft, "6 4")}
                  {boxCenter && boxSidePx != null && (
                    <rect
                      x={boxCenter.x - boxSidePx / 2}
                      y={boxCenter.y - boxSidePx / 2}
                      width={boxSidePx}
                      height={boxSidePx}
                      stroke={color}
                      strokeWidth={2}
                      fill={color}
                      fillOpacity={0.08}
                      vectorEffect="non-scaling-stroke"
                    />
                  )}
                </svg>
              )}
            </div>
          </div>

          {/* Controls */}
          <div className="min-h-0 overflow-y-auto border-t border-rule md:border-l md:border-t-0 p-4 space-y-4 text-sm">
            {/* Line colour */}
            <section>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono mb-1">
                Line colour
              </h3>
              <div className="flex items-center gap-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    onClick={() => setColor(c)}
                    aria-label={`Use ${c}`}
                    className={
                      "h-5 w-5 rounded-full border transition-transform " +
                      (color.toLowerCase() === c ? "ring-2 ring-copper scale-110" : "border-rule")
                    }
                    style={{ backgroundColor: c }}
                  />
                ))}
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  aria-label="Custom line colour"
                  className="h-5 w-6 cursor-pointer rounded border border-rule bg-transparent p-0"
                />
              </div>
            </section>

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
                      onKeyDown={(e) => e.key === "Enter" && setScale()}
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
                  onKeyDown={(e) => e.key === "Enter" && addTest()}
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

            {/* Step 3: grain-boundary counting box */}
            <section className={measuring ? "" : "opacity-40 pointer-events-none"}>
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono mb-1">
                3 · Grain-boundary box
              </h3>
              <p className="text-xs text-muted-foreground">
                Draw a Z×Z box (Z = average grain size × your factor) and count the grain boundaries
                attacked inside it.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <label className="text-xs text-muted-foreground">Factor ×</label>
                <input
                  value={scaleFactor}
                  onChange={(e) => setScaleFactor(e.target.value)}
                  inputMode="decimal"
                  placeholder="e.g. 5"
                  className="w-16 bg-transparent border-b border-input focus:border-primary focus:outline-none text-sm py-0.5 font-mono"
                />
                <button
                  onClick={() => {
                    if (boxSidePx == null) return;
                    setTool((t) => (t === "box" ? "line" : "box"));
                    if (boxCenter == null && natural)
                      setBoxCenter({ x: natural.w / 2, y: natural.h / 2 });
                  }}
                  disabled={boxSidePx == null}
                  className={
                    "ml-auto rounded px-2.5 py-1 text-xs disabled:opacity-40 " +
                    (tool === "box" ? "bg-copper text-white" : "bg-primary text-primary-foreground")
                  }
                  title={boxSidePx == null ? "Add at least one intercept test first" : undefined}
                >
                  {tool === "box" ? "Placing…" : boxCenter ? "Move box" : "Place box"}
                </button>
              </div>
              {zUm != null ? (
                <p className="mt-1 text-[11px] text-muted-foreground font-mono">
                  Z = {fmt(zUm, 2)} µm ({fmt(boxSidePx ?? 0, 0)} px per side)
                </p>
              ) : (
                measuring && (
                  <p className="mt-1 text-[11px] text-muted-foreground italic">
                    Add at least one intercept test to size the box.
                  </p>
                )
              )}
              {boxCenter && (
                <div className="mt-2 flex items-center gap-2">
                  <label className="text-xs text-muted-foreground">Boundaries attacked</label>
                  <input
                    value={boxCount}
                    onChange={(e) => setBoxCount(e.target.value)}
                    inputMode="numeric"
                    placeholder="count"
                    className="w-16 bg-transparent border-b border-input focus:border-primary focus:outline-none text-sm py-0.5 font-mono"
                  />
                  <button
                    onClick={() => {
                      setBoxCenter(null);
                      setBoxCount("");
                      setTool("line");
                    }}
                    className="ml-auto text-xs text-copper hover:underline"
                  >
                    Clear box
                  </button>
                </div>
              )}
            </section>

            {/* Results */}
            <section className="rounded-lg border border-rule bg-muted/30 p-3">
              <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono mb-2">
                Result
              </h3>
              <div className="space-y-1 font-mono text-xs">
                <div className="flex items-end justify-between">
                  <span className="text-muted-foreground text-xs">Avg grain size L̄</span>
                  <span className="text-base font-semibold">
                    {lbarUm != null ? `${fmt(lbarUm, 2)} µm` : "—"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">ASTM G</span>
                  <span>{g != null ? fmt(g, 2) : "—"}</span>
                </div>
              </div>
              <button
                onClick={copyResult}
                disabled={lbarUm == null}
                className="mt-2 w-full inline-flex items-center justify-center gap-1 rounded border border-rule px-2 py-1 text-xs hover:bg-accent disabled:opacity-40"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-state-filled" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
                {copied ? "Copied" : "Copy average (µm)"}
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
