// A stable colour per experiment (by its position within a paper), used to tag
// experiments across the viewer — switcher chips, per-row selectors, and the
// multi-experiment comparison columns. Muted tones that read on both themes.
export const EXP_COLORS = [
  "#b87333", // copper
  "#6b8f71", // sage
  "#7a9bb0", // slate blue
  "#9a7aa0", // mauve
  "#c2a36b", // brass
  "#8c9db5", // steel
  "#b0846b", // clay
  "#5f9ea0", // teal
  "#a0788f", // plum
  "#7f9c6b", // moss
];

export function expColor(index: number): string {
  const n = EXP_COLORS.length;
  return EXP_COLORS[((index % n) + n) % n];
}
