// Field definitions for the corrosion literature review database.
//
// The default schema below is the seed. At runtime the schema is editable
// (see src/lib/settings.tsx): columns (field groups) and data points (fields)
// can be added, renamed, and deleted, and the live schema is persisted in the
// browser. Consumers should read the live schema via the settings hooks
// (useFieldDefs / useFieldsByGroup / useSchema) rather than the constants here.
//
// The constants (DEFAULT_GROUPS, DEFAULT_FIELDS, DEFAULT_SCHEMA) remain the
// single source of truth for the initial state and for "reset to defaults".

// A column ("group") id. Kept as a free string so new columns can be added.
export type FieldGroup = string;
export type FieldType = "number" | "text" | "select" | "image";
export type FieldState = "filled" | "missing" | "na" | "needs_check";

export interface GroupDef {
  id: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  group: FieldGroup;
  type: FieldType;
  unit?: string;
  definition: string;
  options?: string[]; // suggested values (free-text fallback for select)
}

export interface Schema {
  groups: GroupDef[];
  fields: FieldDef[];
}

export const DEFAULT_GROUPS: GroupDef[] = [
  { id: "physical", label: "Physical" },
  { id: "chemical", label: "Chemical" },
  { id: "material", label: "Material" },
];

export const DEFAULT_FIELDS: FieldDef[] = [
  // Physical
  {
    key: "temp_c",
    label: "Temp",
    group: "physical",
    type: "number",
    unit: "°C",
    definition: "Temperature of the molten salt during the test.",
  },
  {
    key: "time_h",
    label: "Time",
    group: "physical",
    type: "number",
    unit: "h",
    definition: "Duration of immersion.",
  },
  {
    key: "flow_static",
    label: "F/S",
    group: "physical",
    type: "select",
    definition: "Flowing salt, static salt, or both.",
    options: ["Flowing", "Static", "Both"],
  },
  {
    key: "stress",
    label: "Stress",
    group: "physical",
    type: "text",
    definition:
      "Is there a force applied to the electrode during the test, if so how much? Is it constant?",
  },
  {
    key: "orientation",
    label: "Ortn",
    group: "physical",
    type: "text",
    definition: "Orientation of grains on the electrode surface before immersion.",
  },
  {
    key: "depth_um",
    label: "Depth",
    group: "physical",
    type: "number",
    unit: "µm",
    definition: "Depth of corrosion.",
  },
  {
    key: "ngba",
    label: "NGBA",
    group: "physical",
    type: "number",
    definition:
      'Number of grain boundaries attacked. Relevant for IGC only — how many "segments" are connected in one group.',
  },
  {
    key: "branch",
    label: "Branch",
    group: "physical",
    type: "select",
    definition: "Did the IGC branch off into two or more grain boundaries at one node? (y/n)",
    options: ["y", "n"],
  },
  {
    key: "corrosion_image",
    label: "Corrosion Image",
    group: "physical",
    type: "image",
    definition:
      "Micrograph or figure showing the corrosion attack for this experiment. Capture a region from the PDF with the snip tool, or upload an image.",
  },
  // Chemical
  {
    key: "salt",
    label: "Salt",
    group: "chemical",
    type: "select",
    definition: "Molten salt composition used in the test (e.g. FLiNaK, FLiBe, NaCl-MgCl2).",
    options: ["FLiNaK", "FLiBe", "LiF-NaF-KF", "NaCl-MgCl2", "KCl-MgCl2", "LiCl-KCl", "NaF-ZrF4"],
  },
  {
    key: "atmosphere",
    label: "Atmosphere",
    group: "chemical",
    type: "select",
    definition: "Cover gas / atmosphere above the salt during the test.",
    options: ["Ar", "Ar-H2", "Air", "N2", "He", "Vacuum"],
  },
  {
    key: "impurities",
    label: "Impurities",
    group: "chemical",
    type: "text",
    definition:
      "Reported salt impurities (oxygen, moisture, HF, metal cations, etc.) with concentration if given.",
  },
  {
    key: "crucible",
    label: "Crucible",
    group: "chemical",
    type: "select",
    definition: "Container material holding the salt during the test.",
    options: ["Ni", "Graphite", "Alumina", "Quartz", "SS316", "Glassy carbon", "Mo"],
  },
  // Chemical — electrochemical conditions (carried over from the spreadsheet's
  // "Electrochemical Conditions" column).
  {
    key: "mcep",
    label: "MCEP",
    group: "chemical",
    type: "select",
    definition:
      "Method of Controlling Electrode Potential (e.g. Impurity Ctrl, Dissimilar Metal Ctrl, or Potentiostat Ctrl).",
    options: ["Impurity Ctrl", "Dissimilar Metal Ctrl", "Potentiostat Ctrl", "N/A"],
  },
  {
    key: "ptl_pol",
    label: "Ptl. Pol.",
    group: "chemical",
    type: "select",
    definition: "Was the potential polarized (y/n), or held at open-circuit potential (OCP)?",
    options: ["y", "n", "OCP"],
  },
  // Material
  {
    key: "alloy",
    label: "Alloy",
    group: "material",
    type: "select",
    definition:
      "Alloy tested, ideally by common designation (e.g. Inconel 625, Hastelloy N, Ni-20Cr).",
    options: [
      "Inconel 625",
      "Inconel 718",
      "Hastelloy N",
      "Hastelloy C-276",
      "Ni-20Cr",
      "Ni-Cr binary",
      "SS316",
      "SS304",
      "Incoloy 800H",
      "Pure Ni",
    ],
  },
  {
    key: "morphology",
    label: "Morphology",
    group: "material",
    type: "text",
    definition:
      "Reported morphology of the attack (uniform, intergranular, pitting, subsurface voids, etc.).",
  },
  {
    key: "grain_size_um",
    label: "Grain size",
    group: "material",
    type: "number",
    unit: "µm",
    definition: "Average grain size of the tested material in micrometres.",
  },
  {
    key: "cold_work",
    label: "Cold work",
    group: "material",
    type: "text",
    definition: "Cold work state or percent reduction, if reported.",
  },
  {
    key: "fabrication",
    label: "Fabrication",
    group: "material",
    type: "text",
    definition:
      "Fabrication route of the sample (wrought, cast, additively manufactured, rolled, etc.).",
  },
  {
    key: "polish",
    label: "Polish",
    group: "material",
    type: "text",
    definition:
      "Surface preparation before the test (final grit, electropolish, as-received, etc.).",
  },
];

export const DEFAULT_SCHEMA: Schema = {
  groups: DEFAULT_GROUPS,
  fields: DEFAULT_FIELDS,
};

// Backwards-compatible aliases. Prefer the live schema via settings hooks.
export const FIELD_DEFS = DEFAULT_FIELDS;

export function fieldsByGroup(schema: Schema): Record<string, FieldDef[]> {
  const out: Record<string, FieldDef[]> = {};
  for (const g of schema.groups) out[g.id] = [];
  for (const f of schema.fields) {
    (out[f.group] ??= []).push(f);
  }
  return out;
}

export const STATE_LABELS: Record<FieldState, string> = {
  filled: "Filled",
  missing: "Missing",
  na: "N/A",
  needs_check: "Needs check",
};

export interface FieldValue {
  value: string | number | null;
  state: FieldState;
  note?: string;
}

export function emptyValues(fields: FieldDef[] = DEFAULT_FIELDS): Record<string, FieldValue> {
  const out: Record<string, FieldValue> = {};
  for (const f of fields) out[f.key] = { value: null, state: "missing" };
  return out;
}

// Return stored values verbatim (never drop anything). Fields absent from the
// stored object are treated as Missing by consumers, which iterate the live
// schema and fall back per-field. This keeps dynamically-added fields working
// without a migration.
export function withDefaults(
  values: Record<string, FieldValue> | null | undefined,
): Record<string, FieldValue> {
  return values ? { ...values } : {};
}

// A blank value used when an experiment has no stored entry for a field yet.
export const MISSING_VALUE: FieldValue = { value: null, state: "missing" };
