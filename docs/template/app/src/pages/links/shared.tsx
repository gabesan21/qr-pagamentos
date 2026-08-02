import { Link } from "react-router";
import { ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Simple token-styled breadcrumb (Links → #id → …). */
export function LinksBreadcrumb({ items }: { items: Array<{ label: string; to?: string; mono?: boolean }> }) {
  return (
    <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-text-3">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="size-3" aria-hidden />}
          {item.to ? (
            <Link to={item.to} className={cn("hover:text-text-2 hover:underline", item.mono && "font-money")}>
              {item.label}
            </Link>
          ) : (
            <span className={cn("text-text-2", item.mono && "font-money")}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Stacked form/preview section card. */
export function SectionCard({
  title,
  children,
  index = 0,
  className,
}: {
  title?: string;
  children: ReactNode;
  index?: number;
  className?: string;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      className={cn("rounded-card border border-border bg-surface p-5 shadow-card", className)}
    >
      {title && <h2 className="mb-4 font-display text-[15px] leading-[22px] font-semibold text-text">{title}</h2>}
      {children}
    </motion.section>
  );
}

/** Currency-pair chip (BRL / PIX). */
export function PairChip({ label = "BRL / PIX" }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-pill bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-text-2">
      {label}
    </span>
  );
}

/** Page-level error notice with retry. */
export function ErrorNotice({ message, retryLabel, onRetry }: { message: string; retryLabel: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-6 py-12 text-center shadow-card">
      <p className="text-sm text-text-2">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="h-9 rounded-md border border-border bg-surface-2 px-4 text-sm font-medium text-text hover:bg-border"
      >
        {retryLabel}
      </button>
    </div>
  );
}

const labelCls = "text-[13px] font-medium text-text";
const inputCls =
  "h-10 w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-3 focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)] disabled:bg-surface-2 disabled:text-text-3";

export const formCls = { label: labelCls, input: inputCls };
