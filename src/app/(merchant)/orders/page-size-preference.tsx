"use client";

import { useEffect } from "react";

import { DIRECTORY_INVALID_FILTERS_PARAM } from "@/data-directory/server/notice";

// Observation-only page-size preference (8.3.3): it never intercepts the
// native GET form. A change of the toolbar control stores the choice; on
// mount, only when the URL carries no explicit `pageSize`, no mutation
// notice and no reserved invalid-filters pair, it navigates once to the
// canonical URL with the stored registered size. An explicit URL value
// always wins and is re-stored, so the stored default never navigates and no
// redirect loop can form.
export function OrderV2PageSizePreference({
  defaultSize,
  noticeKey,
  registeredSizes,
  selectId,
  storageKey,
}: Readonly<{
  defaultSize: number;
  noticeKey: string;
  registeredSizes: readonly number[];
  selectId: string;
  storageKey: string;
}>) {
  useEffect(() => {
    const store = (value: string) => {
      try {
        window.localStorage.setItem(storageKey, value);
      } catch {
        // The preference is best-effort; private modes may refuse storage.
      }
    };
    const observeToolbarChange = (event: Event) => {
      const target = event.target;
      if (target instanceof HTMLSelectElement && target.id === selectId && registeredSizes.includes(Number(target.value))) {
        store(target.value);
      }
    };
    document.addEventListener("change", observeToolbarChange);

    const parameters = new URLSearchParams(window.location.search);
    const explicit = parameters.get("pageSize");
    if (explicit !== null) {
      if (registeredSizes.includes(Number(explicit))) store(explicit);
    } else if (!parameters.has(noticeKey) && !parameters.has(DIRECTORY_INVALID_FILTERS_PARAM)) {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(storageKey);
      } catch {
        stored = null;
      }
      if (stored !== null && registeredSizes.includes(Number(stored)) && Number(stored) !== defaultSize) {
        parameters.set("pageSize", stored);
        window.location.replace(`${window.location.pathname}?${parameters.toString()}`);
      }
    }
    return () => document.removeEventListener("change", observeToolbarChange);
  }, [defaultSize, noticeKey, registeredSizes, selectId, storageKey]);

  return null;
}
