# Template fidelity audit — foundation, shell, theme/locale, authentication

- **Date:** 2026-09-07 · **Method:** read-only comparison of `docs/template/app/src/{index.css,components/*,theme/*,i18n/*,pages/auth/*}` against `src/app/layout.tsx`, `src/app/globals.css`, `src/design-system/**`, `src/app-shell/**`, `src/app/login/**`, `src/app/reset-password/**` (no build: `node_modules` absent).
- **Overview:** [[researches/template-fidelity-convergence/template-fidelity-audit|Template fidelity audit]] — read first for the cross-cutting causes.
- **Functional authority:** `docs/template/info.md` › "Product Roles and Shared Behavior", "Shared Access Pages".

## Theme and locale (the largest gap)

- **No theme switching in the authenticated app.** Template `ThemeProvider` writes `data-theme` on `<html>` and persists `qrp:theme`; production `src/app/layout.tsx:23` renders `<html lang>` only and no TSX ever sets `data-theme=`. The six `:root[data-theme=…]` blocks (`globals.css:280-1039`) are dead for the shell; users get pix-paper, or midnight-clearing via `prefers-color-scheme`. The only theme pickers feed the storefront/checkout fallback (`storefront-settings-management.tsx:61`, `admin/settings/appearance-section.tsx:27`). Contradicts info.md "selectable theme contexts shared by authenticated surfaces".
- **Locale switch is a round-trip that always lands on `/`** (`language-preference/route.ts:18`), bouncing admins through `/admin`; the "saved" notice renders only on merchant `/`; control hidden at ≤375px (`app-shell.css:460-462`); no language control on login/reset (template has a compact globe switcher).
- **Palette:** bg/surface/surface-2/border/text/text-2/accent equal the template in all six themes. Differ: `text-3` (deliberate AA projection, `DESIGN.md:87-95`), pix-paper `accent-fg`, light-theme success/warning/danger, solid focus ring vs 35–45% alpha, and **no `*-soft` feedback tokens** (only `--color-action-soft`).
- **Utility vocabulary missing:** `@theme inline` (`globals.css:1130-1165`) exposes shadcn names only; `bg-surface`, `text-text-2`, `rounded-card`, `shadow-card`, `font-display`, `bg-accent-soft`, `rounded-pill`, `max-w-app` have no utility. `text-accent` resolves to the pale action-soft tint, the opposite of the template's strong accent. Files authored in template vocabulary (`not-found.tsx:6-9`, `(merchant)/page.tsx:54`, `admin/accounts/[id]/page.tsx:123`) are therefore unstyled (UNVERIFIED without build).
- Fonts Sora/Inter/IBM Plex Mono are self-hosted and applied (`globals.css:4-13,1175-1180`) — this part is faithful.

## Shell and navigation

| Template element | Status | Evidence / note |
|---|---|---|
| 56px top bar, 248px rail, 1280 content, p-4/lg:p-6 | present | `globals.css:40-41`, `app-shell.css:127-141,280-288` |
| Rail/drawer switch at `lg` 1024px | **diverges** | `app-shell.css:417` switches at 768px; `DESIGN.md:216` promises `lg` |
| Route-derived top-bar title | partial | static eyebrow "Merchant workspace"/"Administration" (`(merchant)/layout.tsx:39`, `admin/layout.tsx:39`) |
| Rail footer: Monogram + username + role pill | partial | no monogram, role plain text, extra Sign-out button |
| "View storefront" link in top bar | **missing** | prop exists (`app-shell.tsx:28`) but `(merchant)/layout.tsx` never passes it |
| User menu: Profile + Sign out | **bug** | menu renders only `profileLink` (`shell-navigation.tsx:109-118`); admin passes none → **empty panel** |
| Rail caption "by Nautt Finance" | missing | no dictionary key |
| Nav labels | diverge | "Links"/"Products" vs "Payment Links"/"Catalog" |
| Drawer slide, page fade | missing | no motion library |
| Toast provider | **not mounted** | `ToastViewport` only in `/design-system` specimen |
| Footer | diverges | authenticated shell has a footer (template none); "Privacy" is a `<span>`, "Language: pt-BR" is static text; auth pages have **no** footer (template has powered-by + switcher + privacy) |

## Login and TOTP

- 720/300/420 geometry present (`globals.css:1235-1245`) but the brand panel is on the **right** (template left) and contains only the logo, `aria-hidden`: no tagline, gradient strip, six swatches, texture or entrance motion.
- Missing: forgot-password link, show/hide password toggle, inline "Required" copy (native bubbles), focus-to-username after error, language switcher. Caption says "administrator credentials" to merchants (`shared/en.ts:5`).
- TOTP challenge is a single `<Input maxLength 6/64>` (`totp-challenge-form.tsx:48-59`): no 6-cell input (production `input-otp.tsx` exists, unused here), paste fill, auto-submit, "Verifying identity for {username}" caption, Back, or lockout state. Recovery-code toggle present (hex 64 format vs template `xxxx-xxxx`).

## Reset password

- Invalid/expired/used collapse into one alert (`reset-password/page.tsx:62-75`); no back-to-login; no show/hide; `minLength=12` only — no `maxLength`, requirement copy, meter or client mismatch message (`submit/route.ts:23-25` folds mismatch into generic `failed`); success rendered on `/login` instead of the reset page. 128 cap server-side: UNVERIFIED.

## Not-found and role guard

- `not-found.tsx` copies the stub composition but is **pt-BR only** and authored in unwired utilities. Wrong-role access redirects to the other area instead of the template's safe "unavailable" card.

## Top divergences by user impact

1. No theme switching in the authenticated app.
2. Locale switch round-trips to `/`; absent on auth pages.
3. Toast system not mounted.
4. Login lacks forgot-password, show/hide, inline errors; admin-flavoured caption.
5. TOTP challenge is a plain text box.
6. Reset flow collapses states; no hints/meter/back link.
7. Account menu without sign-out; empty for admins; storefront link never wired.
8. Split styling: BEM + shadcn tokens; template utilities absent; `text-accent` inverted.
9. Rail/drawer breakpoint 768px; zero motion.
10. Bare auth brand panel; static top-bar title; nav labels differ.

## Production extras worth keeping

Skip link and 44px targets; server-persisted locale with `accept-language` negotiation; real session/MFA/CSRF handling; route-level `loading.tsx` and admin `error.tsx`; admin default theme + scoped `data-theme-preview` for storefront/checkout.
