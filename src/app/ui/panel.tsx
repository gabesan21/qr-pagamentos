import { useId, type ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type PanelProps = { children: ReactNode; title: string };

/** @deprecated Migrate consumers to Card composition in task 1.4.4. */
export function Panel({ children, title }: Readonly<PanelProps>) {
  const titleId = useId();
  return <Card aria-labelledby={titleId} role="region">
    <CardHeader><CardTitle id={titleId}>{title}</CardTitle></CardHeader>
    <CardContent className="flex flex-col gap-4">{children}</CardContent>
  </Card>;
}
