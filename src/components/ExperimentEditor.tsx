import { useEffect, useRef, useState } from "react";
import type { Experiment, Paper } from "@/lib/db";
import { useUpdateExperiment, useDeleteExperiment, useUpdatePaper } from "@/lib/db";
import { MISSING_VALUE, withDefaults, type FieldValue } from "@/lib/fields";
import { useSettings } from "@/lib/settings";
import { FieldRow } from "./FieldRow";
import { Plus, Trash2 } from "lucide-react";

function useDebouncedEffect(cb: () => void, deps: unknown[], delay = 400) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(cb, delay);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function ExperimentEditor({
  paper,
  experiment,
}: {
  paper: Paper;
  experiment: Experiment;
}) {
  const updateExp = useUpdateExperiment();
  const deleteExp = useDeleteExperiment();
  const updatePaper = useUpdatePaper();
  const { groups, fieldsByGroup, addField, deleteField } = useSettings();

  const [label, setLabel] = useState(experiment.label);
  const [values, setValues] = useState<Record<string, FieldValue>>(
    withDefaults(experiment.values),
  );

  useEffect(() => {
    setLabel(experiment.label);
    setValues(withDefaults(experiment.values));
  }, [experiment.id, experiment.label, experiment.values]);

  useDebouncedEffect(
    () => {
      if (label !== experiment.label) {
        updateExp.mutate({ id: experiment.id, patch: { label } });
      }
    },
    [label],
    500,
  );

  useDebouncedEffect(
    () => {
      updateExp.mutate({ id: experiment.id, patch: { values } });
    },
    [values],
    350,
  );

  const setField = (key: string, next: FieldValue) => {
    setValues((v) => ({ ...v, [key]: next }));
  };

  return (
    <div className="@container rounded-lg border border-rule bg-card">
      <header className="flex items-center justify-between gap-2 px-5 py-3 border-b border-rule">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
            Experiment
          </span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. static / Ni capsule / 700 °C"
            className="flex-1 bg-transparent text-lg font-serif italic focus:outline-none min-w-0"
          />
        </div>
        <button
          onClick={() => {
            if (confirm("Delete this experiment row?")) deleteExp.mutate(experiment.id);
          }}
          className="text-muted-foreground hover:text-destructive transition-colors p-1"
          aria-label="Delete experiment"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </header>

      <div className="grid grid-cols-1 @3xl:grid-cols-2 @6xl:grid-cols-3 gap-x-8 gap-y-0 px-5 py-3">
        {groups.map((group) => (
          <section key={group.id} className="min-w-0">
            <h4 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono mt-2 mb-1">
              {group.label}
            </h4>
            <div>
              {(fieldsByGroup[group.id] ?? []).map((f) => (
                <FieldRow
                  key={f.key}
                  field={f}
                  value={values[f.key] ?? MISSING_VALUE}
                  onChange={(next) => setField(f.key, next)}
                  onDelete={() => {
                    if (
                      confirm(
                        `Delete the "${f.label}" data point? It will be removed from every experiment.`,
                      )
                    )
                      deleteField(f.key);
                  }}
                />
              ))}
              {(fieldsByGroup[group.id] ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground italic py-2">No data points yet.</p>
              )}
              <button
                onClick={() => addField(group.id)}
                className="mt-1 inline-flex items-center gap-1 text-xs text-copper hover:underline"
              >
                <Plus className="h-3 w-3" /> Add data point
              </button>
            </div>
          </section>
        ))}
      </div>

      <footer className="px-5 py-2 border-t border-rule/60 text-[10px] text-muted-foreground font-mono flex justify-between">
        <span>Autosaved</span>
        <span>
          {paper.citation_key || `${paper.author} ${paper.year ?? ""}`.trim() || "Untitled paper"}
        </span>
      </footer>
    </div>
  );
}
