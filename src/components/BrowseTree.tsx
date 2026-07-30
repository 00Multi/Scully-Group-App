import { useEffect, useMemo, useState } from "react";
import { ArrowDownWideNarrow, Check, ChevronRight, Plus, Search } from "lucide-react";
import type { Experiment, Paper } from "@/lib/db";
import { useCreatePaper } from "@/lib/db";
import type { FieldState } from "@/lib/fields";
import { useFieldDefs } from "@/lib/settings";

export type StateFilter = "any" | FieldState;
export type SortMode =
  "default" | "alpha_az" | "alpha_za" | "active" | "filled" | "added_new" | "added_old";

const ALLOY_TYPE_KEY = "alloy_type";

// The label shown for a paper in the tree, used for alphabetical sorting.
function alphaKey(p: Paper): string {
  return (p.citation_key || p.author || p.title || "").trim();
}

// Remember the tree's sort, alloy filter, and which papers are expanded across
// tab switches.
const TREE_STATE_KEY = "browse.tree.v1";
interface TreeUIState {
  sortBy: SortMode;
  alloyFilter: string;
  openPapers: Record<string, boolean>;
}
function loadTreeState(): Partial<TreeUIState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(TREE_STATE_KEY);
    return raw ? (JSON.parse(raw) as Partial<TreeUIState>) : null;
  } catch {
    return null;
  }
}
function saveTreeState(s: TreeUIState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TREE_STATE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota errors */
  }
}

interface Props {
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

function alloyTypeOf(e: Experiment): string {
  const v = e.values?.[ALLOY_TYPE_KEY]?.value;
  return typeof v === "string" ? v.trim() : "";
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

function expMatchesState(e: Experiment, filter: StateFilter) {
  if (filter === "any") return true;
  return Object.values(e.values).some((v) => v?.state === filter);
}

export function BrowseTree({
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
  const [openPapers, setOpenPapers] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<SortMode>("default");
  const [alloyFilter, setAlloyFilter] = useState<string>("all");
  const [restored, setRestored] = useState(false);
  const createPaper = useCreatePaper();
  const fieldDefs = useFieldDefs();

  // Restore the persisted tree state once, client-side.
  useEffect(() => {
    const saved = loadTreeState();
    if (saved) {
      if (saved.sortBy) setSortBy(saved.sortBy);
      if (saved.alloyFilter) setAlloyFilter(saved.alloyFilter);
      if (saved.openPapers) setOpenPapers(saved.openPapers);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    saveTreeState({ sortBy, alloyFilter, openPapers });
  }, [restored, sortBy, alloyFilter, openPapers]);

  useEffect(() => {
    if (selectedPaperId) setOpenPapers((s) => ({ ...s, [selectedPaperId]: true }));
  }, [selectedPaperId]);

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

  // Alloy-type values actually present (for the filter dropdown), unioned with
  // the field's configured options so empty-but-defined types still appear.
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

  // Per-paper sort metrics.
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

  // Experiments shown under a paper, after the alloy-type filter.
  const shownExps = (p: Paper) => {
    const exps = expsByPaper.get(p.id) ?? [];
    if (alloyFilter === "all") return exps;
    return exps.filter((e) => alloyTypeOf(e) === alloyFilter);
  };

  const visiblePapers = useMemo(() => {
    let list = papers.filter((p) => {
      const exps = expsByPaper.get(p.id) ?? [];
      if (!matchesSearch(p, exps, search)) return false;
      if (stateFilter !== "any" && !exps.some((e) => expMatchesState(e, stateFilter))) return false;
      if (alloyFilter !== "all" && !exps.some((e) => alloyTypeOf(e) === alloyFilter)) return false;
      return true;
    });
    if (sortBy !== "default") {
      const mt = (id: string) => metrics.get(id)!;
      list = [...list];
      const collate = (a: string, b: string) =>
        a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
      if (sortBy === "alpha_az") list.sort((a, b) => collate(alphaKey(a), alphaKey(b)));
      else if (sortBy === "alpha_za") list.sort((a, b) => collate(alphaKey(b), alphaKey(a)));
      else if (sortBy === "active")
        list.sort((a, b) => mt(b.id).activity.localeCompare(mt(a.id).activity));
      else if (sortBy === "filled") list.sort((a, b) => mt(b.id).filled - mt(a.id).filled);
      else if (sortBy === "added_new")
        list.sort((a, b) => mt(b.id).created.localeCompare(mt(a.id).created));
      else if (sortBy === "added_old")
        list.sort((a, b) => mt(a.id).created.localeCompare(mt(b.id).created));
    }
    return list;
  }, [papers, expsByPaper, search, stateFilter, alloyFilter, sortBy, metrics]);

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
          value={alloyFilter}
          onChange={(e) => setAlloyFilter(e.target.value)}
          className="w-full py-1.5 px-2 text-xs bg-background border border-input rounded focus:outline-none"
          aria-label="Filter by alloy type"
        >
          <option value="all">All alloy types</option>
          {alloyOptions.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
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
            <option value="default">Sort: default</option>
            <option value="alpha_az">Sort: A → Z</option>
            <option value="alpha_za">Sort: Z → A</option>
            <option value="active">Sort: recently active</option>
            <option value="filled">Sort: most data filled</option>
            <option value="added_new">Sort: newest added</option>
            <option value="added_old">Sort: oldest added</option>
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between px-3 py-1.5 border-b border-rule/60">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
          {visiblePapers.length} paper{visiblePapers.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={() => createPaper.mutate({ category_id: null })}
          className="inline-flex items-center gap-1 text-xs text-copper hover:underline"
        >
          <Plus className="h-3 w-3" /> New paper
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-1">
        {visiblePapers.length === 0 && (
          <p className="px-3 py-4 text-xs text-muted-foreground italic">No papers match.</p>
        )}
        {visiblePapers.map((p) => {
          const exps = shownExps(p);
          const active = p.id === selectedPaperId;
          const paperOpen = openPapers[p.id] ?? false;
          // A paper is "done" when it has experiments and every one is reviewed.
          const allExps = expsByPaper.get(p.id) ?? [];
          const paperDone = allExps.length > 0 && allExps.every((e) => e.checked);
          return (
            <div key={p.id} className="mb-0.5">
              <div
                className={`group flex items-start rounded-sm mx-1 ${
                  active ? "bg-accent text-foreground" : "text-ink-muted hover:bg-accent/70"
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
                  <div className="font-serif italic truncate flex items-center gap-1">
                    {paperDone && (
                      <Check
                        className="h-3.5 w-3.5 shrink-0 text-state-filled"
                        aria-label="All experiments reviewed"
                      />
                    )}
                    <span className="truncate">{p.citation_key || "Untitled"}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">
                    {exps.length} exp{exps.length === 1 ? "" : "s"}
                  </div>
                </button>
              </div>
              {paperOpen && exps.length > 0 && (
                <ul className="ml-[1.85rem] border-l border-rule/60 pl-1">
                  {exps.map((e) => {
                    const expActive = e.id === selectedExperimentId;
                    const alloy = alloyTypeOf(e);
                    return (
                      <li key={e.id}>
                        <button
                          onClick={() => onSelectExperiment(p.id, e.id)}
                          className={`w-full text-left px-2 py-1 text-xs rounded-sm flex items-center gap-1.5 ${
                            expActive
                              ? "bg-copper/15 text-foreground"
                              : "text-muted-foreground hover:bg-accent/60"
                          }`}
                          title={e.label}
                        >
                          <span className="truncate flex-1 min-w-0">
                            {e.label || "Untitled experiment"}
                          </span>
                          {alloy && (
                            <span className="shrink-0 rounded-sm bg-copper/15 text-copper px-1 py-px text-[9px] font-mono uppercase tracking-wide">
                              {alloy}
                            </span>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
