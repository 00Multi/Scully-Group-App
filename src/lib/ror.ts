// Research-institution lookup via the ROR (Research Organization Registry)
// public API — https://ror.org. Free, CORS-enabled, no auth. Used to recommend
// institutions as the user types and to attach a country/website so we can show
// a logo or flag. This is the open equivalent of the org picker LinkedIn shows
// when adding a research position.

import type { Paper } from "./db";

export interface Institution {
  name: string;
  countryCode?: string; // ISO-3166 alpha-2, lowercased (for flags)
  countryName?: string;
  domain?: string; // homepage host, e.g. "mit.edu" (for a logo)
  rorId?: string;
}

const ROR_ENDPOINT = "https://api.ror.org/organizations";

function hostToDomain(link: string): string | undefined {
  try {
    return new URL(link).hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

// Query ROR for institutions matching `query`. Returns up to 8 suggestions.
export async function searchInstitutions(
  query: string,
  signal?: AbortSignal,
): Promise<Institution[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const res = await fetch(`${ROR_ENDPOINT}?query=${encodeURIComponent(q)}`, {
    headers: { Accept: "application/json" },
    signal,
  });
  if (!res.ok) throw new Error(`Institution lookup failed (${res.status}).`);
  const json = await res.json();
  const items: unknown[] = Array.isArray(json?.items) ? json.items : [];
  return items
    .slice(0, 8)
    .map((raw): Institution => {
      const it = raw as {
        id?: string;
        name?: string;
        links?: string[];
        country?: { country_code?: string; country_name?: string };
      };
      const link = Array.isArray(it.links) && it.links[0] ? String(it.links[0]) : "";
      return {
        name: String(it.name ?? "").trim(),
        countryCode: it.country?.country_code
          ? String(it.country.country_code).toLowerCase()
          : undefined,
        countryName: it.country?.country_name ? String(it.country.country_name) : undefined,
        domain: link ? hostToDomain(link) : undefined,
        rorId: it.id ? String(it.id) : undefined,
      };
    })
    .filter((i) => i.name);
}

// ---------- Institution list stored on a paper ----------
//
// `paper.institution` is the source of truth for WHICH institutions (a
// "; "-joined string that exports/trends/search already understand). The
// country/domain enrichment is cached in `paper.meta.institutions`, keyed by
// name, so a DOI-prefilled name (no country) still renders and any ROR-picked
// details survive.

export function splitInstitutions(s: string): string[] {
  return (s ?? "")
    .split(/\s*;\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function institutionsToString(list: Institution[]): string {
  return list.map((i) => i.name).join("; ");
}

export function readInstitutionRefs(paper: Paper): Institution[] {
  const names = splitInstitutions(paper.institution ?? "");
  const cachedRaw = (paper.meta as { institutions?: unknown })?.institutions;
  const cached: Institution[] = Array.isArray(cachedRaw) ? (cachedRaw as Institution[]) : [];
  const byName = new Map(cached.filter((c) => c && c.name).map((c) => [c.name.toLowerCase(), c]));
  return names.map((n) => {
    const hit = byName.get(n.toLowerCase());
    return hit ? { ...hit, name: n } : { name: n };
  });
}

// Distinct institution → {countryCode, domain} across all papers, so a name
// typed on one paper can borrow enrichment discovered on another.
export function institutionEnrichmentIndex(papers: Paper[]): Map<string, Institution> {
  const m = new Map<string, Institution>();
  for (const p of papers) {
    for (const inst of readInstitutionRefs(p)) {
      const key = inst.name.toLowerCase();
      const prev = m.get(key);
      if (!prev || (!prev.domain && inst.domain) || (!prev.countryCode && inst.countryCode)) {
        m.set(key, inst);
      }
    }
  }
  return m;
}
