import { pdfPublicUrl } from "@/lib/db";
import type { Paper } from "@/lib/db";
import { FileText } from "lucide-react";

export function PdfViewer({ paper }: { paper: Paper }) {
  const url = paper.pdf_path ? pdfPublicUrl(paper.pdf_path) : null;

  if (!url) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
        <FileText className="h-10 w-10 mb-3 opacity-40" />
        <p className="text-sm">No PDF attached to this paper.</p>
        <p className="text-xs mt-1">Use "Upload PDF" in the paper header to add one.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-rule bg-card/60 text-xs">
        <span className="truncate font-mono text-muted-foreground">
          {paper.pdf_name || "document.pdf"}
        </span>
        <a href={url} target="_blank" rel="noreferrer" className="text-copper hover:underline shrink-0">
          Open in new tab ↗
        </a>
      </div>
      <object data={url} type="application/pdf" className="flex-1 w-full">
        <iframe src={url} title={paper.pdf_name || "PDF"} className="w-full h-full border-0" />
      </object>
    </div>
  );
}
