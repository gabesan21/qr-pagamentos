import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <main aria-busy="true" className="admin-shell">
      <header className="receipt-rail"><span className="receipt-rail__label">QR Pagamentos / admin</span><h1>Carregando / Loading</h1></header>
      <Card>
        <CardHeader><CardTitle>Contas administrativas / Administrator accounts</CardTitle><CardDescription>Carregando dados protegidos / Loading protected data</CardDescription></CardHeader>
        <CardContent><div className="admin-skeletons"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div></CardContent>
      </Card>
    </main>
  );
}
