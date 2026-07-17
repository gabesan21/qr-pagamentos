import type { ReactNode } from "react";
import { AlertCircleIcon, CheckCircle2Icon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

type StatusProps = { children: ReactNode; label: string; tone: "success" | "warning" | "danger" };
const icons = { success: CheckCircle2Icon, warning: TriangleAlertIcon, danger: AlertCircleIcon } as const;

/** @deprecated Migrate consumers to Alert/Badge composition in tasks 1.4.3/1.4.4. */
export function Status({ children, label, tone }: Readonly<StatusProps>) {
  const Icon = icons[tone];
  return <Alert data-ds-status data-variant={tone} variant={tone === "danger" ? "destructive" : tone}>
    <Icon aria-hidden="true" data-ds-status-cue />
    <AlertTitle>{label}</AlertTitle>
    <AlertDescription>{children}</AlertDescription>
  </Alert>;
}
