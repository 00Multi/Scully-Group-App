import type { FieldDef } from "@/lib/fields";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronDown, ListChecks } from "lucide-react";

// Multi-select of the "variables studied" for a paper, picked from the full
// schema of data points. Selection is surfaced as a distribution on Trends.
export function VariablesSelect({
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
      <DropdownMenuTrigger className="focus:outline-none" title="Variables studied in this paper">
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
