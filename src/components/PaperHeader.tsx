import { useEffect, useRef, useState } from "react";
import type { Paper } from "@/lib/db";
import {
  useCategories,
  useUpdatePaper,
  useDeletePaper,
  useCreateExperiment,
  useUploadPaperPdf,
  useRemovePaperPdf,
} from "@/lib/db";
import { fetchCrossref, isLikelyDoi } from "@/lib/crossref";
import { FileUp, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";

type Draft = {
  author: string;
  year: number | null;
  title: string;
  doi: string;
  journal: string;
  abstract: string;
  summary: string;
  notes: string;
  category_id: string | null;
};

export function PaperHeader({ paper, nextPosition }: { paper: Paper; nextPosition: number }) {
  const { data: categories = [] } = useCategories();
  const update = useUpdatePaper();
  const del = useDeletePaper();
  const createExp = useCreateExperiment();
  const uploadPdf = useUploadPaperPdf();
  const removePdf = useRemovePaperPdf();
  const fileRef = useRef<HTMLInputElement>(null);

  const draft = (p: Paper): Draft => ({
    author: p.author,
    year: p.year,
    title: p.title,
    doi: p.doi,
    journal: p.journal ?? "",
    abstract: p.abstract,
    summary: p.summary,
    notes: p.notes ?? "",
    category_id: p.category_id,
  });

  const [state, setState] = useState<Draft>(draft(paper));
  const [auto, setAuto] = useState<Record<string, boolean>>(paper.auto_filled ?? {});
  const [prefilling, setPrefilling] = useState(false);
  const [prefillMsg, setPrefillMsg] = useState<string | null>(null);

  useEffect(() => {
    setState(draft(paper));
    setAuto(paper.auto_filled ?? {});
    setPrefillMsg(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.id]);

  const commit = (patch: Partial<Draft>, extra?: Partial<Paper>) => {
    const next = { ...state, ...patch };
    setState(next);
    const citation_key =
      next.author && next.year
        ? `${next.author.split(/[\s,]+/)[0]} ${next.year}`
        : paper.citation_key;
    update.mutate({ id: paper.id, patch: { ...patch, citation_key, ...extra } });
  };

  // Editing a field confirms it — drop its auto-filled mark.
  const clearAuto = (key: string) => {
    if (!auto[key]) return;
    const nextAuto = { ...auto };
    delete nextAuto[key];
    setAuto(nextAuto);
    update.mutate({ id: paper.id, patch: { auto_filled: nextAuto } });
  };

  const prefill = async () => {
    if (!isLikelyDoi(state.doi)) {
      setPrefillMsg("Enter a valid DOI first (e.g. 10.1016/j.corsci.2015.01.001).");
      return;
    }
    setPrefilling(true);
    setPrefillMsg(null);
    try {
      const r = await fetchCrossref(state.doi);
      const nextAuto: Record<string, boolean> = { ...auto };
      const patch: Partial<Draft> = {};
      // Only fill empty fields; never clobber values already entered.
      if (!state.title && r.title) (patch.title = r.title), (nextAuto.title = true);
      if (!state.author && r.authors) (patch.author = r.authors), (nextAuto.author = true);
      if (state.year == null && r.year != null) (patch.year = r.year), (nextAuto.year = true);
      if (!state.journal && r.journal) (patch.journal = r.journal), (nextAuto.journal = true);
      if (!state.abstract && r.abstract) (patch.abstract = r.abstract), (nextAuto.abstract = true);
      // Abstract copied into Summary if Summary is empty (PRD F2).
      if (!state.summary && r.abstract) (patch.summary = r.abstract), (nextAuto.summary = true);

      const meta = {
        ...(paper.meta ?? {}),
        authors_full: r.authorsFull,
        volume: r.volume,
        issue: r.issue,
        pages: r.pages,
        keywords: r.keywords,
        publisher: r.publisher,
        reference_count: r.referenceCount,
        url: r.url,
        crossref_fetched_at: new Date().toISOString(),
      };

      const next = { ...state, ...patch };
      setState(next);
      setAuto(nextAuto);
      const citation_key =
        next.author && next.year
          ? `${next.author.split(/[\s,]+/)[0]} ${next.year}`
          : r.citationKey || paper.citation_key;
      update.mutate({
        id: paper.id,
        patch: { ...patch, citation_key, auto_filled: nextAuto, meta } as Partial<Paper>,
      });
      const filled = Object.keys(patch).length;
      setPrefillMsg(
        filled ? `Filled ${filled} empty field${filled === 1 ? "" : "s"} from Crossref.` : "Crossref found the record — all fields already had values.",
      );
    } catch (e: any) {
      setPrefillMsg(e?.message ?? "Crossref lookup failed.");
    } finally {
      setPrefilling(false);
    }
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      alert("Please choose a PDF file.");
      return;
    }
    uploadPdf.mutate({ paperId: paper.id, file });
  };

  const autoHint = (key: string) =>
    auto[key] ? (
      <span className="ml-2 rounded bg-amber-500/15 text-amber-700 dark:text-amber-400 px-1 text-[9px] uppercase tracking-wider font-mono align-middle">
        auto
      </span>
    ) : null;

  return (
    <div className="rounded-lg border border-rule bg-card">
      <header className="flex items-center justify-between gap-3 px-5 py-3 border-b border-rule">
        <div className="flex items-baseline gap-3 min-w-0">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            Paper
          </span>
          <span className="text-lg font-serif italic truncate">
            {paper.citation_key || "Untitled"}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={onPickFile}
            className="hidden"
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadPdf.isPending}
            className="inline-flex items-center gap-1 rounded border border-rule px-2.5 py-1 text-xs hover:bg-accent transition-colors disabled:opacity-50"
          >
            {uploadPdf.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <FileUp className="h-3 w-3" />
            )}
            {paper.pdf_path ? "Replace PDF" : "Upload PDF"}
          </button>
          <button
            onClick={() =>
              createExp.mutate({
                paper_id: paper.id,
                label: `Experiment ${nextPosition + 1}`,
                position: nextPosition,
              })
            }
            className="inline-flex items-center gap-1 rounded border border-rule px-2.5 py-1 text-xs hover:bg-accent transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add experiment
          </button>
          <button
            onClick={() => {
              if (confirm(`Delete paper "${paper.citation_key}" and all its experiments?`))
                del.mutate(paper.id);
            }}
            className="p-1 text-muted-foreground hover:text-destructive transition-colors"
            aria-label="Delete paper"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </header>

      {paper.pdf_path && (
        <div className="flex items-center gap-2 px-5 py-1.5 border-b border-rule/60 text-xs text-muted-foreground">
          <FileUp className="h-3 w-3 text-copper" />
          <span className="truncate font-mono">{paper.pdf_name || "document.pdf"}</span>
          <button
            onClick={() => {
              if (confirm("Remove the attached PDF?"))
                removePdf.mutate({ paperId: paper.id, path: paper.pdf_path });
            }}
            className="ml-auto inline-flex items-center gap-0.5 hover:text-destructive"
          >
            <X className="h-3 w-3" /> Remove
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-[1fr_9rem_10rem] gap-3 px-5 py-3 border-b border-rule/60">
        <input
          value={state.author}
          onChange={(e) => setState({ ...state, author: e.target.value })}
          onBlur={() => commit({ author: state.author })}
          onFocus={() => clearAuto("author")}
          placeholder="Author(s)"
          className="bg-transparent border-b border-input focus:border-primary focus:outline-none text-sm py-1 font-mono"
        />
        <input
          value={state.year ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            setState({ ...state, year: v === "" ? null : Number(v) });
          }}
          onBlur={() => commit({ year: state.year })}
          onFocus={() => clearAuto("year")}
          placeholder="Year"
          inputMode="numeric"
          className="bg-transparent border-b border-input focus:border-primary focus:outline-none text-sm py-1 font-mono"
        />
        <select
          value={state.category_id ?? ""}
          onChange={(e) => commit({ category_id: e.target.value || null })}
          className="bg-transparent border-b border-input focus:border-primary focus:outline-none text-sm py-1"
        >
          <option value="">Uncategorized</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="px-5 py-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            Title {autoHint("title")}
          </label>
          <input
            value={state.title}
            onChange={(e) => setState({ ...state, title: e.target.value })}
            onBlur={() => commit({ title: state.title })}
            onFocus={() => clearAuto("title")}
            placeholder="Paper title"
            className="w-full mt-1 bg-transparent border-b border-input focus:border-primary focus:outline-none text-base font-serif italic py-1"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            DOI / link
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              value={state.doi}
              onChange={(e) => setState({ ...state, doi: e.target.value })}
              onBlur={() => commit({ doi: state.doi })}
              placeholder="10.xxxx/..."
              className="flex-1 min-w-0 bg-transparent border-b border-input focus:border-primary focus:outline-none text-sm font-mono py-1"
            />
            <button
              onClick={prefill}
              disabled={prefilling}
              title="Fill title, authors, year, journal, and abstract from Crossref"
              className="inline-flex items-center gap-1 rounded border border-rule px-2 py-1 text-xs hover:bg-accent transition-colors disabled:opacity-50 shrink-0"
            >
              {prefilling ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3 text-copper" />
              )}
              Prefill
            </button>
          </div>
          {prefillMsg && <p className="mt-1 text-[11px] text-muted-foreground">{prefillMsg}</p>}
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            Journal {autoHint("journal")}
          </label>
          <input
            value={state.journal}
            onChange={(e) => setState({ ...state, journal: e.target.value })}
            onBlur={() => commit({ journal: state.journal })}
            onFocus={() => clearAuto("journal")}
            placeholder="Journal name"
            className="w-full mt-1 bg-transparent border-b border-input focus:border-primary focus:outline-none text-sm py-1"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            Abstract {autoHint("abstract")}
          </label>
          <textarea
            value={state.abstract}
            onChange={(e) => setState({ ...state, abstract: e.target.value })}
            onBlur={() => commit({ abstract: state.abstract })}
            onFocus={() => clearAuto("abstract")}
            rows={3}
            placeholder="Original abstract from paper"
            className="w-full mt-1 bg-transparent border border-input rounded p-2 focus:border-primary focus:outline-none text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            Summary (editable) {autoHint("summary")}
          </label>
          <textarea
            value={state.summary}
            onChange={(e) => setState({ ...state, summary: e.target.value })}
            onBlur={() => commit({ summary: state.summary })}
            onFocus={() => clearAuto("summary")}
            rows={3}
            placeholder="Your working summary of the paper's findings"
            className="w-full mt-1 bg-transparent border border-input rounded p-2 focus:border-primary focus:outline-none text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            Notes
          </label>
          <textarea
            value={state.notes}
            onChange={(e) => setState({ ...state, notes: e.target.value })}
            onBlur={() => commit({ notes: state.notes })}
            rows={2}
            placeholder="Free-form notes (e.g. check full text, paywalled)"
            className="w-full mt-1 bg-transparent border border-input rounded p-2 focus:border-primary focus:outline-none text-sm"
          />
        </div>
      </div>
    </div>
  );
}
