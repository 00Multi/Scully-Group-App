import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useCategories, usePapers, useExperiments } from "@/lib/db";
import { useFieldDefs } from "@/lib/settings";

export const Route = createFileRoute("/export")({
  head: () => ({
    meta: [
      { title: "Export — Corrosion Literature Review" },
      {
        name: "description",
        content:
          "Export the corrosion literature dataset as JSONL, one record per experiment, with typed fields, explicit states, and a schema header.",
      },
      { property: "og:title", content: "Export — Corrosion Literature Review" },
      {
        property: "og:description",
        content: "Download the dataset as AI-training JSONL with a schema header.",
      },
    ],
  }),
  component: ExportPage,
});

function ExportPage() {
  const { data: categories = [] } = useCategories();
  const { data: papers = [] } = usePapers();
  const { data: experiments = [] } = useExperiments();
  const fieldDefs = useFieldDefs();
  const [preview, setPreview] = useState(false);

  const jsonl = useMemo(() => {
    const catById = new Map(categories.map((c) => [c.id, c]));
    const paperById = new Map(papers.map((p) => [p.id, p]));
    const schema = {
      $meta: "schema",
      version: 1,
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
    for (const e of experiments) {
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
      };
      lines.push(JSON.stringify(record));
    }
    return lines.join("\n");
  }, [categories, papers, experiments, fieldDefs]);

  const download = () => {
    const blob = new Blob([jsonl], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `corrosion_review_${new Date().toISOString().slice(0, 10)}.jsonl`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const recordCount = jsonl.split("\n").length - 1;

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-5xl font-serif italic">Export</h1>
      <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
        Machine-readable JSONL, one record per experiment, with paper metadata
        denormalized and a schema header on the first line. Missing and N/A are
        distinguishable — both carry <code className="font-mono">value: null</code> but
        different <code className="font-mono">state</code> tags.
      </p>

      <div className="mt-8 rounded-lg border border-rule bg-card p-5 space-y-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Stat label="Papers" value={papers.length} />
          <Stat label="Experiment records" value={recordCount} />
          <Stat label="Fields per record" value={fieldDefs.length} />
        </div>
        <div className="flex gap-2">
          <button
            onClick={download}
            className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Download JSONL
          </button>
          <button
            onClick={() => setPreview((p) => !p)}
            className="inline-flex items-center rounded-md border border-rule px-4 py-2 text-sm hover:bg-accent"
          >
            {preview ? "Hide" : "Preview"} first records
          </button>
        </div>

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
