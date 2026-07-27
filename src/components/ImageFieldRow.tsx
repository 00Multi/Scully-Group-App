import { useRef, useState } from "react";
import type { FieldDef, FieldState, FieldValue } from "@/lib/fields";
import { STATE_LABELS } from "@/lib/fields";
import { useUploadExperimentImage } from "@/lib/db";
import { useSnip } from "@/lib/snip";
import { FieldTooltip } from "./FieldTooltip";
import { StateBadge } from "./StateBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ImageUp, Loader2, Scissors, Trash2, X } from "lucide-react";

interface Props {
  field: FieldDef;
  value: FieldValue;
  paperId: string;
  experimentId: string;
  onChange: (next: FieldValue) => void;
  onDelete?: () => void;
  expControl?: React.ReactNode;
}

const STATES: FieldState[] = ["filled", "missing", "na", "needs_check"];

export function ImageFieldRow({
  field,
  value,
  paperId,
  experimentId,
  onChange,
  onDelete,
  expControl,
}: Props) {
  const upload = useUploadExperimentImage();
  const snip = useSnip();
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const url = typeof value.value === "string" && value.value ? value.value : null;
  const requestingThis = snip.active && snip.label === field.label;

  const store = async (blob: Blob, ext = "png") => {
    setErr(null);
    setBusy(true);
    try {
      const publicUrl = await upload.mutateAsync({
        paperId,
        experimentId,
        fieldKey: field.key,
        blob,
        ext,
      });
      onChange({ ...value, value: publicUrl, state: "filled" });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  const onSnip = () => snip.request(field.label, (blob) => store(blob, "png"));

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) {
      setErr("Please choose an image file.");
      return;
    }
    const ext = f.name.split(".").pop()?.toLowerCase() || "png";
    store(f, ext);
  };

  const remove = () => onChange({ ...value, value: null, state: "missing" });

  return (
    <div className="group flex items-start gap-2 py-2 border-b border-rule/60 last:border-0">
      {expControl && <div className="pt-1 shrink-0">{expControl}</div>}

      <FieldTooltip field={field}>
        <div className="pt-1.5 w-16 @sm:w-20 shrink-0 text-xs leading-tight text-ink-muted cursor-help select-none break-words hyphens-auto">
          {field.label}
        </div>
      </FieldTooltip>

      <div className="flex flex-col gap-2 flex-1 min-w-0">
        {url ? (
          <div className="relative inline-block">
            <a href={url} target="_blank" rel="noreferrer" title="Open full image">
              <img
                src={url}
                alt={field.label}
                className="max-h-40 rounded border border-rule object-contain bg-white"
              />
            </a>
            <button
              onClick={remove}
              title="Remove image"
              className="absolute -top-2 -right-2 rounded-full bg-card border border-rule p-0.5 text-muted-foreground hover:text-destructive shadow"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground italic">No image yet.</div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onSnip}
            disabled={busy}
            className={
              "inline-flex items-center gap-1 rounded border px-2 py-1 text-xs transition-colors disabled:opacity-50 " +
              (requestingThis
                ? "border-copper bg-copper/10 text-copper"
                : "border-rule hover:bg-accent")
            }
            title="Capture a region from the PDF (open Split or Paper view)"
          >
            <Scissors className="h-3 w-3" />
            {requestingThis ? "Drag on the PDF…" : url ? "Re-snip" : "Snip from PDF"}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded border border-rule px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImageUp className="h-3 w-3" />}
            Upload
          </button>
          <input ref={fileRef} type="file" accept="image/*" onChange={onPick} className="hidden" />
        </div>
        {err && <p className="text-[11px] text-destructive">{err}</p>}
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
              <DropdownMenuItem key={s} onSelect={() => onChange({ ...value, state: s })}>
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
