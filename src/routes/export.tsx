import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCategories, usePapers, useExperiments } from "@/lib/db";
import { useSettings } from "@/lib/settings";
import { downloadXlsx, openPrintReport, type ExportData } from "@/lib/xlsx-export";
import { FileJson, FileSpreadsheet, Printer } from "lucide-react";

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
        content: "Download the dataset as JSONL, XLSX, or a PDF report — respecting the category filter.",
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

  const catActive = (id: string | null) =>
    selectedCats.size === 0 || (id != null && selectedCats.has(id)) || (id == null && selectedCats.has("__uncat__"));

  const filteredPapers = useMemo(() => papers.filter((p) => catActive(p.category_id)), [papers, selectedCats]);
  const paperIds = useMemo(() => new Set(filteredPapers.map((p) => p.id)), [filteredPapers]);
  const filteredExps = useMemo(
    () => experiments.filter((e) => paperIds.has(e.paper_id)),
    [experiments, paperIds],
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
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const jsonl = useMemo(() => {
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
    const lines: string[] = [JSON.stringify(schema)];
    for (const e of filteredExps) {
      const p = paperById.get(e.paper_id);
      if (!p) continue;
      const cat = p.category_id ? catById.get(p.category_id) : null;
      const record = {
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
            return [f.key, { value: v.state === "filled" ? v.value : null, state: v.state, note: v.note ?? null }];
          }),
        ),
      };
      lines.push(JSON.stringify(record));
    }
    return lines.join("\n");
  }, [categories, filteredPapers, filteredExps, fieldDefs]);

  const downloadJsonl = () => {
    const blob = new Blob([jsonl], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `corrosion_review_${new Date().toISOString().slice(0, 10)}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const recordCount = filteredExps.length;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-5xl font-serif italic">Export</h1>
      <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
        Three output shapes: machine-readable <strong>JSONL</strong> for AI training, a human-readable{" "}
        <strong>XLSX</strong> reproducing the four column groups, and a printable <strong>PDF report</strong>{" "}
        grouped by material category. All three respect the category filter below.
      </p>

      <div className="mt-6 rounded-lg border border-rule bg-card p-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono mb-2">
          Category filter
        </h3>
        <div className="flex flex-wrap gap-2">
          {[...categories.map((c) => ({ id: c.id, name: c.name })), { id: "__uncat__", name: "Uncategorized" }].map(
            (c) => {
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
            },
          )}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {selectedCats.size === 0
            ? "All categories included."
            : `${filteredPapers.length} papers · ${recordCount} experiments selected.`}
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <FormatCard
          icon={<FileJson className="h-5 w-5" />}
          title="JSONL"
          desc="One record per experiment, typed, with explicit states and a schema header."
          action="Download .jsonl"
          onClick={downloadJsonl}
        />
        <FormatCard
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="XLSX"
          desc="Four-column-group layout, one row per experiment, values human-readable."
          action="Download .xlsx"
          onClick={() => downloadXlsx(exportData, `corrosion_review_${new Date().toISOString().slice(0, 10)}.xlsx`)}
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
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">{label}</div>
      <div className="text-3xl font-serif italic mt-0.5">{value}</div>
    </div>
  );
}
