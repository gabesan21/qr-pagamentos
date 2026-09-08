import type { ReactNode } from "react";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";

type StatCardProps = Readonly<{
  caption?: string;
  className?: string;
  label: string;
  sparkline?: readonly number[];
  trend?: Readonly<{ direction: "down" | "up"; label: string }>;
  value: ReactNode;
}>;

const SPARKLINE_WIDTH = 96;
const SPARKLINE_HEIGHT = 32;

/** Trend-only decoration: aria-hidden, no motion library, no entrance animation. */
function Sparkline({ points }: { points: readonly number[] }) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  const path = points
    .map((point, index) => `${(index / (points.length - 1)) * SPARKLINE_WIDTH},${SPARKLINE_HEIGHT - ((point - min) / range) * SPARKLINE_HEIGHT}`)
    .join(" ");

  return (
    <svg aria-hidden="true" className="ml-auto text-accent" height={SPARKLINE_HEIGHT} viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`} width={SPARKLINE_WIDTH}>
      <polyline fill="none" points={path} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </svg>
  );
}

export function StatCard({ caption, className, label, sparkline, trend, value }: StatCardProps) {
  const hasSparkline = (sparkline?.length ?? 0) > 1;
  return (
    <Card className={className}>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="font-mono text-[length:var(--type-stat)] leading-7 font-semibold tabular-nums">{value}</CardTitle>
      </CardHeader>
      {trend || caption || hasSparkline ? (
        <CardContent className="flex flex-wrap items-center gap-2">
          {trend ? (
            <StatusBadge
              icon={trend.direction === "down" ? ArrowDownIcon : ArrowUpIcon}
              label={trend.label}
              tone={trend.direction === "down" ? "danger" : "success"}
            />
          ) : null}
          {caption ? <span className="text-xs text-muted-foreground">{caption}</span> : null}
          {hasSparkline && sparkline ? <Sparkline points={sparkline} /> : null}
        </CardContent>
      ) : null}
    </Card>
  );
}
