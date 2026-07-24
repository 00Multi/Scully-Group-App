import type { FieldState } from "@/lib/fields";
import { STATE_LABELS } from "@/lib/fields";

const styles: Record<FieldState, string> = {
  filled: "bg-state-filled/15 text-state-filled",
  missing: "bg-state-missing/15 text-state-missing",
  na: "bg-state-na/15 text-state-na",
  needs_check: "bg-state-check/20 text-state-check",
};

export function StateBadge({ state }: { state: FieldState }) {
  return <span className={`field-tag ${styles[state]}`}>{STATE_LABELS[state]}</span>;
}
