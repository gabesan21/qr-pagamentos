import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n";

export interface TimelineEntry {
  id: string;
  title: string;
  body?: string;
  at: string | Date;
  tone?: "default" | "success" | "danger" | "info";
}

const dotTone: Record<NonNullable<TimelineEntry["tone"]>, string> = {
  default: "bg-text-3",
  success: "bg-success",
  danger: "bg-danger",
  info: "bg-info",
};

/** Vertical event timeline (order history, comments). */
export function Timeline({ entries, className }: { entries: TimelineEntry[]; className?: string }) {
  const { formatDateTime } = useI18n();
  return (
    <ol className={cn("relative space-y-5 border-l border-border pl-5", className)}>
      {entries.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={cn("absolute -left-[26px] top-1.5 size-2.5 rounded-full border-2 border-surface", dotTone[e.tone ?? "default"])}
            aria-hidden
          />
          <div className="text-sm font-medium text-text">{e.title}</div>
          {e.body && <p className="mt-0.5 text-sm text-text-2">{e.body}</p>}
          <time className="mt-0.5 block font-money text-xs text-text-3">{formatDateTime(e.at)}</time>
        </li>
      ))}
    </ol>
  );
}
