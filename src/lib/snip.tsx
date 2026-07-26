import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

// Coordinates the in-app "snip" flow: an image field row requests a capture,
// the PDF viewer becomes a selection surface, and the captured PNG is handed
// back to the requester. Kept in context so the two components (which live in
// different panes of the Browse layout) can talk without prop-drilling.

type CaptureHandler = (blob: Blob) => void | Promise<void>;

interface SnipCtx {
  // True while the viewer should act as a selection surface.
  active: boolean;
  // Human-readable description of what we're capturing for (shown in the viewer).
  label: string | null;
  // An image field row calls this to start a capture.
  request: (label: string, onCapture: CaptureHandler) => void;
  // The PDF viewer calls this with the cropped PNG blob.
  capture: (blob: Blob) => Promise<void>;
  // Cancel without capturing.
  cancel: () => void;
}

const Ctx = createContext<SnipCtx | null>(null);

export function SnipProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState(false);
  const [label, setLabel] = useState<string | null>(null);
  const handlerRef = useRef<CaptureHandler | null>(null);

  const request = useCallback((lbl: string, onCapture: CaptureHandler) => {
    handlerRef.current = onCapture;
    setLabel(lbl);
    setActive(true);
  }, []);

  const cancel = useCallback(() => {
    handlerRef.current = null;
    setLabel(null);
    setActive(false);
  }, []);

  const capture = useCallback(async (blob: Blob) => {
    const h = handlerRef.current;
    handlerRef.current = null;
    setActive(false);
    setLabel(null);
    if (h) await h(blob);
  }, []);

  const value = useMemo<SnipCtx>(
    () => ({ active, label, request, capture, cancel }),
    [active, label, request, capture, cancel],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSnip() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSnip must be used inside <SnipProvider>");
  return v;
}
