import type { ReactNode } from "react";

export function WorkspaceHeading({
  description,
  eyebrow,
  title,
}: Readonly<{ description: string; eyebrow: string; title: ReactNode }>) {
  return (
    <header className="workspace-heading">
      <span className="workspace-heading__eyebrow">{eyebrow}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
