import { useEffect, useRef, type TextareaHTMLAttributes } from "react";

// A textarea that grows to fit its content and re-fits when its width changes
// (so wrapped text never gets clipped). By default it also lets the user drag
// the resize handle and remembers that height as a floor. Pass `autoOnly` to
// disable manual resizing entirely — pure auto-fit, no handle.
export function AutoTextarea({
  value,
  className,
  style,
  onInput,
  autoOnly,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { autoOnly?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const manual = useRef(false); // has the user dragged the handle?
  const manualHeight = useRef(0); // the height they dragged to (a floor)
  const lastAutoHeight = useRef(0); // last height WE applied (to detect drags)

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    const prev = el.style.height;
    el.style.height = "auto";
    const needed = el.scrollHeight;
    el.style.height = prev;
    const target = !autoOnly && manual.current ? Math.max(manualHeight.current, needed) : needed;
    el.style.height = `${target}px`;
    lastAutoHeight.current = el.offsetHeight;
  };

  // Re-fit whenever the controlled value changes.
  useEffect(() => {
    fit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  // Re-fit on width changes (reflow); optionally detect manual height drags.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    fit();
    let lastWidth = el.offsetWidth;
    const ro = new ResizeObserver(() => {
      const w = el.offsetWidth;
      if (w !== lastWidth) {
        lastWidth = w;
        fit();
        return;
      }
      if (!autoOnly) {
        const h = el.offsetHeight;
        if (Math.abs(h - lastAutoHeight.current) > 1) {
          manual.current = true;
          manualHeight.current = h;
          lastAutoHeight.current = h;
        }
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOnly]);

  return (
    <textarea
      ref={ref}
      value={value}
      onInput={(e) => {
        fit();
        onInput?.(e);
      }}
      className={className}
      style={{ resize: autoOnly ? "none" : "vertical", overflow: "hidden", ...style }}
      {...rest}
    />
  );
}
