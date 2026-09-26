import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { usePapers, useExperiments } from "@/lib/db";
import { useSettings } from "@/lib/settings";
import { PlotExplorer } from "@/components/PlotExplorer";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/plot")({
  head: () => ({
    meta: [
      { title: "Plot — Corrosion" },
      {
        name: "description",
        content:
          "Plot any two data points against each other, one point per experiment, with constraints, multiple series, and editable axes.",
      },
      { property: "og:title", content: "Plot — Corrosion Literature Review" },
      {
        property: "og:description",
        content: "Scatter any data point against another across the molten-salt corrosion dataset.",
      },
    ],
  }),
  component: PlotPage,
});

function PlotPage() {
  const { data: papers = [] } = usePapers();
  const { data: experiments = [] } = useExperiments();
  const { fieldDefs } = useSettings();

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      <div className="mb-2">
        <Link
          to="/"
          className="text-xs text-muted-foreground hover:text-copper inline-flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" /> Dashboard
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="text-5xl font-serif italic">Plot</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Pick an X and a Y data point; every experiment that reports both is drawn as one point.
          Add constraints to focus a subset (e.g. Salt = FLiNaK), or add more series to compare
          slices on the same axes. Colours, shapes, axis names, limits, and the grid are all yours
          to change — click a point to delete it, and undo (⌘/Ctrl+Z) reverses mistakes.
        </p>
      </div>

      {experiments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-rule p-10 text-center text-sm text-muted-foreground italic">
          No experiments to plot yet. Add papers and fill in numeric data points, then come back.
        </div>
      ) : (
        <PlotExplorer
          experiments={experiments}
          papers={papers}
          fieldDefs={fieldDefs}
          mounted={mounted}
        />
      )}
    </div>
  );
}
