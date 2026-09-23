# Role shell contract

- This subtree owns role-neutral shell presentation and the focused navigation
  client boundary; it owns no authentication, locale, or business service.
- Role adapters under `src/app/admin/` and `src/app/(merchant)/` must resolve an
  exact active principal before rendering this frame or any route child.
- Shell props are inert labels, links, identity content, username, locale,
  theme options (an id from the closed registry plus its localized name), and
  children. Never pass a business DTO, credential, provider value, or service.
- The top-bar title is resolved inside the shell from `titleRoutes` (a
  route→label list each role layout supplies, matched with `isActiveRoute`)
  plus a `titleFallback`; an unmatched route always falls back to the role's
  dashboard label. Never hard-code a page name in the shell or a layout.
- An optional `storefrontLink` (`{href, label}`) renders in the merchant top
  bar only when the caller resolved an enabled storefront with a slug; the
  shell never resolves storefront settings itself and never renders the link
  for the administrator shell.
- Keep administrator and merchant navigation inventories separate and fixed at
  five entries; never infer one role's fallback routes from the other.
- The username block opens an account menu that always offers Sign out (native
  POST to `/logout`) and, for merchants only, the secondary `/profile` link; never
  count either as primary navigation and never render the menu empty.
- The persistent rail footer is presentation only: a `Monogram`, username,
  role pill, and the `by Nautt Finance` caption. Sign out is owned solely by
  the account menu and must never be duplicated in the rail footer (the
  mobile drawer panel keeps its own separate sign-out control).
- Dashboard roots match exactly. Other active states match exact routes or a
  slash-delimited descendant, never a string prefix.
- Two shell client boundaries exist, each narrow and isolated:
  `shell-navigation.tsx` reads the pathname and owns mobile disclosure state;
  `shell-theme-picker.tsx` reads and mutates only `document.documentElement`'s
  `data-theme` attribute and the client-writable `qr_theme` cookie. Neither
  imports auth or business code.
- The account-menu theme picker switches instantly (no navigation, form
  submit, or new route) and persists via that cookie alone; the server never
  trusts it — it is revalidated against the closed id registry on every
  request in `src/app/layout.tsx`.
- Hidden desktop/mobile navigation copies must use responsive `display` rules so
  only one copy exists in the accessibility tree at a time.
- Preserve the skip link above every fixed chrome layer, `aria-current="page"`,
  a visible non-color active marker, 44px controls, unobscured focus, reduced
  motion, and 320px fit.

- This subtree owns `app-shell.css`, the only remaining route-neutral BEM
  stylesheet in the application; no other subtree may add a new one — every
  page-scoped surface composes projected Tailwind utilities instead.

## Related contracts

- [`../../pop/specs/administrative-foundation.md`](../../pop/specs/administrative-foundation.md)
  — follow when changing route ownership or role capability.
- [`../../DESIGN.md`](../../DESIGN.md) — follow when changing shell composition,
  state, responsive, or identity rules.
