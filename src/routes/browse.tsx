import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { BrowseTree, type StateFilter } from "@/components/BrowseTree";
import { PaperHeader } from "@/components/PaperHeader";
import { ExperimentEditor } from "@/components/ExperimentEditor";
import { PdfViewer } from "@/components/PdfViewer";
import { useCategories, usePapers, useExperiments } from "@/lib/db";
import type { Paper } from "@/lib/db";
import { Columns2, FileText, Table2 } from "lucide-react";

type ViewMode = "data" | "split" | "paper";

export const Route = createFileRoute("/browse")({
  head: () => ({
    meta: [
      { title: "Browse — Corrosion Literature Review" },
      {
        name: "description",
        content:
          "Browse molten-salt corrosion papers by material category and edit experiment-level data inline, with a split PDF + data view.",
      },
      { property: "og:title", content: "Browse — Corrosion Literature Review" },
      {
        property: "og:description",
        content: "Category → Paper → Experiment tree with inline editing and split PDF view.",
      },
    ],
  }),
  component: BrowsePage,
});

function DataPane({ paper, exps }: { paper: Paper; exps: ReturnType<typeof useExperiments>["data"] }) {
  const list = exps ?? [];
  return (
    <div className="space-y-4">
      <PaperHeader paper={paper} nextPosition={list.length} />
      {list.map((exp) => (
        <ExperimentEditor key={exp.id} paper={paper} experiment={exp} />
      ))}
      {list.length === 0 && (
        <div className="text-sm text-muted-foreground italic p-6 border border-dashed border-rule rounded">
          No experiments yet. Use "Add experiment" above.
        </div>
      )}
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
              (active ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground")
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
  const { data: categories = [] } = useCategories();
  const { data: papers = [] } = usePapers();
  const { data: experiments = [] } = useExperiments();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("any");
  const [mode, setMode] = useState<ViewMode>("data");
  const [userChoseMode, setUserChoseMode] = useState(false);

  useEffect(() => {
    if (!selectedId && papers.length > 0) setSelectedId(papers[0].id);
  }, [papers, selectedId]);

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

  return (
    <div className="flex max-w-[1600px] mx-auto">
      <BrowseTree
        categories={categories}
        papers={papers}
        experiments={experiments}
        selectedPaperId={selectedId}
        onSelectPaper={setSelectedId}
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
              <div className="flex-1 overflow-y-auto p-6">
                <DataPane paper={selected} exps={selectedExps} />
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
                  <div className="h-full overflow-y-auto p-6">
                    <DataPane paper={selected} exps={selectedExps} />
                  </div>
                </Panel>
              </Group>
            )}
          </>
        ) : (
          <div className="text-center py-24">
            <h2 className="text-3xl font-serif italic">Empty database</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick a material category on the left and add your first paper.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
