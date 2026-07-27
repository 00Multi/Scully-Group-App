import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { usePapers, useExperiments, useBulkUpdateExperiments } from "@/lib/db";
import { useSettings } from "@/lib/settings";
import { STATE_LABELS, type FieldState, type FieldValue } from "@/lib/fields";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/bulk")({
  head: () => ({
    meta: [
      { title: "Bulk edit — Corrosion Literature Review" },
      {
        name: "description",
        content:
          "Edit one field across many experiments at once: set a value, find/replace, or set a state, with a filtered preview and confirm step.",
      },
    ],
  }),
  component: BulkPage,
});

type Op = "set_value" | "find_replace" | "set_state";
const STATES: FieldState[] = ["filled", "missing", "na", "needs_check"];

function valueToString(v: FieldValue | undefined): string {
  if (!v || v.value == null) return "";
  return String(v.value);
}

const ALLOY_TYPE_KEY = "alloy_type";

function alloyTypeOf(e: { values?: Record<string, FieldValue> }): string {
  const v = e.values?.[ALLOY_TYPE_KEY]?.value;
  return typeof v === "string" ? v.trim() : "";
}

function BulkPage() {
  const { data: papers = [] } = usePapers();
  const { data: experiments = [] } = useExperiments();
  const { fieldDefs } = useSettings();
  const bulk = useBulkUpdateExperiments();

  const [fieldKey, setFieldKey] = useState(fieldDefs[0]?.key ?? "");
  const [alloyFilter, setAlloyFilter] = useState<string>("");
  const [stateFilter, setStateFilter] = useState<"any" | FieldState>("any");
  const [valueContains, setValueContains] = useState("");
  const [op, setOp] = useState<Op>("set_value");
  const [setValueText, setSetValueText] = useState("");
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [newState, setNewState] = useState<FieldState>("na");
  const [confirming, setConfirming] = useState(false);
  const [doneMsg, setDoneMsg] = useState<string | null>(null);

  const field = fieldDefs.find((f) => f.key === fieldKey);
  const paperById = useMemo(() => new Map(papers.map((p) => [p.id, p])), [papers]);

  // Alloy-type values present (for the filter dropdown), unioned with the
  // field's configured options.
  const alloyOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of experiments) {
      const a = alloyTypeOf(e);
      if (a) set.add(a);
    }
    const f = fieldDefs.find((x) => x.key === ALLOY_TYPE_KEY);
    for (const o of f?.options ?? []) set.add(o);
    return Array.from(set).sort();
  }, [experiments, fieldDefs]);

  // Experiments matching the filters.
  const affected = useMemo(() => {
    if (!field) return [];
    return experiments.filter((e) => {
      const p = paperById.get(e.paper_id);
      if (!p) return false;
      if (alloyFilter && alloyTypeOf(e) !== alloyFilter) return false;
      const v = e.values?.[fieldKey];
      const st = v?.state ?? "missing";
      if (stateFilter !== "any" && st !== stateFilter) return false;
      if (valueContains && !valueToString(v).toLowerCase().includes(valueContains.toLowerCase()))
        return false;
      return true;
    });
  }, [experiments, paperById, field, fieldKey, alloyFilter, stateFilter, valueContains]);

  // Compute the new FieldValue for one experiment given the chosen op.
  const computeNext = (v: FieldValue | undefined): FieldValue | null => {
    const cur: FieldValue = v ?? { value: null, state: "missing" };
    if (op === "set_value") {
      const t = setValueText.trim();
      let parsed: string | number | null = t === "" ? null : t;
      if (field?.type === "number" && t !== "") {
        const n = Number(t);
        if (Number.isFinite(n)) parsed = n;
      }
      return { ...cur, value: parsed, state: t === "" ? cur.state : "filled" };
    }
    if (op === "set_state") {
      return { ...cur, state: newState };
    }
    // find_replace
    const s = valueToString(v);
    if (!findText || !s.includes(findText)) return null; // no change
    const replaced = s.split(findText).join(replaceText);
    let parsed: string | number = replaced;
    if (field?.type === "number") {
      const n = Number(replaced);
      if (Number.isFinite(n) && replaced.trim() !== "") parsed = n;
    }
    return { ...cur, value: parsed, state: cur.state === "missing" ? "filled" : cur.state };
  };

  const changes = useMemo(() => {
    return affected
      .map((e) => {
        const before = e.values?.[fieldKey];
        const after = computeNext(before);
        if (!after) return null;
        // Skip no-ops.
        if (
          after.value === (before?.value ?? null) &&
          after.state === (before?.state ?? "missing") &&
          (after.note ?? null) === (before?.note ?? null)
        )
          return null;
        return { exp: e, before, after };
      })
      .filter(Boolean) as {
      exp: (typeof affected)[number];
      before?: FieldValue;
      after: FieldValue;
    }[];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [affected, fieldKey, op, setValueText, findText, replaceText, newState, field?.type]);

  const apply = async () => {
    setDoneMsg(null);
    const updates = changes.map((c) => ({
      id: c.exp.id,
      values: { ...c.exp.values, [fieldKey]: c.after },
    }));
    const n = await bulk.mutateAsync(updates);
    setConfirming(false);
    setDoneMsg(`Updated ${fieldKey} on ${n} experiment${n === 1 ? "" : "s"}.`);
  };

  const describe = (v: FieldValue | undefined) => {
    if (!v || v.state === "missing") return "—";
    if (v.state === "na") return "N/A";
    const val = v.value == null ? "" : String(v.value);
    return v.state === "needs_check" ? `${val} (?)` : val || STATE_LABELS[v.state];
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <h1 className="text-5xl font-serif italic">Bulk edit</h1>
      <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
        Change one field across many experiments at once. Filter the rows, choose an operation,
        review the preview, then confirm. Nothing is written until you press Apply.
      </p>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Target + filters */}
        <div className="rounded-lg border border-rule bg-card p-4 space-y-3">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono">
            Target &amp; filters
          </h3>
          <label className="block text-xs text-muted-foreground">
            Field
            <select
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              className="mt-1 w-full bg-transparent border border-input rounded px-2 py-1.5 text-sm"
            >
              {fieldDefs.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label} ({f.group})
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            Alloy type
            <select
              value={alloyFilter}
              onChange={(e) => setAlloyFilter(e.target.value)}
              className="mt-1 w-full bg-transparent border border-input rounded px-2 py-1.5 text-sm"
            >
              <option value="">All alloy types</option>
              {alloyOptions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            Only rows whose field state is
            <select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value as any)}
              className="mt-1 w-full bg-transparent border border-input rounded px-2 py-1.5 text-sm"
            >
              <option value="any">Any</option>
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {STATE_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted-foreground">
            Value contains (optional)
            <input
              value={valueContains}
              onChange={(e) => setValueContains(e.target.value)}
              placeholder="substring filter"
              className="mt-1 w-full bg-transparent border border-input rounded px-2 py-1.5 text-sm font-mono"
            />
          </label>
          <p className="text-xs text-muted-foreground pt-1">
            {affected.length} experiment{affected.length === 1 ? "" : "s"} match.
          </p>
        </div>

        {/* Operation */}
        <div className="rounded-lg border border-rule bg-card p-4 space-y-3">
          <h3 className="text-[10px] uppercase tracking-[0.2em] text-copper font-mono">
            Operation
          </h3>
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["set_value", "Set value"],
                ["find_replace", "Find / replace"],
                ["set_state", "Set state"],
              ] as [Op, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setOp(k)}
                className={
                  "rounded border px-2.5 py-1 text-xs " +
                  (op === k
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-rule hover:bg-accent")
                }
              >
                {label}
              </button>
            ))}
          </div>

          {op === "set_value" && (
            <label className="block text-xs text-muted-foreground">
              New value {field?.unit ? `(${field.unit})` : ""}
              <input
                value={setValueText}
                onChange={(e) => setSetValueText(e.target.value)}
                list={field?.options ? "bulk-opts" : undefined}
                placeholder="value to set on every matched row"
                className="mt-1 w-full bg-transparent border border-input rounded px-2 py-1.5 text-sm font-mono"
              />
              {field?.options && (
                <datalist id="bulk-opts">
                  {field.options.map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              )}
            </label>
          )}

          {op === "find_replace" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs text-muted-foreground">
                Find
                <input
                  value={findText}
                  onChange={(e) => setFindText(e.target.value)}
                  className="mt-1 w-full bg-transparent border border-input rounded px-2 py-1.5 text-sm font-mono"
                />
              </label>
              <label className="block text-xs text-muted-foreground">
                Replace with
                <input
                  value={replaceText}
                  onChange={(e) => setReplaceText(e.target.value)}
                  className="mt-1 w-full bg-transparent border border-input rounded px-2 py-1.5 text-sm font-mono"
                />
              </label>
            </div>
          )}

          {op === "set_state" && (
            <label className="block text-xs text-muted-foreground">
              New state
              <select
                value={newState}
                onChange={(e) => setNewState(e.target.value as FieldState)}
                className="mt-1 w-full bg-transparent border border-input rounded px-2 py-1.5 text-sm"
              >
                {STATES.map((s) => (
                  <option key={s} value={s}>
                    {STATE_LABELS[s]}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="pt-2">
            <button
              onClick={() => setConfirming(true)}
              disabled={changes.length === 0}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40"
            >
              Review {changes.length} change{changes.length === 1 ? "" : "s"}
            </button>
          </div>
          {doneMsg && <p className="text-xs text-state-filled">{doneMsg}</p>}
        </div>
      </div>

      {/* Preview */}
      {confirming && (
        <div className="mt-6 rounded-lg border border-rule bg-card overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 border-b border-rule">
            <h3 className="text-sm font-serif italic">
              {changes.length} change{changes.length === 1 ? "" : "s"} to “{field?.label}”
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="rounded border border-rule px-3 py-1 text-xs hover:bg-accent"
              >
                Cancel
              </button>
              <button
                onClick={apply}
                disabled={bulk.isPending}
                className="inline-flex items-center gap-1 rounded bg-primary px-3 py-1 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {bulk.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                Apply
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto">
            <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-4 py-2 border-b border-rule text-[10px] uppercase tracking-widest text-muted-foreground font-mono sticky top-0 bg-card">
              <div>Experiment</div>
              <div>Before</div>
              <div>After</div>
            </div>
            {changes.map((c) => {
              const p = paperById.get(c.exp.paper_id);
              return (
                <div
                  key={c.exp.id}
                  className="grid grid-cols-[1fr_1fr_1fr] gap-3 px-4 py-1.5 border-b border-rule/60 last:border-0 text-sm items-center"
                >
                  <div className="truncate">
                    <span className="font-serif italic">{p?.citation_key || "Untitled"}</span>
                    <span className="text-muted-foreground text-xs"> · {c.exp.label}</span>
                  </div>
                  <div className="font-mono text-xs text-muted-foreground truncate">
                    {describe(c.before)}
                  </div>
                  <div className="font-mono text-xs text-copper truncate">{describe(c.after)}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
