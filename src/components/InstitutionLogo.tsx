import { useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import type { Institution } from "@/lib/ror";

// Show an institution's logo, falling back to its country flag, then a generic
// icon. Logos come from Clearbit (by website domain); flags from flagcdn.
export function InstitutionLogo({ inst, size = 18 }: { inst: Institution; size?: number }) {
  const sources: string[] = [];
  if (inst.domain) sources.push(`https://logo.clearbit.com/${inst.domain}?size=64`);
  if (inst.countryCode) sources.push(`https://flagcdn.com/48x36/${inst.countryCode}.png`);

  const [idx, setIdx] = useState(0);

  // Reset to the first (best) source when the institution changes.
  useEffect(() => {
    setIdx(0);
  }, [inst.domain, inst.countryCode]);

  const src = sources[idx];
  const rounded = idx === 0 && inst.domain; // logos square-ish, flags rectangular

  if (!src) {
    return (
      <Building2
        className="text-muted-foreground shrink-0"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      onError={() => setIdx((i) => i + 1)}
      className={"shrink-0 object-contain " + (rounded ? "rounded-sm" : "rounded-[2px]")}
      style={{ width: size, height: size }}
      title={inst.countryName || inst.name}
    />
  );
}
