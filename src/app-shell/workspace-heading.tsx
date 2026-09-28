import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function WorkspaceHeading({
  className,
  description,
  eyebrow,
  title,
}: Readonly<{ className?: string; description: string; eyebrow: string; title: ReactNode }>) {
  return (
    <header className={cn("workspace-heading", className)}>
      <span className="workspace-heading__eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
