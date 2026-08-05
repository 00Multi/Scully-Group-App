import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import {
  DEFAULT_SCHEMA,
  fieldsByGroup as computeFieldsByGroup,
  type FieldDef,
  type FieldType,
  type GroupDef,
  type Schema,
} from "./fields";

// ---------- Live, user-editable schema ----------
//
// The schema (columns + data points) is persisted in localStorage so a single
// user can shape the database to their spreadsheet without a backend migration.
// Columns are field groups; data points are fields.

const LS_SCHEMA = "corrosion.schema.v2";
const LS_THEME = "corrosion.theme.v1";

type Theme = "light" | "dark";

export interface NewFieldInput {
  label?: string;
  type?: FieldType;
  unit?: string;
  definition?: string;
  options?: string[];
}

interface SettingsCtx {
  schema: Schema;
  groups: GroupDef[];
  fieldDefs: FieldDef[];
  fieldsByGroup: Record<string, FieldDef[]>;

  // Data points (fields)
  addField: (groupId: string, input?: NewFieldInput) => string;
  // Merge fully-formed fields (used by the importer) keeping their keys;
  // fields whose key or group already exists are skipped / their group ensured.
  addImportedFields: (fields: FieldDef[]) => void;
  updateField: (key: string, patch: Partial<FieldDef>) => void;
  deleteField: (key: string) => void;
  // Reorder a data point to sit just before another (drives the viewer order).
  moveField: (dragKey: string, overKey: string) => void;

  // Columns (groups)
  addGroup: (label?: string) => string;
  renameGroup: (id: string, label: string) => void;
  deleteGroup: (id: string) => void;

  resetSchema: () => void;

  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
}

function uniqueKey(base: string, taken: Set<string>): string {
  const root = base || "field";
  if (!taken.has(root)) return root;
  let i = 2;
  while (taken.has(`${root}_${i}`)) i++;
  return `${root}_${i}`;
}

function cloneDefaultSchema(): Schema {
  return {
    groups: DEFAULT_SCHEMA.groups.map((g) => ({ ...g })),
    fields: DEFAULT_SCHEMA.fields.map((f) => ({
      ...f,
      options: f.options ? [...f.options] : undefined,
    })),
  };
}

function isValidSchema(x: unknown): x is Schema {
  if (!x || typeof x !== "object") return false;
  const s = x as Schema;
  return Array.isArray(s.groups) && Array.isArray(s.fields);
}

function loadSchema(): Schema {
  if (typeof window === "undefined") return cloneDefaultSchema();
  try {
    const raw = window.localStorage.getItem(LS_SCHEMA);
    if (!raw) return cloneDefaultSchema();
    const parsed = JSON.parse(raw);
    return isValidSchema(parsed) ? parsed : cloneDefaultSchema();
  } catch {
    return cloneDefaultSchema();
  }
}

function loadTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const t = window.localStorage.getItem(LS_THEME);
  if (t === "dark" || t === "light") return t;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// The schema is shared across all browsers/deploys via a single Supabase row, so
// custom labels, definitions, and dropdown options survive a fresh deployment.
// localStorage remains a fast cache and offline fallback.
const SCHEMA_ROW_ID = "default";

async function fetchRemoteSchema(): Promise<Schema | null> {
  const { data, error } = await supabase
    .from("app_schema")
    .select("schema")
    .eq("id", SCHEMA_ROW_ID)
    .maybeSingle();
  if (error) throw error;
  const raw = data?.schema;
  return raw && isValidSchema(raw) ? (raw as Schema) : null;
}

async function saveRemoteSchema(schema: Schema): Promise<boolean> {
  const { error } = await supabase.from("app_schema").upsert({
    id: SCHEMA_ROW_ID,
    schema: schema as unknown as Json,
    updated_at: new Date().toISOString(),
  });
  return !error;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [schema, setSchema] = useState<Schema>(() => cloneDefaultSchema());
  const [theme, setThemeState] = useState<Theme>("light");
  const [hydrated, setHydrated] = useState(false);

  // JSON of the schema last known to match the Supabase row, so we don't echo a
  // just-loaded value back, and a flag that the initial remote load has run (so
  // we never push the local/default schema before reading the shared one).
  const remoteSyncedRef = useRef<string | null>(null);
  const remoteLoadedRef = useRef(false);

  useEffect(() => {
    // 1. Instant paint from the local cache (also the offline fallback).
    const local = loadSchema();
    setSchema(local);
    setThemeState(loadTheme());
    setHydrated(true);

    // 2. Reconcile with the shared schema in Supabase.
    let cancelled = false;
    const defaultJson = JSON.stringify(cloneDefaultSchema());
    const localJson = JSON.stringify(local);
    const localIsCustom = localJson !== defaultJson;

    const applyRemote = (remote: Schema) => {
      const json = JSON.stringify(remote);
      remoteSyncedRef.current = json;
      setSchema(remote);
      try {
        window.localStorage.setItem(LS_SCHEMA, json);
      } catch {
        /* ignore quota errors */
      }
    };
    const pushLocal = async () => {
      if (await saveRemoteSchema(local)) remoteSyncedRef.current = localJson;
    };

    (async () => {
      try {
        const remote = await fetchRemoteSchema();
        if (cancelled) return;
        if (remote) {
          const remoteIsCustom = JSON.stringify(remote) !== defaultJson;
          // Prefer the shared schema, EXCEPT when it's still the default while
          // this browser holds real customizations — then our edits win and are
          // pushed up, so a default seed can't wipe out existing custom labels,
          // definitions, or dropdown options.
          if (remoteIsCustom || !localIsCustom) applyRemote(remote);
          else await pushLocal();
        } else {
          // No shared schema yet — seed it from whatever this browser has.
          await pushLocal();
        }
      } catch {
        /* offline or unreachable — keep the local cache */
      } finally {
        remoteLoadedRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const json = JSON.stringify(schema);
    try {
      window.localStorage.setItem(LS_SCHEMA, json);
    } catch {
      /* ignore quota errors */
    }
    // Push edits to the shared row (debounced), but only after the initial
    // remote load, and only when the value actually differs from the remote.
    if (!remoteLoadedRef.current || json === remoteSyncedRef.current) return;
    const t = setTimeout(() => {
      void saveRemoteSchema(schema).then((ok) => {
        if (ok) remoteSyncedRef.current = json;
      });
    }, 600);
    return () => clearTimeout(t);
  }, [schema, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("dark");
    else root.classList.remove("dark");
    window.localStorage.setItem(LS_THEME, theme);
  }, [theme, hydrated]);

  const value = useMemo<SettingsCtx>(() => {
    const groups = schema.groups;
    const fieldDefs = schema.fields;
    const byGroup = computeFieldsByGroup(schema);

    const addField: SettingsCtx["addField"] = (groupId, input = {}) => {
      const label = input.label?.trim() || "New field";
      let newKey = "";
      setSchema((prev) => {
        const taken = new Set(prev.fields.map((f) => f.key));
        newKey = uniqueKey(slugify(label), taken);
        const field: FieldDef = {
          key: newKey,
          label,
          group: groupId,
          type: input.type ?? "text",
          definition: input.definition ?? "",
          ...(input.unit ? { unit: input.unit } : {}),
          ...(input.options && input.options.length ? { options: input.options } : {}),
        };
        return { ...prev, fields: [...prev.fields, field] };
      });
      return newKey;
    };

    const addImportedFields: SettingsCtx["addImportedFields"] = (incoming) => {
      if (!incoming.length) return;
      setSchema((prev) => {
        const haveKeys = new Set(prev.fields.map((f) => f.key));
        const haveGroups = new Set(prev.groups.map((g) => g.id));
        const toAdd = incoming.filter((f) => !haveKeys.has(f.key));
        if (toAdd.length === 0) return prev;
        // Make sure each new field's group exists as a column.
        const missingGroups = Array.from(new Set(toAdd.map((f) => f.group)))
          .filter((g) => !haveGroups.has(g))
          .map((g) => ({ id: g, label: g.charAt(0).toUpperCase() + g.slice(1) }));
        return {
          groups: [...prev.groups, ...missingGroups],
          fields: [...prev.fields, ...toAdd],
        };
      });
    };

    const updateField: SettingsCtx["updateField"] = (key, patch) => {
      setSchema((prev) => ({
        ...prev,
        fields: prev.fields.map((f) => {
          if (f.key !== key) return f;
          const next: FieldDef = { ...f, ...patch };
          // Normalize empty unit / options to absent.
          if (next.unit !== undefined && next.unit.trim() === "") delete next.unit;
          if (next.options && next.options.length === 0) delete next.options;
          return next;
        }),
      }));
    };

    const deleteField: SettingsCtx["deleteField"] = (key) => {
      setSchema((prev) => ({ ...prev, fields: prev.fields.filter((f) => f.key !== key) }));
    };

    const moveField: SettingsCtx["moveField"] = (dragKey, overKey) => {
      if (dragKey === overKey) return;
      setSchema((prev) => {
        const fields = [...prev.fields];
        const from = fields.findIndex((f) => f.key === dragKey);
        if (from < 0) return prev;
        const [moved] = fields.splice(from, 1);
        const to = fields.findIndex((f) => f.key === overKey);
        if (to < 0) return prev;
        fields.splice(to, 0, moved);
        return { ...prev, fields };
      });
    };

    const addGroup: SettingsCtx["addGroup"] = (label) => {
      const name = label?.trim() || "New column";
      let newId = "";
      setSchema((prev) => {
        const taken = new Set(prev.groups.map((g) => g.id));
        newId = uniqueKey(slugify(name) || "column", taken);
        return { ...prev, groups: [...prev.groups, { id: newId, label: name }] };
      });
      return newId;
    };

    const renameGroup: SettingsCtx["renameGroup"] = (id, label) => {
      setSchema((prev) => ({
        ...prev,
        groups: prev.groups.map((g) => (g.id === id ? { ...g, label } : g)),
      }));
    };

    const deleteGroup: SettingsCtx["deleteGroup"] = (id) => {
      setSchema((prev) => ({
        groups: prev.groups.filter((g) => g.id !== id),
        // Drop the column's data points too.
        fields: prev.fields.filter((f) => f.group !== id),
      }));
    };

    const resetSchema: SettingsCtx["resetSchema"] = () => setSchema(cloneDefaultSchema());

    return {
      schema,
      groups,
      fieldDefs,
      fieldsByGroup: byGroup,
      addField,
      addImportedFields,
      updateField,
      deleteField,
      moveField,
      addGroup,
      renameGroup,
      deleteGroup,
      resetSchema,
      theme,
      setTheme: setThemeState,
      toggleTheme: () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    };
  }, [schema, theme]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSettings must be used inside <SettingsProvider>");
  return v;
}

export function useSchema() {
  return useSettings().schema;
}
export function useFieldDefs() {
  return useSettings().fieldDefs;
}
export function useFieldsByGroup() {
  return useSettings().fieldsByGroup;
}
export function useGroups() {
  return useSettings().groups;
}
