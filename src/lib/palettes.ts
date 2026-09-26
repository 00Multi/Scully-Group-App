// Colour palettes for the Trends bar charts. "default" keeps the original
// categorical copper/muted set; the others are gradients (a colormap) mapped
// across the bars from first to last.

import { CHART_COLORS } from "./trends";

export type PaletteName = "default" | "jet" | "reds" | "blues" | "greens" | "mono";

export const PALETTES: { id: PaletteName; label: string }[] = [
  { id: "default", label: "Default" },
  { id: "jet", label: "Jet" },
  { id: "reds", label: "Red" },
  { id: "blues", label: "Blue" },
  { id: "greens", label: "Green" },
  { id: "mono", label: "Black" },
];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const hex = (r: number, g: number, b: number) =>
  "#" +
  [r, g, b]
    .map((v) =>
      Math.round(clamp01(v) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

// Classic "jet" colormap approximation, t in [0, 1].
function jet(t: number): string {
  const r = clamp01(1.5 - Math.abs(4 * t - 3));
  const g = clamp01(1.5 - Math.abs(4 * t - 2));
  const b = clamp01(1.5 - Math.abs(4 * t - 1));
  return hex(r, g, b);
}

// Linear interpolation between two hex colours.
function lerpHex(a: string, b: string, t: number): string {
  const pa = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(b.slice(i, i + 2), 16));
  return hex(
    (pa[0] + (pb[0] - pa[0]) * t) / 255,
    (pa[1] + (pb[1] - pa[1]) * t) / 255,
    (pa[2] + (pb[2] - pa[2]) * t) / 255,
  );
}

// Light → dark endpoints for the single-hue gradients.
const RAMPS: Record<Exclude<PaletteName, "default" | "jet">, [string, string]> = {
  reds: ["#f6b6ab", "#7f1d1d"],
  blues: ["#b7d0ec", "#1e3a8a"],
  greens: ["#bfe0c4", "#14532d"],
  mono: ["#d4d4d4", "#111827"],
};

// The colour of bar `i` of `n` for a palette.
export function barColor(palette: PaletteName, i: number, n: number): string {
  if (palette === "default") return CHART_COLORS[i % CHART_COLORS.length];
  const t = n <= 1 ? 0.5 : i / (n - 1);
  if (palette === "jet") return jet(t);
  const [lo, hi] = RAMPS[palette];
  return lerpHex(lo, hi, t);
}

// A single representative colour for the palette (used for the line view).
export function paletteAccent(palette: PaletteName): string {
  if (palette === "default") return "#b87333";
  if (palette === "jet") return jet(0.75);
  return RAMPS[palette][1];
}
