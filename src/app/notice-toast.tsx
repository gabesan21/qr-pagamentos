"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

import { showToast, type ToastKind } from "@/components/ui/toast";

// A closed, already-localized notice a server page resolved from its own
// query string: `param`/`value` name the exact URL pair that activates it, so
// the bridge only ever raises a toast the server already decided to show.
export type NoticeToastEntry = Readonly<{
  param: string;
  value: string;
  kind: ToastKind;
  message: string;
  retry?: Readonly<{ href: string; label: string }>;
}>;

function NoticeToastEffect({ notices }: Readonly<{ notices: readonly NoticeToastEntry[] }>) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const matched = notices.find((notice) => searchParams.get(notice.param) === notice.value);
    if (!matched) return;

    showToast({
      kind: matched.kind,
      message: matched.message,
      action: matched.retry
        ? { label: matched.retry.label, onClick: () => window.location.assign(matched.retry!.href) }
        : undefined,
    });

    // Strip every notice param this instance owns so a refresh never re-fires
    // the toast; `history.replaceState` avoids a Next.js re-navigation that
    // would re-run the server page for a purely cosmetic URL cleanup.
    const url = new URL(window.location.href);
    for (const notice of notices) url.searchParams.delete(notice.param);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    // Runs once for the notice resolved at mount; re-checking on every
    // subsequent render would re-toast after the params above are stripped.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

/**
 * Raises exactly one toast for the first matching entry in `notices` and
 * removes its query params, then renders nothing. Mount it once per page
 * (or once in the root layout for a global notice family); pass only the
 * entry the server already resolved for the current request.
 */
export function NoticeToast({ notices }: Readonly<{ notices: readonly NoticeToastEntry[] }>) {
  if (notices.length === 0) return null;
  return (
    <Suspense fallback={null}>
      <NoticeToastEffect notices={notices} />
    </Suspense>
  );
}
