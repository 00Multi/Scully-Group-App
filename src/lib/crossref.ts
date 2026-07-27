// Crossref metadata lookup by DOI. A plain public API call (CORS-enabled),
// not a model. See PRD §10 — bibliographic prefill only.

export interface CrossrefResult {
  title: string;
  authors: string; // "Zheng, Sridharan" — short form for the Author field
  authorsFull: string[]; // full ordered list "Given Family"
  institution: string; // affiliation(s) of the authors, if Crossref lists them
  year: number | null;
  journal: string;
  volume: string;
  issue: string;
  pages: string;
  doi: string;
  abstract: string;
  keywords: string[];
  referenceCount: number | null;
  publisher: string;
  url: string;
  citationKey: string;
}

function stripJats(s: string): string {
  if (!s) return "";
  return s
    .replace(/<jats:title>[\s\S]*?<\/jats:title>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDoi(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}

export function isLikelyDoi(raw: string): boolean {
  return /10\.\d{4,9}\/\S+/.test(normalizeDoi(raw));
}

export async function fetchCrossref(rawDoi: string): Promise<CrossrefResult> {
  const doi = normalizeDoi(rawDoi);
  if (!doi) throw new Error("No DOI provided.");
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    if (res.status === 404) throw new Error(`DOI not found on Crossref: ${doi}`);
    throw new Error(`Crossref lookup failed (${res.status}).`);
  }
  const json = await res.json();
  const m = json.message ?? {};

  const authorObjs: {
    given?: string;
    family?: string;
    name?: string;
    affiliation?: { name?: string }[];
  }[] = m.author ?? [];
  const authorsFull = authorObjs.map((a) =>
    a.name ? a.name : [a.given, a.family].filter(Boolean).join(" "),
  );
  const families = authorObjs.map((a) => a.family || a.name || "").filter(Boolean);
  const authorsShort = families.length <= 3 ? families.join(", ") : `${families[0]} et al.`;

  // Distinct author affiliations, in first-seen order. Crossref only carries
  // these when the publisher supplied them, so this is often empty.
  const affiliations: string[] = [];
  for (const a of authorObjs) {
    for (const aff of a.affiliation ?? []) {
      const name = (aff?.name ?? "").trim();
      if (name && !affiliations.includes(name)) affiliations.push(name);
    }
  }
  const institution = affiliations.join("; ");

  const dateParts =
    m.issued?.["date-parts"]?.[0] ??
    m["published-print"]?.["date-parts"]?.[0] ??
    m["published-online"]?.["date-parts"]?.[0] ??
    m.created?.["date-parts"]?.[0] ??
    [];
  const year = typeof dateParts[0] === "number" ? dateParts[0] : null;

  const firstFamily = families[0] ?? (m.title?.[0] ?? "").split(/\s+/)[0] ?? "Untitled";

  return {
    title: Array.isArray(m.title) ? (m.title[0] ?? "") : (m.title ?? ""),
    authors: authorsShort,
    authorsFull,
    institution,
    year,
    journal: Array.isArray(m["container-title"]) ? (m["container-title"][0] ?? "") : "",
    volume: m.volume ?? "",
    issue: m.issue ?? "",
    pages: m.page ?? "",
    doi,
    abstract: stripJats(m.abstract ?? ""),
    keywords: Array.isArray(m.subject) ? m.subject : [],
    referenceCount: typeof m["references-count"] === "number" ? m["references-count"] : null,
    publisher: m.publisher ?? "",
    url: m.URL ?? `https://doi.org/${doi}`,
    citationKey: year ? `${firstFamily} ${year}` : firstFamily,
  };
}
