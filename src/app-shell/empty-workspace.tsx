import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function EmptyWorkspace({
  description,
  title,
}: Readonly<{ description: string; title: string }>) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="app-shell__empty-marker" role="status">
          <span aria-hidden="true">—</span> {description}
        </p>
      </CardContent>
    </Card>
  );
}
