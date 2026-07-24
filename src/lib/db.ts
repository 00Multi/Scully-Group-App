import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { emptyValues, withDefaults, type FieldValue } from "./fields";

export interface Category {
  id: string;
  name: string;
  sort_order: number;
}

export interface Paper {
  id: string;
  category_id: string | null;
  author: string;
  year: number | null;
  title: string;
  doi: string;
  abstract: string;
  summary: string;
  citation_key: string;
  // Added in the pdf_storage_and_paper_metadata migration.
  pdf_path: string;
  pdf_name: string;
  journal: string;
  notes: string;
  meta: Record<string, unknown>;
  auto_filled: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

// Public URL for a stored PDF path in the `papers` bucket.
export function pdfPublicUrl(path: string): string | null {
  if (!path) return null;
  const { data } = supabase.storage.from("papers").getPublicUrl(path);
  return data.publicUrl;
}

// Columns that may be absent on older rows / before the metadata migration
// has been applied. Kept optional so the app degrades gracefully.
function normalizePaper(row: any): Paper {
  return {
    ...row,
    pdf_path: row?.pdf_path ?? "",
    pdf_name: row?.pdf_name ?? "",
    journal: row?.journal ?? "",
    notes: row?.notes ?? "",
    meta: row?.meta ?? {},
    auto_filled: row?.auto_filled ?? {},
  } as Paper;
}

export interface Experiment {
  id: string;
  paper_id: string;
  label: string;
  position: number;
  values: Record<string, FieldValue>;
  created_at: string;
  updated_at: string;
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from("material_categories")
        .select("*")
        .order("sort_order");
      if (error) throw error;
      return data as Category[];
    },
  });
}

export function usePapers() {
  return useQuery({
    queryKey: ["papers"],
    queryFn: async (): Promise<Paper[]> => {
      const { data, error } = await supabase
        .from("papers")
        .select("*")
        .order("year", { ascending: false, nullsFirst: false })
        .order("author");
      if (error) throw error;
      return (data || []).map(normalizePaper);
    },
  });
}

export function useExperiments() {
  return useQuery({
    queryKey: ["experiments"],
    queryFn: async (): Promise<Experiment[]> => {
      const { data, error } = await supabase
        .from("experiments")
        .select("*")
        .order("position");
      if (error) throw error;
      return (data || []).map((row: any) => ({
        ...row,
        values: withDefaults(row.values),
      })) as Experiment[];
    },
  });
}

export function useCreatePaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      category_id: string | null;
      author?: string;
      year?: number | null;
      title?: string;
    }) => {
      const author = input.author ?? "";
      const year = input.year ?? null;
      const citation_key = author && year ? `${author.split(/[\s,]+/)[0]} ${year}` : "Untitled";
      const { data, error } = await supabase
        .from("papers")
        .insert({
          category_id: input.category_id,
          author,
          year,
          title: input.title ?? "",
          citation_key,
        })
        .select()
        .single();
      if (error) throw error;
      // Auto-create first experiment
      await supabase.from("experiments").insert({
        paper_id: data.id,
        label: "Experiment 1",
        position: 0,
        values: emptyValues() as any,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["papers"] });
      qc.invalidateQueries({ queryKey: ["experiments"] });
    },
  });
}

export function useUpdatePaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Paper> }) => {
      const { error } = await supabase.from("papers").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["papers"] }),
  });
}

// Upload a PDF for a paper into the `papers` storage bucket and record its path.
export function useUploadPaperPdf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paperId, file }: { paperId: string; file: File }) => {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${paperId}/${Date.now()}_${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("papers")
        .upload(path, file, { contentType: "application/pdf", upsert: true });
      if (upErr) throw upErr;
      const { error } = await supabase
        .from("papers")
        .update({ pdf_path: path, pdf_name: file.name } as any)
        .eq("id", paperId);
      if (error) throw error;
      return path;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["papers"] }),
  });
}

export function useRemovePaperPdf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paperId, path }: { paperId: string; path: string }) => {
      if (path) await supabase.storage.from("papers").remove([path]);
      const { error } = await supabase
        .from("papers")
        .update({ pdf_path: "", pdf_name: "" } as any)
        .eq("id", paperId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["papers"] }),
  });
}

export function useDeletePaper() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("papers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["papers"] });
      qc.invalidateQueries({ queryKey: ["experiments"] });
    },
  });
}

export function useCreateExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      paper_id,
      label,
      position,
      values,
    }: {
      paper_id: string;
      label?: string;
      position?: number;
      values?: Record<string, FieldValue>;
    }) => {
      const { data, error } = await supabase
        .from("experiments")
        .insert({
          paper_id,
          label: label ?? "New experiment",
          position: position ?? 0,
          values: (values ?? emptyValues()) as any,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["experiments"] }),
  });
}

export function useUpdateExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<Experiment> }) => {
      const { error } = await supabase.from("experiments").update(patch as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["experiments"] }),
  });
}

export function useDeleteExperiment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("experiments").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["experiments"] }),
  });
}

// Apply new `values` to many experiments at once (bulk edit).
export function useBulkUpdateExperiments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (updates: { id: string; values: Record<string, FieldValue> }[]) => {
      for (const u of updates) {
        const { error } = await supabase
          .from("experiments")
          .update({ values: u.values } as any)
          .eq("id", u.id);
        if (error) throw error;
      }
      return updates.length;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["experiments"] }),
  });
}

export interface ImportPaperInput {
  category_name: string | null;
  author: string;
  year: number | null;
  title: string;
  doi: string;
  notes: string;
  summary: string;
  experiments: { label: string; values: Record<string, FieldValue> }[];
}

// Bulk import parsed papers + experiments, creating any missing categories.
export function useImportData() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (papersInput: ImportPaperInput[]) => {
      // Resolve / create categories by name.
      const { data: existingCats } = await supabase.from("material_categories").select("*");
      const catByName = new Map<string, string>(
        (existingCats || []).map((c: any) => [c.name.toLowerCase(), c.id]),
      );
      const neededNames = Array.from(
        new Set(
          papersInput
            .map((p) => p.category_name?.trim())
            .filter((n): n is string => !!n && !catByName.has(n.toLowerCase())),
        ),
      );
      let sort = (existingCats?.length ?? 0) * 10 + 10;
      for (const name of neededNames) {
        const { data, error } = await supabase
          .from("material_categories")
          .insert({ name, sort_order: sort } as any)
          .select()
          .single();
        if (error) throw error;
        catByName.set(name.toLowerCase(), data.id);
        sort += 10;
      }

      let paperCount = 0;
      let expCount = 0;
      for (const p of papersInput) {
        const category_id = p.category_name
          ? (catByName.get(p.category_name.toLowerCase()) ?? null)
          : null;
        const citation_key =
          p.author && p.year ? `${p.author.split(/[\s,]+/)[0]} ${p.year}` : p.author || "Untitled";
        const { data: paperRow, error: pErr } = await supabase
          .from("papers")
          .insert({
            category_id,
            author: p.author,
            year: p.year,
            title: p.title,
            doi: p.doi,
            notes: p.notes,
            summary: p.summary,
            citation_key,
          } as any)
          .select()
          .single();
        if (pErr) throw pErr;
        paperCount++;

        const exps = p.experiments.length
          ? p.experiments
          : [{ label: "Experiment 1", values: emptyValues() }];
        const rows = exps.map((e, i) => ({
          paper_id: paperRow.id,
          label: e.label || `Experiment ${i + 1}`,
          position: i,
          values: e.values as any,
        }));
        const { error: eErr } = await supabase.from("experiments").insert(rows as any);
        if (eErr) throw eErr;
        expCount += rows.length;
      }
      return { papers: paperCount, experiments: expCount, categories: neededNames.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["papers"] });
      qc.invalidateQueries({ queryKey: ["experiments"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
    },
  });
}
