"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { getDictionary } from "@/i18n/dictionaries";
import type { AdminAnalyticsPeriod } from "@/orders/admin-analytics";

type Dictionary = ReturnType<typeof getDictionary>;

// Closed set, pinned order; an absent or hand-edited `period` value renders
// the pinned `7d` default (resolved server-side in `page.tsx`), never a
// redirect from this control.
const DASHBOARD_PERIODS: ReadonlyArray<{
  id: AdminAnalyticsPeriod;
  label: (dictionary: Dictionary) => string;
}> = [
  { id: "today", label: (dictionary) => dictionary.adminDashboardPeriodToday },
  { id: "7d", label: (dictionary) => dictionary.adminDashboardPeriod7d },
  { id: "30d", label: (dictionary) => dictionary.adminDashboardPeriod30d },
];

/**
 * Route-local segmented period control over the owned `Tabs`/`TabsList`
 * (default pill variant — no new shared primitive). Selecting a period
 * commits `?period=<id>` through `router.replace` inside a transition,
 * mirroring `DataDirectoryClient`'s commit pattern: every other query pair
 * (e.g. `success`/`error`) is preserved, and the URL never round-trips a
 * full navigation. The `<noscript>` fallback keeps the three plain links so
 * the closed set still works without JavaScript.
 */
export function AdminDashboardPeriodControl({
  current,
  dictionary,
}: Readonly<{ current: AdminAnalyticsPeriod; dictionary: Dictionary }>) {
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
        aria-label={dictionary.adminDashboardPeriodLabel}
        onValueChange={commit}
        value={current}
      >
        <TabsList aria-label={dictionary.adminDashboardPeriodLabel}>
          {DASHBOARD_PERIODS.map((period) => (
            <TabsTrigger key={period.id} value={period.id}>
              {period.label(dictionary)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <noscript>
        <nav aria-label={dictionary.adminDashboardPeriodLabel} className="flex flex-wrap gap-2">
          {DASHBOARD_PERIODS.map((period) =>
            period.id === current ? (
              <span aria-current="page" className="text-sm font-semibold underline underline-offset-2" key={period.id}>
                {period.label(dictionary)}
              </span>
            ) : (
              <a
                className="inline-flex min-h-11 items-center rounded-md border border-border px-4 text-sm text-foreground no-underline"
                href={`/admin?period=${period.id}`}
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
