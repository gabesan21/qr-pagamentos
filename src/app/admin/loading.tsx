import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { en } from "@/i18n/dictionaries/en";
import { ptBR } from "@/i18n/dictionaries/pt-BR";

export default function AdminLoading() {
  return (
    <main aria-busy="true" className="admin-shell">
      <header className="receipt-rail"><span className="receipt-rail__label">QR Pagamentos / admin</span><h1>{ptBR.adminLoadingHeading} / {en.adminLoadingHeading}</h1></header>
      <Card>
        <CardHeader><CardTitle>{ptBR.adminUsersHeading} / {en.adminUsersHeading}</CardTitle><CardDescription>{ptBR.adminLoadingDescription} / {en.adminLoadingDescription}</CardDescription></CardHeader>
        <CardContent><div className="admin-skeletons"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div></CardContent>
      </Card>
    </main>
  );
}
