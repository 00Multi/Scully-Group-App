import { useEffect } from "react";

// Collapse every run of whitespace — newlines, tabs, indentation, and repeated
// spaces — into a single space, then trim the ends. This is what strips the
// line breaks and stray indentation that come with text copied out of a PDF.
export function collapseWhitespace(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// Text-like fields we normalise on paste. Number inputs are skipped (they never
// carry newlines and don't support execCommand insertion); password/date/etc.
// are left alone.
const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "email", "tel", ""]);

function isTextField(el: EventTarget | null): el is HTMLInputElement | HTMLTextAreaElement {
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  if (el instanceof HTMLInputElement) {
    const type = (el.type || "text").toLowerCase();
    return TEXT_INPUT_TYPES.has(type) && !el.readOnly && !el.disabled;
  }
  return false;
}

// Insert plain text at the caret in a way that keeps a React controlled input's
// onChange in sync. execCommand fires a real input event (the happy path in
// Chrome); the fallback splices the value and dispatches one manually.
function insertText(el: HTMLInputElement | HTMLTextAreaElement, text: string): void {
  let ok = false;
  try {
    ok = document.execCommand("insertText", false, text);
  } catch {
    ok = false;
  }
  if (ok) return;

  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? el.value.length;
  const next = el.value.slice(0, start) + text + el.value.slice(end);
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setter) return;
  setter.call(el, next);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  const caret = start + text.length;
  try {
    el.setSelectionRange(caret, caret);
  } catch {
    /* some input types disallow setSelectionRange */
  }
}

// Install a global paste handler that collapses whitespace in any text field.
// Pasting an abstract or a block of PDF text lands as a single clean line
// instead of carrying its original line breaks and indentation.
export function useCollapsePasteWhitespace(): void {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const el = e.target;
      if (!isTextField(el)) return;
      const raw = e.clipboardData?.getData("text");
      if (!raw) return;
      const cleaned = collapseWhitespace(raw);
      // Nothing to normalise — let the browser's own paste run untouched.
      if (cleaned === raw) return;
      e.preventDefault();
      insertText(el, cleaned);
    };
    document.addEventListener("paste", onPaste, true);
    return () => document.removeEventListener("paste", onPaste, true);
  }, []);
}
