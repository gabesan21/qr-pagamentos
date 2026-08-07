import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastKind = "success" | "error" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  onRetry?: () => void;
}

interface ToastContextValue {
  toast: (kind: ToastKind, message: string, opts?: { onRetry?: () => void; retryLabel?: string }) => void;
  /** Localized retry label for sticky error toasts. */
  retryLabel?: string;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const icons: Record<ToastKind, ReactNode> = {
  success: <CheckCircle2 className="size-4 text-success" aria-hidden />,
  error: <AlertCircle className="size-4 text-danger" aria-hidden />,
  info: <Info className="size-4 text-info" aria-hidden />,
};

export function ToastProvider({ children, retryLabel = "Retry" }: { children: ReactNode; retryLabel?: string }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback<ToastContextValue["toast"]>(
    (kind, message, opts) => {
      const id = ++idRef.current;
      setToasts((ts) => [...ts.slice(-3), { id, kind, message, onRetry: opts?.onRetry }]);
      // success auto-dismisses after 5s; errors stay sticky
      if (kind !== "error") {
        setTimeout(() => dismiss(id), 5000);
      }
    },
    [dismiss],
  );

  const value = useMemo(() => ({ toast, retryLabel }), [toast, retryLabel]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-80 flex-col gap-2" aria-live="polite">
        <AnimatePresence>
          {toasts.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 24 }}
              transition={{ duration: 0.18 }}
              className={cn(
                "pointer-events-auto flex items-start gap-2.5 rounded-card border border-border bg-surface p-3 shadow-card",
              )}
            >
              <span className="mt-0.5 shrink-0">{icons[item.kind]}</span>
              <p className="min-w-0 flex-1 text-sm text-text">{item.message}</p>
              {item.onRetry && (
                <button
                  type="button"
                  onClick={() => {
                    item.onRetry?.();
                    dismiss(item.id);
                  }}
                  className="shrink-0 text-xs font-medium text-accent hover:underline"
                >
                  {retryLabel}
                </button>
              )}
              <button
                type="button"
                onClick={() => dismiss(item.id)}
                aria-label="Dismiss"
                className="shrink-0 rounded p-0.5 text-text-3 hover:text-text"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
