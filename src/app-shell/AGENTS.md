# Role shell contract

- This subtree owns role-neutral shell presentation and the focused navigation
  client boundary; it owns no authentication, locale, or business service.
- Role adapters under `src/app/admin/` and `src/app/(merchant)/` must resolve an
  exact active principal before rendering this frame or any route child.
- Shell props are inert labels, links, identity content, username, locale, and
  children. Never pass a business DTO, credential, provider value, or service.
- Keep administrator and merchant navigation inventories separate and fixed at
  five entries; never infer one role's fallback routes from the other.
- The merchant username block may expose only the secondary `/profile` link;
  never count it as primary navigation or add it for administrators.
- Dashboard roots match exactly. Other active states match exact routes or a
  slash-delimited descendant, never a string prefix.
- `shell-navigation.tsx` is the only shell client boundary. It may read the
  pathname and own mobile disclosure state; never import auth or business code.
- Hidden desktop/mobile navigation copies must use responsive `display` rules so
  only one copy exists in the accessibility tree at a time.
- Preserve the skip link above every fixed chrome layer, `aria-current="page"`,
  a visible non-color active marker, 44px controls, unobscured focus, reduced
  motion, and 320px fit.

## Related contracts

- [`../../pop/specs/administrative-foundation.md`](../../pop/specs/administrative-foundation.md)
  — follow when changing route ownership or role capability.
- [`../../DESIGN.md`](../../DESIGN.md) — follow when changing shell composition,
  state, responsive, or identity rules.
