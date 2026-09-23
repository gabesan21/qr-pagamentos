"use client";

import { useEffect, useState } from "react";

import { SimpleTabs, type SimpleTab } from "@/components/ui/simple-tabs";

// The active tab's identity is the URL hash: restored once at mount (so a
// reload lands back on the same panel) and rewritten with
// `history.replaceState` on every switch, never a Next.js navigation and
// never a new history entry per click.
export function AccountEditorTabs({
  ariaLabel,
  tabs,
}: Readonly<{ ariaLabel: string; tabs: readonly SimpleTab[] }>) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");

  useEffect(() => {
    const hashId = window.location.hash.slice(1);
    // `window.location.hash` is unavailable during the server render that
    // produces the first-tab default, so the client-only restore genuinely
    // requires a post-hydration effect rather than a lazy initializer.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tabs.some((tab) => tab.id === hashId)) setActive(hashId);
    // Reads the hash the browser navigated with exactly once; every later
    // switch is driven by handleValueChange below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleValueChange(value: string) {
    setActive(value);
    window.history.replaceState(null, "", `#${value}`);
  }

  return <SimpleTabs label={ariaLabel} onValueChange={handleValueChange} tabs={tabs} value={active} />;
}
