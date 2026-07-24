import { useEffect, useState } from "react";
import type { FieldDef, FieldState, FieldValue } from "@/lib/fields";
import { STATE_LABELS } from "@/lib/fields";
import { FieldTooltip } from "./FieldTooltip";
import { StateBadge } from "./StateBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Trash2 } from "lucide-react";

interface Props {
  field: FieldDef;
  value: FieldValue;
  onChange: (next: FieldValue) => void;
  onDelete?: () => void;
}

const STATES: FieldState[] = ["filled", "missing", "na", "needs_check"];

export function FieldRow({ field, value, onChange, onDelete }: Props) {
  const [local, setLocal] = useState<string>(
    value.value === null || value.value === undefined ? "" : String(value.value),
  );
  const [note, setNote] = useState<string>(value.note ?? "");

  useEffect(() => {
    setLocal(value.value === null || value.value === undefined ? "" : String(value.value));
    setNote(value.note ?? "");
  }, [value.value, value.note]);

  const commit = (raw: string) => {
    const trimmed = raw.trim();
    let parsed: string | number | null = trimmed === "" ? null : trimmed;
    if (field.type === "number" && trimmed !== "") {
      const n = Number(trimmed);
      parsed = Number.isFinite(n) ? n : trimmed;
    }
    const nextState: FieldState =
      trimmed === "" && value.state === "filled" ? "missing" : trimmed !== "" && value.state === "missing" ? "filled" : value.state;
    onChange({ ...value, value: parsed, state: nextState });
  };

  const setState = (s: FieldState) => {
    onChange({ ...value, state: s });
  };

  return (
    <div className="group grid grid-cols-[10rem_1fr_auto] items-start gap-3 py-2 border-b border-rule/60 last:border-0">
      <FieldTooltip field={field}>
        <div className="pt-1.5 text-sm text-ink-muted cursor-help select-none">
          {field.label}
          {field.unit && (
            <span className="ml-1 text-xs text-muted-foreground font-mono">({field.unit})</span>
          )}
        </div>
      </FieldTooltip>

      <div className="flex flex-col gap-1">
        {field.type === "select" && field.options ? (
          <input
            list={`opts-${field.key}`}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            placeholder={value.state === "na" ? "N/A" : "—"}
            className="w-full bg-transparent border-0 border-b border-input focus:border-primary focus:outline-none text-sm py-1 font-mono"
          />
        ) : (
          <input
            type={field.type === "number" ? "text" : "text"}
            inputMode={field.type === "number" ? "decimal" : undefined}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            placeholder={value.state === "na" ? "N/A" : "—"}
            className="w-full bg-transparent border-0 border-b border-input focus:border-primary focus:outline-none text-sm py-1 font-mono"
          />
        )}
        {field.options && (
          <datalist id={`opts-${field.key}`}>
            {field.options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        )}
        {value.state === "needs_check" && (
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={() => onChange({ ...value, note })}
            placeholder="Note (e.g. paywalled, ambiguous figure)"
            className="w-full bg-muted/40 rounded px-2 py-1 text-xs italic focus:outline-none"
          />
        )}
      </div>

      <div className="flex items-center gap-1 pt-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger className="focus:outline-none">
            <span className="inline-flex items-center gap-0.5">
              <StateBadge state={value.state} />
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {STATES.map((s) => (
              <DropdownMenuItem key={s} onSelect={() => setState(s)}>
                {STATE_LABELS[s]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {onDelete && (
          <button
            onClick={onDelete}
            title="Delete this data point (removes it from every experiment)"
            aria-label={`Delete ${field.label}`}
            className="text-muted-foreground/40 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
