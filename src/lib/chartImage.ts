// Rasterize a chart card to a PNG so it can be copied to the clipboard or
// downloaded. Recharts renders an <svg> whose colors and fonts come from CSS
// (currentColor, utility classes) — none of which survive serialization — so we
// inline the computed presentation styles onto a clone before rasterizing, then
// composite it onto a canvas with the card background and the chart title.

const SVG_NS = "http://www.w3.org/2000/svg";

// Presentation properties that must travel with the serialized SVG.
const INLINE_PROPS = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-dasharray",
  "opacity",
  "font-family",
  "font-size",
  "font-weight",
  "text-anchor",
];

function inlineComputedStyles(source: SVGSVGElement, clone: SVGSVGElement) {
  const src = [source, ...Array.from(source.querySelectorAll("*"))];
  const dst = [clone, ...Array.from(clone.querySelectorAll("*"))];
  for (let i = 0; i < src.length && i < dst.length; i++) {
    const cs = getComputedStyle(src[i] as Element);
    const style = (dst[i] as SVGElement).style;
    for (const p of INLINE_PROPS) {
      const v = cs.getPropertyValue(p);
      if (v) style.setProperty(p, v);
    }
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not render the chart image."));
    img.src = url;
  });
}

// A fully-opaque background colour; transparent card backgrounds fall back to
// white so the exported PNG is never see-through.
function solidBackground(color: string): string {
  if (!color || color === "transparent") return "#ffffff";
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) {
    const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
    if (parts.length === 4 && parts[3] === 0) return "#ffffff";
  }
  return color;
}

// Render the chart inside `card` (its <svg>, plus the card background and the
// given title) to a PNG blob at `scale`× device resolution.
export async function captureCardPng(
  card: HTMLElement,
  opts: { title?: string; scale?: number } = {},
): Promise<Blob> {
  const svg = card.querySelector("svg");
  if (!svg) throw new Error("The chart isn't ready yet.");
  const scale = opts.scale ?? 2;
  const rect = svg.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));

  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineComputedStyles(svg as SVGSVGElement, clone);
  clone.setAttribute("xmlns", SVG_NS);
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${w} ${h}`);

  const svgStr = new XMLSerializer().serializeToString(clone);
  const img = await loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgStr));

  const cardStyle = getComputedStyle(card);
  const bg = solidBackground(cardStyle.backgroundColor);
  const pad = 16;
  const title = opts.title?.trim();
  const titleBand = title ? 26 : 0;
  const cssW = w + pad * 2;
  const cssH = h + pad * 2 + titleBand;

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(cssW * scale);
  canvas.height = Math.round(cssH * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas isn't supported in this browser.");
  ctx.scale(scale, scale);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, cssW, cssH);

  if (title) {
    const h3 = card.querySelector("h3");
    const ts = h3 ? getComputedStyle(h3) : cardStyle;
    ctx.fillStyle = ts.color || "#b87333";
    ctx.font = `600 11px ${ts.fontFamily || "system-ui, sans-serif"}`;
    ctx.textBaseline = "middle";
    ctx.fillText(title, pad, pad + titleBand / 2);
  }
  ctx.drawImage(img, pad, pad + titleBand, w, h);

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed."))), "image/png"),
  );
}

// Whether the browser can put an image on the clipboard.
export function canCopyImages(): boolean {
  return (
    typeof ClipboardItem !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.clipboard?.write
  );
}

export async function copyPngToClipboard(blob: Blob): Promise<void> {
  if (!canCopyImages()) throw new Error("Copying images isn't supported in this browser.");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
}
