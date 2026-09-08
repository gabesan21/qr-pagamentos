"use client";

import { useEffect, useState } from "react";

// Scroll-spy over the section anchors, mirroring the merchant settings
// pattern (`src/app/(merchant)/settings/settings-surface.tsx`): plain Tailwind
// utilities here, no BEM classes from `globals.css`. The anchor list works
// without JS — `aria-current` is a JS-only enhancement on top of it.
export type SettingsNavSection = Readonly<{ id: string; label: string }>;

export function SettingsNav({
  ariaLabel,
  sections,
}: Readonly<{ ariaLabel: string; sections: readonly SettingsNavSection[] }>) {
  const [activeId, setActiveId] = useState<string>(sections[0]?.id ?? "");

  useEffect(() => {
    const elements = sections
      .map(({ id }) => document.getElementById(`sec-${id}`))
      .filter((element): element is HTMLElement => element !== null);
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActiveId(entry.target.id.replace("sec-", ""));
        }
      },
      { rootMargin: "-30% 0% -60% 0%" },
    );
    for (const element of elements) observer.observe(element);
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label={ariaLabel} className="sticky top-20 hidden h-fit w-48 shrink-0 flex-col gap-1 lg:flex">
      {sections.map(({ id, label }) => (
        <a
          key={id}
          aria-current={activeId === id ? "true" : undefined}
          className="flex min-h-11 w-full items-center rounded-md px-3 text-left text-sm text-muted-foreground transition-colors hover:bg-muted aria-[current=true]:bg-muted aria-[current=true]:font-medium aria-[current=true]:text-foreground"
          href={`#sec-${id}`}
        >
          {label}
        </a>
      ))}
    </nav>
  );
}
