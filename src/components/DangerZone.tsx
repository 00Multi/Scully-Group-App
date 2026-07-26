import { useState } from "react";
import { useResetAllData } from "@/lib/db";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";

// Two-step, irreversible "delete everything" flow. Both steps are explicit
// confirmations; the second requires typing DELETE.
export function DangerZone() {
  const reset = useResetAllData();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [confirmText, setConfirmText] = useState("");
  const [result, setResult] = useState<string | null>(null);

  const close = () => {
    setStep(0);
    setConfirmText("");
  };

  const doReset = async () => {
    try {
      const r = await reset.mutateAsync();
      setResult(
        `Deleted ${r.papers} paper${r.papers === 1 ? "" : "s"} (with their experiments) and ${r.files} stored file${r.files === 1 ? "" : "s"}. The database is now empty.`,
      );
    } catch (e) {
      setResult(e instanceof Error ? `Reset failed: ${e.message}` : "Reset failed.");
    } finally {
      close();
    }
  };

  const canDelete = confirmText.trim().toUpperCase() === "DELETE";

  return (
    <section className="mb-10">
      <h2 className="text-2xl font-serif italic text-destructive">Danger zone</h2>
      <div className="mt-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 flex items-start gap-4">
        <AlertTriangle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium">Delete all data and start fresh</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-xl">
            Permanently removes every paper, experiment, and uploaded PDF/image. Your material
            categories and column setup are kept. This cannot be undone.
          </p>
          {result && <p className="mt-2 text-xs font-medium">{result}</p>}
        </div>
        <button
          onClick={() => {
            setResult(null);
            setStep(1);
          }}
          disabled={reset.isPending}
          className="inline-flex items-center gap-1.5 rounded-md border border-destructive/50 text-destructive px-3 py-2 text-sm hover:bg-destructive/10 disabled:opacity-50 shrink-0"
        >
          {reset.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 className="h-4 w-4" />
          )}
          Delete all data
        </button>
      </div>

      <AlertDialog open={step !== 0} onOpenChange={(o) => !o && close()}>
        <AlertDialogContent>
          {step === 1 ? (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete everything? (1 of 2)</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes{" "}
                  <strong>all papers, all experiments, and every uploaded PDF and image</strong>.
                  Your material categories and column/data-point setup are kept. This cannot be
                  undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel onClick={close}>Cancel</AlertDialogCancel>
                <button
                  onClick={() => setStep(2)}
                  className="inline-flex items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
                >
                  Continue
                </button>
              </AlertDialogFooter>
            </>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure? (2 of 2)</AlertDialogTitle>
                <AlertDialogDescription>
                  Last check — there is no undo. Type{" "}
                  <span className="font-mono font-semibold">DELETE</span> to erase all data and
                  start from a clean slate.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <input
                autoFocus
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && canDelete) doReset();
                }}
                placeholder="Type DELETE"
                className="w-full bg-background border border-input rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-destructive"
              />
              <AlertDialogFooter>
                <AlertDialogCancel onClick={close}>Cancel</AlertDialogCancel>
                <button
                  onClick={doReset}
                  disabled={!canDelete || reset.isPending}
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {reset.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Delete all data
                </button>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
