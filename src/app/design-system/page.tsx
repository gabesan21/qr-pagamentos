import { cookies } from "next/headers";
import { CheckCircle2Icon, CircleIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { EmptyState } from "@/components/ui/empty-state";
import { MoneyText } from "@/components/ui/money-text";
import { Monogram } from "@/components/ui/monogram";
import { QrDisplay } from "@/components/ui/qr-display";
import { Separator } from "@/components/ui/separator";
import { CardSkeleton, CheckoutSkeleton, DetailSkeleton, StatGridSkeleton, TableSkeleton } from "@/components/ui/skeletons";
import { Spinner } from "@/components/ui/spinner";
import { StatCard } from "@/components/ui/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Timeline } from "@/components/ui/timeline";
import { getDictionary } from "@/i18n/dictionaries";
import { localeFromPreferenceCookie, localePreferenceCookieName } from "@/i18n/locales";
import { DataDirectorySpecimen } from "@/data-directory/ui/specimen";

import { DesignSystemInteractiveSpecimens } from "./interactive-specimens";
import { designSystemCoverage } from "./coverage";

const themes = [
  ["pix-paper", "light"], ["cashier-daylight", "light"], ["settlement-sand", "light"],
  ["midnight-clearing", "dark"], ["vault-blue", "dark"], ["terminal-amber", "dark"],
] as const;

function Section({ children, description, id, title }: Readonly<{ children: React.ReactNode; description: string; id: string; title: string }>) {
  return <section aria-labelledby={id} className="ds-section" data-ds-section={id}>
    <div className="ds-section__heading"><h2 id={id}>{title}</h2><p data-ds-prose>{description}</p></div>
    {children}
  </section>;
}

export default async function DesignSystemPage() {
  const requestCookies = await cookies();
  const locale = localeFromPreferenceCookie(requestCookies.get(localePreferenceCookieName)?.value);
  const dictionary = getDictionary(locale);

  return <main className="ds-ledger" data-design-system-locale={locale}>
    <header className="receipt-rail">
      <span className="receipt-rail__label">QR Pagamentos / shared specimen</span>
      <h1>{dictionary.designSystemHeading}</h1>
      <div className="receipt-rail__facts ds-facts"><span>application-frontend-system</span><span>Inter · Sora · IBM Plex Mono</span><span>{dictionary.designSystemRole}</span></div>
    </header>
    <p className="admin-shell__intro" data-ds-prose>{dictionary.designSystemIntroduction}</p>

    <Section id="themes" title={dictionary.designSystemThemesHeading} description={dictionary.designSystemThemesDescription}>
      <div className="ds-row">{themes.map(([id, mode]) => <Badge data-theme-id={id} key={id} variant="outline">{id} · {mode === "light" ? dictionary.designSystemLight : dictionary.designSystemDark}</Badge>)}</div>
    </Section>

    <Section id="feedback" title={dictionary.designSystemFeedbackHeading} description={dictionary.designSystemFeedbackDescription}>
      <div className="grid gap-3 md:grid-cols-2">
        <Alert variant="success"><CheckCircle2Icon aria-hidden /><AlertTitle>{dictionary.designSystemSuccess}</AlertTitle><AlertDescription>{dictionary.designSystemSuccessDescription}</AlertDescription></Alert>
        <Alert variant="warning"><TriangleAlertIcon aria-hidden /><AlertTitle>{dictionary.designSystemWarning}</AlertTitle><AlertDescription>{dictionary.designSystemWarningDescription}</AlertDescription></Alert>
        <Alert variant="destructive"><TriangleAlertIcon aria-hidden /><AlertTitle>{dictionary.designSystemError}</AlertTitle><AlertDescription>{dictionary.designSystemErrorDescription}</AlertDescription></Alert>
        <Alert><InfoIcon aria-hidden /><AlertTitle>{dictionary.designSystemInfo}</AlertTitle><AlertDescription>{dictionary.designSystemInfoDescription}</AlertDescription></Alert>
      </div>
    </Section>

    <Section id="display" title={dictionary.designSystemDisplayHeading} description={dictionary.designSystemDisplayDescription}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card data-specimen-owner="card"><CardHeader><CardTitle>{dictionary.designSystemCardTitle}</CardTitle><CardDescription>{dictionary.designSystemCardDescription}</CardDescription><CardAction><Badge variant="outline">{dictionary.designSystemReady}</Badge></CardAction></CardHeader><CardContent>{dictionary.designSystemCardBody}</CardContent><CardFooter>{dictionary.designSystemCardFooter}</CardFooter></Card>
        <StatCard caption={dictionary.designSystemStatCaption} label={dictionary.designSystemStatLabel} trend={{ direction: "up", label: dictionary.designSystemStatTrend }} value={<MoneyText pairLabel="BRL" value="128,40" />} />
        <Card><CardHeader><CardTitle>{dictionary.designSystemIdentityHeading}</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center gap-4"><Avatar size="lg"><AvatarImage alt="" src="/application-assets/avatar-default.svg" /><AvatarFallback>QP</AvatarFallback><AvatarBadge><CircleIcon aria-hidden /></AvatarBadge></Avatar><AvatarGroup><Avatar><AvatarFallback>QR</AvatarFallback></Avatar><Avatar><AvatarFallback>PX</AvatarFallback></Avatar><AvatarGroupCount>+2</AvatarGroupCount></AvatarGroup><Monogram accessibleName={dictionary.designSystemMonogramName} name="QR Pagamentos" /><Monogram name="Settlement desk" size="sm" /></CardContent></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <QrDisplay alternativeLabel={dictionary.designSystemQrAlternativeLabel} alternativeValue="00020126580014br.gov.bcb.pix0136fixture-redacted-payload" caption={dictionary.designSystemQrCaption} graphic={<span className="grid size-full grid-cols-5 gap-1 p-3" aria-hidden>{Array.from({ length: 25 }, (_, index) => <span className={index % 3 === 0 ? "bg-foreground" : "bg-muted"} key={index} />)}</span>} graphicLabel={dictionary.designSystemQrLabel} />
        <Timeline entries={[{ id: "prepared", title: dictionary.designSystemTimelinePrepared, formattedAt: "2026-08-03 09:30 BRT", tone: "info" }, { id: "confirmed", title: dictionary.designSystemTimelineConfirmed, formattedAt: "2026-08-03 09:31 BRT", tone: "success" }, { id: "review", title: dictionary.designSystemTimelineReview, formattedAt: "2026-08-03 09:32 BRT", tone: "danger" }]} />
      </div>
      <div className="ds-row"><StatusBadge label={dictionary.designSystemSuccess} tone="success" /><StatusBadge label={dictionary.designSystemWarning} tone="warning" /><StatusBadge label={dictionary.designSystemDanger} tone="danger" /><StatusBadge archived label={dictionary.designSystemArchived} /></div>
    </Section>

    <Section id="empty-states" title={dictionary.designSystemEmptyHeading} description={dictionary.designSystemEmptyDescription}>
      <div className="grid gap-4 lg:grid-cols-2"><EmptyState body={dictionary.designSystemEmptyBody} illustration="orders" title={dictionary.designSystemEmpty} /><EmptyState body={dictionary.designSystemFilteredBody} illustration="links" kind="filtered-empty" title={dictionary.designSystemFiltered} /><EmptyState body={dictionary.designSystemUnavailableBody} illustration="unavailable" kind="unavailable" title={dictionary.designSystemUnavailable} /><EmptyState body={dictionary.designSystemErrorDescription} illustration="unavailable" kind="error" title={dictionary.designSystemError} /></div>
      <Empty><EmptyHeader><EmptyMedia variant="icon"><InfoIcon aria-hidden /></EmptyMedia><EmptyTitle>{dictionary.designSystemPrimitiveEmpty}</EmptyTitle><EmptyDescription>{dictionary.designSystemEmptyBody}</EmptyDescription></EmptyHeader></Empty>
    </Section>

    <Section id="loading" title={dictionary.designSystemLoadingHeading} description={dictionary.designSystemLoadingDescription}>
      <div className="grid gap-4 lg:grid-cols-2"><CardSkeleton label={dictionary.designSystemLoading} /><StatGridSkeleton label={dictionary.designSystemLoading} /><TableSkeleton label={dictionary.designSystemLoading} /><DetailSkeleton label={dictionary.designSystemLoading} /><CheckoutSkeleton label={dictionary.designSystemLoading} /><div className="flex items-center gap-3" role="status"><Spinner aria-hidden /><span>{dictionary.designSystemLoading}</span></div></div>
    </Section>

    <Section id="table" title={dictionary.designSystemTableHeading} description={dictionary.designSystemTableDescription}>
      <Table><TableCaption>{dictionary.designSystemTableCaption}</TableCaption><TableHeader><TableRow><TableHead>{dictionary.designSystemReference}</TableHead><TableHead>{dictionary.designSystemState}</TableHead><TableHead>{dictionary.designSystemAmount}</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell className="font-mono">FIX-2026-001</TableCell><TableCell>{dictionary.designSystemReady}</TableCell><TableCell className="font-mono">128,40 BRL</TableCell></TableRow></TableBody></Table>
      <Separator />
    </Section>

    <Section id="directory" title={dictionary.dataDirectoryHeading} description={dictionary.dataDirectoryDescription}><DataDirectorySpecimen dictionary={dictionary} /></Section>
    <DesignSystemInteractiveSpecimens dictionary={dictionary} />
    <section className="sr-only" aria-label={dictionary.designSystemCoverageHeading} data-specimen-coverage="closed">{designSystemCoverage.map((entry) => <span data-coverage-fixture={entry.fixture} data-coverage-owner={entry.owner} key={entry.id}>{entry.id}</span>)}</section>
  </main>;
}
