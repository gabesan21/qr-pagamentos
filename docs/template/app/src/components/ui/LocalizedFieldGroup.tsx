import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { LocalizedText } from "@/mock/types";

/**
 * Two-tab bilingual field group (design.md §5): PT-BR / EN tabs with per-tab completeness dot.
 * Renders one input (or textarea) per tab bound to a LocalizedText value.
 */
export function LocalizedFieldGroup({
  label,
  value,
  onChange,
  multiline = false,
  required = false,
  id,
}: {
  label: string;
  value: LocalizedText;
  onChange: (v: LocalizedText) => void;
  multiline?: boolean;
  required?: boolean;
  id: string;
}) {
  const tabs = ["pt-BR", "en"] as const;
  const [tab, setTab] = useState<(typeof tabs)[number]>("pt-BR");

  const complete = (l: (typeof tabs)[number]) => value[l].trim().length > 0;

  const fieldId = `${id}-${tab}`;
  const shared = cn(
    "w-full rounded-md border border-border bg-surface px-3 text-sm text-text placeholder:text-text-3",
    "focus:border-accent focus:outline-none focus:ring-[3px] focus:ring-[var(--ring-color)]",
    multiline ? "min-h-24 py-2.5" : "h-10",
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <label htmlFor={fieldId} className="text-[13px] font-medium text-text">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
        <div role="tablist" className="flex gap-1 rounded-md bg-surface-2 p-0.5">
          {tabs.map((l) => (
            <button
              key={l}
              role="tab"
              aria-selected={tab === l}
              type="button"
              onClick={() => setTab(l)}
              className={cn(
                "relative flex items-center gap-1.5 rounded px-2 py-1 text-[11px] font-semibold uppercase",
                tab === l ? "bg-surface text-text shadow-card" : "text-text-3 hover:text-text-2",
              )}
            >
              {l === "pt-BR" ? "PT-BR" : "EN"}
              <span className={cn("size-1.5 rounded-full", complete(l) ? "bg-success" : "bg-text-3")} aria-hidden />
            </button>
          ))}
        </div>
      </div>
      <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.12 }} className="mt-1.5">
        {multiline ? (
          <textarea
            id={fieldId}
            className={shared}
            value={value[tab]}
            onChange={(e) => onChange({ ...value, [tab]: e.target.value })}
          />
        ) : (
          <input
            id={fieldId}
            className={shared}
            value={value[tab]}
            onChange={(e) => onChange({ ...value, [tab]: e.target.value })}
          />
        )}
      </motion.div>
    </div>
  );
}
