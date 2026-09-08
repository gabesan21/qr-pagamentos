import type { ReactNode } from "react";

import { BrandIdentity } from "@/brand/brand-identity";
import { Card } from "@/components/ui/card";
import { STOREFRONT_THEME_IDS } from "@/design-system/themes";

/**
 * Shared server composition for every auth surface (login, MFA challenge,
 * reset password). Owned by `14.4.1` front F02 — do not fork or duplicate
 * this file; the reset/404 front (F03) consumes it as-is.
 *
 * Public API:
 * - `tagline` / `caption`: localized brand-panel copy supplied by the
 *   caller's own dictionary (no hard-coded strings live here).
 * - `languageControl`: the accessible language switcher, rendered once in a
 *   fixed top-right slot of the form column — callers never re-implement
 *   this placement.
 * - `children`: the content column. It accepts either an interactive form
 *   (login credentials, MFA challenge, reset form) or a state-only panel
 *   (an unusable-link notice, a success message) — `AuthCard` has no
 *   opinion about which, so a state-only caller renders no `<form>` at all.
 *
 * The leading brand panel (tagline, product caption, and the six-swatch
 * strip) is entirely internal: it is generated once from the closed
 * `STOREFRONT_THEME_IDS` registry, stays decorative (`aria-hidden`), and is
 * hidden below the auth breakpoint (`--breakpoint-auth`) — callers never
 * pass panel content and never see it in the accessibility tree.
 */
export type AuthCardProps = Readonly<{
  caption: string;
  children: ReactNode;
  languageControl: ReactNode;
  tagline: string;
}>;

export function AuthCard({ caption, children, languageControl, tagline }: AuthCardProps) {
  return (
    <Card className="auth-card">
      <div aria-hidden="true" className="auth-card__panel">
        <BrandIdentity className="auth-card__panel-brand" variant="product-lockup" />
        <p className="auth-card__tagline">
          {tagline}
          <span className="auth-card__caption">{caption}</span>
        </p>
        <div className="auth-card__strip">
          {STOREFRONT_THEME_IDS.map((themeId) => (
            <img alt="" className="auth-card__swatch" key={themeId} src={`/application-assets/theme-swatch-${themeId}.svg`} />
          ))}
        </div>
      </div>
      <div className="auth-card__form">
        <div className="auth-card__language">{languageControl}</div>
        {children}
      </div>
    </Card>
  );
}
