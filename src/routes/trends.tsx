import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { usePapers, useExperiments } from "@/lib/db";
import { useSettings } from "@/lib/settings";
import { TrendChart } from "@/components/TrendChart";
import { TrendsInstitutions } from "@/components/TrendsInstitutions";
import { buildTrendSections } from "@/lib/trends";
import { ArrowLeft, Search } from "lucide-react";

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

      <TrendsInstitutions papers={papers} query={query} />

      <div className="space-y-10">
        {filtered.map((section) => (
          <section key={section.id}>
            <h2 className="text-2xl font-serif italic mb-3">{section.label}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {section.trends.map((t) => (
                <TrendChart key={t.id} title={t.title} data={t.data} mounted={mounted} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
