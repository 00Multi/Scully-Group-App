import { useEffect, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

// A Trends section with a collapsible header. The open/closed state is
// remembered per section id in localStorage so navigation stays tidy.
export function CollapsibleSection({
  id,
  title,
  right,
  children,
}: {
  id: string;
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const key = `trends.collapse.${id}`;
  const [open, setOpen] = useState(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(key) === "0") setOpen(false);
    } catch {
      /* ignore */
    }
  }, [key]);

  const toggle = () =>
    setOpen((o) => {
      const next = !o;
      try {
        window.localStorage.setItem(key, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <button
          onClick={toggle}
          className="flex items-center gap-2 text-left"
          aria-expanded={open}
          title={open ? "Hide section" : "Show section"}
        >
          <ChevronRight
            className={
              "h-4 w-4 text-muted-foreground transition-transform " + (open ? "rotate-90" : "")
            }
          />
          <h2 className="text-2xl font-serif italic">{title}</h2>
        </button>
        {open && right}
      </div>
      {open && children}
    </section>
  );
}
