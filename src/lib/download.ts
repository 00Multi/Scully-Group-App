// Helpers for downloading uploaded images under a human-readable filename.
//
// Supabase Storage serves images from a different origin, and the anchor
// `download` attribute is ignored for cross-origin URLs (the browser navigates
// to the file instead of saving it). So we fetch the bytes ourselves and hand
// the browser an object URL, which the `download` attribute honours.

// Strip characters that are illegal in filenames on common filesystems and
// collapse whitespace, so a paper/experiment/data-point name is safe to use.
export function sanitizeFilename(s: string): string {
  return s
    .replace(/[/\\:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// Best-effort file extension from a storage URL, defaulting to png.
export function extFromUrl(url: string, fallback = "png"): string {
  const name = url.split(/[?#]/)[0].split("/").pop() ?? "";
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return fallback;
  return name.slice(dot + 1).toLowerCase();
}

// Compose "Paper - Experiment - Data point[ (n)].ext" from its parts, dropping
// any blank segments and suffixing an index only when a cell has several images.
export function imageFilename(parts: {
  paper: string;
  experiment: string;
  dataPoint: string;
  ext: string;
  index?: number;
}): string {
  const base = [parts.paper, parts.experiment, parts.dataPoint]
    .map(sanitizeFilename)
    .filter(Boolean)
    .join(" - ");
  const suffix = parts.index != null ? ` (${parts.index + 1})` : "";
  return `${base || "image"}${suffix}.${parts.ext}`;
}

// Fetch a (possibly cross-origin) URL and save it under `filename`.
export async function downloadUrl(url: string, filename: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    // Revoke on the next tick so the click has a chance to start the download.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
