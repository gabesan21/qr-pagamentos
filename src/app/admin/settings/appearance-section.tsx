"use client";

import { useState } from "react";

import { CheckCircle2Icon } from "lucide-react";

import { AdminSubmit } from "@/app/admin/admin-submit";
import { Button } from "@/components/ui/button";
import type { Dictionary } from "./settings-surface";
import { SettingsSectionNotice, type SectionNotice } from "./settings-section-notice";

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
  notice,
  themeIds,
}: Readonly<{ defaultThemeId: string; dictionary: Dictionary; notice: SectionNotice; themeIds: readonly string[] }>) {
  const [themeId, setThemeId] = useState(defaultThemeId);

  return (
    <form action="/admin/settings/default-theme" method="post">
      <SettingsSectionNotice
        dictionary={dictionary}
        notice={notice}
        toastEntries={[
          { param: "success", value: "theme-default", kind: "success", message: dictionary.adminThemeDefaultSaved },
          { param: "error", value: "theme-default-failed", kind: "error", message: dictionary.adminThemeDefaultFailed },
        ]}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {themeIds.map((id) => {
          const selected = themeId === id;
          const label = dictionary[THEME_NAMES[id] as keyof Dictionary] as string;
          return (
            <Button
              key={id}
              aria-pressed={selected}
              className={`relative text-left transition-shadow hover:bg-transparent active:bg-transparent ${selected ? "border-primary ring-3 ring-ring" : "border-border hover:border-muted-foreground"}`}
              data-theme-id={id}
              onClick={() => setThemeId(id)}
              size="theme-swatch"
              type="button"
              variant="ghost"
            >
              {selected ? <CheckCircle2Icon aria-hidden className="absolute right-2 top-2 size-4 text-primary" /> : null}
              <img
                alt={String(dictionary.adminThemeSwatchAlt).replace("{{name}}", label)}
                className="w-full rounded-md"
                height={64}
                src={`/application-assets/theme-swatch-${id}.svg`}
                width={96}
              />
              <span className="mt-1 block text-label font-medium text-text-2">{label}</span>
            </Button>
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
