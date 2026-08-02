import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";
import { Button } from "./button";

/** Focus-trapped modal with overlay (design.md §7). Esc closes unless `disableDismiss`. */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 480,
  disableDismiss = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  disableDismiss?: boolean;
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !disableDismiss) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, disableDismiss]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.12 }}
          role="dialog"
          aria-modal="true"
          aria-label={title}
        >
          <div className="absolute inset-0 bg-black/50" onClick={disableDismiss ? undefined : onClose} />
          <motion.div
            className="relative w-full rounded-card border border-border bg-surface p-6 shadow-modal"
            style={{ maxWidth: width }}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.14 }}
          >
            <div className="flex items-start justify-between gap-4">
              <h2 className="font-display text-lg leading-[26px] font-semibold text-text">{title}</h2>
              {!disableDismiss && (
                <button
                  type="button"
                  onClick={onClose}
                  aria-label={t("common.close")}
                  className="rounded-md p-1 text-text-3 hover:bg-surface-2 hover:text-text"
                >
                  <X className="size-4" aria-hidden />
                </button>
              )}
            </div>
            <div className="mt-4">{children}</div>
            {footer && <div className="mt-6 flex items-center justify-end gap-3">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Destructive-action confirmation: danger right, cancel left; optional type-to-confirm. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  destructive = true,
  requireText,
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  requireText?: string;
  loading?: boolean;
}) {
  const { t } = useI18n();
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (open) setTyped("");
  }, [open]);
  const blocked = requireText ? typed !== requireText : false;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            {t("common.cancel")}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={onConfirm}
            disabled={blocked || loading}
          >
            {loading ? t("common.loading") : confirmLabel ?? t("common.confirm")}
          </Button>
        </>
      }
    >
      <div className="text-sm text-text-2">{body}</div>
      {requireText && (
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={requireText}
          className={cn(
            "mt-4 h-10 w-full rounded-md border border-border bg-transparent px-3 font-money text-sm text-text",
            "focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)]",
          )}
        />
      )}
    </Modal>
  );
}
