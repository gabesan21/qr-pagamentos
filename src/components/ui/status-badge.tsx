import type { ComponentType, SVGProps } from "react";
import {
  ArchiveIcon,
  CheckIcon,
  CircleIcon,
  InfoIcon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type StatusTone = "danger" | "info" | "neutral" | "success" | "warning";
type StatusIcon = ComponentType<SVGProps<SVGSVGElement>>;

const toneClasses: Readonly<Record<StatusTone, string>> = {
  danger: "bg-destructive text-destructive-foreground",
  info: "bg-[var(--feedback-info)] text-[var(--color-feedback-info-foreground)]",
  neutral: "bg-secondary text-secondary-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
};

const toneIcons: Readonly<Record<StatusTone, StatusIcon>> = {
  danger: XIcon,
  info: InfoIcon,
  neutral: CircleIcon,
  success: CheckIcon,
  warning: TriangleAlertIcon,
};

type StatusBadgeProps = Readonly<{
  archived?: boolean;
  className?: string;
  icon?: StatusIcon;
  label: string;
  tone?: StatusTone;
}>;

export function StatusBadge({ archived = false, className, icon, label, tone = "neutral" }: StatusBadgeProps) {
  const Icon = archived ? ArchiveIcon : (icon ?? toneIcons[tone]);
  return (
    <Badge className={cn(toneClasses[tone], className)}>
      <Icon aria-hidden data-icon="inline-start" />
      <span className={cn(archived && "line-through")}>{label}</span>
    </Badge>
  );
}
