import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { BrowseTree, type StateFilter } from "@/components/BrowseTree";
import { PaperHeader } from "@/components/PaperHeader";
import { PaperExperiments } from "@/components/PaperExperiments";
import { PdfViewer } from "@/components/PdfViewer";
import { PdfDropZone } from "@/components/PdfDropZone";
import { usePapers, useExperiments } from "@/lib/db";
import type { Paper } from "@/lib/db";
import { SnipProvider } from "@/lib/snip";
import { Columns2, FileText, Table2 } from "lucide-react";

type ViewMode = "data" | "split" | "paper";

interface BrowseSearch {
  paper?: string;
  exp?: string;
}

// The Browse tab's selection/view is remembered across tab switches (Browse is
// unmounted when you visit e.g. Export), so returning lands on the same paper.
const BROWSE_STATE_KEY = "browse.ui.v1";
interface BrowseUIState {
  paperId: string | null;
  expId: string | null;
  mode: ViewMode;
  userChoseMode: boolean;
  search: string;
  stateFilter: StateFilter;
}
function loadBrowseState(): Partial<BrowseUIState> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BROWSE_STATE_KEY);
    return raw ? (JSON.parse(raw) as Partial<BrowseUIState>) : null;
  } catch {
    return null;
  }
}
function saveBrowseState(s: BrowseUIState) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BROWSE_STATE_KEY, JSON.stringify(s));
  } catch {
    /* ignore quota errors */
  }
}

export const Route = createFileRoute("/browse")({
  validateSearch: (search: Record<string, unknown>): BrowseSearch => ({
    paper: typeof search.paper === "string" ? search.paper : undefined,
    exp: typeof search.exp === "string" ? search.exp : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Browse — Corrosion Literature Review" },
      {
        name: "description",
        content:
          "Browse molten-salt corrosion papers and edit experiment-level data inline, filter by alloy type, with a split PDF + data view.",
      },
      { property: "og:title", content: "Browse — Corrosion Literature Review" },
      {
        property: "og:description",
        content:
          "Paper → Experiment tree with alloy-type filtering, inline editing, and split PDF view.",
      },
    ],
  }),
  component: BrowsePage,
});

function DataPane({
  paper,
  exps,
  onCreated,
  scrollRef,
  onScroll,
  allowMulti,
  activeExpId,
  onActiveExp,
}: {
  paper: Paper;
  exps: ReturnType<typeof useExperiments>["data"];
  onCreated: (id: string) => void;
  scrollRef: (el: HTMLDivElement | null) => void;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  allowMulti: boolean;
  activeExpId: string | null;
  onActiveExp: (id: string | null) => void;
}) {
  const list = exps ?? [];
  return (
    <div ref={scrollRef} onScroll={onScroll} className="h-full overflow-y-auto p-6">
      <div className="space-y-4">
        <PdfDropZone onCreated={onCreated} />
        <PaperHeader paper={paper} nextPosition={list.length} />
        <PaperExperiments
          key={paper.id}
          paper={paper}
          experiments={list}
          allowMulti={allowMulti}
          activeExpId={activeExpId}
          onActiveExp={onActiveExp}
        />
      </div>
    </div>
  );
}

function ViewToggle({ mode, setMode }: { mode: ViewMode; setMode: (m: ViewMode) => void }) {
  const opts: { key: ViewMode; label: string; icon: typeof Table2 }[] = [
    { key: "data", label: "Data", icon: Table2 },
    { key: "split", label: "Split", icon: Columns2 },
    { key: "paper", label: "Paper", icon: FileText },
  ];
  return (
    <div className="inline-flex rounded-md border border-rule overflow-hidden">
      {opts.map((o) => {
        const Icon = o.icon;
        const active = mode === o.key;
        return (
          <button
            key={o.key}
            onClick={() => setMode(o.key)}
            className={
              "inline-flex items-center gap-1 px-2.5 py-1 text-xs transition-colors " +
              (active
                ? "bg-primary text-primary-foreground"
                : "hover:bg-accent text-muted-foreground")
            }
          >
            <Icon className="h-3 w-3" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function BrowsePage() {
  const { paper: paperParam, exp: expParam } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: papers = [] } = usePapers();
  const { data: experiments = [] } = useExperiments();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedExpId, setSelectedExpId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("any");
  const [mode, setMode] = useState<ViewMode>("data");
  const [userChoseMode, setUserChoseMode] = useState(false);
  // Whether the one-time restore of persisted browse state has run.
  const [restored, setRestored] = useState(false);

  // Persisted scroll position for the data form pane, so switching view modes
  // (which remounts the pane) does not reset the reader's place. (PRD F3)
  const dataScrollTop = useRef(0);
  const attachDataScroll = useCallback((el: HTMLDivElement | null) => {
    if (el) el.scrollTop = dataScrollTop.current;
  }, []);
  const onDataScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    dataScrollTop.current = e.currentTarget.scrollTop;
  }, []);

  // Pending experiment id to scroll to once the pane has rendered.
  const pendingScrollExp = useRef<string | null>(null);

  // One-time restore of the persisted browse selection/view (unless an incoming
  // deep-link takes precedence). Runs client-side to avoid SSR hydration drift.
  useEffect(() => {
    const saved = !paperParam ? loadBrowseState() : null;
    if (saved) {
      if (saved.paperId) setSelectedId(saved.paperId);
      if (saved.expId) {
        setSelectedExpId(saved.expId);
        pendingScrollExp.current = saved.expId;
      }
      if (saved.mode) setMode(saved.mode);
      if (saved.userChoseMode) setUserChoseMode(true);
      if (saved.search) setSearch(saved.search);
      if (saved.stateFilter) setStateFilter(saved.stateFilter);
    }
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply an incoming deep-link (?paper=&exp=) once the data has loaded.
  useEffect(() => {
    if (paperParam && papers.some((p) => p.id === paperParam)) {
      setSelectedId(paperParam);
      if (expParam) {
        setSelectedExpId(expParam);
        pendingScrollExp.current = expParam;
      }
      // Clear the params so a later manual selection isn't overridden.
      navigate({ search: {}, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperParam, expParam, papers]);

  // Fall back to the first paper only after restore, and also recover if the
  // remembered paper no longer exists (e.g. it was deleted).
  useEffect(() => {
    if (!restored || papers.length === 0) return;
    if (selectedId && papers.some((p) => p.id === selectedId)) return;
    setSelectedId(papers[0].id);
  }, [restored, papers, selectedId]);

  // Persist the browse selection/view so it survives leaving and returning.
  useEffect(() => {
    if (!restored) return;
    saveBrowseState({
      paperId: selectedId,
      expId: selectedExpId,
      mode,
      userChoseMode,
      search,
      stateFilter,
    });
  }, [restored, selectedId, selectedExpId, mode, userChoseMode, search, stateFilter]);

  const selected = papers.find((p) => p.id === selectedId) ?? null;
  const selectedExps = useMemo(
    () =>
      experiments
        .filter((e) => e.paper_id === selectedId)
        .sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)),
    [experiments, selectedId],
  );

  // Default to Split when a paper with a PDF is opened, unless the user has
  // explicitly picked a mode this session.
  useEffect(() => {
    if (!userChoseMode) setMode(selected?.pdf_path ? "split" : "data");
  }, [selected?.id, selected?.pdf_path, userChoseMode]);

  const chooseMode = (m: ViewMode) => {
    setUserChoseMode(true);
    setMode(m);
  };

  const selectExperiment = (paperId: string, expId: string) => {
    setSelectedId(paperId);
    setSelectedExpId(expId);
    pendingScrollExp.current = expId;
    // Ensure the data form is visible.
    if (mode === "paper") {
      setUserChoseMode(true);
      setMode(selected?.pdf_path ? "split" : "data");
    }
  };

  // Scroll to the pending experiment after the relevant pane is on screen.
  useEffect(() => {
    const expId = pendingScrollExp.current;
    if (!expId || mode === "paper") return;
    const t = setTimeout(() => {
      const el = document.getElementById(`exp-${expId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("ring-2", "ring-copper");
        setTimeout(() => el.classList.remove("ring-2", "ring-copper"), 1600);
        pendingScrollExp.current = null;
      }
    }, 120);
    return () => clearTimeout(t);
  }, [mode, selectedExpId, selectedId, selectedExps.length]);

  return (
    <SnipProvider>
      <div className="flex max-w-[1600px] mx-auto">
        <BrowseTree
          papers={papers}
          experiments={experiments}
          selectedPaperId={selectedId}
          selectedExperimentId={selectedExpId}
          onSelectPaper={(id) => {
            setSelectedId(id);
            setSelectedExpId(null);
          }}
          onSelectExperiment={selectExperiment}
          search={search}
          setSearch={setSearch}
          stateFilter={stateFilter}
          setStateFilter={setStateFilter}
        />
        <section className="flex-1 min-w-0 flex flex-col h-[calc(100vh-3.5rem)]">
          {selected ? (
            <>
              <div className="flex items-center justify-between gap-3 px-6 py-2 border-b border-rule">
                <span className="text-sm font-serif italic truncate">
                  {selected.citation_key || "Untitled"}
                </span>
                <ViewToggle mode={mode} setMode={chooseMode} />
              </div>

              {mode === "data" && (
                <div className="flex-1 min-h-0">
                  <DataPane
                    paper={selected}
                    exps={selectedExps}
                    onCreated={setSelectedId}
                    scrollRef={attachDataScroll}
                    onScroll={onDataScroll}
                    allowMulti
                    activeExpId={selectedExpId}
                    onActiveExp={setSelectedExpId}
                  />
                </div>
              )}

              {mode === "paper" && (
                <div className="flex-1 min-h-0">
                  <PdfViewer paper={selected} />
                </div>
              )}

              {mode === "split" && (
                <Group orientation="horizontal" className="flex-1 min-h-0 flex">
                  <Panel defaultSize="50%" minSize="25%" className="min-h-0">
                    <PdfViewer paper={selected} />
                  </Panel>
                  <Separator className="w-1.5 bg-rule/40 hover:bg-copper/60 transition-colors cursor-col-resize" />
                  <Panel defaultSize="50%" minSize="25%" className="min-h-0">
                    <DataPane
                      paper={selected}
                      exps={selectedExps}
                      onCreated={setSelectedId}
                      scrollRef={attachDataScroll}
                      onScroll={onDataScroll}
                      allowMulti={false}
                      activeExpId={selectedExpId}
                      onActiveExp={setSelectedExpId}
                    />
                  </Panel>
                </Group>
              )}
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto mt-10">
                <h2 className="text-3xl font-serif italic text-center">Empty database</h2>
                <p className="mt-2 mb-6 text-sm text-muted-foreground text-center">
                  Add a paper from the tree on the left, or drop PDFs below to create papers with
                  metadata auto-filled.
                </p>
                <PdfDropZone onCreated={setSelectedId} />
              </div>
            </div>
          )}
        </section>
      </div>
    </SnipProvider>
  );
}
