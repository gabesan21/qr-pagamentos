import type { ReactNode } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type StatCardProps = Readonly<{
  caption?: string;
  className?: string;
  label: string;
  trend?: Readonly<{ direction: "down" | "up"; label: string }>;
  value: ReactNode;
}>;

export function StatCard({ caption, className, label, trend, value }: StatCardProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-heading text-[length:var(--type-stat)] leading-7 font-semibold">{value}</CardTitle>
      </CardHeader>
      {trend || caption ? (
        <CardContent className="flex flex-wrap items-center gap-2">
          {trend ? (
            <StatusBadge
              icon={trend.direction === "down" ? ArrowDownIcon : ArrowUpIcon}
              label={trend.label}
              tone={trend.direction === "down" ? "danger" : "success"}
            />
          ) : null}
          {caption ? <span className="text-xs text-muted-foreground">{caption}</span> : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
