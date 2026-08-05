import { useEffect, useMemo, useRef, useState } from "react";
import { COUNTRIES, flagEmoji } from "@/lib/countries";

// Single-select, typeable country picker. The user can type the country name to
// filter, or type a name freely; committing a name not in the list stores it
// without a flag/code. Used when tagging an institution group with a country.
export function CountryCombobox({
  value,
  onChange,
  placeholder = "Country…",
}: {
  value: { code: string; name: string } | null;
  onChange: (c: { code: string; name: string } | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState(value?.name ?? "");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // Reflect an externally-cleared value (e.g. after creating a group).
  useEffect(() => {
    setQuery(value?.name ?? "");
  }, [value?.code, value?.name]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!q) return COUNTRIES.slice(0, 60);
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code === q).slice(0, 40);
  }, [q]);

  const pick = (c: { code: string; name: string }) => {
    onChange(c);
    setQuery(c.name);
    setOpen(false);
  };
  // Commit whatever is typed: an exact list match keeps its code+flag,
  // otherwise the free text is stored as a code-less country.
  const commitTyped = () => {
    const typed = query.trim();
    if (!typed) {
      onChange(null);
      return;
    }
    const exact = COUNTRIES.find((c) => c.name.toLowerCase() === typed.toLowerCase());
    onChange(exact ?? { code: "", name: typed });
    setOpen(false);
  };

  return (
    <div ref={boxRef} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (results[0] && q) pick(results[0]);
            else commitTyped();
          }
        }}
        onBlur={commitTyped}
        placeholder={placeholder}
        className="bg-background border border-input rounded px-2 py-1 text-xs w-44 focus:outline-none focus:border-primary"
        aria-label="Group country"
      />
      {value?.code && !open && (
        <span
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-sm"
          aria-hidden
        >
          {flagEmoji(value.code)}
        </span>
      )}
      {open && (
        <div className="absolute z-40 mt-1 w-56 max-h-64 overflow-auto rounded-md border border-rule bg-card shadow-lg text-sm">
          {results.map((c) => (
            <button
              key={c.code}
              onClick={() => pick(c)}
              className="flex items-center gap-2 w-full text-left px-2 py-1.5 hover:bg-accent"
            >
              <span aria-hidden>{flagEmoji(c.code)}</span>
              <span className="truncate flex-1">{c.name}</span>
              <span className="text-[10px] text-muted-foreground uppercase">{c.code}</span>
            </button>
          ))}
          {results.length === 0 && (
            <button
              onClick={commitTyped}
              className="w-full text-left px-2 py-1.5 hover:bg-accent text-muted-foreground"
            >
              Use “{query.trim()}” as typed
            </button>
          )}
        </div>
      )}
    </div>
  );
}
