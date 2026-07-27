import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { usePapers, useExperiments } from "@/lib/db";
import { useSettings } from "@/lib/settings";
import { TrendChart } from "@/components/TrendChart";
import { InstitutionLogo } from "@/components/InstitutionLogo";
import { buildTrendSections, institutionCounts } from "@/lib/trends";
import { ArrowLeft, Search } from "lucide-react";

export const Route = createFileRoute("/trends")({
  head: () => ({
    meta: [
      { title: "Trends — Corrosion Literature Review" },
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

  const institutions = useMemo(() => institutionCounts(papers), [papers]);
  const filteredInstitutions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return institutions;
    return institutions.filter(
      (i) => i.name.toLowerCase().includes(q) || (i.countryName ?? "").toLowerCase().includes(q),
    );
  }, [institutions, query]);
  const maxInstCount = filteredInstitutions.reduce((m, i) => Math.max(m, i.count), 0);
  const nothingMatches =
    totalCharts > 0 && filtered.length === 0 && filteredInstitutions.length === 0;

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

      {filteredInstitutions.length > 0 && (
        <section className="mb-10">
          <h2 className="text-2xl font-serif italic mb-3">Institutions</h2>
          <div className="rounded-lg border border-rule bg-card divide-y divide-rule/60">
            {filteredInstitutions.map((inst) => (
              <div key={inst.name} className="flex items-center gap-3 px-4 py-2">
                <InstitutionLogo inst={inst} size={22} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm">{inst.name}</span>
                    <span className="font-mono text-xs text-muted-foreground shrink-0">
                      {inst.count} paper{inst.count === 1 ? "" : "s"}
                      {inst.countryName ? ` · ${inst.countryName}` : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-copper"
                      style={{ width: `${maxInstCount ? (inst.count / maxInstCount) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

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
