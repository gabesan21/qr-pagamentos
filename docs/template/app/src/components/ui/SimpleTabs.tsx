import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface SimpleTab {
  id: string;
  label: string;
  count?: number;
}

/** Underline tabs with 2px accent indicator + layoutId slide (design.md §7). */
export function SimpleTabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: SimpleTab[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex gap-1 border-b border-border", className)}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={selected}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "relative px-3 py-2 text-sm font-medium transition-colors",
              selected ? "text-text" : "text-text-3 hover:text-text-2",
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1.5 rounded-pill bg-surface-2 px-1.5 py-0.5 text-xs text-text-2">{tab.count}</span>
            )}
            {selected && (
              <motion.span
                layoutId="simple-tabs-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 bg-accent"
                transition={{ duration: 0.18 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
