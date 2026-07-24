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
  created_at: string;
  updated_at: string;
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
      return data as Paper[];
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
      const { error } = await supabase.from("papers").update(patch).eq("id", id);
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
