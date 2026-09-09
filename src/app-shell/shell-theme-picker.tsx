"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "lucide-react";

import { buildThemePreferenceCookie } from "@/design-system/theme-preference";
import type { StorefrontThemeId } from "@/design-system/themes";

import type { ShellThemeOption } from "./shell-types";

/**
 * The account-menu theme picker. It is the shell's second client boundary:
 * a narrow, isolated concern (reading the server-stamped attribute,
 * mutating it, and persisting the choice) with no auth or business import,
 * kept out of `shell-navigation.tsx` on purpose.
 *
 * The value is a non-sensitive presentation preference with no
 * authorization effect, so the switch is instant and client-only: it sets
 * `<html>`'s `data-theme` attribute and writes the cookie in the same click
 * handler, after hydration. Nothing here computes that attribute during
 * render, so markup always agrees with the server output and no
 * `suppressHydrationWarning` is needed.
 */
export function ShellThemePicker({
  groupLabel,
  themeOptions,
}: Readonly<{ groupLabel?: string; themeOptions: readonly ShellThemeOption[] }>) {
  const [activeThemeId, setActiveThemeId] = useState<StorefrontThemeId | undefined>(undefined);
  // No point rendering an empty, unlabeled `role="group"` — the account menu
  // has nothing to show when the registry resolves no options.
  const hasOptions = themeOptions.length > 0;

  // The server-stamped `data-theme` attribute is a client-only external
  // system unavailable during the server render, so reading it back cannot
  // happen before mount; a lazy `useState` initializer would instead read it
  // during hydration and desync from the server-rendered markup.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setActiveThemeId(document.documentElement.dataset.theme as StorefrontThemeId | undefined);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  function selectTheme(themeId: StorefrontThemeId) {
    // Instant, client-only persistence with no authorization effect: the DOM
    // attribute and the qr_theme cookie are external browser state, not
    // React state, so writing them directly here is the intended escape
    // hatch — a method call, never a computed value during render.
    document.documentElement.setAttribute("data-theme", themeId);
    // document.cookie has no non-assignment API; this is the standard way to
    // set one cookie.
    // eslint-disable-next-line react-hooks/immutability
    document.cookie = buildThemePreferenceCookie(themeId, window.location.protocol === "https:");
    setActiveThemeId(themeId);
  }

  if (!hasOptions) return null;

  return (
    <div aria-label={groupLabel} className="app-shell__theme-group" role="group">
      {themeOptions.map((option) => {
        const checked = option.id === activeThemeId;
        return (
          <button
            key={option.id}
            aria-checked={checked}
            className="app-shell__theme-option"
            onClick={() => selectTheme(option.id)}
            role="menuitemradio"
            type="button"
          >
            <img
              alt=""
              className="app-shell__theme-swatch"
              height={64}
              src={`/application-assets/theme-swatch-${option.id}.svg`}
              width={96}
            />
            <span className="app-shell__theme-label">{option.label}</span>
            {checked ? <CheckIcon aria-hidden="true" className="app-shell__theme-check" /> : null}
          </button>
        );
      })}
    </div>
  );
}
