import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCategories, usePapers, useExperiments } from "@/lib/db";
import type { Experiment } from "@/lib/db";
import type { FieldState } from "@/lib/fields";
import { useSettings } from "@/lib/settings";
import { downloadXlsx, openPrintReport, type ExportData } from "@/lib/xlsx-export";
import { Braces, FileJson, FileSpreadsheet, Printer, Search } from "lucide-react";

type StateFilter = "any" | FieldState;

function expMatchesSearch(
  exps: Experiment[],
  author: string,
  year: number | null,
  extras: string[],
  q: string,
) {
  if (!q) return true;
  const needle = q.toLowerCase();
  const base = [author, String(year ?? ""), ...extras].join(" ").toLowerCase();
  if (base.includes(needle)) return true;
  return exps.some((e) =>
    [e.label, ...Object.values(e.values).map((v) => (v?.value ?? "").toString())]
      .join(" ")
      .toLowerCase()
      .includes(needle),
  );
}

export const Route = createFileRoute("/export")({
  head: () => ({
    meta: [
      { title: "Export — Corrosion Literature Review" },
      {
        name: "description",
        content:
          "Export the corrosion literature dataset as JSONL for AI training, as a human-readable XLSX, or as a printable PDF report.",
      },
      { property: "og:title", content: "Export — Corrosion Literature Review" },
      {
        property: "og:description",
        content:
          "Download the dataset as JSONL, XLSX, or a PDF report — respecting the category filter.",
      },
    ],
  }),
  component: ExportPage,
});

function ExportPage() {
  const { data: categories = [] } = useCategories();
  const { data: papers = [] } = usePapers();
  const { data: experiments = [] } = useExperiments();
  const { groups, fieldDefs } = useSettings();
  const [preview, setPreview] = useState(false);
  const [selectedCats, setSelectedCats] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("any");

  const catActive = (id: string | null) =>
    selectedCats.size === 0 ||
    (id != null && selectedCats.has(id)) ||
    (id == null && selectedCats.has("__uncat__"));

  const expsByPaper = useMemo(() => {
    const m = new Map<string, Experiment[]>();
    for (const e of experiments) {
      if (!m.has(e.paper_id)) m.set(e.paper_id, []);
      m.get(e.paper_id)!.push(e);
    }
    return m;
  }, [experiments]);

  const filteredPapers = useMemo(
    () =>
      papers.filter((p) => {
        if (!catActive(p.category_id)) return false;
        const exps = expsByPaper.get(p.id) ?? [];
        if (!expMatchesSearch(exps, p.author, p.year, [p.title, p.doi, p.citation_key], search))
          return false;
        return true;
      }),
    [papers, selectedCats, search, expsByPaper],
  );
  const paperIds = useMemo(() => new Set(filteredPapers.map((p) => p.id)), [filteredPapers]);
  const filteredExps = useMemo(
    () =>
      experiments.filter((e) => {
        if (!paperIds.has(e.paper_id)) return false;
        if (stateFilter !== "any") {
          return Object.values(e.values).some((v) => v?.state === stateFilter);
        }
        return true;
      }),
    [experiments, paperIds, stateFilter],
  );

  const exportData: ExportData = {
    groups,
    fields: fieldDefs,
    papers: filteredPapers,
    experiments: filteredExps,
    categories,
  };

  const toggleCat = (id: string) =>
    setSelectedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { schema, records } = useMemo(() => {
    const catById = new Map(categories.map((c) => [c.id, c]));
    const paperById = new Map(filteredPapers.map((p) => [p.id, p]));
    const schema = {
      $meta: "schema",
      version: 2,
      generated_at: new Date().toISOString(),
      fields: fieldDefs.map((f) => ({
        key: f.key,
        label: f.label,
        group: f.group,
        type: f.type,
        unit: f.unit ?? null,
        definition: f.definition,
      })),
      states: ["filled", "missing", "na", "needs_check"],
    };
    const records: unknown[] = [];
    for (const e of filteredExps) {
      const p = paperById.get(e.paper_id);
      if (!p) continue;
      const cat = p.category_id ? catById.get(p.category_id) : null;
      records.push({
        experiment_id: e.id,
        paper: {
          id: p.id,
          citation_key: p.citation_key,
          author: p.author,
          year: p.year,
          title: p.title,
          doi: p.doi,
          journal: p.journal,
          abstract: p.abstract,
          summary: p.summary,
          material_category: cat?.name ?? null,
        },
        label: e.label,
        fields: Object.fromEntries(
          fieldDefs.map((f) => {
            const v = e.values?.[f.key] ?? { value: null, state: "missing" };
            return [
              f.key,
              {
                value: v.state === "filled" ? v.value : null,
                state: v.state,
                note: v.note ?? null,
              },
            ];
          }),
        ),
      });
    }
    return { schema, records };
  }, [categories, filteredPapers, filteredExps, fieldDefs]);

  const jsonl = useMemo(
    () => [schema, ...records].map((x) => JSON.stringify(x)).join("\n"),
    [schema, records],
  );
  const jsonDoc = useMemo(() => JSON.stringify({ schema, records }, null, 2), [schema, records]);

  const downloadBlob = (content: string, mime: string, ext: string) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `corrosion_review_${new Date().toISOString().slice(0, 10)}.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const downloadJsonl = () => downloadBlob(jsonl, "application/x-ndjson", "jsonl");
  const downloadJson = () => downloadBlob(jsonDoc, "application/json", "json");

  const recordCount = filteredExps.length;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-5xl font-serif italic">Export</h1>
      <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
        Machine-readable <strong>JSONL</strong> or <strong>JSON</strong> for AI training, a
        human-readable <strong>XLSX</strong> reproducing the four column groups, and a printable{" "}
        <strong>PDF report</strong> grouped by material category. All formats respect the filter
        below — category, search, and field state.
      </p>

      <div className="mt-6 rounded-lg border border-rule bg-card p-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono mb-2">
          Category filter
        </h3>
        <div className="flex flex-wrap gap-2">
          {[
            ...categories.map((c) => ({ id: c.id, name: c.name })),
            { id: "__uncat__", name: "Uncategorized" },
          ].map((c) => {
            const on = selectedCats.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleCat(c.id)}
                className={
                  "rounded-full border px-3 py-1 text-xs transition-colors " +
                  (on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-rule text-muted-foreground hover:bg-accent")
                }
              >
                {c.name}
              </button>
            );
          })}
        </div>
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_12rem] gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by author, salt, alloy, crucible…"
              className="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-input rounded focus:outline-none focus:border-primary"
            />
          </div>
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value as StateFilter)}
            className="py-1.5 px-2 text-xs bg-background border border-input rounded focus:outline-none"
          >
            <option value="any">Any field state</option>
            <option value="missing">Has missing fields</option>
            <option value="needs_check">Has needs-check</option>
            <option value="na">Has N/A</option>
            <option value="filled">Has filled</option>
          </select>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {selectedCats.size === 0 && !search && stateFilter === "any"
            ? `All ${filteredPapers.length} papers · ${recordCount} experiments included.`
            : `${filteredPapers.length} papers · ${recordCount} experiments match the current filter.`}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <FormatCard
          icon={<FileJson className="h-5 w-5" />}
          title="JSONL"
          desc="One record per experiment, typed, with explicit states and a schema header line."
          action="Download .jsonl"
          onClick={downloadJsonl}
        />
        <FormatCard
          icon={<Braces className="h-5 w-5" />}
          title="JSON"
          desc="A single { schema, records } document — same typed records, pretty-printed."
          action="Download .json"
          onClick={downloadJson}
        />
        <FormatCard
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="XLSX"
          desc="Four-column-group layout, one row per experiment, values human-readable."
          action="Download .xlsx"
          onClick={() =>
            downloadXlsx(
              exportData,
              `corrosion_review_${new Date().toISOString().slice(0, 10)}.xlsx`,
            )
          }
        />
        <FormatCard
          icon={<Printer className="h-5 w-5" />}
          title="PDF report"
          desc="Formatted report grouped by category — opens the print dialog (save as PDF)."
          action="Print report"
          onClick={() => openPrintReport(exportData)}
        />
      </div>

      <div className="mt-6 rounded-lg border border-rule bg-card p-5 space-y-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Stat label="Papers" value={filteredPapers.length} />
          <Stat label="Experiment records" value={recordCount} />
          <Stat label="Fields per record" value={fieldDefs.length} />
        </div>
        <button
          onClick={() => setPreview((v) => !v)}
          className="inline-flex items-center rounded-md border border-rule px-4 py-2 text-sm hover:bg-accent"
        >
          {preview ? "Hide" : "Preview"} JSONL
        </button>
        {preview && (
          <pre className="mt-2 max-h-96 overflow-auto bg-muted/50 p-3 rounded text-[11px] font-mono leading-relaxed whitespace-pre">
            {jsonl.split("\n").slice(0, 4).join("\n")}
            {recordCount > 3 ? "\n…" : ""}
          </pre>
        )}
      </div>
    </div>
  );
}

function FormatCard({
  icon,
  title,
  desc,
  action,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  action: string;
  onClick: () => void;
}) {
  return (
    <div className="rounded-lg border border-rule bg-card p-4 flex flex-col">
      <div className="flex items-center gap-2 text-copper">
        {icon}
        <h3 className="text-lg font-serif italic text-foreground">{title}</h3>
      </div>
      <p className="mt-2 text-xs text-muted-foreground flex-1">{desc}</p>
      <button
        onClick={onClick}
        className="mt-3 inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
      >
        {action}
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
        {label}
      </div>
      <div className="text-3xl font-serif italic mt-0.5">{value}</div>
    </div>
  );
}
