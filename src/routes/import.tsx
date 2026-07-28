import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useImportData, type ImportPaperInput } from "@/lib/db";
import { useFieldDefs, useSettings } from "@/lib/settings";
import { parseImportFile, type ImportResult } from "@/lib/xlsx-import";
import { FileSpreadsheet, Loader2, UploadCloud } from "lucide-react";

export const Route = createFileRoute("/import")({
  head: () => ({
    meta: [
      { title: "Corrosion" },
      {
        name: "description",
        content:
          "One-time importer that reads the existing corrosion-review spreadsheet, maps sections to alloy types, and creates papers and experiments.",
      },
    ],
  }),
  component: ImportPage,
});

function countFilled(p: ImportPaperInput): number {
  let n = 0;
  for (const e of p.experiments)
    for (const v of Object.values(e.values)) if (v.state === "filled" || v.state === "na") n++;
  return n;
}

// Distinct alloy types across a paper's experiments, for the preview column.
function alloyTypesOf(p: ImportPaperInput): string {
  const set = new Set<string>();
  for (const e of p.experiments) {
    const v = e.values?.["alloy_type"]?.value;
    if (typeof v === "string" && v.trim()) set.add(v.trim());
  }
  return set.size ? Array.from(set).join(", ") : "—";
}

function ImportPage() {
  const fieldDefs = useFieldDefs();
  const { addImportedFields } = useSettings();
  const importer = useImportData();
  const fileRef = useRef<HTMLInputElement>(null);

  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<ImportResult | null>(null);
  const [fileName, setFileName] = useState("");
  const [done, setDone] = useState<{
    papers: number;
    experiments: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setParsing(true);
    setError(null);
    setDone(null);
    setParsed(null);
    setFileName(file.name);
    try {
      const result = await parseImportFile(file, fieldDefs);
      setParsed(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not read that file. Supported: .xlsx, .csv, .json, .jsonl.",
      );
    } finally {
      setParsing(false);
    }
  };

  const runImport = async () => {
    if (!parsed) return;
    setError(null);
    try {
      // Register any newly-discovered fields into the live schema first so the
      // imported values are visible and editable in Browse.
      if (parsed.newFields.length) addImportedFields(parsed.newFields);
      const res = await importer.mutateAsync(parsed.papers);
      setDone(res);
      setParsed(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed.");
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-5xl font-serif italic">Import data</h1>
      <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
        Import from <span className="font-mono">.xlsx</span>,{" "}
        <span className="font-mono">.csv</span>, <span className="font-mono">.json</span>, or{" "}
        <span className="font-mono">.jsonl</span>. The original review workbook maps section headers
        to alloy types, parses <span className="font-mono">Author Year</span> into papers, and
        splits multi-condition cells into separate experiments. CSV and JSON/JSONL round-trip the
        app's own exports (one record per experiment). Labels not already in the schema are added as
        new data points (Missing everywhere else) — nothing is silently dropped, and the log lists
        every split, new field, and ambiguous cell.
      </p>

      <div className="mt-8 rounded-lg border border-rule bg-card p-5">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv,.json,.jsonl,.ndjson"
          onChange={onPick}
          className="hidden"
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={parsing}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {parsing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <UploadCloud className="h-4 w-4" />
          )}
          Choose a file (.xlsx, .csv, .json, .jsonl)
        </button>
        {fileName && (
          <span className="ml-3 text-sm text-muted-foreground inline-flex items-center gap-1">
            <FileSpreadsheet className="h-4 w-4" /> {fileName}
          </span>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
          {error}
        </div>
      )}

      {done && (
        <div className="mt-4 rounded-lg border border-state-filled/40 bg-state-filled/5 p-4 text-sm">
          Imported <strong>{done.papers}</strong> papers and <strong>{done.experiments}</strong>{" "}
          experiments. Open{" "}
          <a href="/browse" className="text-copper hover:underline">
            Browse
          </a>{" "}
          to review.
        </div>
      )}

      {parsed && (
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-serif italic">
              Preview — {parsed.papers.length} paper{parsed.papers.length === 1 ? "" : "s"}
            </h2>
            <button
              onClick={runImport}
              disabled={importer.isPending || parsed.papers.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              {importer.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Import {parsed.papers.length} paper{parsed.papers.length === 1 ? "" : "s"}
            </button>
          </div>

          <div className="rounded-lg border border-rule bg-card overflow-hidden">
            <div className="grid grid-cols-[1fr_10rem_5rem_6rem] gap-3 px-4 py-2 border-b border-rule text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
              <div>Author</div>
              <div>Alloy type</div>
              <div>Year</div>
              <div>Fields</div>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {parsed.papers.map((p, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_10rem_5rem_6rem] gap-3 px-4 py-1.5 border-b border-rule/60 last:border-0 text-sm items-center"
                >
                  <div className="truncate font-mono">{p.author}</div>
                  <div className="truncate text-muted-foreground text-xs">{alloyTypesOf(p)}</div>
                  <div className="font-mono text-xs">{p.year ?? "—"}</div>
                  <div className="font-mono text-xs">{countFilled(p)} filled</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-rule bg-muted/30 p-4">
            <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono mb-2">
              Import log ({parsed.log.length})
            </h3>
            <ul className="text-xs font-mono space-y-1 max-h-56 overflow-y-auto text-muted-foreground">
              {parsed.log.map((l, i) => (
                <li key={i}>{l}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
