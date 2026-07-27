import { useEffect, useMemo, useRef, useState } from "react";
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
import { ChevronDown, Columns3, Copy, Plus, Rows3, Trash2 } from "lucide-react";

const STATES: FieldState[] = ["filled", "missing", "na", "needs_check"];
const VIEW_KEY = "paper.exp.view.v1";

type ViewMode = "single" | "multi";

const expName = (e: Experiment, i: number) => e.label?.trim() || `Experiment ${i + 1}`;

// ---- A small coloured dot for an experiment ----
function Dot({ i, className = "" }: { i: number; className?: string }) {
  return (
    <span
      className={"inline-block h-2.5 w-2.5 rounded-full shrink-0 " + className}
      style={{ backgroundColor: expColor(i) }}
    />
  );
}

// ---- Per-row selector: which experiment this data point currently shows ----
function ExperimentSelect({
  experiments,
  valueId,
  onChange,
}: {
  experiments: Experiment[];
  valueId: string;
  onChange: (id: string) => void;
}) {
  const idx = experiments.findIndex((e) => e.id === valueId);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="focus:outline-none"
        title="Which experiment this value belongs to — change to view another"
      >
        <span className="inline-flex items-center gap-1 rounded border border-rule px-1.5 py-0.5 text-[10px] font-mono hover:bg-accent">
          <Dot i={idx} />E{idx + 1}
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {experiments.map((e, i) => (
          <DropdownMenuItem key={e.id} onSelect={() => onChange(e.id)} className="gap-2">
            <Dot i={i} />
            <span className="truncate max-w-[16rem]">{expName(e, i)}</span>
          </DropdownMenuItem>
        ))}
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
  }, [value.value]);

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
        placeholder={value.state === "na" ? "N/A" : "—"}
        className="w-full min-w-0 bg-transparent border-b border-input/60 focus:border-primary focus:outline-none text-xs py-0.5 font-mono"
      />
      <StateSelect value={value} onChange={onChange} />
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
  onActiveExp: (id: string) => void;
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

  // The active experiment for the single view (falls back to the first).
  const activeId = experiments.some((e) => e.id === activeExpId)
    ? (activeExpId as string)
    : (experiments[0]?.id ?? null);
  const activeIndex = experiments.findIndex((e) => e.id === activeId);

  // Per-row override: which experiment each data point row shows (defaults to
  // the active one). Overrides for deleted experiments quietly fall back.
  const [rowExp, setRowExp] = useState<Record<string, string>>({});
  // Switching the active experiment cleanly resets rows to it; the per-row
  // dropdown is for ad-hoc cross-referencing after that.
  useEffect(() => {
    setRowExp({});
  }, [activeId]);
  const effExp = (key: string) => {
    const o = rowExp[key];
    return o && experiments.some((e) => e.id === o) ? o : (activeId as string);
  };

  const orderedGroups = useMemo(
    () => groups.filter((g) => (fieldsByGroup[g.id] ?? []).length > 0),
    [groups, fieldsByGroup],
  );

  const addExperiment = async () => {
    const created = await createExp.mutateAsync({
      paper_id: paper.id,
      label: `Experiment ${experiments.length + 1}`,
      position: experiments.length,
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
    const next = experiments.find((x) => x.id !== e.id);
    deleteExp.mutate(e.id);
    if (e.id === activeId && next) onActiveExp(next.id);
  };
  const renameActive = (label: string) => {
    if (activeId) updateExp.mutate({ id: activeId, patch: { label } });
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
    <div id={activeId ? `exp-${activeId}` : undefined} className="scroll-mt-20">
      {/* Toolbar: experiment switcher + view toggle */}
      <div className="rounded-t-lg border border-rule bg-card/70 px-3 py-2 flex flex-wrap items-center gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mr-1">
          {experiments.length} exp{experiments.length === 1 ? "" : "s"}
        </span>
        <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
          {experiments.map((e, i) => {
            const on = mode === "single" && e.id === activeId;
            return (
              <button
                key={e.id}
                onClick={() => onActiveExp(e.id)}
                className={
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors max-w-[14rem] " +
                  (on
                    ? "border-transparent text-white"
                    : "border-rule text-muted-foreground hover:bg-accent")
                }
                style={on ? { backgroundColor: expColor(i) } : undefined}
                title={expName(e, i)}
              >
                <Dot i={i} className={on ? "ring-1 ring-white/70" : ""} />
                <span className="truncate">{expName(e, i)}</span>
              </button>
            );
          })}
          <button
            onClick={addExperiment}
            disabled={createExp.isPending}
            className="inline-flex items-center gap-1 rounded-full border border-dashed border-rule px-2.5 py-1 text-xs text-copper hover:bg-accent disabled:opacity-50"
          >
            <Plus className="h-3 w-3" /> Add
          </button>
        </div>
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
          key={activeId ?? "none"}
          paper={paper}
          experiments={experiments}
          activeId={activeId!}
          activeIndex={activeIndex}
          orderedGroups={orderedGroups}
          fieldsByGroup={fieldsByGroup}
          valueOf={valueOf}
          setField={setField}
          effExp={effExp}
          setRowExp={(key, id) => setRowExp((r) => ({ ...r, [key]: id }))}
          rename={renameActive}
          duplicate={() => {
            const e = experiments[activeIndex];
            if (e) duplicate(e, activeIndex);
          }}
          onDeleteExp={() => {
            const e = experiments[activeIndex];
            if (e) remove(e);
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
        />
      )}
    </div>
  );
}

// ---------- Single-experiment view ----------
function SingleView({
  paper,
  experiments,
  activeId,
  activeIndex,
  orderedGroups,
  fieldsByGroup,
  valueOf,
  setField,
  effExp,
  setRowExp,
  rename,
  duplicate,
  onDeleteExp,
  addField,
  deleteField,
}: {
  paper: Paper;
  experiments: Experiment[];
  activeId: string;
  activeIndex: number;
  orderedGroups: { id: string; label: string }[];
  fieldsByGroup: Record<string, FieldDef[]>;
  valueOf: (expId: string, key: string) => FieldValue;
  setField: (expId: string, key: string, v: FieldValue) => void;
  effExp: (key: string) => string;
  setRowExp: (key: string, id: string) => void;
  rename: (label: string) => void;
  duplicate: () => void;
  onDeleteExp: () => void;
  addField: (groupId: string) => void;
  deleteField: (key: string) => void;
}) {
  const active = experiments[activeIndex];
  const [label, setLabel] = useState(active?.label ?? "");
  useEffect(() => {
    setLabel(active?.label ?? "");
  }, [activeId, active?.label]);

  return (
    <div className="@container rounded-b-lg border border-t-0 border-rule bg-card">
      <header
        className="flex items-center gap-2 px-5 py-3 border-b border-rule"
        style={{ boxShadow: `inset 3px 0 0 ${expColor(activeIndex)}` }}
      >
        <Dot i={activeIndex} />
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => label !== active?.label && rename(label)}
          placeholder={`Experiment ${activeIndex + 1}`}
          className="flex-1 bg-transparent text-lg font-serif italic focus:outline-none min-w-0"
        />
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

      <div className="grid grid-cols-1 @3xl:grid-cols-2 @6xl:grid-cols-3 gap-x-8 gap-y-0 px-5 py-3">
        {orderedGroups.map((group) => (
          <section key={group.id} className="min-w-0">
            <h4 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono mt-2 mb-1">
              {group.label}
            </h4>
            <div>
              {(fieldsByGroup[group.id] ?? []).map((f) => {
                const exp = effExp(f.key);
                const value = valueOf(exp, f.key);
                const selector = (
                  <ExperimentSelect
                    experiments={experiments}
                    valueId={exp}
                    onChange={(id) => setRowExp(f.key, id)}
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
                return f.type === "image" ? (
                  <ImageFieldRow
                    key={f.key}
                    field={f}
                    value={value}
                    paperId={paper.id}
                    experimentId={exp}
                    onChange={(next) => setField(exp, f.key, next)}
                    onDelete={onDelete}
                    expControl={selector}
                  />
                ) : (
                  <FieldRow
                    key={f.key}
                    field={f}
                    value={value}
                    onChange={(next) => setField(exp, f.key, next)}
                    onDelete={onDelete}
                    expControl={selector}
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
        <span>Autosaved · one experiment shown — switch above or use each row's selector</span>
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
