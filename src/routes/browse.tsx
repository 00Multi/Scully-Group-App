import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BrowseTree, type StateFilter } from "@/components/BrowseTree";
import { PaperHeader } from "@/components/PaperHeader";
import { ExperimentEditor } from "@/components/ExperimentEditor";
import { useCategories, usePapers, useExperiments } from "@/lib/db";

export const Route = createFileRoute("/browse")({
  head: () => ({
    meta: [
      { title: "Browse — Corrosion Literature Review" },
      {
        name: "description",
        content:
          "Browse molten-salt corrosion papers by material category and edit experiment-level data inline.",
      },
      { property: "og:title", content: "Browse — Corrosion Literature Review" },
      {
        property: "og:description",
        content: "Category → Paper → Experiment tree with inline editing.",
      },
    ],
  }),
  component: BrowsePage,
});

function BrowsePage() {
  const { data: categories = [] } = useCategories();
  const { data: papers = [] } = usePapers();
  const { data: experiments = [] } = useExperiments();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("any");

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
      <section className="flex-1 min-w-0 p-6 space-y-4">
        {selected ? (
          <>
            <PaperHeader paper={selected} nextPosition={selectedExps.length} />
            {selectedExps.map((exp) => (
              <ExperimentEditor key={exp.id} paper={selected} experiment={exp} />
            ))}
            {selectedExps.length === 0 && (
              <div className="text-sm text-muted-foreground italic p-6 border border-dashed border-rule rounded">
                No experiments yet. Use "Add experiment" above.
              </div>
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
