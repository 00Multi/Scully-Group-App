import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { usePapers, useExperiments } from "@/lib/db";
import type { Experiment } from "@/lib/db";
import type { FieldState } from "@/lib/fields";
import { useSettings } from "@/lib/settings";
import {
  buildCsv,
  buildPapersCsv,
  downloadPapersXlsx,
  downloadXlsx,
  openPrintReport,
  paperMetaRecord,
  META_COLUMNS,
  type ExportData,
} from "@/lib/xlsx-export";
import { Braces, FileJson, FileSpreadsheet, FileText, Printer, Search, Table } from "lucide-react";

type StateFilter = "any" | FieldState;

const ALLOY_TYPE_KEY = "alloy_type";
const NO_ALLOY = "__none__";

function alloyTypeOf(e: Experiment): string {
  const v = e.values?.[ALLOY_TYPE_KEY]?.value;
  return typeof v === "string" ? v.trim() : "";
}

function paperMatchesSearch(
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
          "Download the dataset as JSONL, XLSX, or a PDF report — respecting the alloy-type filter.",
      },
    ],
  }),
  component: ExportPage,
});

function ExportPage() {
  const { data: papers = [] } = usePapers();
  const { data: experiments = [] } = useExperiments();
  const { groups, fieldDefs } = useSettings();
  const [preview, setPreview] = useState(false);
  const [selectedAlloys, setSelectedAlloys] = useState<Set<string>>(() => new Set());
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("any");
  // Data points (fields) to leave OUT of the export. Empty = include everything.
  const [excludedFields, setExcludedFields] = useState<Set<string>>(() => new Set());
  // Paper-metadata columns to leave OUT. Empty = include every metadata column.
  const [excludedMeta, setExcludedMeta] = useState<Set<string>>(() => new Set());

  const activeMeta = useMemo(
    () => META_COLUMNS.filter((m) => !excludedMeta.has(m.key)),
    [excludedMeta],
  );
  const toggleMeta = (key: string) =>
    setExcludedMeta((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  // Only the selected columns/data points go into every export format.
  const activeFields = useMemo(
    () => fieldDefs.filter((f) => !excludedFields.has(f.key)),
    [fieldDefs, excludedFields],
  );
  const activeGroups = useMemo(
    () => groups.filter((g) => activeFields.some((f) => f.group === g.id)),
    [groups, activeFields],
  );

  const toggleField = (key: string) =>
    setExcludedFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const setGroupIncluded = (groupId: string, included: boolean) =>
    setExcludedFields((prev) => {
      const next = new Set(prev);
      for (const f of fieldDefs)
        if (f.group === groupId) {
          if (included) next.delete(f.key);
          else next.add(f.key);
        }
      return next;
    });

  // Alloy-type values actually present, unioned with the field's configured
  // options so empty-but-defined types still appear as filter chips.
  const alloyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of experiments) {
      const a = alloyTypeOf(e);
      if (a) set.add(a);
    }
    const field = fieldDefs.find((f) => f.key === ALLOY_TYPE_KEY);
    for (const o of field?.options ?? []) set.add(o);
    return Array.from(set).sort();
  }, [experiments, fieldDefs]);

  const alloyActive = (e: Experiment) => {
    if (selectedAlloys.size === 0) return true;
    const a = alloyTypeOf(e);
    return selectedAlloys.has(a || NO_ALLOY);
  };

  const expsByPaper = useMemo(() => {
    const m = new Map<string, Experiment[]>();
    for (const e of experiments) {
      if (!m.has(e.paper_id)) m.set(e.paper_id, []);
      m.get(e.paper_id)!.push(e);
    }
    return m;
  }, [experiments]);

  // Papers whose author/metadata (or any experiment) match the search box.
  const searchOkPaperIds = useMemo(() => {
    const s = new Set<string>();
    for (const p of papers) {
      const exps = expsByPaper.get(p.id) ?? [];
      if (paperMatchesSearch(exps, p.author, p.year, [p.title, p.doi, p.citation_key], search))
        s.add(p.id);
    }
    return s;
  }, [papers, expsByPaper, search]);

  // Experiment-first filtering: an experiment is included when its paper matches
  // the search, its alloy type matches the alloy filter, and it satisfies the
  // field-state filter.
  const filteredExps = useMemo(
    () =>
      experiments.filter((e) => {
        if (!searchOkPaperIds.has(e.paper_id)) return false;
        if (!alloyActive(e)) return false;
        if (stateFilter !== "any")
          return Object.values(e.values).some((v) => v?.state === stateFilter);
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [experiments, searchOkPaperIds, selectedAlloys, stateFilter],
  );

  const filteredPaperIds = useMemo(
    () => new Set(filteredExps.map((e) => e.paper_id)),
    [filteredExps],
  );
  const filteredPapers = useMemo(
    () => papers.filter((p) => filteredPaperIds.has(p.id)),
    [papers, filteredPaperIds],
  );

  const exportData: ExportData = {
    groups: activeGroups,
    fields: activeFields,
    papers: filteredPapers,
    experiments: filteredExps,
    meta: activeMeta,
  };

  const toggleAlloy = (id: string) =>
    setSelectedAlloys((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { schema, records } = useMemo(() => {
    const paperById = new Map(filteredPapers.map((p) => [p.id, p]));
    const schema = {
      $meta: "schema",
      version: 2,
      generated_at: new Date().toISOString(),
      fields: activeFields.map((f) => ({
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
      records.push({
        experiment_id: e.id,
        paper: { id: p.id, ...paperMetaRecord(p, activeMeta) },
        label: e.label,
        alloy_type: alloyTypeOf(e) || null,
        fields: Object.fromEntries(
          activeFields.map((f) => {
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
  }, [filteredPapers, filteredExps, activeFields, activeMeta]);

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
  const downloadCsv = () => downloadBlob(buildCsv(exportData), "text/csv", "csv");

  // Metadata-only: one row/record per paper, just the selected metadata columns.
  const papersMetaJson = useMemo(
    () =>
      JSON.stringify(
        {
          $meta: "papers",
          generated_at: new Date().toISOString(),
          columns: activeMeta.map((m) => ({ key: m.key, label: m.label })),
          papers: filteredPapers.map((p) => ({ id: p.id, ...paperMetaRecord(p, activeMeta) })),
        },
        null,
        2,
      ),
    [filteredPapers, activeMeta],
  );
  const downloadMetaCsv = () =>
    downloadBlob(buildPapersCsv(filteredPapers, activeMeta), "text/csv", "csv");
  const downloadMetaJson = () => downloadBlob(papersMetaJson, "application/json", "json");
  const downloadMetaXlsx = () =>
    downloadPapersXlsx(
      filteredPapers,
      activeMeta,
      `corrosion_metadata_${new Date().toISOString().slice(0, 10)}.xlsx`,
    );

  const recordCount = filteredExps.length;
  const hasNoAlloy = useMemo(() => experiments.some((e) => !alloyTypeOf(e)), [experiments]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-5xl font-serif italic">Export</h1>
      <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
        Machine-readable <strong>JSONL</strong>, <strong>JSON</strong>, or <strong>CSV</strong> for
        AI training and reuse, a human-readable <strong>XLSX</strong> reproducing the column groups,
        and a printable <strong>PDF report</strong> — or export the{" "}
        <strong>paper metadata alone</strong>, one row per paper. All formats respect the filters
        below — alloy type, search, field state, and which metadata columns and data points to
        include.
      </p>

      <div className="mt-6 rounded-lg border border-rule bg-card p-4">
        <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono mb-2">
          Alloy-type filter
        </h3>
        <div className="flex flex-wrap gap-2">
          {[
            ...alloyOptions.map((a) => ({ id: a, name: a })),
            ...(hasNoAlloy ? [{ id: NO_ALLOY, name: "No alloy type" }] : []),
          ].map((a) => {
            const on = selectedAlloys.has(a.id);
            return (
              <button
                key={a.id}
                onClick={() => toggleAlloy(a.id)}
                className={
                  "rounded-full border px-3 py-1 text-xs transition-colors " +
                  (on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-rule text-muted-foreground hover:bg-accent")
                }
              >
                {a.name}
              </button>
            );
          })}
          {alloyOptions.length === 0 && !hasNoAlloy && (
            <span className="text-xs text-muted-foreground italic">
              No alloy types recorded yet.
            </span>
          )}
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
          {selectedAlloys.size === 0 && !search && stateFilter === "any"
            ? `All ${filteredPapers.length} papers · ${recordCount} experiments included.`
            : `${filteredPapers.length} papers · ${recordCount} experiments match the current filter.`}
        </p>
      </div>

      <div className="mt-6 rounded-lg border border-rule bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono">
            Paper metadata to include
          </h3>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-muted-foreground">
              {activeMeta.length}/{META_COLUMNS.length} fields
            </span>
            <button
              onClick={() => setExcludedMeta(new Set())}
              className="text-copper hover:underline"
            >
              All
            </button>
            <button
              onClick={() => setExcludedMeta(new Set(META_COLUMNS.map((m) => m.key)))}
              className="text-copper hover:underline"
            >
              None
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {META_COLUMNS.map((m) => {
            const on = !excludedMeta.has(m.key);
            return (
              <button
                key={m.key}
                onClick={() => toggleMeta(m.key)}
                className={
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors " +
                  (on
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-rule text-muted-foreground hover:bg-accent")
                }
              >
                {m.label}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          These bibliographic columns appear in every format below, and are the columns used by the
          metadata-only export. Turn any off to leave it out.
        </p>
      </div>

      <div className="mt-6 rounded-lg border border-rule bg-card p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono">
            Columns &amp; data points to include
          </h3>
          <div className="flex items-center gap-3 text-[11px]">
            <span className="text-muted-foreground">
              {activeFields.length}/{fieldDefs.length} data points
            </span>
            <button
              onClick={() => setExcludedFields(new Set())}
              className="text-copper hover:underline"
            >
              All
            </button>
            <button
              onClick={() => setExcludedFields(new Set(fieldDefs.map((f) => f.key)))}
              className="text-copper hover:underline"
            >
              None
            </button>
          </div>
        </div>
        <div className="space-y-3">
          {groups.map((g) => {
            const gf = fieldDefs.filter((f) => f.group === g.id);
            if (gf.length === 0) return null;
            const onCount = gf.filter((f) => !excludedFields.has(f.key)).length;
            const allOn = onCount === gf.length;
            return (
              <div key={g.id}>
                <button
                  onClick={() => setGroupIncluded(g.id, !allOn)}
                  className="flex items-center gap-1.5 text-sm font-medium mb-1"
                  title={allOn ? "Exclude this whole column" : "Include this whole column"}
                >
                  <span
                    className={
                      "inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border text-[9px] " +
                      (onCount === 0
                        ? "border-input"
                        : allOn
                          ? "bg-primary border-primary text-primary-foreground"
                          : "bg-primary/40 border-primary text-primary-foreground")
                    }
                  >
                    {onCount > 0 ? "✓" : ""}
                  </span>
                  {g.label}
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {onCount}/{gf.length}
                  </span>
                </button>
                <div className="flex flex-wrap gap-1.5 pl-5">
                  {gf.map((f) => {
                    const on = !excludedFields.has(f.key);
                    return (
                      <button
                        key={f.key}
                        onClick={() => toggleField(f.key)}
                        className={
                          "rounded-full border px-2.5 py-0.5 text-xs transition-colors " +
                          (on
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-rule text-muted-foreground hover:bg-accent")
                        }
                      >
                        {f.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          These toggles control which experiment data points appear in every format below. Paper
          metadata columns are chosen separately, above.
        </p>
      </div>

      <h2 className="mt-8 text-2xl font-serif italic">Full dataset</h2>
      <p className="text-[11px] text-muted-foreground">One row/record per experiment.</p>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <FormatCard
          icon={<FileJson className="h-5 w-5" />}
          title="JSONL"
          desc="One record per experiment, typed, with explicit states and a schema header line."
          action="Download .jsonl"
          onClick={downloadJsonl}
        />
        <FormatCard
          icon={<Table className="h-5 w-5" />}
          title="CSV"
          desc="Flat one-row-per-experiment table with paper columns — opens anywhere, re-imports here."
          action="Download .csv"
          onClick={downloadCsv}
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
          desc="Column-group layout, one row per experiment, values human-readable."
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
          desc="Formatted report grouped by alloy type — opens the print dialog (save as PDF)."
          action="Print report"
          onClick={() => openPrintReport(exportData)}
        />
      </div>

      <h2 className="mt-8 text-2xl font-serif italic">Metadata only</h2>
      <p className="text-[11px] text-muted-foreground">
        One row/record per paper — just the selected bibliographic columns, no experiment data.{" "}
        {filteredPapers.length} paper{filteredPapers.length === 1 ? "" : "s"} · {activeMeta.length}{" "}
        column{activeMeta.length === 1 ? "" : "s"}.
      </p>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
        <FormatCard
          icon={<Table className="h-5 w-5" />}
          title="Metadata CSV"
          desc="One row per paper with the chosen metadata columns — opens anywhere, re-imports here."
          action="Download .csv"
          onClick={downloadMetaCsv}
          disabled={activeMeta.length === 0}
        />
        <FormatCard
          icon={<FileSpreadsheet className="h-5 w-5" />}
          title="Metadata XLSX"
          desc="A single sheet of paper metadata, one row per paper."
          action="Download .xlsx"
          onClick={downloadMetaXlsx}
          disabled={activeMeta.length === 0}
        />
        <FormatCard
          icon={<FileText className="h-5 w-5" />}
          title="Metadata JSON"
          desc="A { columns, papers } document of the selected metadata, one object per paper."
          action="Download .json"
          onClick={downloadMetaJson}
          disabled={activeMeta.length === 0}
        />
      </div>

      <div className="mt-6 rounded-lg border border-rule bg-card p-5 space-y-4">
        <div className="grid grid-cols-3 gap-4 text-sm">
          <Stat label="Papers" value={filteredPapers.length} />
          <Stat label="Experiment records" value={recordCount} />
          <Stat label="Data points per record" value={activeFields.length} />
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
  disabled,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  action: string;
  onClick: () => void;
  disabled?: boolean;
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
        disabled={disabled}
        className="mt-3 inline-flex items-center justify-center rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
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
