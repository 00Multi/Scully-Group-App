import { useEffect, useState } from "react";
import type { Paper } from "@/lib/db";
import { useCategories, useUpdatePaper, useDeletePaper, useCreateExperiment } from "@/lib/db";
import { Plus, Trash2 } from "lucide-react";

export function PaperHeader({ paper, nextPosition }: { paper: Paper; nextPosition: number }) {
  const { data: categories = [] } = useCategories();
  const update = useUpdatePaper();
  const del = useDeletePaper();
  const createExp = useCreateExperiment();

  const [state, setState] = useState({
    author: paper.author,
    year: paper.year,
    title: paper.title,
    doi: paper.doi,
    abstract: paper.abstract,
    summary: paper.summary,
    category_id: paper.category_id,
  });

  useEffect(() => {
    setState({
      author: paper.author,
      year: paper.year,
      title: paper.title,
      doi: paper.doi,
      abstract: paper.abstract,
      summary: paper.summary,
      category_id: paper.category_id,
    });
  }, [paper.id]);

  const commit = (patch: Partial<typeof state>) => {
    const next = { ...state, ...patch };
    setState(next);
    const citation_key =
      next.author && next.year
        ? `${next.author.split(/[\s,]+/)[0]} ${next.year}`
        : paper.citation_key;
    update.mutate({ id: paper.id, patch: { ...patch, citation_key } });
  };

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

      <div className="grid grid-cols-1 md:grid-cols-[1fr_9rem_10rem] gap-3 px-5 py-3 border-b border-rule/60">
        <input
          value={state.author}
          onChange={(e) => setState({ ...state, author: e.target.value })}
          onBlur={() => commit({ author: state.author })}
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
          placeholder="Year"
          inputMode="numeric"
          className="bg-transparent border-b border-input focus:border-primary focus:outline-none text-sm py-1 font-mono"
        />
        <select
          value={state.category_id ?? ""}
          onChange={(e) => {
            const v = e.target.value || null;
            commit({ category_id: v });
          }}
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
            Title
          </label>
          <input
            value={state.title}
            onChange={(e) => setState({ ...state, title: e.target.value })}
            onBlur={() => commit({ title: state.title })}
            placeholder="Paper title"
            className="w-full mt-1 bg-transparent border-b border-input focus:border-primary focus:outline-none text-base font-serif italic py-1"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            DOI / link
          </label>
          <input
            value={state.doi}
            onChange={(e) => setState({ ...state, doi: e.target.value })}
            onBlur={() => commit({ doi: state.doi })}
            placeholder="10.xxxx/..."
            className="w-full mt-1 bg-transparent border-b border-input focus:border-primary focus:outline-none text-sm font-mono py-1"
          />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            Abstract
          </label>
          <textarea
            value={state.abstract}
            onChange={(e) => setState({ ...state, abstract: e.target.value })}
            onBlur={() => commit({ abstract: state.abstract })}
            rows={3}
            placeholder="Original abstract from paper"
            className="w-full mt-1 bg-transparent border border-input rounded p-2 focus:border-primary focus:outline-none text-sm"
          />
        </div>
        <div className="md:col-span-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            Summary (editable)
          </label>
          <textarea
            value={state.summary}
            onChange={(e) => setState({ ...state, summary: e.target.value })}
            onBlur={() => commit({ summary: state.summary })}
            rows={3}
            placeholder="Your working summary of the paper's findings"
            className="w-full mt-1 bg-transparent border border-input rounded p-2 focus:border-primary focus:outline-none text-sm"
          />
        </div>
      </div>
    </div>
  );
}
