// ISO 3166-1 country list + flag helpers. Flags are rendered as emoji derived
// from the two-letter code (regional indicator symbols), so no images/network
// are needed. Country codes are stored lowercased to match the ROR institution
// country codes used elsewhere.

export interface Country {
  code: string; // ISO 3166-1 alpha-2, lowercase
  name: string;
}

// Regional-indicator flag emoji for a two-letter country code.
export function flagEmoji(code: string): string {
  const cc = (code || "").trim().toUpperCase();
  if (cc.length !== 2 || !/^[A-Z]{2}$/.test(cc)) return "🏳️";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// A pragmatic list of countries/territories. Names are the common short form.
export const COUNTRIES: Country[] = [
  ["af", "Afghanistan"],
  ["al", "Albania"],
  ["dz", "Algeria"],
  ["ad", "Andorra"],
  ["ao", "Angola"],
  ["ar", "Argentina"],
  ["am", "Armenia"],
  ["au", "Australia"],
  ["at", "Austria"],
  ["az", "Azerbaijan"],
  ["bh", "Bahrain"],
  ["bd", "Bangladesh"],
  ["by", "Belarus"],
  ["be", "Belgium"],
  ["bj", "Benin"],
  ["bo", "Bolivia"],
  ["ba", "Bosnia and Herzegovina"],
  ["bw", "Botswana"],
  ["br", "Brazil"],
  ["bn", "Brunei"],
  ["bg", "Bulgaria"],
  ["bf", "Burkina Faso"],
  ["kh", "Cambodia"],
  ["cm", "Cameroon"],
  ["ca", "Canada"],
  ["cl", "Chile"],
  ["cn", "China"],
  ["co", "Colombia"],
  ["cr", "Costa Rica"],
  ["hr", "Croatia"],
  ["cu", "Cuba"],
  ["cy", "Cyprus"],
  ["cz", "Czechia"],
  ["cd", "DR Congo"],
  ["dk", "Denmark"],
  ["do", "Dominican Republic"],
  ["ec", "Ecuador"],
  ["eg", "Egypt"],
  ["sv", "El Salvador"],
  ["ee", "Estonia"],
  ["et", "Ethiopia"],
  ["fi", "Finland"],
  ["fr", "France"],
  ["ge", "Georgia"],
  ["de", "Germany"],
  ["gh", "Ghana"],
  ["gr", "Greece"],
  ["gt", "Guatemala"],
  ["hn", "Honduras"],
  ["hk", "Hong Kong"],
  ["hu", "Hungary"],
  ["is", "Iceland"],
  ["in", "India"],
  ["id", "Indonesia"],
  ["ir", "Iran"],
  ["iq", "Iraq"],
  ["ie", "Ireland"],
  ["il", "Israel"],
  ["it", "Italy"],
  ["ci", "Ivory Coast"],
  ["jm", "Jamaica"],
  ["jp", "Japan"],
  ["jo", "Jordan"],
  ["kz", "Kazakhstan"],
  ["ke", "Kenya"],
  ["kw", "Kuwait"],
  ["kg", "Kyrgyzstan"],
  ["la", "Laos"],
  ["lv", "Latvia"],
  ["lb", "Lebanon"],
  ["ly", "Libya"],
  ["lt", "Lithuania"],
  ["lu", "Luxembourg"],
  ["mo", "Macau"],
  ["mg", "Madagascar"],
  ["my", "Malaysia"],
  ["mt", "Malta"],
  ["mx", "Mexico"],
  ["md", "Moldova"],
  ["mc", "Monaco"],
  ["mn", "Mongolia"],
  ["me", "Montenegro"],
  ["ma", "Morocco"],
  ["mz", "Mozambique"],
  ["mm", "Myanmar"],
  ["np", "Nepal"],
  ["nl", "Netherlands"],
  ["nz", "New Zealand"],
  ["ni", "Nicaragua"],
  ["ng", "Nigeria"],
  ["kp", "North Korea"],
  ["mk", "North Macedonia"],
  ["no", "Norway"],
  ["om", "Oman"],
  ["pk", "Pakistan"],
  ["pa", "Panama"],
  ["py", "Paraguay"],
  ["pe", "Peru"],
  ["ph", "Philippines"],
  ["pl", "Poland"],
  ["pt", "Portugal"],
  ["qa", "Qatar"],
  ["cg", "Republic of the Congo"],
  ["ro", "Romania"],
  ["ru", "Russia"],
  ["rw", "Rwanda"],
  ["sa", "Saudi Arabia"],
  ["sn", "Senegal"],
  ["rs", "Serbia"],
  ["sg", "Singapore"],
  ["sk", "Slovakia"],
  ["si", "Slovenia"],
  ["so", "Somalia"],
  ["za", "South Africa"],
  ["kr", "South Korea"],
  ["es", "Spain"],
  ["lk", "Sri Lanka"],
  ["sd", "Sudan"],
  ["se", "Sweden"],
  ["ch", "Switzerland"],
  ["sy", "Syria"],
  ["tw", "Taiwan"],
  ["tj", "Tajikistan"],
  ["tz", "Tanzania"],
  ["th", "Thailand"],
  ["tn", "Tunisia"],
  ["tr", "Turkey"],
  ["tm", "Turkmenistan"],
  ["ug", "Uganda"],
  ["ua", "Ukraine"],
  ["ae", "United Arab Emirates"],
  ["gb", "United Kingdom"],
  ["us", "United States"],
  ["uy", "Uruguay"],
  ["uz", "Uzbekistan"],
  ["ve", "Venezuela"],
  ["vn", "Vietnam"],
  ["ye", "Yemen"],
  ["zm", "Zambia"],
  ["zw", "Zimbabwe"],
].map(([code, name]) => ({ code, name }));

const BY_CODE = new Map(COUNTRIES.map((c) => [c.code, c]));
export function countryName(code: string): string {
  return BY_CODE.get((code || "").toLowerCase())?.name ?? code.toUpperCase();
}

// A country stored on a paper.
export interface PaperCountry {
  code: string;
  name: string;
}

// Read the (possibly multiple) countries tagged on a paper from paper.meta.
export function readPaperCountries(
  meta: Record<string, unknown> | null | undefined,
): PaperCountry[] {
  const raw = (meta as { countries?: unknown })?.countries;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      const o = c as { code?: unknown; name?: unknown };
      const code = typeof o.code === "string" ? o.code.toLowerCase() : "";
      if (!code) return null;
      return { code, name: typeof o.name === "string" && o.name ? o.name : countryName(code) };
    })
    .filter((c): c is PaperCountry => c !== null);
}
