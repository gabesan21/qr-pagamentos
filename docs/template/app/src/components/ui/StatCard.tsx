import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Stat card: small label, display/money-lg value, optional delta chip or sparkline (design.md §7). */
export function StatCard({
  label,
  value,
  delta,
  deltaDirection,
  caption,
  sparkline,
  index = 0,
  className,
}: {
  label: string;
  value: ReactNode;
  delta?: string;
  deltaDirection?: "up" | "down";
  caption?: string;
  sparkline?: number[];
  index?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
      className={cn("rounded-card border border-border bg-surface p-5 shadow-card", className)}
    >
      <div className="text-xs font-medium text-text-2">{label}</div>
      <div className="mt-1.5 font-display text-[22px] leading-7 font-semibold text-text">{value}</div>
      <div className="mt-1.5 flex items-center gap-2">
        {delta && (
          <span
            className={cn(
              "rounded-pill px-2 py-0.5 text-xs font-medium",
              deltaDirection === "down" ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
            )}
          >
            {deltaDirection === "down" ? "▼" : "▲"} {delta}
          </span>
        )}
        {caption && <span className="text-xs text-text-3">{caption}</span>}
        {sparkline && sparkline.length > 1 && <Sparkline points={sparkline} />}
      </div>
    </motion.div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 96;
  const h = 40;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const d = points
    .map((p, i) => `${(i / (points.length - 1)) * w},${h - 4 - ((p - min) / range) * (h - 8)}`)
    .join(" ");
  return (
    <svg width={w} height={h} className="ml-auto" aria-hidden>
      <polyline points={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
