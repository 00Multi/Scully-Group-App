import { useMemo, useState } from "react";
import { ChevronRight, Plus, Search } from "lucide-react";
import type { Category, Experiment, Paper } from "@/lib/db";
import { useCreatePaper } from "@/lib/db";
import type { FieldState } from "@/lib/fields";

export type StateFilter = "any" | FieldState;

interface Props {
  categories: Category[];
  papers: Paper[];
  experiments: Experiment[];
  selectedPaperId: string | null;
  onSelectPaper: (id: string) => void;
  search: string;
  setSearch: (v: string) => void;
  stateFilter: StateFilter;
  setStateFilter: (v: StateFilter) => void;
}

function matchesSearch(paper: Paper, exps: Experiment[], q: string) {
  if (!q) return true;
  const needle = q.toLowerCase();
  const hay = [paper.author, String(paper.year ?? ""), paper.title, paper.doi, paper.citation_key]
    .join(" ")
    .toLowerCase();
  if (hay.includes(needle)) return true;
  return exps.some((e) => {
    const s = [
      e.label,
      ...Object.values(e.values).map((v) => (v?.value ?? "").toString()),
    ]
      .join(" ")
      .toLowerCase();
    return s.includes(needle);
  });
}

function matchesStateFilter(exps: Experiment[], filter: StateFilter) {
  if (filter === "any") return true;
  return exps.some((e) =>
    Object.values(e.values).some((v) => v?.state === filter),
  );
}

export function BrowseTree({
  categories,
  papers,
  experiments,
  selectedPaperId,
  onSelectPaper,
  search,
  setSearch,
  stateFilter,
  setStateFilter,
}: Props) {
  const [openCats, setOpenCats] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, true])),
  );
  const createPaper = useCreatePaper();

  const grouped = useMemo(() => {
    const byCat = new Map<string | null, Paper[]>();
    for (const p of papers) {
      const k = p.category_id;
      if (!byCat.has(k)) byCat.set(k, []);
      byCat.get(k)!.push(p);
    }
    return byCat;
  }, [papers]);

  const expsByPaper = useMemo(() => {
    const m = new Map<string, Experiment[]>();
    for (const e of experiments) {
      if (!m.has(e.paper_id)) m.set(e.paper_id, []);
      m.get(e.paper_id)!.push(e);
    }
    return m;
  }, [experiments]);

  const filterPaper = (p: Paper) => {
    const exps = expsByPaper.get(p.id) ?? [];
    return matchesSearch(p, exps, search) && matchesStateFilter(exps, stateFilter);
  };

  return (
    <aside className="w-72 shrink-0 border-r border-rule bg-card/50 flex flex-col h-[calc(100vh-3.5rem)] sticky top-14">
      <div className="p-3 border-b border-rule space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search author, salt, alloy…"
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-input rounded focus:outline-none focus:border-primary"
          />
        </div>
        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value as StateFilter)}
          className="w-full py-1.5 px-2 text-xs bg-background border border-input rounded focus:outline-none"
        >
          <option value="any">Any field state</option>
          <option value="missing">Has missing fields</option>
          <option value="needs_check">Has needs-check</option>
          <option value="na">Has N/A</option>
          <option value="filled">Has filled</option>
        </select>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {categories.map((cat) => {
          const catPapers = (grouped.get(cat.id) ?? []).filter(filterPaper);
          const open = openCats[cat.id] ?? true;
          return (
            <div key={cat.id} className="mb-1">
              <button
                onClick={() => setOpenCats((s) => ({ ...s, [cat.id]: !open }))}
                className="w-full flex items-center gap-1 px-3 py-1 text-[11px] uppercase tracking-widest text-copper font-mono hover:bg-accent/50"
              >
                <ChevronRight
                  className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`}
                />
                <span className="flex-1 text-left">{cat.name}</span>
                <span className="text-muted-foreground normal-case tracking-normal">
                  {catPapers.length}
                </span>
              </button>
              {open && (
                <div className="pl-4">
                  {catPapers.map((p) => {
                    const exps = expsByPaper.get(p.id) ?? [];
                    const active = p.id === selectedPaperId;
                    return (
                      <button
                        key={p.id}
                        onClick={() => onSelectPaper(p.id)}
                        className={`w-full text-left px-3 py-1.5 text-sm hover:bg-accent/70 rounded-sm ${
                          active ? "bg-accent text-foreground" : "text-ink-muted"
                        }`}
                      >
                        <div className="font-serif italic">
                          {p.citation_key || "Untitled"}
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono">
                          {exps.length} exp{exps.length === 1 ? "" : "s"}
                        </div>
                      </button>
                    );
                  })}
                  <button
                    onClick={() => createPaper.mutate({ category_id: cat.id })}
                    className="w-full flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="h-3 w-3" /> Add paper
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
