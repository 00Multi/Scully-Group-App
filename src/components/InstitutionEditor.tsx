import { useEffect, useRef, useState } from "react";
import type { Paper } from "@/lib/db";
import { useUpdatePaper } from "@/lib/db";
import {
  institutionsToString,
  readInstitutionRefs,
  searchInstitutions,
  type Institution,
} from "@/lib/ror";
import { InstitutionLogo } from "./InstitutionLogo";
import { Loader2, Plus, X } from "lucide-react";

export function InstitutionEditor({ paper }: { paper: Paper }) {
  const update = useUpdatePaper();
  const [list, setList] = useState<Institution[]>(() => readInstitutionRefs(paper));
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Institution[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Resync when the paper changes externally (switching papers, or a DOI
  // prefill writing paper.institution) — but not from our own commits.
  useEffect(() => {
    if ((paper.institution ?? "") !== institutionsToString(list)) {
      setList(readInstitutionRefs(paper));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper.id, paper.institution]);

  // Debounced ROR search as the user types.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchInstitutions(q, ctrl.signal)
        .then((r) => {
          setResults(r);
          setErr(null);
        })
        .catch((e) => {
          if (e?.name !== "AbortError") setErr("Couldn't reach the institution directory.");
        })
        .finally(() => setSearching(false));
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [query]);

  // Close the dropdown on an outside click.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const commit = (next: Institution[]) => {
    setList(next);
    update.mutate({
      id: paper.id,
      patch: {
        institution: institutionsToString(next),
        meta: { ...(paper.meta ?? {}), institutions: next },
      } as Partial<Paper>,
    });
  };

  const add = (inst: Institution) => {
    if (!list.some((i) => i.name.toLowerCase() === inst.name.toLowerCase())) {
      commit([...list, inst]);
    }
    setQuery("");
    setResults([]);
    setOpen(false);
  };
  const addFreeText = () => {
    const n = query.trim();
    if (n) add({ name: n });
  };
  const remove = (name: string) => commit(list.filter((i) => i.name !== name));

  const q = query.trim();

  return (
    <div ref={boxRef} className="relative mt-1">
      {list.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-1.5">
          {list.map((inst) => (
            <span
              key={inst.name}
              className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-muted/40 pl-1 pr-1.5 py-0.5 text-xs max-w-full"
              title={inst.countryName ? `${inst.name} · ${inst.countryName}` : inst.name}
            >
              <InstitutionLogo inst={inst} />
              <span className="truncate">{inst.name}</span>
              <button
                onClick={() => remove(inst.name)}
                className="text-muted-foreground hover:text-destructive shrink-0"
                aria-label={`Remove ${inst.name}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="relative">
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
              if (results[0]) add(results[0]);
              else addFreeText();
            }
          }}
          placeholder={list.length ? "Add another institution…" : "Search for an institution…"}
          className="w-full bg-transparent border-b border-input focus:border-primary focus:outline-none text-sm py-1 pr-5"
          aria-label="Search institutions"
        />
        {searching && (
          <Loader2 className="absolute right-0.5 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-muted-foreground" />
        )}

        {open && q.length >= 2 && (
          <div className="absolute z-30 mt-1 w-full max-h-64 overflow-auto rounded-md border border-rule bg-card shadow-lg text-sm">
            {results.map((r) => (
              <button
                key={r.rorId || r.name}
                onClick={() => add(r)}
                className="flex items-center gap-2 w-full text-left px-2 py-1.5 hover:bg-accent"
              >
                <InstitutionLogo inst={r} />
                <span className="truncate flex-1">{r.name}</span>
                {r.countryName && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {r.countryName}
                  </span>
                )}
              </button>
            ))}
            {!searching && results.length === 0 && !err && (
              <div className="px-2 py-1.5 text-[11px] text-muted-foreground">No matches found.</div>
            )}
            <button
              onClick={addFreeText}
              className="flex items-center gap-2 w-full text-left px-2 py-1.5 hover:bg-accent border-t border-rule/60 text-muted-foreground"
            >
              <Plus className="h-3.5 w-3.5" /> Add “{q}” as typed
            </button>
            {err && <div className="px-2 py-1.5 text-[11px] text-destructive">{err}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
