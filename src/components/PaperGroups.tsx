import { useEffect, useRef, useState } from "react";
import type { Paper } from "@/lib/db";
import {
  paperGroupIds,
  setPaperInGroup,
  useInstitutionGroups,
  useSaveInstitutionGroups,
} from "@/lib/institutionGroups";
import { flagEmoji } from "@/lib/countries";
import { Check, ChevronDown, Group as GroupIcon, X } from "lucide-react";

// The institution groups a paper is assigned to, plus a dropdown to add it to
// (or remove it from) any group created on the Trends tab. Sits next to the
// Institution(s) cell in the paper header.
export function PaperGroups({ paper }: { paper: Paper }) {
  const { data: groups = [] } = useInstitutionGroups();
  const save = useSaveInstitutionGroups();
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const memberOf = paperGroupIds(groups, paper.id);
  const toggle = (groupId: string) => {
    save.mutate(setPaperInGroup(groups, groupId, paper.id, !memberOf.has(groupId)));
  };

  const current = groups.filter((g) => memberOf.has(g.id));

  return (
    <div ref={boxRef} className="relative mt-1">
      {current.length > 0 && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {current.map((g) => (
            <span
              key={g.id}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-copper/40 bg-copper/10 px-2 py-0.5 text-xs text-copper"
              title={g.country?.name ? `${g.shorthand} · ${g.country.name}` : g.shorthand}
            >
              {g.country?.code && <span aria-hidden>{flagEmoji(g.country.code)}</span>}
              <span className="truncate">{g.shorthand}</span>
              <button
                onClick={() => toggle(g.id)}
                className="shrink-0 text-copper/70 hover:text-destructive"
                aria-label={`Remove from ${g.shorthand}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      {groups.length === 0 ? (
        <p className="text-[11px] italic text-muted-foreground">
          No groups yet — create institution groups on the Trends tab.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded border border-rule px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
        >
          <GroupIcon className="h-3.5 w-3.5" />
          Add to group
          <ChevronDown className="h-3 w-3" />
        </button>
      )}

      {open && groups.length > 0 && (
        <div className="absolute z-30 mt-1 max-h-64 w-64 overflow-auto rounded-md border border-rule bg-card text-sm shadow-lg">
          {groups.map((g) => {
            const on = memberOf.has(g.id);
            return (
              <button
                key={g.id}
                onClick={() => toggle(g.id)}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-accent"
              >
                <span
                  className={
                    "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border " +
                    (on ? "border-copper bg-copper text-white" : "border-rule")
                  }
                >
                  {on && <Check className="h-3 w-3" />}
                </span>
                {g.country?.code && <span aria-hidden>{flagEmoji(g.country.code)}</span>}
                <span className="truncate flex-1">{g.shorthand}</span>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {(g.members?.length ?? 0) + (g.papers?.length ?? 0)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
