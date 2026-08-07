"use client";

import { useState } from "react";

import { CheckCircle2Icon } from "lucide-react";

import { AdminSubmit } from "@/app/admin/admin-submit";
import type { Dictionary } from "./settings-surface";

const THEME_NAMES: Record<string, keyof Dictionary> = {
  "pix-paper": "storefrontThemePixPaper",
  "cashier-daylight": "storefrontThemeCashierDaylight",
  "settlement-sand": "storefrontThemeSettlementSand",
  "midnight-clearing": "storefrontThemeMidnightClearing",
  "vault-blue": "storefrontThemeVaultBlue",
  "terminal-amber": "storefrontThemeTerminalAmber",
};

export function AppearanceSection({
  defaultThemeId,
  dictionary,
  themeIds,
}: Readonly<{ defaultThemeId: string; dictionary: Dictionary; themeIds: readonly string[] }>) {
  const [themeId, setThemeId] = useState(defaultThemeId);

  return (
    <form action="/admin/settings/default-theme" method="post">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {themeIds.map((id) => {
          const selected = themeId === id;
          const label = dictionary[THEME_NAMES[id] as keyof Dictionary] as string;
          return (
            <button
              key={id}
              aria-pressed={selected}
              className={`relative rounded-lg border p-1.5 text-left transition-shadow ${selected ? "border-primary ring-3 ring-ring" : "border-border hover:border-muted-foreground"}`}
              data-theme-id={id}
              onClick={() => setThemeId(id)}
              type="button"
            >
              {selected ? <CheckCircle2Icon aria-hidden className="absolute right-2 top-2 size-4 text-primary" /> : null}
              <img
                alt={String(dictionary.adminThemeSwatchAlt).replace("{{name}}", label)}
                className="w-full rounded-md"
                height={64}
                src={`/application-assets/theme-swatch-${id}.svg`}
                width={96}
              />
              <span className="mt-1 block text-xs font-medium text-muted-foreground">{label}</span>
            </button>
          );
        })}
      </div>
      <input name="themeId" type="hidden" value={themeId} />
      <div className="mt-4 flex justify-end">
        <AdminSubmit disabled={themeId === defaultThemeId} label={dictionary.adminDefaultThemeSave} />
      </div>
    </form>
  );
}
