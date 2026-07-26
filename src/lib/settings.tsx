import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [schema, setSchema] = useState<Schema>(() => cloneDefaultSchema());
  const [theme, setThemeState] = useState<Theme>("light");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setSchema(loadSchema());
    setThemeState(loadTheme());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(LS_SCHEMA, JSON.stringify(schema));
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
