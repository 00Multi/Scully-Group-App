import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePapers, useExperiments } from "@/lib/db";
import type { Paper } from "@/lib/db";
import type { FieldDef, FieldType } from "@/lib/fields";
import { useSettings } from "@/lib/settings";
import { AutoTextarea } from "@/components/AutoTextarea";
import { DangerZone } from "@/components/DangerZone";
import { TrendChart } from "@/components/TrendChart";
import {
  categoricalDistribution,
  numericHistogram,
  papersPerYear as computePapersPerYear,
} from "@/lib/trends";
import { ArrowRight, GripVertical, Plus, RotateCcw, Trash2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Corrosion" },
      {
        name: "description",
        content:
          "Coverage and gaps across the molten-salt corrosion literature database: which fields are filled, which are missing, and what to work on next.",
      },
      { property: "og:title", content: "Dashboard — Corrosion Literature Review" },
      {
        property: "og:description",
        content: "Coverage, missing-data list, and simple trends.",
      },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const { data: papers = [] } = usePapers();
  const { data: experiments = [] } = useExperiments();
  const { fieldDefs } = useSettings();

  const stats = useMemo(() => {
    const totalCells = experiments.length * fieldDefs.length;
    let filled = 0;
    let missing = 0;
    let na = 0;
    let needsCheck = 0;
    const perField = new Map<string, { filled: number; total: number }>();
    for (const f of fieldDefs) perField.set(f.key, { filled: 0, total: experiments.length });
    for (const e of experiments) {
      for (const f of fieldDefs) {
        const st = e.values?.[f.key]?.state ?? "missing";
        if (st === "filled") {
          filled++;
          perField.get(f.key)!.filled++;
        } else if (st === "missing") missing++;
        else if (st === "na") na++;
        else if (st === "needs_check") needsCheck++;
      }
    }
    return { totalCells, filled, missing, na, needsCheck, perField };
  }, [experiments, fieldDefs]);

  // Experiments per alloy type (the field that replaced material categories).
  const alloyCounts = useMemo(
    () => categoricalDistribution(experiments, "alloy_type"),
    [experiments],
  );

  const worstFields = useMemo(() => {
    return fieldDefs
      .map((f) => {
        const s = stats.perField.get(f.key)!;
        return { field: f, pct: s.total ? s.filled / s.total : 0, ...s };
      })
      .sort((a, b) => a.pct - b.pct)
      .slice(0, 6);
  }, [stats, fieldDefs]);

  // The queue can show experiments with Missing fields or Needs-check fields.
  // Missing is listed per experiment; Needs-check is rolled up by paper (a
  // paper appears if any of its experiments has a needs-check field).
  const [queueState, setQueueState] = useState<"missing" | "needs_check">("missing");
  const gapList = useMemo(() => {
    const paperById = new Map(papers.map((p) => [p.id, p]));

    if (queueState === "needs_check") {
      const byPaper = new Map<string, { paper: Paper; fields: Map<string, FieldDef> }>();
      for (const e of experiments) {
        const paper = paperById.get(e.paper_id);
        if (!paper) continue;
        const nc = fieldDefs.filter((f) => e.values?.[f.key]?.state === "needs_check");
        if (nc.length === 0) continue;
        let entry = byPaper.get(paper.id);
        if (!entry) {
          entry = { paper, fields: new Map() };
          byPaper.set(paper.id, entry);
        }
        for (const f of nc) entry.fields.set(f.key, f);
      }
      return Array.from(byPaper.values())
        .map((x) => ({
          key: x.paper.id,
          paper: x.paper,
          expLabel: undefined as string | undefined,
          expId: undefined as string | undefined,
          fields: Array.from(x.fields.values()),
        }))
        .sort((a, b) => b.fields.length - a.fields.length)
        .slice(0, 10);
    }

    return experiments
      .map((e) => {
        const paper = paperById.get(e.paper_id);
        const fields = fieldDefs.filter(
          (f) => (e.values?.[f.key]?.state ?? "missing") === "missing",
        );
        return {
          key: e.id,
          paper,
          expLabel: e.label as string | undefined,
          expId: e.id as string | undefined,
          fields,
        };
      })
      .filter(
        (
          x,
        ): x is {
          key: string;
          paper: Paper;
          expLabel: string | undefined;
          expId: string | undefined;
          fields: FieldDef[];
        } => !!x.paper && x.fields.length > 0,
      )
      .sort((a, b) => b.fields.length - a.fields.length)
      .slice(0, 10);
  }, [experiments, papers, fieldDefs, queueState]);

  const overallPct = stats.totalCells ? Math.round((stats.filled / stats.totalCells) * 100) : 0;

  // A curated handful of trends for the home page; the full set (any data point
  // plus metadata) lives on /trends behind "See more".
  const papersPerYear = useMemo(() => computePapersPerYear(papers), [papers]);
  const saltDist = useMemo(() => categoricalDistribution(experiments, "salt"), [experiments]);
  const crucibleDist = useMemo(
    () => categoricalDistribution(experiments, "crucible"),
    [experiments],
  );
  const tempHist = useMemo(() => numericHistogram(experiments, "temp_c"), [experiments]);

  const hasTrendData =
    papersPerYear.length + saltDist.length + crucibleDist.length + tempHist.length > 0;

  // recharts needs a real width; render charts only after mount to avoid
  // SSR/hydration width mismatches.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="max-w-[1600px] mx-auto px-6 py-8">
      <header className="mb-8">
        <h1 className="text-5xl font-serif italic tracking-tight">Corrosion review</h1>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
        <StatCard label="Papers" value={papers.length} />
        <StatCard label="Experiments" value={experiments.length} />
        <StatCard label="Field cells" value={stats.totalCells} />
        <StatCard label="Filled" value={`${overallPct}%`} accent />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
        <Panel title="Alloy types" className="lg:col-span-1">
          <ul className="text-sm">
            {alloyCounts.map((a) => (
              <li
                key={a.label}
                className="flex items-baseline justify-between py-1.5 border-b border-rule/60 last:border-0"
              >
                <span className="font-serif italic">{a.label}</span>
                <span className="font-mono text-xs text-muted-foreground">{a.count} exps</span>
              </li>
            ))}
            {alloyCounts.length === 0 && (
              <li className="text-muted-foreground italic">No alloy types set yet.</li>
            )}
          </ul>
        </Panel>

        <Panel title="Field state totals" className="lg:col-span-1">
          <div className="space-y-3">
            <Bar
              label="Filled"
              value={stats.filled}
              total={stats.totalCells}
              barClass="bg-state-filled"
            />
            <Bar
              label="Missing"
              value={stats.missing}
              total={stats.totalCells}
              barClass="bg-state-missing"
            />
            <Bar label="N/A" value={stats.na} total={stats.totalCells} barClass="bg-state-na" />
            <Bar
              label="Needs check"
              value={stats.needsCheck}
              total={stats.totalCells}
              barClass="bg-state-check"
            />
          </div>
        </Panel>

        <Panel title="Worst-covered fields" className="lg:col-span-1">
          <ul className="text-sm space-y-2">
            {worstFields.map((w) => (
              <li key={w.field.key}>
                <div className="flex justify-between">
                  <span>{w.field.label}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {w.filled}/{w.total}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-muted overflow-hidden mt-1">
                  <div
                    className="h-full bg-copper"
                    style={{ width: `${Math.round(w.pct * 100)}%` }}
                  />
                </div>
              </li>
            ))}
            {worstFields.length === 0 && (
              <li className="text-muted-foreground italic">No data yet.</li>
            )}
          </ul>
        </Panel>
      </section>

      {hasTrendData && (
        <section className="mb-10">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-2xl font-serif italic">Trends</h2>
            <Link
              to="/trends"
              className="text-xs text-copper hover:underline inline-flex items-center gap-1"
            >
              See more <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TrendChart title="Papers per year" data={papersPerYear} mounted={mounted} />
            <TrendChart title="Test temperature (°C)" data={tempHist} mounted={mounted} />
            <TrendChart title="Salts" data={saltDist} mounted={mounted} />
            <TrendChart title="Crucibles" data={crucibleDist} mounted={mounted} />
          </div>
        </section>
      )}

      <section className="mb-10">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-serif italic">
              {queueState === "missing" ? "Missing-data queue" : "Needs-check queue"}
            </h2>
            <div className="inline-flex rounded-md border border-rule overflow-hidden text-xs">
              {(
                [
                  ["missing", "Missing"],
                  ["needs_check", "Needs check"],
                ] as ["missing" | "needs_check", string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setQueueState(key)}
                  className={
                    "px-2.5 py-1 transition-colors " +
                    (queueState === key
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent text-muted-foreground")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Link to="/browse" className="text-xs text-copper hover:underline">
            Open browser →
          </Link>
        </div>
        <div className="rounded-lg border border-rule bg-card overflow-hidden">
          {gapList.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground italic">
              {queueState === "missing"
                ? "Nothing missing. Add a paper in Browse to start."
                : "No fields are marked Needs check."}
            </div>
          ) : (
            <ul className="divide-y divide-rule/60">
              {gapList.map(({ key, paper, expLabel, expId, fields }) => (
                <li key={key} className="p-4 flex items-baseline justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-serif italic">
                      {paper.citation_key || "Untitled"}
                      {expLabel && (
                        <span className="text-muted-foreground text-sm not-italic font-sans">
                          {" "}
                          · {expLabel}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {fields.map((m) => (
                        <span
                          key={m.key}
                          className={
                            "field-tag " +
                            (queueState === "missing"
                              ? "bg-state-missing/10 text-state-missing"
                              : "bg-state-check/10 text-state-check")
                          }
                        >
                          {m.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Link
                    to="/browse"
                    search={expId ? { paper: paper.id, exp: expId } : { paper: paper.id }}
                    className="text-xs text-copper hover:underline shrink-0 font-mono"
                  >
                    Edit →
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <SchemaManager />

      <DangerZone />
    </div>
  );
}

// Comma-separated dropdown-options editor. Keeps its own text state while the
// user is typing so a comma (needed to separate options) is never eaten by the
// parse-on-every-keystroke; it only commits the parsed list on blur, and
// re-seeds from props when not focused (e.g. after a schema reset).
function OptionsInput({
  value,
  onCommit,
}: {
  value: string[];
  onCommit: (options: string[]) => void;
}) {
  const [text, setText] = useState(value.join(", "));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(value.join(", "));
  }, [value, focused]);

  const commit = () =>
    onCommit(
      text
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );

  return (
    <input
      value={text}
      onChange={(e) => setText(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      placeholder="Dropdown options, comma-separated (leave blank for a free-text field)"
      className="bg-muted/40 rounded px-2 py-1 text-xs font-mono focus:outline-none"
      aria-label="Dropdown options"
    />
  );
}

const FIELD_TYPES: FieldType[] = ["text", "number", "select", "image"];

function SchemaManager() {
  const {
    groups,
    fieldsByGroup,
    addField,
    updateField,
    deleteField,
    moveField,
    addGroup,
    renameGroup,
    deleteGroup,
    resetSchema,
  } = useSettings();

  // Drag-to-reorder data points (changes the order they appear in the viewer).
  const dragKey = useRef<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  return (
    <section className="mb-10">
      <div className="flex items-baseline justify-between mb-3">
        <div>
          <h2 className="text-2xl font-serif italic">Columns &amp; data points</h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Rename or add columns, and add, edit, move, or delete the data points inside each one.
            Use a data point's <span className="font-medium">Column</span> dropdown to move it to
            another column. Changes apply to every experiment and are saved automatically in this
            browser.
          </p>
        </div>
        <button
          onClick={() => {
            if (
              confirm(
                "Reset all columns and data points to the defaults? Field values already entered are kept, but any columns or data points you added will be removed.",
              )
            )
              resetSchema();
          }}
          className="text-xs text-muted-foreground hover:text-destructive inline-flex items-center gap-1 shrink-0"
        >
          <RotateCcw className="h-3 w-3" /> Reset to defaults
        </button>
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <div key={group.id} className="rounded-lg border border-rule bg-card overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-rule bg-muted/30">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono shrink-0">
                Column
              </span>
              <input
                value={group.label}
                onChange={(e) => renameGroup(group.id, e.target.value)}
                className="flex-1 bg-transparent text-lg font-serif italic focus:outline-none border-b border-transparent focus:border-primary min-w-0"
                aria-label="Column name"
              />
              <button
                onClick={() => {
                  const n = (fieldsByGroup[group.id] ?? []).length;
                  if (
                    confirm(
                      `Delete the "${group.label}" column${n ? ` and its ${n} data point${n === 1 ? "" : "s"}` : ""}? This applies to every experiment.`,
                    )
                  )
                    deleteGroup(group.id);
                }}
                className="text-muted-foreground hover:text-destructive transition-colors p-1 shrink-0"
                aria-label="Delete column"
                title="Delete column"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="hidden md:grid grid-cols-[1rem_1fr_5rem_6rem_7rem_2fr_auto] gap-3 px-4 py-2 border-b border-rule/60 text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
              <div></div>
              <div>Data point</div>
              <div>Type</div>
              <div>Unit</div>
              <div>Column</div>
              <div>Definition (tooltip)</div>
              <div></div>
            </div>

            {(fieldsByGroup[group.id] ?? []).map((f) => (
              <div
                key={f.key}
                onDragOver={(e) => {
                  if (!dragKey.current) return;
                  e.preventDefault();
                  if (overKey !== f.key) setOverKey(f.key);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragKey.current) moveField(dragKey.current, f.key);
                  dragKey.current = null;
                  setOverKey(null);
                }}
                className={
                  "grid grid-cols-1 md:grid-cols-[1rem_1fr_5rem_6rem_7rem_2fr_auto] gap-2 md:gap-3 px-4 py-2 border-b border-rule/60 last:border-0 items-start " +
                  (overKey === f.key ? "ring-2 ring-copper rounded" : "")
                }
              >
                <button
                  draggable
                  onDragStart={(e) => {
                    dragKey.current = f.key;
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => {
                    dragKey.current = null;
                    setOverKey(null);
                  }}
                  title="Drag to reorder this data point"
                  aria-label="Reorder data point"
                  className="hidden md:flex items-center justify-center pt-1.5 text-muted-foreground/60 hover:text-foreground cursor-grab active:cursor-grabbing"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
                <input
                  value={f.label}
                  onChange={(e) => updateField(f.key, { label: e.target.value })}
                  placeholder="Label"
                  className="bg-transparent border-b border-input focus:border-primary focus:outline-none text-sm py-1"
                  aria-label="Data point label"
                />
                <select
                  value={f.type}
                  onChange={(e) => updateField(f.key, { type: e.target.value as FieldType })}
                  className="bg-transparent border-b border-input focus:border-primary focus:outline-none text-xs py-1 font-mono"
                  aria-label="Type"
                >
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  value={f.unit ?? ""}
                  onChange={(e) => updateField(f.key, { unit: e.target.value })}
                  placeholder="—"
                  className="bg-transparent border-b border-input focus:border-primary focus:outline-none text-sm py-1 font-mono"
                  aria-label="Unit"
                />
                <select
                  value={f.group}
                  onChange={(e) => {
                    if (e.target.value !== f.group) updateField(f.key, { group: e.target.value });
                  }}
                  className="bg-transparent border-b border-input focus:border-primary focus:outline-none text-xs py-1"
                  aria-label="Move data point to column"
                  title="Move this data point to another column (applies to every experiment)"
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                    </option>
                  ))}
                </select>
                <div className="flex flex-col gap-1">
                  <AutoTextarea
                    value={f.definition}
                    onChange={(e) => updateField(f.key, { definition: e.target.value })}
                    rows={1}
                    placeholder="What this data point means (shown as a tooltip)"
                    className="bg-transparent border border-input rounded px-2 py-1 text-xs focus:border-primary focus:outline-none min-h-[2rem]"
                    aria-label="Definition"
                  />
                  <OptionsInput
                    value={f.options ?? []}
                    onCommit={(options) => updateField(f.key, { options })}
                  />
                </div>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        `Delete the "${f.label}" data point? It will be removed from every experiment.`,
                      )
                    )
                      deleteField(f.key);
                  }}
                  className="text-muted-foreground hover:text-destructive md:pt-1.5 justify-self-start"
                  aria-label="Delete data point"
                  title="Delete data point"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            <div className="px-4 py-2 border-t border-rule/60">
              <button
                onClick={() => addField(group.id)}
                className="inline-flex items-center gap-1 text-xs text-copper hover:underline"
              >
                <Plus className="h-3 w-3" /> Add data point
              </button>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => addGroup()}
        className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-rule px-3 py-2 text-sm hover:bg-accent"
      >
        <Plus className="h-4 w-4" /> Add column
      </button>
    </section>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-rule bg-card px-4 py-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
        {label}
      </div>
      <div
        className={
          "mt-1 text-4xl font-serif italic " + (accent ? "text-copper" : "text-foreground")
        }
      >
        {value}
      </div>
    </div>
  );
}

function Panel({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={"rounded-lg border border-rule bg-card p-4 " + className}>
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Bar({
  label,
  value,
  total,
  barClass,
}: {
  label: string;
  value: number;
  total: number;
  barClass: string;
}) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {value} · {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1">
        <div className={`h-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
