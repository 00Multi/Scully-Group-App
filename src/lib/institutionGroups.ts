// Institution grouping: the same institution is often written slightly
// differently across papers ("MIT", "Massachusetts Institute of Technology").
// The user can group those variants under a shorthand, tied to a country. The
// groups are shared via a single Supabase row so everyone sees the same merges.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface InstitutionGroup {
  id: string;
  shorthand: string;
  country?: { code: string; name: string };
  members: string[]; // institution names, matched case-insensitively
}

const ROW_ID = "default";

// The generated Supabase types don't include the app_institution_groups table
// yet, so access it through a minimal loosely-typed shim (no `any`).
interface GroupsTableClient {
  from: (table: "app_institution_groups") => {
    select: (cols: string) => {
      eq: (
        col: string,
        val: string,
      ) => {
        maybeSingle: () => Promise<{ data: { groups?: unknown } | null; error: unknown }>;
      };
    };
    upsert: (row: { id: string; groups: unknown; updated_at: string }) => Promise<{
      error: unknown;
    }>;
  };
}
const db = supabase as unknown as GroupsTableClient;

function isGroup(x: unknown): x is InstitutionGroup {
  const g = x as InstitutionGroup;
  return (
    !!g && typeof g.id === "string" && typeof g.shorthand === "string" && Array.isArray(g.members)
  );
}

export function useInstitutionGroups() {
  return useQuery({
    queryKey: ["institution_groups"],
    queryFn: async (): Promise<InstitutionGroup[]> => {
      const { data, error } = await db
        .from("app_institution_groups")
        .select("groups")
        .eq("id", ROW_ID)
        .maybeSingle();
      if (error) throw error;
      const raw = (data?.groups ?? []) as unknown;
      return Array.isArray(raw) ? raw.filter(isGroup) : [];
    },
  });
}

export function useSaveInstitutionGroups() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (groups: InstitutionGroup[]) => {
      const { error } = await db.from("app_institution_groups").upsert({
        id: ROW_ID,
        groups,
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["institution_groups"] }),
  });
}

// Index each member name → the group it belongs to (first match wins).
export function groupByMember(groups: InstitutionGroup[]): Map<string, InstitutionGroup> {
  const m = new Map<string, InstitutionGroup>();
  for (const g of groups) {
    for (const name of g.members) {
      const key = name.trim().toLowerCase();
      if (key && !m.has(key)) m.set(key, g);
    }
  }
  return m;
}
