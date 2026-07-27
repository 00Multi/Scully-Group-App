import { useRef, useState } from "react";
import { useCreatePaper, useUploadPaperPdf, useUpdatePaper, type Paper } from "@/lib/db";
import { extractPdfText, findDoi } from "@/lib/pdf-extract";
import { fetchCrossref } from "@/lib/crossref";
import { FileUp, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

type Status = "working" | "done" | "warn" | "error";
interface Job {
  name: string;
  status: Status;
  message: string;
}

export function PdfDropZone({ onCreated }: { onCreated?: (paperId: string) => void }) {
  const createPaper = useCreatePaper();
  const uploadPdf = useUploadPaperPdf();
  const updatePaper = useUpdatePaper();
  const inputRef = useRef<HTMLInputElement>(null);

  const [dragOver, setDragOver] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [busy, setBusy] = useState(false);

  const setJob = (i: number, patch: Partial<Job>) =>
    setJobs((prev) => prev.map((j, idx) => (idx === i ? { ...j, ...patch } : j)));

  const processFile = async (file: File, jobIndex: number) => {
    try {
      // 1. Create the paper (auto-creates its first experiment) and upload PDF.
      const paper = (await createPaper.mutateAsync({
        category_id: null,
        title: file.name.replace(/\.pdf$/i, ""),
      })) as Paper;
      await uploadPdf.mutateAsync({ paperId: paper.id, file });
      onCreated?.(paper.id);

      // 2. Extract text and look for a DOI.
      setJob(jobIndex, { message: "Reading PDF…" });
      let text = "";
      try {
        text = await extractPdfText(file);
      } catch {
        setJob(jobIndex, {
          status: "warn",
          message: "Uploaded. Couldn't read text (scanned PDF?) — fill fields manually.",
        });
        return;
      }
      const doi = findDoi(text);
      if (!doi) {
        setJob(jobIndex, {
          status: "warn",
          message:
            "Uploaded. No DOI found in the text — add a DOI and use Prefill, or fill manually.",
        });
        return;
      }

      // 3. Crossref lookup → fill metadata.
      setJob(jobIndex, { message: `Found DOI ${doi} — fetching metadata…` });
      try {
        const r = await fetchCrossref(doi);
        const autoFilled: Record<string, boolean> = {};
        const patch: Partial<Paper> = { doi };
        if (r.title) ((patch.title = r.title), (autoFilled.title = true));
        if (r.authors) ((patch.author = r.authors), (autoFilled.author = true));
        if (r.year != null) ((patch.year = r.year), (autoFilled.year = true));
        if (r.journal) ((patch.journal = r.journal), (autoFilled.journal = true));
        if (r.abstract) {
          patch.abstract = r.abstract;
          patch.summary = r.abstract;
          autoFilled.abstract = true;
          autoFilled.summary = true;
        }
        patch.citation_key = r.citationKey || paper.citation_key;
        patch.auto_filled = autoFilled;
        patch.meta = {
          authors_full: r.authorsFull,
          volume: r.volume,
          issue: r.issue,
          pages: r.pages,
          keywords: r.keywords,
          publisher: r.publisher,
          reference_count: r.referenceCount,
          url: r.url,
          crossref_fetched_at: new Date().toISOString(),
        };
        await updatePaper.mutateAsync({ id: paper.id, patch });
        setJob(jobIndex, {
          status: "done",
          message: `Imported “${r.citationKey}” — ${Object.keys(autoFilled).length} fields auto-filled.`,
        });
      } catch (e: any) {
        setJob(jobIndex, {
          status: "warn",
          message: `Uploaded with DOI ${doi}, but Crossref failed (${e?.message ?? "error"}).`,
        });
      }
    } catch (e: any) {
      setJob(jobIndex, { status: "error", message: e?.message ?? "Upload failed." });
    }
  };

  const handleFiles = async (files: FileList | File[]) => {
    const pdfs = Array.from(files).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdfs.length === 0) return;
    const startIndex = jobs.length;
    setJobs((prev) => [
      ...prev,
      ...pdfs.map((f) => ({
        name: f.name,
        status: "working" as Status,
        message: "Creating paper…",
      })),
    ]);
    setBusy(true);
    for (let i = 0; i < pdfs.length; i++) {
      await processFile(pdfs[i], startIndex + i);
    }
    setBusy(false);
  };

  return (
    <div className="rounded-lg border border-rule bg-card">
      <div className="flex items-center gap-3 px-4 py-2 border-b border-rule/60">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">
          Add papers from PDF
        </span>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          handleFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        className={
          "m-3 flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-4 py-6 text-center cursor-pointer transition-colors " +
          (dragOver ? "border-copper bg-copper/5" : "border-rule hover:border-copper/50")
        }
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        {busy ? (
          <Loader2 className="h-6 w-6 text-copper animate-spin" />
        ) : (
          <FileUp className="h-6 w-6 text-copper" />
        )}
        <p className="text-sm">
          Drag &amp; drop PDFs here, or <span className="text-copper underline">browse</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Each PDF becomes a paper; its DOI is read and metadata auto-filled from Crossref. Set the
          alloy type per experiment once it's created.
        </p>
      </div>

      {jobs.length > 0 && (
        <ul className="px-4 pb-3 space-y-1">
          {jobs.map((j, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              {j.status === "working" && (
                <Loader2 className="h-3.5 w-3.5 mt-0.5 animate-spin text-muted-foreground shrink-0" />
              )}
              {j.status === "done" && (
                <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-state-filled shrink-0" />
              )}
              {j.status === "warn" && (
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-state-check shrink-0" />
              )}
              {j.status === "error" && (
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-destructive shrink-0" />
              )}
              <span className="min-w-0">
                <span className="font-mono">{j.name}</span>
                <span className="text-muted-foreground"> — {j.message}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
