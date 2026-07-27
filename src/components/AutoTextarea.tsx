import { useEffect, useRef, type TextareaHTMLAttributes } from "react";

// A textarea that grows to fit its content, and — once the user drags the
// resize handle — remembers that manual height and never shrinks below it.
// It still grows past a manual height if the text needs more room, so user
// input is never hidden.
export function AutoTextarea({
  value,
  className,
  style,
  onInput,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const manual = useRef(false); // has the user dragged the handle?
  const manualHeight = useRef(0); // the height they dragged to (a floor)
  const lastAutoHeight = useRef(0); // last height WE applied (to detect drags)

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    // Measure the content height with the box collapsed.
    const prev = el.style.height;
    el.style.height = "auto";
    const needed = el.scrollHeight;
    el.style.height = prev;
    const target = manual.current ? Math.max(manualHeight.current, needed) : needed;
    el.style.height = `${target}px`;
    lastAutoHeight.current = el.offsetHeight;
  };

  // Re-fit whenever the controlled value changes.
  useEffect(() => {
    fit();
  }, [value]);

  // Detect manual drags: any height change we didn't apply becomes the new floor.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    fit();
    const ro = new ResizeObserver(() => {
      const h = el.offsetHeight;
      if (Math.abs(h - lastAutoHeight.current) > 1) {
        manual.current = true;
        manualHeight.current = h;
        lastAutoHeight.current = h;
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      onInput={(e) => {
        fit();
        onInput?.(e);
      }}
      className={className}
      style={{ resize: "vertical", overflow: "hidden", ...style }}
      {...rest}
    />
  );
}
