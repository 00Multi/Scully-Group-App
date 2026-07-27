import { useEffect, useMemo, useState } from "react";
import { ArrowDownWideNarrow, ChevronRight, Plus, Search } from "lucide-react";
import type { Category, Experiment, Paper } from "@/lib/db";
import { useCreatePaper } from "@/lib/db";
import type { FieldState } from "@/lib/fields";
import { useFieldDefs } from "@/lib/settings";

export type StateFilter = "any" | FieldState;
export type SortMode = "default" | "active" | "filled" | "added_new" | "added_old";

interface Props {
  categories: Category[];
  papers: Paper[];
  experiments: Experiment[];
  selectedPaperId: string | null;
  selectedExperimentId: string | null;
  onSelectPaper: (id: string) => void;
  onSelectExperiment: (paperId: string, experimentId: string) => void;
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
    const s = [e.label, ...Object.values(e.values).map((v) => (v?.value ?? "").toString())]
      .join(" ")
      .toLowerCase();
    return s.includes(needle);
  });
}

function matchesStateFilter(exps: Experiment[], filter: StateFilter) {
  if (filter === "any") return true;
  return exps.some((e) => Object.values(e.values).some((v) => v?.state === filter));
}

export function BrowseTree({
  categories,
  papers,
  experiments,
  selectedPaperId,
  selectedExperimentId,
  onSelectPaper,
  onSelectExperiment,
  search,
  setSearch,
  stateFilter,
  setStateFilter,
}: Props) {
  const [openCats, setOpenCats] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, true])),
  );
  const [openPapers, setOpenPapers] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<SortMode>("default");
  const createPaper = useCreatePaper();
  const fieldDefs = useFieldDefs();

  // Keep the selected paper's experiments expanded so the active row is visible.
  useEffect(() => {
    if (selectedPaperId) setOpenPapers((s) => ({ ...s, [selectedPaperId]: true }));
  }, [selectedPaperId]);

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
    for (const list of m.values())
      list.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
    return m;
  }, [experiments]);

  const filterPaper = (p: Paper) => {
    const exps = expsByPaper.get(p.id) ?? [];
    return matchesSearch(p, exps, search) && matchesStateFilter(exps, stateFilter);
  };

  // Per-paper sort metrics: last activity (max of the paper's and its
  // experiments' updated_at), fraction of fields filled, and date added.
  const metrics = useMemo(() => {
    const m = new Map<string, { activity: string; filled: number; created: string }>();
    for (const p of papers) {
      const exps = expsByPaper.get(p.id) ?? [];
      let activity = p.updated_at;
      let filled = 0;
      let total = 0;
      for (const e of exps) {
        if (e.updated_at > activity) activity = e.updated_at;
        for (const f of fieldDefs) {
          total++;
          if (e.values?.[f.key]?.state === "filled") filled++;
        }
      }
      m.set(p.id, { activity, filled: total ? filled / total : 0, created: p.created_at });
    }
    return m;
  }, [papers, expsByPaper, fieldDefs]);

  const sortPapers = (list: Paper[]): Paper[] => {
    if (sortBy === "default") return list;
    const arr = [...list];
    const mt = (id: string) => metrics.get(id)!;
    if (sortBy === "active") arr.sort((a, b) => mt(b.id).activity.localeCompare(mt(a.id).activity));
    else if (sortBy === "filled") arr.sort((a, b) => mt(b.id).filled - mt(a.id).filled);
    else if (sortBy === "added_new")
      arr.sort((a, b) => mt(b.id).created.localeCompare(mt(a.id).created));
    else if (sortBy === "added_old")
      arr.sort((a, b) => mt(a.id).created.localeCompare(mt(b.id).created));
    return arr;
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
        <div className="relative">
          <ArrowDownWideNarrow className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortMode)}
            className="w-full pl-7 pr-2 py-1.5 text-xs bg-background border border-input rounded focus:outline-none"
            aria-label="Sort papers"
          >
            <option value="default">Sort: default (by category)</option>
            <option value="active">Sort: recently active</option>
            <option value="filled">Sort: most data filled</option>
            <option value="added_new">Sort: newest added</option>
            <option value="added_old">Sort: oldest added</option>
          </select>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {categories.map((cat) => {
          const catPapers = sortPapers((grouped.get(cat.id) ?? []).filter(filterPaper));
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
                <div className="pl-2">
                  {catPapers.map((p) => {
                    const exps = expsByPaper.get(p.id) ?? [];
                    const active = p.id === selectedPaperId;
                    const paperOpen = openPapers[p.id] ?? false;
                    return (
                      <div key={p.id}>
                        <div
                          className={`group flex items-start rounded-sm ${
                            active
                              ? "bg-accent text-foreground"
                              : "text-ink-muted hover:bg-accent/70"
                          }`}
                        >
                          <button
                            onClick={() => setOpenPapers((s) => ({ ...s, [p.id]: !paperOpen }))}
                            className="pl-2 pt-2 shrink-0"
                            aria-label={paperOpen ? "Collapse experiments" : "Expand experiments"}
                          >
                            <ChevronRight
                              className={`h-3 w-3 text-muted-foreground transition-transform ${
                                paperOpen ? "rotate-90" : ""
                              } ${exps.length === 0 ? "opacity-20" : ""}`}
                            />
                          </button>
                          <button
                            onClick={() => {
                              onSelectPaper(p.id);
                              setOpenPapers((s) => ({ ...s, [p.id]: true }));
                            }}
                            className="flex-1 text-left px-2 py-1.5 text-sm min-w-0"
                          >
                            <div className="font-serif italic truncate">
                              {p.citation_key || "Untitled"}
                            </div>
                            <div className="text-[10px] text-muted-foreground font-mono">
                              {exps.length} exp{exps.length === 1 ? "" : "s"}
                            </div>
                          </button>
                        </div>
                        {paperOpen && exps.length > 0 && (
                          <ul className="ml-[1.35rem] border-l border-rule/60 pl-1">
                            {exps.map((e) => {
                              const expActive = e.id === selectedExperimentId;
                              return (
                                <li key={e.id}>
                                  <button
                                    onClick={() => onSelectExperiment(p.id, e.id)}
                                    className={`w-full text-left px-2 py-1 text-xs rounded-sm truncate ${
                                      expActive
                                        ? "bg-copper/15 text-foreground"
                                        : "text-muted-foreground hover:bg-accent/60"
                                    }`}
                                    title={e.label}
                                  >
                                    {e.label || "Untitled experiment"}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
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
