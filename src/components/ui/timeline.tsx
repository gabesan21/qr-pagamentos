import type { ComponentType, SVGProps } from "react";
import { CheckIcon, CircleIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type TimelineTone = "danger" | "default" | "info" | "success";

export type TimelineEntry = Readonly<{
  body?: string;
  dateTime?: string;
  formattedAt: string;
  id: string;
  title: string;
  tone?: TimelineTone;
}>;

type TimelineIcon = ComponentType<SVGProps<SVGSVGElement>>;

const toneIcons: Readonly<Record<TimelineTone, TimelineIcon>> = {
  danger: TriangleAlertIcon,
  default: CircleIcon,
  info: InfoIcon,
  success: CheckIcon,
};

const toneClasses: Readonly<Record<TimelineTone, string>> = {
  danger: "bg-destructive text-destructive-foreground",
  default: "bg-secondary text-secondary-foreground",
  info: "bg-[var(--feedback-info)] text-[var(--text-on-info)]",
  success: "bg-success text-success-foreground",
};

export function Timeline({ className, entries }: Readonly<{ className?: string; entries: readonly TimelineEntry[] }>) {
  return (
    <ol className={cn("flex flex-col", className)}>
      {entries.map((entry, index) => {
        const tone = entry.tone ?? "default";
        const Icon = toneIcons[tone];
        return (
          <li className="relative grid grid-cols-[auto_1fr] gap-x-3 pb-5 last:pb-0" key={entry.id}>
            {index < entries.length - 1 ? <span aria-hidden className="absolute bottom-0 left-4 top-8 w-px bg-border" /> : null}
            <span className={cn("relative grid size-8 place-items-center rounded-full", toneClasses[tone])}>
              <Icon aria-hidden className="size-4" />
            </span>
            <div className="min-w-0">
              <p className="font-medium">{entry.title}</p>
              {entry.body ? <p className="mt-1 max-w-prose text-sm text-muted-foreground">{entry.body}</p> : null}
              <time className="mt-1 block font-mono text-xs text-muted-foreground tabular-nums" dateTime={entry.dateTime}>
                {entry.formattedAt}
              </time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
