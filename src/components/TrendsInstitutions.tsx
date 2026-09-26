import { useEffect, useMemo, useState } from "react";
import {
  Bar as RBar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Paper } from "@/lib/db";
import {
  countryCounts,
  institutionCounts,
  institutionsForCountry,
  type InstitutionCount,
} from "@/lib/trends";
import {
  useInstitutionGroups,
  useSaveInstitutionGroups,
  type InstitutionGroup,
} from "@/lib/institutionGroups";
import { flagEmoji } from "@/lib/countries";
import { CountryCombobox } from "./CountryCombobox";
import { InstitutionLogo } from "./InstitutionLogo";
import { CollapsibleSection } from "./CollapsibleSection";
import {
  BarChart3,
  Check,
  ChevronRight,
  Group,
  LineChart as LineIcon,
  Ungroup,
  X,
} from "lucide-react";

const COPPER = "#b87333";

const keyOf = (i: InstitutionCount) => (i.groupId ? `g:${i.groupId}` : `i:${i.name.toLowerCase()}`);
const newId = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `grp_${Date.now().toString(36)}`;

function Bar({ count, max }: { count: number; max: number }) {
  return (
    <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
      <div className="h-full bg-copper" style={{ width: `${max ? (count / max) * 100 : 0}%` }} />
    </div>
  );
}

// Papers-per-country as a line (default) or bar chart.
function CountryChart({
  data,
  mode,
  mounted,
}: {
  data: { label: string; count: number }[];
  mode: "line" | "bar";
  mounted: boolean;
}) {
  const maxChars = data.reduce((m, d) => Math.max(m, d.label.length), 1);
  const rotate = data.length > 4 || maxChars > 6;
  const height = 224 + (rotate ? 40 : 0);
  const xAxis = (
    <XAxis
      dataKey="label"
      tick={{ fontSize: 10, fill: "currentColor" }}
      interval={mode === "line" ? "preserveStartEnd" : 0}
      angle={rotate ? -35 : 0}
      textAnchor={rotate ? "end" : "middle"}
      height={(rotate ? 60 : 22) + 20}
      tickMargin={6}
      stroke="currentColor"
      className="text-muted-foreground"
      label={{
        value: "Country",
        position: "insideBottom",
        offset: 0,
        style: { fontSize: 11, fill: "currentColor", textAnchor: "middle" },
      }}
    />
  );
  const yAxis = (
    <YAxis
      allowDecimals={false}
      tick={{ fontSize: 10, fill: "currentColor" }}
      stroke="currentColor"
      className="text-muted-foreground"
      width={52}
      tickMargin={4}
      label={{
        value: "Papers",
        angle: -90,
        position: "insideLeft",
        style: { fontSize: 11, fill: "currentColor", textAnchor: "middle" },
      }}
    />
  );
  return (
    <div className="mb-3 rounded-lg border border-rule bg-card p-4" style={{ height }}>
      {mounted && (
        <ResponsiveContainer width="100%" height="100%">
          {mode === "line" ? (
            <LineChart data={data} margin={{ top: 6, right: 10, left: 4, bottom: 4 }}>
              <CartesianGrid stroke="currentColor" className="text-rule/40" vertical={false} />
              {xAxis}
              {yAxis}
              <RTooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                labelStyle={{ fontWeight: 600 }}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke={COPPER}
                strokeWidth={2}
                dot={{ r: 2, fill: COPPER }}
              />
            </LineChart>
          ) : (
            <BarChart data={data} margin={{ top: 6, right: 10, left: 4, bottom: 4 }}>
              {xAxis}
              {yAxis}
              <RTooltip
                cursor={{ fill: "rgba(184,115,51,0.08)" }}
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                labelStyle={{ fontWeight: 600 }}
              />
              <RBar dataKey="count" fill={COPPER} radius={[3, 3, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      )}
    </div>
  );
}

export function TrendsInstitutions({ papers, query }: { papers: Paper[]; query: string }) {
  const { data: groups = [] } = useInstitutionGroups();
  const saveGroups = useSaveInstitutionGroups();

  const institutions = useMemo(() => institutionCounts(papers, groups), [papers, groups]);
  const countries = useMemo(() => countryCounts(papers), [papers]);

  const q = query.trim().toLowerCase();
  const shownInstitutions = q
    ? institutions.filter(
        (i) => i.name.toLowerCase().includes(q) || (i.countryName ?? "").toLowerCase().includes(q),
      )
    : institutions;
  const shownCountries = q
    ? countries.filter((c) => c.name.toLowerCase().includes(q) || c.code === q)
    : countries;

  const maxInst = shownInstitutions.reduce((m, i) => Math.max(m, i.count), 0);
  const maxCountry = shownCountries.reduce((m, c) => Math.max(m, c.count), 0);

  // Multi-select for grouping.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [shorthand, setShorthand] = useState("");
  const [country, setCountry] = useState<{ code: string; name: string } | null>(null);
  const toggleSel = (k: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  const createGroup = () => {
    const name = shorthand.trim();
    if (!name || selected.size === 0) return;
    const memberNames = new Set<string>();
    const removeIds = new Set<string>();
    for (const inst of institutions) {
      if (!selected.has(keyOf(inst))) continue;
      if (inst.groupId) {
        removeIds.add(inst.groupId);
        (inst.members ?? []).forEach((n) => memberNames.add(n));
      } else {
        memberNames.add(inst.name);
      }
    }
    const group: InstitutionGroup = {
      id: newId(),
      shorthand: name,
      country: country && country.name ? country : undefined,
      members: Array.from(memberNames),
    };
    saveGroups.mutate([...groups.filter((g) => !removeIds.has(g.id)), group]);
    setSelected(new Set());
    setShorthand("");
    setCountry(null);
  };

  const ungroup = (groupId: string) => saveGroups.mutate(groups.filter((g) => g.id !== groupId));

  // Country drill-down.
  const [openCountry, setOpenCountry] = useState<string | null>(null);
  const [countryMode, setCountryMode] = useState<"line" | "bar">("line");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const countryChartData = useMemo(
    () => shownCountries.map((c) => ({ label: c.name, count: c.count })),
    [shownCountries],
  );

  const countryModeToggle = (
    <div className="inline-flex overflow-hidden rounded-md border border-rule">
      {(
        [
          ["line", LineIcon],
          ["bar", BarChart3],
        ] as ["line" | "bar", typeof LineIcon][]
      ).map(([m, Icon]) => (
        <button
          key={m}
          onClick={() => setCountryMode(m)}
          title={m === "line" ? "Line" : "Bars"}
          className={
            "inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors " +
            (countryMode === m
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-accent")
          }
        >
          <Icon className="h-3 w-3" />
        </button>
      ))}
    </div>
  );

  return (
    <>
      {shownCountries.length > 0 && (
        <CollapsibleSection id="countries" title="Countries" right={countryModeToggle}>
          <CountryChart data={countryChartData} mode={countryMode} mounted={mounted} />
          <div className="rounded-lg border border-rule bg-card divide-y divide-rule/60">
            {shownCountries.map((c) => {
              const open = openCountry === c.code;
              const insts = open ? institutionsForCountry(papers, groups, c.code) : [];
              return (
                <div key={c.code}>
                  <button
                    onClick={() => setOpenCountry(open ? null : c.code)}
                    className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-accent/40"
                  >
                    <ChevronRight
                      className={
                        "h-3.5 w-3.5 text-muted-foreground transition-transform " +
                        (open ? "rotate-90" : "")
                      }
                    />
                    <span className="text-lg" aria-hidden>
                      {flagEmoji(c.code)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-sm">{c.name}</span>
                        <span className="font-mono text-xs text-muted-foreground shrink-0">
                          {c.count} paper{c.count === 1 ? "" : "s"}
                        </span>
                      </div>
                      <Bar count={c.count} max={maxCountry} />
                    </div>
                  </button>
                  {open && (
                    <div className="px-4 pb-2 pl-11">
                      {insts.length === 0 ? (
                        <p className="py-1 text-xs text-muted-foreground italic">
                          No institutions are tagged with this country yet. Group institutions below
                          and assign them a country.
                        </p>
                      ) : (
                        <ul className="py-1 space-y-1">
                          {insts.map((i) => (
                            <li key={keyOf(i)} className="flex items-center gap-2 text-sm">
                              <InstitutionLogo inst={i} />
                              <span className="truncate flex-1">{i.name}</span>
                              <span className="font-mono text-xs text-muted-foreground">
                                {i.count}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}

      {shownInstitutions.length > 0 && (
        <CollapsibleSection
          id="institutions"
          title="Institutions"
          right={
            <span className="text-xs text-muted-foreground">
              Select variants of the same institution to group them.
            </span>
          }
        >
          {/* Grouping toolbar (shown when something is selected). */}
          {selected.size > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-copper/40 bg-copper/5 p-3">
              <Group className="h-4 w-4 text-copper shrink-0" />
              <span className="text-xs text-muted-foreground">{selected.size} selected →</span>
              <input
                value={shorthand}
                onChange={(e) => setShorthand(e.target.value)}
                placeholder="Group shorthand (e.g. MIT)"
                className="bg-background border border-input rounded px-2 py-1 text-xs w-48 focus:outline-none focus:border-primary"
              />
              <CountryCombobox
                value={country}
                onChange={setCountry}
                placeholder="Type a country…"
              />
              {country?.name && !country.code && (
                <span className="text-[10px] text-muted-foreground">({country.name})</span>
              )}
              <button
                onClick={createGroup}
                disabled={!shorthand.trim()}
                className="rounded bg-primary px-2.5 py-1 text-xs text-primary-foreground disabled:opacity-40"
              >
                Group
              </button>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear
              </button>
            </div>
          )}

          <div className="rounded-lg border border-rule bg-card divide-y divide-rule/60">
            {shownInstitutions.map((inst) => {
              const k = keyOf(inst);
              const on = selected.has(k);
              return (
                <div key={k} className="flex items-center gap-3 px-3 py-2">
                  <button
                    onClick={() => toggleSel(k)}
                    aria-label={on ? "Deselect" : "Select for grouping"}
                    className={
                      "shrink-0 inline-flex h-4 w-4 items-center justify-center rounded-sm border " +
                      (on ? "bg-copper border-copper text-white" : "border-rule")
                    }
                  >
                    {on && <Check className="h-3 w-3" />}
                  </button>
                  <InstitutionLogo inst={inst} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-sm inline-flex items-center gap-1.5">
                        {inst.countryCode && <span aria-hidden>{flagEmoji(inst.countryCode)}</span>}
                        {inst.name}
                        {inst.groupId && (
                          <span className="rounded-full bg-copper/15 text-copper px-1.5 text-[10px] font-mono">
                            group · {inst.members?.length ?? 0}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground shrink-0 inline-flex items-center gap-2">
                        {inst.count} paper{inst.count === 1 ? "" : "s"}
                        {inst.groupId && (
                          <button
                            onClick={() => ungroup(inst.groupId!)}
                            title="Ungroup"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Ungroup className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </span>
                    </div>
                    <Bar count={inst.count} max={maxInst} />
                    {inst.groupId && inst.members && inst.members.length > 1 && (
                      <div className="mt-0.5 text-[10px] text-muted-foreground truncate">
                        {inst.members.join(" · ")}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CollapsibleSection>
      )}
    </>
  );
}
