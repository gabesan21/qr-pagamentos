import { cookies } from "next/headers";
import Link from "next/link";
import { CheckCircle2Icon, CircleIcon, InfoIcon, TriangleAlertIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarBadge, AvatarFallback, AvatarGroup, AvatarGroupCount, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { DataDirectory, type DataDirectoryCopy, type DataDirectoryState } from "@/data-directory/ui/data-directory";

import { DesignSystemInteractiveSpecimens } from "./interactive-specimens";
import { SpecimenBinding } from "./specimen-binding";

const themes = [
  ["pix-paper", "light"], ["cashier-daylight", "light"], ["settlement-sand", "light"],
  ["midnight-clearing", "dark"], ["vault-blue", "dark"], ["terminal-amber", "dark"],
] as const;

const tableStates: readonly DataDirectoryState[] = [
  "ready",
  "loading",
  "empty",
  "filtered-empty",
  "invalid-query",
  "error",
];

function Section({ children, description, id, title }: Readonly<{ children: React.ReactNode; description: string; id: string; title: string }>) {
  return <section aria-labelledby={id} className="grid gap-5 border-t-[length:var(--focus-width)] border-border pt-6" data-ds-section={id}>
    <div className="grid gap-2"><h2 className="m-0" id={id}>{title}</h2><p className="m-0 max-w-[var(--layout-max)] text-muted-foreground">{description}</p></div>
    {children}
  </section>;
}

function directoryCopy(dictionary: Record<string, string>): DataDirectoryCopy {
  return {
    searchLabel: dictionary.dataDirectorySearchLabel,
    searchPlaceholder: dictionary.dataDirectorySearchPlaceholder,
    pageSizeLabel: dictionary.dataDirectoryPageSizeLabel,
    applyFilters: dictionary.dataDirectoryApplyFilters,
    resetFilters: dictionary.dataDirectoryResetFilters,
    clearFilters: dictionary.dataDirectoryClearFilters,
    previousPage: dictionary.dataDirectoryPreviousPage,
    nextPage: dictionary.dataDirectoryNextPage,
    paginationLabel: dictionary.dataDirectoryPaginationLabel,
    loading: dictionary.dataDirectoryLoading,
    loadingDescription: dictionary.dataDirectoryLoadingDescription,
    empty: dictionary.dataDirectoryEmpty,
    emptyDescription: dictionary.dataDirectoryEmptyDescription,
    filteredEmpty: dictionary.dataDirectoryFilteredEmpty,
    filteredEmptyDescription: dictionary.dataDirectoryFilteredEmptyDescription,
    invalid: dictionary.dataDirectoryInvalid,
    invalidDescription: dictionary.dataDirectoryInvalidDescription,
    error: dictionary.dataDirectoryError,
    errorDescription: dictionary.dataDirectoryErrorDescription,
    retry: dictionary.dataDirectoryRetry,
  };
}

type DirectoryRow = { id: string; label: string; amount: string; status: string };

function directoryRows(dictionary: Record<string, string>): DirectoryRow[] {
  return [
    { id: "SYN-001", label: "PIX Alpha", amount: "128,40", status: dictionary.dataDirectoryActiveStatus },
    { id: "SYN-002", label: "PIX Beta", amount: "72,00", status: dictionary.dataDirectoryReviewStatus },
  ];
}

function directoryColumns(dictionary: Record<string, string>) {
  return [
    { id: "reference", label: dictionary.dataDirectoryReferenceColumn, value: (row: DirectoryRow) => row.id },
    { id: "label", label: dictionary.dataDirectoryLabelColumn, value: (row: DirectoryRow) => row.label },
    { id: "amount", label: dictionary.dataDirectoryAmountColumn, value: (row: DirectoryRow) => row.amount, numeric: true },
    { id: "status", label: dictionary.dataDirectoryStatusColumn, value: (row: DirectoryRow) => <Badge variant="outline">{row.status}</Badge> },
  ];
}

function DirectoryTableSpecimen({ dictionary, state }: Readonly<{ dictionary: Record<string, string>; state: DataDirectoryState }>) {
  const copy = directoryCopy(dictionary);
  const rows = directoryRows(dictionary);
  const columns = directoryColumns(dictionary);
  const stateLabels: Record<DataDirectoryState, string> = {
    ready: dictionary.dataDirectoryReadyState,
    loading: dictionary.dataDirectoryLoadingState,
    empty: dictionary.dataDirectoryEmptyState,
    "filtered-empty": dictionary.dataDirectoryFilteredEmptyState,
    "invalid-query": dictionary.dataDirectoryInvalidState,
    error: dictionary.dataDirectoryErrorState,
  };

  return (
    <section aria-labelledby={`directory-table-${state}-heading`} className="grid gap-5" data-directory-specimen-state={state} data-ds-section={`directory-table-${state}`}>
      <h3 id={`directory-table-${state}-heading`}>{stateLabels[state]}</h3>
      <DataDirectory
        caption={dictionary.dataDirectoryTableCaption}
        columns={columns}
        copy={copy}
        emptyAction={{ href: "/design-system", label: dictionary.dataDirectoryCreateExample }}
        filters={[{
          name: "status",
          label: dictionary.dataDirectoryStatusLabel,
          allLabel: dictionary.dataDirectoryAllStatuses,
          options: [
            { value: "ACTIVE", label: dictionary.dataDirectoryActiveStatus },
            { value: "REVIEW", label: dictionary.dataDirectoryReviewStatus },
          ],
        }]}
        formAction="/design-system"
        idPrefix={`specimen-table-${state}`}
        interactive={false}
        nextUrl="/design-system?pageSize=25&cursor=synthetic-next"
        previousUrl={state === "ready" ? "/design-system?pageSize=25&cursor=synthetic-previous" : undefined}
        resetUrl="/design-system"
        retryUrl="/design-system"
        rowKey={(row) => row.id}
        rows={rows}
        state={state}
      />
    </section>
  );
}

function DirectoryFilterSpecimen({ dictionary, state }: Readonly<{ dictionary: Record<string, string>; state: "default" | "populated" | "focus" | "selected" | "reset" | "disabled" }>) {
  const copy = directoryCopy(dictionary);
  const rows = directoryRows(dictionary);
  const columns = directoryColumns(dictionary);
  const selected = state === "selected" ? "ACTIVE" : undefined;
  const search = state === "populated" || state === "reset" ? "synthetic fixture" : undefined;

  const directory = (
    <DataDirectory
      caption={dictionary.dataDirectoryTableCaption}
      columns={columns}
      copy={copy}
      filters={[{
        name: "status",
        label: dictionary.dataDirectoryStatusLabel,
        allLabel: dictionary.dataDirectoryAllStatuses,
        selected,
        options: [
          { value: "ACTIVE", label: dictionary.dataDirectoryActiveStatus },
          { value: "REVIEW", label: dictionary.dataDirectoryReviewStatus },
        ],
      }]}
      formAction="/design-system"
      idPrefix={`specimen-filter-${state}`}
      interactive={false}
      resetUrl="/design-system"
      rowKey={(row) => row.id}
      rows={rows}
      search={search}
      state="ready"
    />
  );

  if (state === "disabled") {
    return (
      <fieldset className="m-0 min-w-0 border-0 p-0" disabled>
        <div className="grid gap-5 md:grid-cols-3">
          <Field><FieldLabel htmlFor={`specimen-filter-disabled-search`}>{copy.searchLabel}</FieldLabel><Input disabled id="specimen-filter-disabled-search" placeholder={copy.searchPlaceholder} type="search" /></Field>
          <Field><FieldLabel htmlFor={`specimen-filter-disabled-status`}>{dictionary.dataDirectoryStatusLabel}</FieldLabel><NativeSelect disabled id="specimen-filter-disabled-status"><NativeSelectOption value="">{dictionary.dataDirectoryAllStatuses}</NativeSelectOption></NativeSelect></Field>
          <Field><FieldLabel htmlFor={`specimen-filter-disabled-page-size`}>{copy.pageSizeLabel}</FieldLabel><NativeSelect disabled id="specimen-filter-disabled-page-size"><NativeSelectOption value="25">25</NativeSelectOption></NativeSelect></Field>
        </div>
      </fieldset>
    );
  }

  return <div data-probe={state === "focus" ? "focus" : undefined}>{directory}</div>;
}

function PaginationSpecimen({ dictionary, state }: Readonly<{ dictionary: Record<string, string>; state: "default" | "previous" | "next" | "focus" | "disabled" }>) {
  const previousHref = state === "disabled" || state === "next" ? undefined : "/design-system?page=1";
  const nextHref = state === "disabled" || state === "previous" ? undefined : "/design-system?page=2";

  return (
    <Pagination aria-label={dictionary.dataDirectoryPaginationLabel} label={dictionary.dataDirectoryPaginationLabel}>
      <PaginationContent className="w-full">
        <PaginationItem>
          {previousHref ? (
            <PaginationPrevious data-ds-hit-target data-probe={state === "focus" ? "focus" : undefined} href={previousHref} label={dictionary.dataDirectoryPreviousPage} text={dictionary.dataDirectoryPreviousPage} />
          ) : (
            <PaginationPrevious aria-disabled="true" data-probe={state === "disabled" ? "disabled" : undefined} href="/design-system" label={dictionary.dataDirectoryPreviousPage} tabIndex={-1} text={dictionary.dataDirectoryPreviousPage} />
          )}
        </PaginationItem>
        <PaginationItem className="ml-auto">
          {nextHref ? (
            <PaginationNext data-ds-hit-target href={nextHref} label={dictionary.dataDirectoryNextPage} text={dictionary.dataDirectoryNextPage} />
          ) : (
            <PaginationNext aria-disabled="true" data-probe={state === "disabled" ? "disabled" : undefined} href="/design-system" label={dictionary.dataDirectoryNextPage} tabIndex={-1} text={dictionary.dataDirectoryNextPage} />
          )}
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  );
}

export default async function DesignSystemPage() {
  const requestCookies = await cookies();
  const locale = localeFromPreferenceCookie(requestCookies.get(localePreferenceCookieName)?.value);
  const dictionary = getDictionary(locale);

  return <main className="grid gap-8" data-design-system-locale={locale}>
    <header className="grid gap-3 border-y-[length:var(--focus-width)] border-border py-4">
      <span className="text-xs font-semibold">QR Pagamentos / shared specimen</span>
      <h1>{dictionary.designSystemHeading}</h1>
      <div className="flex flex-wrap gap-4 tabular-nums text-muted-foreground"><span>application-frontend-system</span><span>Inter · Sora · IBM Plex Mono</span><span>{dictionary.designSystemRole}</span></div>
    </header>
    <p className="max-w-[var(--layout-max)] text-muted-foreground">{dictionary.designSystemIntroduction}</p>

    <Section id="themes" title={dictionary.designSystemThemesHeading} description={dictionary.designSystemThemesDescription}>
      <div className="flex flex-wrap items-start gap-3" id="ds-primitive-badge">{themes.map(([id, mode]) => <Badge data-theme-id={id} key={id} variant="outline">{id} · {mode === "light" ? dictionary.designSystemLight : dictionary.designSystemDark}</Badge>)}</div>
    </Section>

    <Section id="feedback" title={dictionary.designSystemFeedbackHeading} description={dictionary.designSystemFeedbackDescription}>
      <div className="grid gap-3 md:grid-cols-2" id="ds-primitive-alert">
        <Alert variant="success"><CheckCircle2Icon aria-hidden /><AlertTitle>{dictionary.designSystemSuccess}</AlertTitle><AlertDescription>{dictionary.designSystemSuccessDescription}</AlertDescription></Alert>
        <Alert variant="warning"><TriangleAlertIcon aria-hidden /><AlertTitle>{dictionary.designSystemWarning}</AlertTitle><AlertDescription>{dictionary.designSystemWarningDescription}</AlertDescription></Alert>
        <Alert variant="destructive"><TriangleAlertIcon aria-hidden /><AlertTitle>{dictionary.designSystemError}</AlertTitle><AlertDescription>{dictionary.designSystemErrorDescription}</AlertDescription></Alert>
        <Alert><InfoIcon aria-hidden /><AlertTitle>{dictionary.designSystemInfo}</AlertTitle><AlertDescription>{dictionary.designSystemInfoDescription}</AlertDescription></Alert>
      </div>
    </Section>

    <Section id="display" title={dictionary.designSystemDisplayHeading} description={dictionary.designSystemDisplayDescription}>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div id="ds-primitive-card"><Card data-specimen-owner="card"><CardHeader><CardTitle>{dictionary.designSystemCardTitle}</CardTitle><CardDescription>{dictionary.designSystemCardDescription}</CardDescription><CardAction><Badge variant="outline">{dictionary.designSystemReady}</Badge></CardAction></CardHeader><CardContent>{dictionary.designSystemCardBody}</CardContent><CardFooter>{dictionary.designSystemCardFooter}</CardFooter></Card></div>
        <SpecimenBinding owner="stat-card" state="ready"><StatCard caption={dictionary.designSystemStatCaption} label={dictionary.designSystemStatLabel} trend={{ direction: "up", label: dictionary.designSystemStatTrend }} value={<SpecimenBinding owner="money-text" state="ready"><span id="ds-primitive-money-text"><MoneyText pairLabel="BRL" value="128,40" /></span></SpecimenBinding>} /></SpecimenBinding>
        <div id="ds-primitive-avatar"><Card><CardHeader><CardTitle>{dictionary.designSystemIdentityHeading}</CardTitle></CardHeader><CardContent className="flex flex-wrap items-center gap-4"><Avatar size="lg"><AvatarImage alt="" src="/application-assets/avatar-default.svg" /><AvatarFallback>QP</AvatarFallback><AvatarBadge><CircleIcon aria-hidden /></AvatarBadge></Avatar><AvatarGroup><Avatar><AvatarFallback>QR</AvatarFallback></Avatar><Avatar><AvatarFallback>PX</AvatarFallback></Avatar><AvatarGroupCount>+2</AvatarGroupCount></AvatarGroup><SpecimenBinding owner="monogram" state="image"><Monogram accessibleName={dictionary.designSystemMonogramName} imageUrl="/application-assets/avatar-default.svg" name="QR Pagamentos" /></SpecimenBinding><SpecimenBinding owner="monogram" state="fallback"><Monogram name="Settlement desk" size="sm" /></SpecimenBinding><SpecimenBinding owner="monogram" state="accessible"><Monogram accessibleName={dictionary.designSystemMonogramName} name="QR Pagamentos" /></SpecimenBinding><SpecimenBinding owner="monogram" state="decorative"><Monogram name="Settlement desk" /></SpecimenBinding></CardContent></Card></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(["preparing", "available", "waiting", "recovery", "terminal"] as const).map((state) => <SpecimenBinding key={state} owner="qr-display" state={state}><QrDisplay alternativeLabel={dictionary.designSystemQrAlternativeLabel} alternativeValue={state === "available" ? "00020126580014br.gov.bcb.pix0136fixture-redacted-payload" : undefined} caption={dictionary.designSystemQrCaption} pending={state === "preparing" || state === "waiting"} graphic={<span className="grid size-full grid-cols-5 gap-1 p-3" aria-hidden>{Array.from({ length: 25 }, (_, index) => <span className={index % 3 === 0 ? "bg-foreground" : "bg-muted"} key={index} />)}</span>} graphicLabel={dictionary.designSystemQrLabel} /></SpecimenBinding>)}
        <SpecimenBinding owner="timeline" state="ready"><Timeline entries={[{ id: "prepared", title: dictionary.designSystemTimelinePrepared, formattedAt: "2026-08-03 09:30 BRT", tone: "info" }, { id: "confirmed", title: dictionary.designSystemTimelineConfirmed, formattedAt: "2026-08-03 09:31 BRT", tone: "success" }, { id: "review", title: dictionary.designSystemTimelineReview, formattedAt: "2026-08-03 09:32 BRT", tone: "danger" }]} /></SpecimenBinding>
        <SpecimenBinding owner="timeline" state="empty"><Timeline entries={[]} /></SpecimenBinding>
        {(["default", "success", "info", "danger"] as const).map((tone) => <SpecimenBinding key={tone} owner="timeline" state={tone}><Timeline entries={[{ id: tone, title: dictionary.designSystemTimelinePrepared, formattedAt: "2026-08-03 09:30 BRT", tone }]} /></SpecimenBinding>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-3"><SpecimenBinding owner="stat-card" state="empty"><StatCard label={dictionary.designSystemStatLabel} value="0" /></SpecimenBinding><SpecimenBinding owner="stat-card" state="unavailable"><StatCard caption={dictionary.designSystemUnavailableBody} label={dictionary.designSystemStatLabel} value="—" /></SpecimenBinding></div>
      <div className="flex flex-wrap items-start gap-3">{(["ready", "neutral", "info", "success", "warning", "danger"] as const).map((state) => <SpecimenBinding key={state} owner="status-badge" state={state}><StatusBadge label={state === "danger" ? dictionary.designSystemDanger : state === "warning" ? dictionary.designSystemWarning : state === "success" ? dictionary.designSystemSuccess : state === "info" ? dictionary.designSystemInfo : dictionary.designSystemReady} tone={state === "ready" ? "neutral" : state} /></SpecimenBinding>)}<SpecimenBinding owner="status-badge" state="archived"><StatusBadge archived label={dictionary.designSystemArchived} /></SpecimenBinding></div>
    </Section>

    <Section id="empty-states" title={dictionary.designSystemEmptyHeading} description={dictionary.designSystemEmptyDescription}>
      <div className="grid gap-4 lg:grid-cols-2"><SpecimenBinding owner="empty-state" state="empty"><EmptyState body={dictionary.designSystemEmptyBody} illustration="orders" title={dictionary.designSystemEmpty} /></SpecimenBinding><SpecimenBinding owner="empty-state" state="filtered-empty"><EmptyState body={dictionary.designSystemFilteredBody} illustration="links" kind="filtered-empty" title={dictionary.designSystemFiltered} /></SpecimenBinding><SpecimenBinding owner="empty-state" state="unavailable"><EmptyState body={dictionary.designSystemUnavailableBody} illustration="unavailable" kind="unavailable" title={dictionary.designSystemUnavailable} /></SpecimenBinding><SpecimenBinding owner="empty-state" state="error"><EmptyState body={dictionary.designSystemErrorDescription} illustration="unavailable" kind="error" title={dictionary.designSystemError} /></SpecimenBinding><SpecimenBinding owner="empty-state" state="recovery-focus"><EmptyState action={<Link className="inline-flex min-h-11 items-center" href="/design-system">{dictionary.designSystemRetry}</Link>} body={dictionary.designSystemErrorDescription} illustration="unavailable" kind="error" title={dictionary.designSystemError} /></SpecimenBinding></div>
      <div id="ds-primitive-empty"><Empty><EmptyHeader><EmptyMedia variant="icon"><InfoIcon aria-hidden /></EmptyMedia><EmptyTitle>{dictionary.designSystemPrimitiveEmpty}</EmptyTitle><EmptyDescription>{dictionary.designSystemEmptyBody}</EmptyDescription></EmptyHeader></Empty></div>
    </Section>

    <Section id="loading" title={dictionary.designSystemLoadingHeading} description={dictionary.designSystemLoadingDescription}>
      <SpecimenBinding owner="skeletons" state="loading"><div className="grid gap-4 lg:grid-cols-2" id="ds-primitive-skeleton"><CardSkeleton label={dictionary.designSystemLoading} /><StatGridSkeleton label={dictionary.designSystemLoading} /><TableSkeleton label={dictionary.designSystemLoading} /><DetailSkeleton label={dictionary.designSystemLoading} /><CheckoutSkeleton label={dictionary.designSystemLoading} /><div className="flex items-center gap-3" id="ds-primitive-spinner" role="status"><Spinner aria-hidden /><span>{dictionary.designSystemLoading}</span></div></div></SpecimenBinding>
    </Section>

    <Section id="table" title={dictionary.designSystemTableHeading} description={dictionary.designSystemTableDescription}>
      <div id="ds-primitive-table"><Table><TableCaption>{dictionary.designSystemTableCaption}</TableCaption><TableHeader><TableRow><TableHead>{dictionary.designSystemReference}</TableHead><TableHead>{dictionary.designSystemState}</TableHead><TableHead>{dictionary.designSystemAmount}</TableHead></TableRow></TableHeader><TableBody><TableRow><TableCell className="font-mono">FIX-2026-001</TableCell><TableCell>{dictionary.designSystemReady}</TableCell><TableCell className="font-mono">128,40 BRL</TableCell></TableRow></TableBody></Table></div>
      <div id="ds-primitive-separator"><Separator /></div>
    </Section>

    <Section id="directory" title={dictionary.dataDirectoryHeading} description={dictionary.dataDirectoryDescription}>
      <div className="grid gap-8">
        <div className="grid gap-8">
          {tableStates.map((state) => <SpecimenBinding key={state} owner="data-directory-table" state={state}><DirectoryTableSpecimen dictionary={dictionary} state={state} /></SpecimenBinding>)}
        </div>
        <div className="grid gap-6">
          {(["default", "populated", "focus", "selected", "reset", "disabled"] as const).map((state) => <SpecimenBinding key={state} owner="data-directory-filter" state={state}><DirectoryFilterSpecimen dictionary={dictionary} state={state} /></SpecimenBinding>)}
        </div>
        <div className="grid gap-6" id="ds-primitive-pagination">
          {(["default", "previous", "next", "focus", "disabled"] as const).map((state) => <SpecimenBinding key={state} owner="pagination" state={state}><PaginationSpecimen dictionary={dictionary} state={state} /></SpecimenBinding>)}
        </div>
      </div>
    </Section>
    <DesignSystemInteractiveSpecimens dictionary={dictionary} />
  </main>;
}
