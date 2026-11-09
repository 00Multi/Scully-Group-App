import { useEffect, useMemo, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Star, StickyNote, TrendingUp } from "lucide-react";
import type { Experiment } from "@/lib/db";
import type { FieldDef } from "@/lib/fields";
import { bigCorrelations, fmtNum, specifierCorrelations, type PairCorrelation } from "@/lib/plot";

const STORAGE_KEY = "plot.corr.v1";

// A direction-independent id for a pair (correlation is symmetric), so a favorite
// or a note sticks to the relationship however it's loaded into the plot.
const pairId = (xKey: string, yKey: string) => [xKey, yKey].sort().join("__");

type Store = { favorites: string[]; notes: Record<string, string> };

function loadStore(): Store {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Store>;
      return { favorites: p.favorites ?? [], notes: p.notes ?? {} };
    }
  } catch {
    /* ignore */
  }
  return { favorites: [], notes: {} };
}

// Colour the r value by strength so strong relationships stand out.
function rClass(r: number): string {
  const a = Math.abs(r);
  if (a >= 0.7) return "text-state-filled";
  if (a >= 0.4) return "text-copper";
  return "text-muted-foreground";
}

export function CorrelationPanel({
  experiments,
  fieldDefs,
  activeX,
  activeY,
  onPick,
}: {
  experiments: Experiment[];
  fieldDefs: FieldDef[];
  activeX: string;
  activeY: string;
  onPick: (xKey: string, yKey: string) => void;
}) {
  // Two views: "big" pools each data point's specifiers into one category;
  // "spec" shows relationships involving a specific specifier variant.
  const [tab, setTab] = useState<"big" | "spec">("big");
  const bigPairs = useMemo(() => bigCorrelations(experiments, fieldDefs), [experiments, fieldDefs]);
  const specPairs = useMemo(
    () => specifierCorrelations(experiments, fieldDefs),
    [experiments, fieldDefs],
  );
  const pairs = tab === "big" ? bigPairs : specPairs;

  // Strongest (|r|) first by default; the toggle flips to weakest first.
  const [desc, setDesc] = useState(true);
  const [favOnly, setFavOnly] = useState(false);
  const [store, setStore] = useState<Store>({ favorites: [], notes: {} });
  const [loaded, setLoaded] = useState(false);
  // Which rows have their note editor open.
  const [openNotes, setOpenNotes] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setStore(loadStore());
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    } catch {
      /* ignore */
    }
  }, [store, loaded]);

  const favSet = useMemo(() => new Set(store.favorites), [store.favorites]);

  const rows = useMemo(() => {
    const sorted = [...pairs].sort((a, b) =>
      desc ? Math.abs(b.r) - Math.abs(a.r) : Math.abs(a.r) - Math.abs(b.r),
    );
    return favOnly ? sorted.filter((p) => favSet.has(pairId(p.xKey, p.yKey))) : sorted;
  }, [pairs, desc, favOnly, favSet]);

  const toggleFav = (id: string) =>
    setStore((s) => ({
      ...s,
      favorites: s.favorites.includes(id)
        ? s.favorites.filter((x) => x !== id)
        : [...s.favorites, id],
    }));
  const setNote = (id: string, text: string) =>
    setStore((s) => {
      const notes = { ...s.notes };
      if (text.trim()) notes[id] = text;
      else delete notes[id];
      return { ...s, notes };
    });
  const toggleNote = (id: string) =>
    setOpenNotes((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const isActive = (p: PairCorrelation) =>
    (p.xKey === activeX && p.yKey === activeY) || (p.xKey === activeY && p.yKey === activeX);

  return (
    <div className="rounded-lg border border-rule bg-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-copper" />
          <h3 className="text-sm font-serif italic">Correlations</h3>
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            {rows.length} pair{rows.length === 1 ? "" : "s"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFavOnly((v) => !v)}
            title={favOnly ? "Show all pairs" : "Show only favorites"}
            className={
              "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors " +
              (favOnly
                ? "border-copper/50 bg-copper/10 text-foreground"
                : "border-rule text-muted-foreground hover:bg-accent")
            }
          >
            <Star className={"h-3.5 w-3.5 " + (favOnly ? "fill-copper text-copper" : "")} />
            Favorites
          </button>
          <button
            type="button"
            onClick={() => setDesc((v) => !v)}
            title={
              desc
                ? "Sorted strongest first — click for weakest first"
                : "Sorted weakest first — click for strongest first"
            }
            className="inline-flex items-center gap-1 rounded-md border border-rule px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            {desc ? (
              <ArrowDownWideNarrow className="h-3.5 w-3.5" />
            ) : (
              <ArrowUpNarrowWide className="h-3.5 w-3.5" />
            )}
            {desc ? "Strongest" : "Weakest"}
          </button>
        </div>
      </div>

      <div className="mb-2 inline-flex overflow-hidden rounded-md border border-rule text-xs">
        {(
          [
            ["big", "Non-specified"],
            ["spec", "Specifiers"],
          ] as [typeof tab, string][]
        ).map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={
              "px-3 py-1 transition-colors " +
              (tab === k
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-accent")
            }
          >
            {lbl}
          </button>
        ))}
      </div>

      <p className="mb-2 text-[11px] text-muted-foreground">
        {tab === "big"
          ? "Each data point pools all its specifiers into one non-specified category. "
          : "Relationships that involve a specific specifier variant. "}
        Pearson r across every experiment with both values. Click a pair to load it into the plot;
        strong |r| doesn't prove causation — check the scatter and point count (n).
      </p>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm italic text-muted-foreground">
          {favOnly
            ? "No favorites yet — star a pair to pin it here."
            : tab === "big"
              ? "Not enough numeric data to correlate yet."
              : "No specifier-level relationships yet — add specifier variants that hold data."}
        </p>
      ) : (
        <ul className="divide-y divide-rule/60">
          {rows.map((p) => {
            const id = pairId(p.xKey, p.yKey);
            const fav = favSet.has(id);
            const note = store.notes[id] ?? "";
            const noteOpen = openNotes.has(id);
            return (
              <li key={id} className={isActive(p) ? "bg-accent/40" : ""}>
                <div className="flex items-center gap-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => toggleFav(id)}
                    title={fav ? "Remove from favorites" : "Add to favorites"}
                    aria-label="Toggle favorite"
                    className="shrink-0 text-muted-foreground/60 hover:text-copper"
                  >
                    <Star className={"h-4 w-4 " + (fav ? "fill-copper text-copper" : "")} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onPick(p.xKey, p.yKey)}
                    title="Load this pair into the plot"
                    className="min-w-0 flex-1 truncate text-left text-sm hover:text-copper"
                  >
                    {p.xLabel} <span className="text-muted-foreground">↔</span> {p.yLabel}
                  </button>
                  <span
                    className={"shrink-0 font-mono text-xs tabular-nums " + rClass(p.r)}
                    title={`r² = ${fmtNum(p.r2)}`}
                  >
                    r = {p.r >= 0 ? "+" : ""}
                    {fmtNum(p.r)}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                    n={p.n}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleNote(id)}
                    title={note ? "Edit note" : "Add a note"}
                    aria-label="Note"
                    className={
                      "shrink-0 hover:text-copper " +
                      (note ? "text-copper" : "text-muted-foreground/60")
                    }
                  >
                    <StickyNote className={"h-4 w-4 " + (note ? "fill-copper/20" : "")} />
                  </button>
                </div>
                {noteOpen && (
                  <div className="pb-2 pl-6 pr-1">
                    <textarea
                      autoFocus
                      value={note}
                      onChange={(e) => setNote(id, e.target.value)}
                      placeholder="Notes on this relationship…"
                      rows={2}
                      className="w-full resize-y rounded border border-input bg-background px-2 py-1 text-xs focus:border-primary focus:outline-none"
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
