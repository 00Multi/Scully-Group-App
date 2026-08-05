import { useEffect, useMemo, useRef, useState } from "react";
import type { Paper } from "@/lib/db";
import { useUpdatePaper } from "@/lib/db";
import { COUNTRIES, flagEmoji, readPaperCountries, type PaperCountry } from "@/lib/countries";
import { X } from "lucide-react";

// Multi-select of countries a paper is from, stored on paper.meta.countries.
// Type to search; each entry shows the country flag. One paper can have several.
export function CountryEditor({ paper }: { paper: Paper }) {
  const update = useUpdatePaper();
  const [list, setList] = useState<PaperCountry[]>(() => readPaperCountries(paper.meta));
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setList(readPaperCountries(paper.meta));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.id]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const commit = (next: PaperCountry[]) => {
    setList(next);
    update.mutate({
      id: paper.id,
      patch: { meta: { ...(paper.meta ?? {}), countries: next } } as Partial<Paper>,
    });
  };

  const has = (code: string) => list.some((c) => c.code === code);
  const add = (code: string, name: string) => {
    if (!has(code)) commit([...list, { code, name }]);
    setQuery("");
    setOpen(false);
  };
  const remove = (code: string) => commit(list.filter((c) => c.code !== code));

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    const base = COUNTRIES.filter((c) => !has(c.code));
    if (!q) return base.slice(0, 60);
    return base.filter((c) => c.name.toLowerCase().includes(q) || c.code === q).slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, list]);

  return (
    <div ref={boxRef} className="relative mt-1">
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {list.map((c) => (
            <span
              key={c.code}
              className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-muted/40 pl-2 pr-1.5 py-0.5 text-xs"
              title={c.name}
            >
              <span aria-hidden>{flagEmoji(c.code)}</span>
              <span className="truncate">{c.name}</span>
              <button
                onClick={() => remove(c.code)}
                className="text-muted-foreground hover:text-destructive shrink-0"
                aria-label={`Remove ${c.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) {
            e.preventDefault();
            add(results[0].code, results[0].name);
          }
        }}
        placeholder={list.length ? "Add another country…" : "Search for a country…"}
        className="w-full bg-transparent border-b border-input focus:border-primary focus:outline-none text-sm py-1"
        aria-label="Search countries"
      />

      {open && (
        <div className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-md border border-rule bg-card shadow-lg text-sm">
          {results.map((c) => (
            <button
              key={c.code}
              onClick={() => add(c.code, c.name)}
              className="flex items-center gap-2 w-full text-left px-2 py-1.5 hover:bg-accent"
            >
              <span aria-hidden>{flagEmoji(c.code)}</span>
              <span className="truncate flex-1">{c.name}</span>
              <span className="text-[10px] text-muted-foreground uppercase">{c.code}</span>
            </button>
          ))}
          {results.length === 0 && (
            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">No countries match.</div>
          )}
        </div>
      )}
    </div>
  );
}
