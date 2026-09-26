import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { usePapers, useExperiments } from "@/lib/db";
import { useSettings } from "@/lib/settings";
import { TrendChart } from "@/components/TrendChart";
import { TrendsInstitutions } from "@/components/TrendsInstitutions";
import { RelationshipExplorer } from "@/components/RelationshipExplorer";
import { CollapsibleSection } from "@/components/CollapsibleSection";
import { buildTrendSections } from "@/lib/trends";
import { PALETTES, type PaletteName } from "@/lib/palettes";
import { ArrowLeft, Palette, Search } from "lucide-react";

const PALETTE_KEY = "trends.palette.v1";
function loadPalette(): PaletteName {
  if (typeof window === "undefined") return "default";
  const p = window.localStorage.getItem(PALETTE_KEY);
  return PALETTES.some((x) => x.id === p) ? (p as PaletteName) : "default";
}

export const Route = createFileRoute("/trends")({
  head: () => ({
    meta: [
      { title: "Corrosion" },
      {
        name: "description",
        content:
          "Bar-chart distributions for every data point and paper-metadata field across the molten-salt corrosion database.",
      },
      { property: "og:title", content: "Trends — Corrosion Literature Review" },
      {
        property: "og:description",
        content: "Chart any data point or metadata field as a distribution.",
      },
    ],
  }),
  component: TrendsPage,
});

function TrendsPage() {
  const { data: papers = [] } = usePapers();
  const { data: experiments = [] } = useExperiments();
  const { groups, fieldDefs } = useSettings();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const [query, setQuery] = useState("");
  const [palette, setPalette] = useState<PaletteName>("default");
  useEffect(() => setPalette(loadPalette()), []);
  const choosePalette = (p: PaletteName) => {
    setPalette(p);
    try {
      window.localStorage.setItem(PALETTE_KEY, p);
    } catch {
      /* ignore */
    }
  };

  const sections = useMemo(
    () => buildTrendSections(papers, experiments, fieldDefs, groups),
    [papers, experiments, fieldDefs, groups],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return sections;
    return sections
      .map((s) => ({ ...s, trends: s.trends.filter((t) => t.title.toLowerCase().includes(q)) }))
      .filter((s) => s.trends.length > 0);
  }, [sections, query]);

  const totalCharts = sections.reduce((n, s) => n + s.trends.length, 0);
  const nothingMatches = totalCharts > 0 && filtered.length === 0;

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      <div className="mb-2">
        <Link
          to="/"
          className="text-xs text-muted-foreground hover:text-copper inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Dashboard
        </Link>
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-3 mb-6">
        <div>
          <h1 className="text-5xl font-serif italic">Trends</h1>
          <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
            Every data point and paper-metadata field, shown as a distribution. Categorical fields
            are counted by value; numeric fields are binned into a histogram.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative inline-flex items-center">
            <Palette className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <select
              value={palette}
              onChange={(e) => choosePalette(e.target.value as PaletteName)}
              aria-label="Bar chart colour palette"
              title="Bar chart colour palette"
              className="rounded border border-input bg-background py-1.5 pl-7 pr-2 text-xs focus:border-primary focus:outline-none"
            >
              {PALETTES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter charts…"
              className="w-56 pl-7 pr-2 py-1.5 text-xs bg-background border border-input rounded focus:outline-none focus:border-primary"
            />
          </div>
        </div>
      </div>

      {totalCharts === 0 && (
        <div className="rounded-lg border border-dashed border-rule p-10 text-center text-sm text-muted-foreground italic">
          No data to chart yet. Add papers and fill in experiment fields, then come back.
        </div>
      )}

      {nothingMatches && (
        <div className="rounded-lg border border-dashed border-rule p-10 text-center text-sm text-muted-foreground italic">
          Nothing matches “{query}”.
        </div>
      )}

      {experiments.length > 0 && (
        <CollapsibleSection id="relationship" title="Explore a relationship">
          <p className="mb-3 text-sm text-muted-foreground max-w-2xl">
            Pick two data points and plot one against the other. Numeric X fields are binned; the Y
            value is averaged per group (or counted when it isn't numeric). Switch a numeric plot to
            a line, and download any view as a PNG.
          </p>
          <RelationshipExplorer experiments={experiments} fieldDefs={fieldDefs} mounted={mounted} />
        </CollapsibleSection>
      )}

      <TrendsInstitutions papers={papers} query={query} />

      <div>
        {filtered.map((section) => (
          <CollapsibleSection key={section.id} id={`section:${section.id}`} title={section.label}>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {section.trends.map((t) => (
                <TrendChart
                  key={t.id}
                  title={t.title}
                  data={t.data}
                  splitData={t.splitData}
                  values={t.values}
                  palette={palette}
                  mounted={mounted}
                />
              ))}
            </div>
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );
}
