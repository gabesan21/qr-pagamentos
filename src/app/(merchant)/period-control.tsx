"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { getDictionary } from "@/i18n/dictionaries";
import type { MerchantAnalyticsPeriod } from "@/orders/merchant-analytics";

type Dictionary = ReturnType<typeof getDictionary>;

// Closed set, pinned order; an absent or hand-edited `period` value renders
// the pinned `7d` default (resolved server-side in `page.tsx`), never a
// redirect from this control. Merchant-local mirror of
// `src/app/admin/period-control.tsx`'s pattern (14.5.1): the visual contract
// already lives in the owned `Tabs` pill primitive, so this stays a route-
// local wrapper rather than a promotion of the admin file.
const DASHBOARD_PERIODS: ReadonlyArray<{
  id: MerchantAnalyticsPeriod;
  label: (dictionary: Dictionary) => string;
}> = [
  { id: "today", label: (dictionary) => dictionary.merchantDashboardPeriodToday },
  { id: "7d", label: (dictionary) => dictionary.merchantDashboardPeriod7d },
  { id: "30d", label: (dictionary) => dictionary.merchantDashboardPeriod30d },
];

/**
 * Route-local segmented period control over the owned `Tabs`/`TabsList`
 * (default pill variant — no new shared primitive). Selecting a period
 * commits `?period=<id>` through `router.replace` inside a transition,
 * preserving every other query pair; the URL never round-trips a full
 * navigation. The `<noscript>` fallback keeps three plain links so the
 * closed set still works without JavaScript.
 */
export function MerchantDashboardPeriodControl({
  current,
  dictionary,
}: Readonly<{ current: MerchantAnalyticsPeriod; dictionary: Dictionary }>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  function commit(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", next);
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    });
  }

  return (
    <>
      <Tabs
        aria-busy={isPending || undefined}
        aria-label={dictionary.merchantDashboardPeriodLabel}
        onValueChange={commit}
        value={current}
      >
        <TabsList aria-label={dictionary.merchantDashboardPeriodLabel}>
          {DASHBOARD_PERIODS.map((period) => (
            <TabsTrigger key={period.id} value={period.id}>
              {period.label(dictionary)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <noscript>
        <nav aria-label={dictionary.merchantDashboardPeriodLabel} className="flex flex-wrap gap-2">
          {DASHBOARD_PERIODS.map((period) =>
            period.id === current ? (
              <span aria-current="page" className="text-sm font-semibold underline underline-offset-2" key={period.id}>
                {period.label(dictionary)}
              </span>
            ) : (
              <a
                className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm text-foreground no-underline"
                href={`/?period=${period.id}`}
                key={period.id}
              >
                {period.label(dictionary)}
              </a>
            ),
          )}
        </nav>
      </noscript>
    </>
  );
}
