import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { Experiment, Paper } from "@/lib/db";
import { useCreateExperiment, useDeleteExperiment, useUpdateExperiment } from "@/lib/db";
import {
  MISSING_VALUE,
  parseFieldInput,
  STATE_LABELS,
  withDefaults,
  type FieldDef,
  type FieldState,
  type FieldValue,
} from "@/lib/fields";
import { useSettings } from "@/lib/settings";
import { expColor } from "@/lib/expColors";
import { FieldRow } from "./FieldRow";
import { ImageFieldRow } from "./ImageFieldRow";
import { FieldTooltip } from "./FieldTooltip";
import { StateBadge } from "./StateBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Circle,
  CheckCheck,
  Columns3,
  Copy,
  GripVertical,
  Layers,
  ListChecks,
  Plus,
  Rows3,
  Trash2,
  X,
} from "lucide-react";

const STATES: FieldState[] = ["filled", "missing", "na", "needs_check"];
const VIEW_KEY = "paper.exp.view.v1";
// Sentinel for the "all experiments" row mode — a data point shared across every
// experiment in the paper. This is the default for every data point.
const ALL = "__all__";

type ViewMode = "single" | "multi";

const expName = (e: Experiment, i: number) => e.label?.trim() || `Experiment ${i + 1}`;

const fvEqual = (a: FieldValue, b: FieldValue) =>
  a.state === b.state &&
  (a.value ?? null) === (b.value ?? null) &&
  (a.note ?? null) === (b.note ?? null);

// ---- A small coloured dot for an experiment ----
function Dot({ i, className = "" }: { i: number; className?: string }) {
  return (
    <span
      className={"inline-block h-2.5 w-2.5 rounded-full shrink-0 " + className}
      style={{ backgroundColor: expColor(i) }}
    />
  );
}

// ---- Per-row selector: which experiment(s) this data point applies to ----
// "All experiments" (the default) is rendered in a neutral grey so shared data
// points recede next to the colour-coded, experiment-specific ones.
function ExperimentSelect({
  experiments,
  valueId,
  onChange,
  hasValue,
}: {
  experiments: Experiment[];
  valueId: string;
  onChange: (id: string) => void;
  // Whether a given experiment currently has a value for this data point, so
  // the menu can flag each with a green check (filled) or red ✗ (missing).
  hasValue?: (expId: string) => boolean;
}) {
  const isAll = valueId === ALL;
  const idx = experiments.findIndex((e) => e.id === valueId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="focus:outline-none"
        title="Which experiment(s) this data point applies to"
      >
        <span
          className={
            "inline-flex items-center gap-1 rounded border border-rule px-1.5 py-0.5 text-[10px] font-mono hover:bg-accent " +
            (isAll ? "text-muted-foreground" : "")
          }
        >
          {isAll ? <Layers className="h-3 w-3 text-muted-foreground" /> : <Dot i={idx} />}
          {isAll ? "All" : `E${idx + 1}`}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => onChange(ALL)} className="gap-2 text-muted-foreground">
          <Layers className="h-3.5 w-3.5" />
          All experiments
        </DropdownMenuItem>
        {experiments.length > 0 && <div className="my-1 h-px bg-rule/60" />}
        {experiments.map((e, i) => {
          const filled = hasValue?.(e.id);
          return (
            <DropdownMenuItem key={e.id} onSelect={() => onChange(e.id)} className="gap-2">
              <Dot i={i} />
              <span className="truncate max-w-[16rem]">{expName(e, i)}</span>
              {hasValue &&
                (filled ? (
                  <Check className="h-3.5 w-3.5 ml-auto text-state-filled" />
                ) : (
                  <X className="h-3.5 w-3.5 ml-auto text-destructive" />
                ))}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---- Per-experiment multi-select of the "variables" studied ----
// Lets the user tag each experiment with which data points it varied/studied,
// picked from the full schema. Surfaced as a distribution on the Trends page.
function VariablesSelect({
  fields,
  selected,
  onToggle,
}: {
  fields: FieldDef[];
  selected: string[];
  onToggle: (key: string) => void;
}) {
  const set = new Set(selected);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="focus:outline-none"
        title="Variables studied in this experiment"
      >
        <span className="inline-flex items-center gap-1 rounded border border-rule px-2 py-1 text-xs hover:bg-accent">
          <ListChecks className="h-3.5 w-3.5 text-copper" />
          Variables
          {selected.length > 0 && (
            <span className="rounded-full bg-copper/15 text-copper px-1.5 text-[10px] font-mono">
              {selected.length}
            </span>
          )}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-auto">
        {fields.map((f) => {
          const on = set.has(f.key);
          return (
            <DropdownMenuItem
              key={f.key}
              // Keep the menu open while toggling multiple variables.
              onSelect={(ev) => {
                ev.preventDefault();
                onToggle(f.key);
              }}
              className="gap-2"
            >
              <span
                className={
                  "inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm border " +
                  (on ? "bg-copper border-copper text-white" : "border-rule")
                }
              >
                {on && <Check className="h-3 w-3" />}
              </span>
              <span className="truncate max-w-[16rem]">{f.label}</span>
            </DropdownMenuItem>
          );
        })}
        {fields.length === 0 && (
          <div className="px-2 py-1.5 text-xs text-muted-foreground italic">
            No data points yet.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---- Compact state selector for the comparison table ----
function StateSelect({
  value,
  onChange,
}: {
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="focus:outline-none shrink-0" title="State">
        <StateBadge state={value.state} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {STATES.map((s) => (
          <DropdownMenuItem key={s} onSelect={() => onChange({ ...value, state: s })}>
            {STATE_LABELS[s]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ---- One editable cell in the comparison table ----
function MultiCell({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: FieldValue;
  onChange: (v: FieldValue) => void;
}) {
  const [local, setLocal] = useState(value.value == null ? "" : String(value.value));
  useEffect(() => {
    setLocal(value.value == null ? "" : String(value.value));
    // value.state re-syncs the box to empty when it's cleared to N/A.
  }, [value.value, value.state]);

  if (field.type === "image") {
    const url = typeof value.value === "string" && value.value ? value.value : null;
    return (
      <div className="flex items-center gap-1.5">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer" title="Open image">
            <img
              src={url}
              alt={field.label}
              className="h-8 w-8 rounded border border-rule object-cover bg-white"
            />
          </a>
        ) : (
          <span className="text-xs text-muted-foreground italic">—</span>
        )}
        <StateSelect value={value} onChange={onChange} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <input
        list={field.options?.length ? `mopts-${field.key}` : undefined}
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={(e) => onChange(parseFieldInput(e.target.value, field, value))}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          }
        }}
        placeholder={value.state === "na" ? "N/A" : "—"}
        className="w-full min-w-0 bg-transparent border-b border-input/60 focus:border-primary focus:outline-none text-xs py-0.5 font-mono"
      />
      <StateSelect
        value={value}
        onChange={(v) => onChange(v.state === "na" ? { ...v, value: null } : v)}
      />
    </div>
  );
}

export function PaperExperiments({
  paper,
  experiments,
  allowMulti,
  activeExpId,
  onActiveExp,
}: {
  paper: Paper;
  experiments: Experiment[];
  allowMulti: boolean;
  activeExpId: string | null;
  onActiveExp: (id: string | null) => void;
}) {
  const { groups, fieldsByGroup, addField, deleteField } = useSettings();
  const updateExp = useUpdateExperiment();
  const createExp = useCreateExperiment();
  const deleteExp = useDeleteExperiment();

  const [view, setView] = useState<ViewMode>("single");
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(VIEW_KEY);
      if (v === "single" || v === "multi") setView(v);
    } catch {
      /* ignore */
    }
  }, []);
  const chooseView = (v: ViewMode) => {
    setView(v);
    try {
      window.localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* ignore */
    }
  };
  const mode: ViewMode = allowMulti ? view : "single";

  // Editable drafts per experiment, re-synced from the store whenever a save
  // round-trips (updated_at changes) — never mid-typing.
  const sig = experiments.map((e) => `${e.id}:${e.updated_at}`).join("|");
  const [drafts, setDrafts] = useState<Record<string, Record<string, FieldValue>>>({});
  useEffect(() => {
    setDrafts(Object.fromEntries(experiments.map((e) => [e.id, withDefaults(e.values)])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);

  const draftsRef = useRef(drafts);
  useEffect(() => {
    draftsRef.current = drafts;
  }, [drafts]);

  // Debounced per-experiment save, flushed on unmount so nothing is lost.
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const flush = (expId: string) => {
    const vals = draftsRef.current[expId];
    if (vals) updateExp.mutate({ id: expId, patch: { values: vals } });
  };
  const schedule = (expId: string) => {
    if (timers.current[expId]) clearTimeout(timers.current[expId]);
    timers.current[expId] = setTimeout(() => {
      delete timers.current[expId];
      flush(expId);
    }, 350);
  };
  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const id of Object.keys(t)) {
        clearTimeout(t[id]);
        flush(id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setField = (expId: string, key: string, next: FieldValue) => {
    setDrafts((d) => ({ ...d, [expId]: { ...(d[expId] ?? {}), [key]: next } }));
    schedule(expId);
  };
  const valueOf = (expId: string, key: string): FieldValue => drafts[expId]?.[key] ?? MISSING_VALUE;

  // The base selection: "all experiments" (default) or a specific experiment
  // (when one is picked in the tree / a chip). It's the default mode for every
  // data-point row.
  const base = experiments.some((e) => e.id === activeExpId) ? (activeExpId as string) : ALL;
  const baseIsExp = base !== ALL;
  const baseIndex = experiments.findIndex((e) => e.id === base);

  // Per-row overrides: which experiment (or ALL) each data point row applies to.
  const [rowExp, setRowExp] = useState<Record<string, string>>({});
  const setRowMode = (key: string, val: string) => setRowExp((r) => ({ ...r, [key]: val }));
  // The tab (All, or a specific experiment) governs the whole panel, so clear
  // any per-row experiment overrides whenever the active tab changes. Reset
  // synchronously during render (not in an effect) so no row lingers on the
  // previous experiment for a frame after switching tabs.
  const [rowExpBase, setRowExpBase] = useState(base);
  if (rowExpBase !== base) {
    setRowExpBase(base);
    setRowExp({});
  }

  // The value shared across every experiment for a field, or null if they differ.
  const commonValue = (key: string): FieldValue | null => {
    if (experiments.length === 0) return null;
    const first = valueOf(experiments[0].id, key);
    for (let i = 1; i < experiments.length; i++) {
      if (!fvEqual(valueOf(experiments[i].id, key), first)) return null;
    }
    return first;
  };

  // A data point that is set to the same value across every experiment is a
  // shared/consistent one — default it to "all experiments".
  const isSharedAcrossAll = (key: string): boolean => {
    if (experiments.length < 2) return false;
    const c = commonValue(key);
    return !!c && c.state !== "missing";
  };

  // Whether a specific experiment has a (non-missing) value for a data point.
  const fieldFilled = (expId: string, key: string): boolean =>
    valueOf(expId, key).state !== "missing";
  // Whether any experiment has a value for this data point.
  const anyFilled = (key: string): boolean => experiments.some((e) => fieldFilled(e.id, key));

  const effMode = (key: string): string => {
    const o = rowExp[key];
    if (o === ALL) return ALL;
    if (o && experiments.some((e) => e.id === o)) return o;
    // Consistent-across-all data points always read as "all experiments".
    if (isSharedAcrossAll(key)) return ALL;
    // The "All" tab shows every data point's all value — including a mixed one,
    // which renders as "Varies by experiment". That label ONLY appears here.
    if (base === ALL) return ALL;
    // On a specific experiment's tab we never surface "Varies by experiment":
    //  - if some experiment has a value here, show this experiment's own cell
    //    (its value, or a blank Missing cell to fill in for this experiment);
    //  - if no experiment has a value, fall back to the shared "all" cell.
    return anyFilled(key) ? base : ALL;
  };

  // Resolve how a data-point row reads and writes: an "all experiments" row
  // shows the shared value and edits every experiment at once; a specific row
  // reads/writes just that experiment.
  const resolveRow = (key: string) => {
    const mode = effMode(key);
    if (mode === ALL) {
      const common = commonValue(key);
      // When experiments hold differing values for this data point, "All" has no
      // single value to show — and editing it would clobber those distinct
      // per-experiment values. Render it empty and read-only until the
      // experiment-specific values collapse back down to one.
      const mixed = experiments.length >= 2 && common === null;
      return {
        mode: ALL,
        value: mixed ? MISSING_VALUE : (common ?? valueOf(experiments[0]?.id ?? "", key)),
        commit: mixed
          ? () => {}
          : (v: FieldValue) => experiments.forEach((e) => setField(e.id, key, v)),
        imageExpId: baseIsExp ? base : (experiments[0]?.id ?? ""),
        readOnly: mixed,
      };
    }
    return {
      mode,
      value: valueOf(mode, key),
      commit: (v: FieldValue) => setField(mode, key, v),
      imageExpId: mode,
      readOnly: false,
    };
  };

  const orderedGroups = useMemo(
    () => groups.filter((g) => (fieldsByGroup[g.id] ?? []).length > 0),
    [groups, fieldsByGroup],
  );

  const addExperiment = async () => {
    // Seed the new experiment with only the data points that are currently
    // shared ("all experiments") across every existing experiment, so those
    // auto-fill instead of starting blank. Data points that vary between
    // experiments get no entry at all — an experiment-specific value shouldn't
    // exist, even as a blank, until the user creates one via the row dropdown.
    const allFields = orderedGroups.flatMap((g) => fieldsByGroup[g.id] ?? []);
    const seed: Record<string, FieldValue> = {};
    for (const f of allFields) {
      const c = commonValue(f.key);
      if (c && c.state !== "missing") seed[f.key] = { ...c };
    }
    const created = await createExp.mutateAsync({
      paper_id: paper.id,
      label: `Experiment ${experiments.length + 1}`,
      position: experiments.length,
      values: Object.keys(seed).length ? seed : undefined,
    });
    if (created?.id) onActiveExp(created.id);
  };
  const duplicate = (e: Experiment, i: number) => {
    createExp.mutate({
      paper_id: paper.id,
      label: `${expName(e, i)} (copy)`,
      position: experiments.length,
      values: withDefaults(e.values),
    });
  };
  const remove = (e: Experiment) => {
    if (!confirm("Delete this experiment row?")) return;
    deleteExp.mutate(e.id);
    if (e.id === base) onActiveExp(null);
  };
  const renameBase = (label: string) => {
    if (baseIsExp) updateExp.mutate({ id: base, patch: { label } });
  };

  // Drag-to-reorder for the experiment chips. `order` is a local view that
  // resyncs from the store after each change, so it never diverges.
  const posSig = experiments.map((e) => `${e.id}:${e.position}`).join("|");
  const [order, setOrder] = useState<string[]>(() => experiments.map((e) => e.id));
  useEffect(() => {
    setOrder(experiments.map((e) => e.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posSig]);
  const dragId = useRef<string | null>(null);
  // `overId` marks the gap the dragged tab would drop into: a chip id means
  // "insert before that chip", the END sentinel means "drop at the end".
  const END = "__end__";
  const [overId, setOverId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const endDrag = () => {
    dragId.current = null;
    setOverId(null);
    setDraggingId(null);
  };
  const persistOrder = (next: string[]) => {
    setOrder(next);
    // Persist the new positions (only those that actually changed).
    next.forEach((id, i) => {
      const e = experiments.find((x) => x.id === id);
      if (e && e.position !== i) updateExp.mutate({ id, patch: { position: i } });
    });
  };
  // Drop the dragged tab into the gap before `targetId` (or at the end when
  // targetId is the END sentinel).
  const reorder = (targetId: string) => {
    const src = dragId.current;
    endDrag();
    if (!src) return;
    const next = order.filter((id) => id !== src);
    if (targetId === END) next.push(src);
    else {
      const at = next.indexOf(targetId);
      if (at < 0) return;
      next.splice(at, 0, src);
    }
    if (next.join("|") === order.join("|")) return;
    persistOrder(next);
  };
  // Move an experiment to the far-left column (used by Compare-view tab clicks).
  const moveToFront = (id: string) => {
    if (order[0] === id) return;
    persistOrder([id, ...order.filter((x) => x !== id)]);
  };

  // Per-experiment manual "reviewed" checkmark and the "variables studied" tags.
  const setChecked = (id: string, checked: boolean) => updateExp.mutate({ id, patch: { checked } });
  // "Check all done" — mark every experiment reviewed, or clear them all if
  // they already are.
  const allChecked = experiments.length > 0 && experiments.every((e) => e.checked);
  const toggleCheckAll = () => {
    const next = !allChecked;
    experiments.forEach((e) => {
      if (e.checked !== next) setChecked(e.id, next);
    });
  };
  const toggleVariable = (id: string, key: string) => {
    const e = experiments.find((x) => x.id === id);
    if (!e) return;
    const cur = e.variables ?? [];
    const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    updateExp.mutate({ id, patch: { variables: next } });
  };

  if (experiments.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-rule p-6 text-sm text-muted-foreground italic flex items-center justify-between gap-3">
        <span>No experiments yet.</span>
        <button
          onClick={addExperiment}
          className="inline-flex items-center gap-1 rounded border border-rule px-2.5 py-1 text-xs not-italic text-foreground hover:bg-accent"
        >
          <Plus className="h-3 w-3" /> Add experiment
        </button>
      </div>
    );
  }

  return (
    <div id={baseIsExp ? `exp-${base}` : undefined} className="scroll-mt-20">
      {/* Toolbar: experiment switcher + view toggle */}
      <div className="rounded-t-lg border border-rule bg-card/70 px-3 py-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mr-1">
          {experiments.length} exp{experiments.length === 1 ? "" : "s"}
        </span>
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {/* Neutral "All experiments" chip — the default focus. */}
          <button
            onClick={() => onActiveExp(null)}
            className={
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors " +
              (mode === "single" && !baseIsExp
                ? "border-transparent bg-muted-foreground/15 text-foreground"
                : "border-rule text-muted-foreground hover:bg-accent")
            }
            title="Show every experiment's shared values"
          >
            <Layers className="h-3 w-3" /> All
          </button>
          {order.map((id, i) => {
            const e = experiments.find((x) => x.id === id);
            if (!e) return null;
            const on = mode === "single" && e.id === base;
            // A drop indicator sits in the gap *before* this chip while dragging.
            const showBar = !!draggingId && overId === id && draggingId !== id;
            return (
              <Fragment key={id}>
                <span
                  aria-hidden
                  className={
                    "self-stretch w-1 my-0.5 rounded-full transition-colors " +
                    (showBar ? "bg-copper" : "bg-transparent")
                  }
                />
                <button
                  draggable
                  onDragStart={(ev) => {
                    dragId.current = id;
                    setDraggingId(id);
                    ev.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(ev) => {
                    ev.preventDefault();
                    if (overId !== id) setOverId(id);
                  }}
                  onDrop={(ev) => {
                    ev.preventDefault();
                    reorder(id);
                  }}
                  onDragEnd={endDrag}
                  onClick={() => {
                    onActiveExp(e.id);
                    // In Compare view, clicking a tab pulls that experiment to the
                    // far-left column.
                    if (mode === "multi") moveToFront(e.id);
                  }}
                  className={
                    "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-[background-color,color,opacity] max-w-[14rem] cursor-grab active:cursor-grabbing " +
                    (on
                      ? "border-transparent text-white"
                      : "border-rule text-muted-foreground hover:bg-accent") +
                    (draggingId === id ? " opacity-40" : "")
                  }
                  style={on ? { backgroundColor: expColor(i) } : undefined}
                  title={`${expName(e, i)} — click to ${mode === "multi" ? "move to front" : "focus"}, drag to reorder`}
                >
                  <GripVertical className="h-3 w-3 opacity-50" />
                  <Dot i={i} className={on ? "ring-1 ring-white/70" : ""} />
                  <span className="truncate">{expName(e, i)}</span>
                  {e.checked && (
                    <Check
                      className={"h-3 w-3 shrink-0 " + (on ? "text-white" : "text-state-filled")}
                    />
                  )}
                </button>
              </Fragment>
            );
          })}
          {/* Trailing gap — drop here to move a tab to the end. */}
          <span
            onDragOver={(ev) => {
              if (!draggingId) return;
              ev.preventDefault();
              if (overId !== END) setOverId(END);
            }}
            onDrop={(ev) => {
              ev.preventDefault();
              reorder(END);
            }}
            className={
              "self-stretch w-1 my-0.5 rounded-full transition-colors " +
              (draggingId && overId === END ? "bg-copper" : "bg-transparent")
            }
          />
          <button
            onClick={addExperiment}
            disabled={createExp.isPending}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-rule px-2.5 py-1 text-xs text-copper hover:bg-accent disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
        <button
          onClick={toggleCheckAll}
          className={
            "inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs transition-colors shrink-0 " +
            (allChecked
              ? "border-state-filled/50 text-state-filled hover:bg-state-filled/10"
              : "border-rule text-muted-foreground hover:bg-accent")
          }
          title={
            allChecked
              ? "All experiments reviewed — click to clear"
              : "Mark every experiment reviewed"
          }
        >
          <CheckCheck className="h-3.5 w-3.5" />
          {allChecked ? "All done" : "Check all done"}
        </button>
        {allowMulti && (
          <div className="inline-flex rounded-md border border-rule overflow-hidden shrink-0">
            {(
              [
                ["single", "Single", Rows3],
                ["multi", "Compare", Columns3],
              ] as [ViewMode, string, typeof Rows3][]
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => chooseView(key)}
                className={
                  "inline-flex items-center gap-1 px-2.5 py-1 text-xs transition-colors " +
                  (mode === key
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-accent text-muted-foreground")
                }
              >
                <Icon className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {mode === "single" ? (
        <SingleView
          key={base}
          paper={paper}
          experiments={experiments}
          base={base}
          baseIndex={baseIndex}
          orderedGroups={orderedGroups}
          fieldsByGroup={fieldsByGroup}
          resolveRow={resolveRow}
          setRowMode={setRowMode}
          fieldFilled={fieldFilled}
          rename={renameBase}
          duplicate={() => {
            const e = experiments[baseIndex];
            if (e) duplicate(e, baseIndex);
          }}
          onDeleteExp={() => {
            const e = experiments[baseIndex];
            if (e) remove(e);
          }}
          checked={experiments[baseIndex]?.checked ?? false}
          onToggleChecked={() => {
            const e = experiments[baseIndex];
            if (e) setChecked(e.id, !e.checked);
          }}
          variables={experiments[baseIndex]?.variables ?? []}
          onToggleVariable={(key) => {
            const e = experiments[baseIndex];
            if (e) toggleVariable(e.id, key);
          }}
          addField={addField}
          deleteField={deleteField}
        />
      ) : (
        <MultiView
          experiments={experiments}
          orderedGroups={orderedGroups}
          fieldsByGroup={fieldsByGroup}
          valueOf={valueOf}
          setField={setField}
          onActiveExp={onActiveExp}
          onDuplicate={duplicate}
          onRemove={remove}
          onRename={(id, label) => updateExp.mutate({ id, patch: { label } })}
          onToggleChecked={setChecked}
        />
      )}
    </div>
  );
}

// ---------- Single-experiment view ----------
function SingleView({
  paper,
  experiments,
  base,
  baseIndex,
  orderedGroups,
  fieldsByGroup,
  resolveRow,
  setRowMode,
  fieldFilled,
  rename,
  duplicate,
  onDeleteExp,
  checked,
  onToggleChecked,
  variables,
  onToggleVariable,
  addField,
  deleteField,
}: {
  paper: Paper;
  experiments: Experiment[];
  base: string;
  baseIndex: number;
  orderedGroups: { id: string; label: string }[];
  fieldsByGroup: Record<string, FieldDef[]>;
  resolveRow: (key: string) => {
    mode: string;
    value: FieldValue;
    commit: (v: FieldValue) => void;
    imageExpId: string;
    readOnly: boolean;
  };
  setRowMode: (key: string, id: string) => void;
  fieldFilled: (expId: string, key: string) => boolean;
  rename: (label: string) => void;
  duplicate: () => void;
  onDeleteExp: () => void;
  checked: boolean;
  onToggleChecked: () => void;
  variables: string[];
  onToggleVariable: (key: string) => void;
  addField: (groupId: string) => void;
  deleteField: (key: string) => void;
}) {
  const allFields = orderedGroups.flatMap((g) => fieldsByGroup[g.id] ?? []);
  const baseIsExp = base !== ALL;
  const active = experiments[baseIndex];
  const [label, setLabel] = useState(active?.label ?? "");
  useEffect(() => {
    setLabel(active?.label ?? "");
  }, [base, active?.label]);

  return (
    <div className="@container rounded-b-lg border border-t-0 border-rule bg-card">
      {baseIsExp ? (
        <header
          className="flex items-center gap-2 px-5 py-3 border-b border-rule"
          style={{ boxShadow: `inset 3px 0 0 ${expColor(baseIndex)}` }}
        >
          <Dot i={baseIndex} />
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => label !== active?.label && rename(label)}
            placeholder={`Experiment ${baseIndex + 1}`}
            className="flex-1 bg-transparent text-lg font-serif italic focus:outline-none min-w-0"
          />
          <VariablesSelect fields={allFields} selected={variables} onToggle={onToggleVariable} />
          <button
            onClick={onToggleChecked}
            className={
              "transition-colors p-1 " +
              (checked
                ? "text-state-filled hover:text-state-filled/80"
                : "text-muted-foreground hover:text-state-filled")
            }
            title={checked ? "Marked reviewed — click to clear" : "Mark experiment reviewed"}
            aria-label="Toggle reviewed"
          >
            {checked ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
          </button>
          <button
            onClick={duplicate}
            className="text-muted-foreground hover:text-copper transition-colors p-1"
            title="Duplicate this experiment"
            aria-label="Duplicate experiment"
          >
            <Copy className="h-4 w-4" />
          </button>
          <button
            onClick={onDeleteExp}
            className="text-muted-foreground hover:text-destructive transition-colors p-1"
            aria-label="Delete experiment"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </header>
      ) : (
        <header className="flex items-center gap-2 px-5 py-3 border-b border-rule text-muted-foreground">
          <Layers className="h-4 w-4" />
          <span className="text-lg font-serif italic text-foreground">All experiments</span>
          <span className="text-[11px]">
            · edits apply to every experiment; switch a row to a colour to edit just that one
          </span>
        </header>
      )}

      <div className="grid grid-cols-1 @4xl:grid-cols-2 gap-x-6 gap-y-0 px-5 py-3">
        {orderedGroups.map((group) => (
          <section key={group.id} className="min-w-0">
            <h4 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono mt-2 mb-1">
              {group.label}
            </h4>
            <div>
              {(fieldsByGroup[group.id] ?? []).map((f) => {
                const row = resolveRow(f.key);
                const selector = (
                  <ExperimentSelect
                    experiments={experiments}
                    valueId={row.mode}
                    onChange={(id) => setRowMode(f.key, id)}
                    hasValue={(expId) => fieldFilled(expId, f.key)}
                  />
                );
                const onDelete = () => {
                  if (
                    confirm(
                      `Delete the "${f.label}" data point? It will be removed from every experiment.`,
                    )
                  )
                    deleteField(f.key);
                };
                // Key by the resolved experiment so the editor always shows a
                // fresh box for whichever experiment the row now points at —
                // otherwise a cell can keep stale text after switching tabs
                // (e.g. one that was edited and then cleared).
                return f.type === "image" ? (
                  <ImageFieldRow
                    key={`${f.key}:${row.mode}`}
                    field={f}
                    value={row.value}
                    paperId={paper.id}
                    experimentId={row.imageExpId}
                    onChange={row.commit}
                    onDelete={onDelete}
                    expControl={selector}
                    readOnly={row.readOnly}
                  />
                ) : (
                  <FieldRow
                    key={`${f.key}:${row.mode}`}
                    field={f}
                    value={row.value}
                    onChange={row.commit}
                    onDelete={onDelete}
                    expControl={selector}
                    readOnly={row.readOnly}
                  />
                );
              })}
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
        <span>Autosaved · each row's selector sets which experiment(s) it applies to</span>
        <span>{paper.citation_key || "Untitled paper"}</span>
      </footer>
    </div>
  );
}

// ---------- Multi-experiment comparison view ----------
function MultiView({
  experiments,
  orderedGroups,
  fieldsByGroup,
  valueOf,
  setField,
  onActiveExp,
  onDuplicate,
  onRemove,
  onRename,
  onToggleChecked,
}: {
  experiments: Experiment[];
  orderedGroups: { id: string; label: string }[];
  fieldsByGroup: Record<string, FieldDef[]>;
  valueOf: (expId: string, key: string) => FieldValue;
  setField: (expId: string, key: string, v: FieldValue) => void;
  onActiveExp: (id: string) => void;
  onDuplicate: (e: Experiment, i: number) => void;
  onRemove: (e: Experiment) => void;
  onRename: (id: string, label: string) => void;
  onToggleChecked: (id: string, checked: boolean) => void;
}) {
  const allFields = orderedGroups.flatMap((g) => fieldsByGroup[g.id] ?? []);
  return (
    <div className="rounded-b-lg border border-t-0 border-rule bg-card overflow-x-auto">
      {/* Datalists for option fields (shared by all cells). */}
      {allFields
        .filter((f) => f.options?.length)
        .map((f) => (
          <datalist id={`mopts-${f.key}`} key={f.key}>
            {f.options!.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        ))}

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-card text-left align-bottom px-4 py-2 min-w-[10rem] border-b border-rule">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
                Data point
              </span>
            </th>
            {experiments.map((e, i) => (
              <th
                key={e.id}
                className="text-left align-bottom px-3 py-2 min-w-[12rem] border-b border-rule"
                style={{ boxShadow: `inset 0 3px 0 ${expColor(i)}` }}
              >
                <div className="flex items-center gap-1.5">
                  <ExpHeaderName
                    label={e.label ?? ""}
                    index={i}
                    onCommit={(v) => onRename(e.id, v)}
                    onFocus={() => onActiveExp(e.id)}
                  />
                  <button
                    onClick={() => onToggleChecked(e.id, !e.checked)}
                    className={
                      "p-0.5 transition-colors " +
                      (e.checked
                        ? "text-state-filled hover:text-state-filled/80"
                        : "text-muted-foreground hover:text-state-filled")
                    }
                    title={
                      e.checked ? "Marked reviewed — click to clear" : "Mark experiment reviewed"
                    }
                  >
                    {e.checked ? (
                      <CheckCircle2 className="h-3 w-3" />
                    ) : (
                      <Circle className="h-3 w-3" />
                    )}
                  </button>
                  <button
                    onClick={() => onDuplicate(e, i)}
                    className="text-muted-foreground hover:text-copper p-0.5"
                    title="Duplicate experiment"
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                  <button
                    onClick={() => onRemove(e)}
                    className="text-muted-foreground hover:text-destructive p-0.5"
                    title="Delete experiment"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {orderedGroups.map((group) => (
            <ExpGroupRows
              key={group.id}
              group={group}
              fields={fieldsByGroup[group.id] ?? []}
              experiments={experiments}
              valueOf={valueOf}
              setField={setField}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ExpHeaderName({
  label,
  index,
  onCommit,
  onFocus,
}: {
  label: string;
  index: number;
  onCommit: (v: string) => void;
  onFocus: () => void;
}) {
  const [v, setV] = useState(label);
  useEffect(() => setV(label), [label]);
  return (
    <span className="inline-flex items-center gap-1.5 flex-1 min-w-0">
      <Dot i={index} />
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onFocus={onFocus}
        onBlur={() => v !== label && onCommit(v)}
        placeholder={`Experiment ${index + 1}`}
        className="min-w-0 flex-1 bg-transparent font-serif italic text-sm focus:outline-none border-b border-transparent focus:border-primary"
      />
    </span>
  );
}

function ExpGroupRows({
  group,
  fields,
  experiments,
  valueOf,
  setField,
}: {
  group: { id: string; label: string };
  fields: FieldDef[];
  experiments: Experiment[];
  valueOf: (expId: string, key: string) => FieldValue;
  setField: (expId: string, key: string, v: FieldValue) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <>
      <tr>
        <td
          colSpan={experiments.length + 1}
          className="sticky left-0 bg-muted/40 px-4 py-1 text-[10px] uppercase tracking-[0.2em] text-copper font-mono border-b border-rule/60"
        >
          {group.label}
        </td>
      </tr>
      {fields.map((f) => (
        <tr key={f.key} className="hover:bg-accent/30">
          <td className="sticky left-0 z-10 bg-card px-4 py-1.5 align-top border-b border-rule/60">
            <FieldTooltip field={f}>
              <span className="text-sm text-ink-muted cursor-help select-none break-words">
                {f.label}
                {f.unit && (
                  <span className="ml-1 text-xs text-muted-foreground font-mono">({f.unit})</span>
                )}
              </span>
            </FieldTooltip>
          </td>
          {experiments.map((e) => (
            <td key={e.id} className="px-3 py-1.5 align-top border-b border-rule/60">
              <MultiCell
                field={f}
                value={valueOf(e.id, f.key)}
                onChange={(next) => setField(e.id, f.key, next)}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
