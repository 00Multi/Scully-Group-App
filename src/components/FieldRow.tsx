import { useEffect, useState, type ReactNode } from "react";
import type { FieldDef, FieldState, FieldValue } from "@/lib/fields";
import { parseFieldInput, STATE_LABELS } from "@/lib/fields";
import { AutoTextarea } from "./AutoTextarea";
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
  // Optional control (e.g. a per-row experiment selector) shown before the state
  // badge. Lets each data-point row indicate which experiment it displays.
  expControl?: ReactNode;
}

const STATES: FieldState[] = ["filled", "missing", "na", "needs_check"];

export function FieldRow({ field, value, onChange, onDelete, expControl }: Props) {
  const [local, setLocal] = useState<string>(
    value.value === null || value.value === undefined ? "" : String(value.value),
  );
  const [note, setNote] = useState<string>(value.note ?? "");

  useEffect(() => {
    setLocal(value.value === null || value.value === undefined ? "" : String(value.value));
    setNote(value.note ?? "");
  }, [value.value, value.note]);

  const commit = (raw: string) => {
    onChange(parseFieldInput(raw, field, value));
  };

  const setState = (s: FieldState) => {
    onChange({ ...value, state: s });
  };

  // Every field auto-fits its text (wrapping to more lines when needed) except
  // numbers, which stay on one line. Fields with options keep a compact
  // suggestion dropdown next to the box.
  const hasOptions = !!field.options?.length;
  const isNumber = field.type === "number";
  const inputClass =
    "w-full bg-transparent border-0 border-b border-input focus:border-primary focus:outline-none text-sm py-1 font-mono";

  return (
    <div className="group flex items-start gap-2 py-2 border-b border-rule/60 last:border-0">
      {/* Experiment selector on the left of the data point. */}
      {expControl && <div className="pt-1 shrink-0">{expControl}</div>}

      <FieldTooltip field={field}>
        <div className="pt-1.5 w-16 @sm:w-20 shrink-0 text-xs leading-tight text-ink-muted cursor-help select-none break-words hyphens-auto">
          {field.label}
          {field.unit && (
            <span className="ml-1 text-[10px] text-muted-foreground font-mono">({field.unit})</span>
          )}
        </div>
      </FieldTooltip>

      <div className="flex flex-col gap-1 flex-1 min-w-0">
        {isNumber ? (
          <input
            list={hasOptions ? `opts-${field.key}` : undefined}
            inputMode={hasOptions ? undefined : "decimal"}
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            placeholder={value.state === "na" ? "N/A" : "—"}
            className={inputClass}
          />
        ) : (
          <div className="relative">
            <AutoTextarea
              autoOnly
              value={local}
              onChange={(e) => setLocal(e.target.value)}
              onBlur={(e) => commit(e.target.value)}
              rows={1}
              placeholder={value.state === "na" ? "N/A" : "—"}
              className={inputClass + (hasOptions ? " pr-5" : "")}
            />
            {hasOptions && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  className="absolute right-0 top-1 text-muted-foreground hover:text-foreground focus:outline-none"
                  title="Pick a suggested value"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-64 overflow-auto">
                  {field.options!.map((o) => (
                    <DropdownMenuItem
                      key={o}
                      onSelect={() => {
                        setLocal(o);
                        commit(o);
                      }}
                    >
                      {o}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        )}
        {isNumber && hasOptions ? (
          <datalist id={`opts-${field.key}`}>
            {field.options!.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        ) : null}
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

      <div className="flex items-center gap-1 pt-0.5 shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger className="focus:outline-none">
            <span className="inline-flex items-center gap-0.5 whitespace-nowrap">
              <StateBadge state={value.state} />
              <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
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
