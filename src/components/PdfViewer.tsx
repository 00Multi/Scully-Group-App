import { useCallback, useEffect, useRef, useState } from "react";
import { pdfPublicUrl } from "@/lib/db";
import type { Paper } from "@/lib/db";
import { useSnip } from "@/lib/snip";
import {
  ChevronLeft,
  ChevronRight,
  FileText,
  Loader2,
  Scissors,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

// Minimal structural types for the slice of pdf.js we use (its shipped types
// are awkward to import in this setup).
type PdfViewport = { width: number; height: number };
type PdfRenderTask = { promise: Promise<void>; cancel: () => void };
type PdfPage = {
  getViewport: (o: { scale: number }) => PdfViewport;
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport }) => PdfRenderTask;
};
type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage> };
type Pdfjs = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: string) => { promise: Promise<PdfDoc> };
};

// pdf.js is browser-only; import lazily so it never runs during SSR.
let pdfjsPromise: Promise<Pdfjs> | null = null;
async function getPdfjs(): Promise<Pdfjs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const pdfjs = (await import("pdfjs-dist")) as unknown as Pdfjs;
      if (!pdfjs.GlobalWorkerOptions.workerSrc) {
        const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      }
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}

interface Sel {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Remember which page each paper's PDF was left on, so switching between the
// Data/Split/Paper tabs (which remount the viewer) or opening another paper and
// coming back restores the reader's place. Backed by localStorage so it also
// survives a reload.
const PAGE_MEM_KEY = "pdf.page.v1";
function loadPageMem(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(PAGE_MEM_KEY) || "{}");
  } catch {
    return {};
  }
}
const pageMemory: Record<string, number> = loadPageMem();
function rememberPage(paperId: string, page: number) {
  pageMemory[paperId] = page;
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PAGE_MEM_KEY, JSON.stringify(pageMemory));
  } catch {
    /* ignore quota errors */
  }
}

export function PdfViewer({ paper }: { paper: Paper }) {
  const url = paper.pdf_path ? pdfPublicUrl(paper.pdf_path) : null;
  const snip = useSnip();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const docRef = useRef<PdfDoc | null>(null);
  const renderTaskRef = useRef<PdfRenderTask | null>(null);

  const [numPages, setNumPages] = useState(0);
  const [page, setPage] = useState(() => pageMemory[paper.id] ?? 1);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Persist the current page for this paper whenever it changes.
  useEffect(() => {
    rememberPage(paper.id, page);
  }, [paper.id, page]);

  // Selection rectangle (in canvas CSS pixels) while snipping.
  const [drag, setDrag] = useState<Sel | null>(null);
  const dragStart = useRef<{ x: number; y: number } | null>(null);

  // Load the document when the URL changes. Restore the remembered page for
  // this paper rather than jumping back to page 1.
  useEffect(() => {
    let cancelled = false;
    setNumPages(0);
    setPage(pageMemory[paper.id] ?? 1);
    setError(null);
    docRef.current = null;
    if (!url) return;
    (async () => {
      try {
        setLoading(true);
        const pdfjs = await getPdfjs();
        const doc = await pdfjs.getDocument(url).promise;
        if (cancelled) return;
        docRef.current = doc;
        setNumPages(doc.numPages);
        // Clamp a remembered page that's now out of range.
        setPage((p) => Math.min(Math.max(1, p), doc.numPages));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load the PDF.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, paper.id]);

  // Render the current page whenever it, the scale, or the document changes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const doc = docRef.current;
      const canvas = canvasRef.current;
      if (!doc || !canvas) return;
      try {
        const pg = await doc.getPage(page);
        if (cancelled) return;
        const viewport = pg.getViewport({ scale });
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        if (renderTaskRef.current) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            /* ignore */
          }
        }
        const task = pg.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
      } catch (e) {
        const name = e instanceof Error ? e.name : "";
        if (!cancelled && name !== "RenderingCancelledException") {
          setError(e instanceof Error ? e.message : "Could not render the page.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [page, scale, numPages]);

  // ---- Snip selection handlers (active only while snip.active) ----
  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!snip.active) return;
      const rect = e.currentTarget.getBoundingClientRect();
      dragStart.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      setDrag({ x: dragStart.current.x, y: dragStart.current.y, w: 0, h: 0 });
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [snip.active],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!snip.active || !dragStart.current) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      const s = dragStart.current;
      setDrag({
        x: Math.min(s.x, cx),
        y: Math.min(s.y, cy),
        w: Math.abs(cx - s.x),
        h: Math.abs(cy - s.y),
      });
    },
    [snip.active],
  );

  const onPointerUp = useCallback(
    async (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!snip.active || !dragStart.current) return;
      const canvas = e.currentTarget;
      const rect = canvas.getBoundingClientRect();
      const sel = drag;
      dragStart.current = null;
      setDrag(null);
      if (!sel || sel.w < 6 || sel.h < 6) return; // ignore tiny/stray clicks

      // The selection as fractions of the displayed page (0–1), so the current
      // zoom doesn't matter — we re-render the crop from the PDF itself.
      const fx0 = sel.x / rect.width;
      const fy0 = sel.y / rect.height;
      const fw = sel.w / rect.width;
      const fh = sel.h / rect.height;

      const doc = docRef.current;
      let blob: Blob | null = null;
      try {
        if (doc) {
          const pg = await doc.getPage(page);
          // Render the page at a high, zoom-independent scale so the snip is as
          // crisp as the vector PDF allows. Aim for ~2600px wide, clamped, and
          // cap total pixels so huge pages don't blow up memory.
          const base = pg.getViewport({ scale: 1 });
          let hi = Math.max(2, Math.min(6, 2600 / base.width));
          const MAX_AREA = 26_000_000;
          if (base.width * base.height * hi * hi > MAX_AREA) {
            hi = Math.sqrt(MAX_AREA / (base.width * base.height));
          }
          const vp = pg.getViewport({ scale: hi });
          const full = document.createElement("canvas");
          full.width = Math.round(vp.width);
          full.height = Math.round(vp.height);
          const fctx = full.getContext("2d");
          if (fctx) {
            await pg.render({ canvasContext: fctx, viewport: vp }).promise;
            const sx = fx0 * full.width;
            const sy = fy0 * full.height;
            const sw = fw * full.width;
            const sh = fh * full.height;
            const out = document.createElement("canvas");
            out.width = Math.max(1, Math.round(sw));
            out.height = Math.max(1, Math.round(sh));
            const octx = out.getContext("2d");
            if (octx) {
              octx.drawImage(full, sx, sy, sw, sh, 0, 0, out.width, out.height);
              blob = await new Promise((res) => out.toBlob(res, "image/png"));
            }
          }
        }
      } catch {
        blob = null;
      }

      // Fall back to cropping the on-screen canvas if the high-res render fails.
      if (!blob) {
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const out = document.createElement("canvas");
        out.width = Math.max(1, Math.round(sel.w * scaleX));
        out.height = Math.max(1, Math.round(sel.h * scaleY));
        const octx = out.getContext("2d");
        if (octx) {
          octx.drawImage(
            canvas,
            sel.x * scaleX,
            sel.y * scaleY,
            sel.w * scaleX,
            sel.h * scaleY,
            0,
            0,
            out.width,
            out.height,
          );
          blob = await new Promise((res) => out.toBlob(res, "image/png"));
        }
      }

      if (blob) await snip.capture(blob);
    },
    [snip, drag, page],
  );

  if (!url) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
        <FileText className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">No PDF attached to this paper.</p>
        <p className="text-xs mt-1">Use "Upload PDF" in the paper header to add one.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-rule bg-card/60 text-xs">
        <span className="truncate font-mono text-muted-foreground min-w-0 flex-1">
          {paper.pdf_name || "document.pdf"}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-1 rounded hover:bg-accent disabled:opacity-30"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="tabular-nums text-muted-foreground">
            {numPages ? `${page} / ${numPages}` : "—"}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(numPages || 1, p + 1))}
            disabled={numPages > 0 && page >= numPages}
            className="p-1 rounded hover:bg-accent disabled:opacity-30"
            aria-label="Next page"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <span className="w-px h-4 bg-rule mx-1" />
          <button
            onClick={() => setScale((s) => Math.max(0.5, +(s - 0.2).toFixed(2)))}
            className="p-1 rounded hover:bg-accent"
            aria-label="Zoom out"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => setScale((s) => Math.min(3, +(s + 0.2).toFixed(2)))}
            className="p-1 rounded hover:bg-accent"
            aria-label="Zoom in"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-copper hover:underline ml-1"
          >
            Open ↗
          </a>
        </div>
      </div>

      {snip.active && (
        <div className="flex items-center gap-2 px-3 py-1.5 bg-copper/10 border-b border-copper/40 text-xs text-copper">
          <Scissors className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">
            Drag a box over the figure to capture{snip.label ? ` for ${snip.label}` : ""}.
          </span>
          <button
            onClick={snip.cancel}
            className="inline-flex items-center gap-1 rounded border border-copper/40 px-1.5 py-0.5 hover:bg-copper/20"
          >
            <X className="h-3 w-3" /> Cancel
          </button>
        </div>
      )}

      <div
        className="flex-1 min-h-0 overflow-auto bg-muted/30 flex p-3"
        style={{ justifyContent: "safe center" }}
      >
        {loading && (
          <div className="self-center flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading PDF…
          </div>
        )}
        {error && !loading && (
          <div className="self-center text-sm text-destructive max-w-sm text-center">{error}</div>
        )}
        {!error && (
          <div className="relative h-max">
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className={"shadow-md bg-white block " + (snip.active ? "cursor-crosshair" : "")}
            />
            {drag && (
              <div
                className="absolute border-2 border-copper bg-copper/10 pointer-events-none"
                style={{ left: drag.x, top: drag.y, width: drag.w, height: drag.h }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
