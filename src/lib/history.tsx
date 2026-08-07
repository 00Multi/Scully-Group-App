import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type ReactNode,
} from "react";
import { Redo2, Undo2 } from "lucide-react";

// ---------- Global undo / redo ----------
//
// A single stack of reversible commands drives app-wide undo/redo. Each edit
// site (schema changes, experiment edits, paper-metadata edits, …) records an
// entry describing how to undo and redo itself; the provider replays those
// closures. Keeping the knowledge of *how* to reverse a change next to where it
// is made keeps this layer generic and lets every domain opt in the same way.

export interface HistoryEntry {
  // Human-readable summary, surfaced in the toolbar tooltip (e.g. "Edit Temp").
  label: string;
  undo: () => void | Promise<void>;
  redo: () => void | Promise<void>;
}

interface HistoryCtx {
  record: (entry: HistoryEntry) => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string | null;
  redoLabel: string | null;
}

const Ctx = createContext<HistoryCtx | null>(null);

// Cap the stack so a long editing session can't grow memory without bound.
const MAX = 200;

// Build the inverse of a partial patch by reading the current values of exactly
// the keys the patch touches. Shared by every "table row patch" edit so undo
// restores precisely what changed and nothing else.
export function inversePatch<T extends object>(current: T, patch: Partial<T>): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(patch) as (keyof T)[]) out[k] = current[k];
  return out;
}

export function HistoryProvider({ children }: { children: ReactNode }) {
  const pastRef = useRef<HistoryEntry[]>([]);
  const futureRef = useRef<HistoryEntry[]>([]);
  // While an undo/redo's own closures run, suppress recording so the replayed
  // mutations don't push new entries.
  const applyingRef = useRef(false);
  const [, bump] = useReducer((n: number) => n + 1, 0);

  const record = useCallback((entry: HistoryEntry) => {
    if (applyingRef.current) return;
    pastRef.current = [...pastRef.current, entry].slice(-MAX);
    futureRef.current = [];
    bump();
  }, []);

  const apply = useCallback((fn: () => void | Promise<void>) => {
    applyingRef.current = true;
    // Hold the guard across the async tail of the closure, then release.
    Promise.resolve()
      .then(fn)
      .finally(() => {
        applyingRef.current = false;
      });
  }, []);

  const undo = useCallback(() => {
    const entry = pastRef.current[pastRef.current.length - 1];
    if (!entry) return;
    pastRef.current = pastRef.current.slice(0, -1);
    futureRef.current = [...futureRef.current, entry];
    bump();
    apply(entry.undo);
  }, [apply]);

  const redo = useCallback(() => {
    const entry = futureRef.current[futureRef.current.length - 1];
    if (!entry) return;
    futureRef.current = futureRef.current.slice(0, -1);
    pastRef.current = [...pastRef.current, entry].slice(-MAX);
    bump();
    apply(entry.redo);
  }, [apply]);

  const clear = useCallback(() => {
    pastRef.current = [];
    futureRef.current = [];
    bump();
  }, []);

  // Global keyboard shortcuts. When the user is typing in a form field we defer
  // to the browser's native per-field text undo instead of hijacking the keys —
  // our field edits only commit on blur, so nothing is lost.
  useEffect(() => {
    const isEditable = (el: EventTarget | null): boolean => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return (
        tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || node.isContentEditable === true
      );
    };
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = key === "y" || (key === "z" && e.shiftKey);
      if (!isUndo && !isRedo) return;
      if (isEditable(e.target)) return; // let the field handle its own undo
      e.preventDefault();
      if (isUndo) undo();
      else redo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const value: HistoryCtx = {
    record,
    undo,
    redo,
    clear,
    canUndo: pastRef.current.length > 0,
    canRedo: futureRef.current.length > 0,
    undoLabel: pastRef.current[pastRef.current.length - 1]?.label ?? null,
    redoLabel: futureRef.current[futureRef.current.length - 1]?.label ?? null,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useHistory(): HistoryCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useHistory must be used inside <HistoryProvider>");
  return v;
}

// A no-op fallback so components can call the recorder unconditionally even if
// they are ever rendered outside a provider (e.g. isolated tests).
export function useRecord(): (entry: HistoryEntry) => void {
  const v = useContext(Ctx);
  return v ? v.record : () => {};
}

// The reverse / forward arrows shown in the top bar.
export function UndoRedoButtons() {
  const { undo, redo, canUndo, canRedo, undoLabel, redoLabel } = useHistory();
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || "");
  const mod = isMac ? "⌘" : "Ctrl+";
  const btn =
    "inline-flex items-center justify-center rounded-md border border-rule px-2 py-1 text-muted-foreground transition-colors disabled:opacity-40 disabled:cursor-default enabled:hover:text-foreground enabled:hover:bg-accent";
  return (
    <div className="mr-1 flex items-center gap-1">
      <button
        type="button"
        onClick={undo}
        disabled={!canUndo}
        aria-label="Undo"
        title={canUndo ? `Undo ${undoLabel ?? ""} (${mod}Z)`.trim() : `Nothing to undo (${mod}Z)`}
        className={btn}
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={redo}
        disabled={!canRedo}
        aria-label="Redo"
        title={canRedo ? `Redo ${redoLabel ?? ""} (${mod}Y)`.trim() : `Nothing to redo (${mod}Y)`}
        className={btn}
      >
        <Redo2 className="h-4 w-4" />
      </button>
    </div>
  );
}
