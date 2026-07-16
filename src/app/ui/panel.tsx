import type { ReactNode } from "react";

type PanelProps = {
  children: ReactNode;
  title: string;
};

export function Panel({ children, title }: Readonly<PanelProps>) {
  return <section aria-labelledby={`${title}-title`} className="panel"><h2 id={`${title}-title`}>{title}</h2>{children}</section>;
}
