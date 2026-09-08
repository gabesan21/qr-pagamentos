# Data directory contract

- This subtree owns only the generic bounded directory server contract and its
  role-neutral UI composition; never add a concrete Orders, Links, Users,
  Products, Categories, or analytics projection here.
- `server/` exposes only merchant-own and administrator-global query entry
  points. Recheck the active role before adapter I/O and derive owner/global
  scope on the server; never accept scope, order, or raw query fragments from
  a URL or cursor.
- Measure the exact raw request-target query substring before decoding. Keep
  strict form decoding, registered filters, deterministic canonical `307`
  locations, per-directory registered page-size subsets/defaults drawn from the
  closed 10/20/25/50/100 superset, bounded entries, and zero-I/O invalid paths.
- Cursors use the required server key only for domain-separated HKDF/HMAC.
  Never serialize an identity or treat a cursor as authorization; every read
  reapplies role and scope.
- Orders are immutable lexicographic tuples whose last registered field is
  explicitly marked `UNIQUE_IMMUTABLE_ID`; unmarked or misplaced markers fail
  before adapter I/O.
  Adapters request only `pageSize + 1`; never add offset, total count,
  arbitrary sorting, client-side full-list filtering, or snapshot promises.
- `ui/` receives only localized copy, redacted rows, column/fact definitions,
  canonical URLs, and optional consumer actions. Never import auth, a business
  service/store, or theme/role branching; `next/navigation` and the owned
  shadcn primitives are the only allowed non-copy imports.
- `DataDirectory` is the only production owner for shared table, native-GET
  filter and canonical previous/next pagination responsibilities; never add a
  parallel `DataTable`, `FilterBar`, total-count or page-number owner. Its
  client shell is a thin URL-state controller over the native `<form
  method="get">` foundation: search commits on a fixed debounce, every other
  toolbar control and the page-size select commit on `change` through
  `router.replace` inside a transition, and every commit drops `cursor` and
  keeps the remaining canonical pairs. Apply/Reset render only inside
  `<noscript>`; the visible action is a ghost "Clear filters" anchor shown
  only when a filter is active. A documented `interactive={false}` opt-out
  renders the same composition with no live commit, for non-navigating demo
  surfaces only. Never add offset, total count, page numbers, arbitrary
  sorting, client-side row filtering, or a snapshot promise.
- Active filters render as removable chips resolved through the caller's
  registered filter definitions (enum option label, or the submitted text for
  text/calendar filters); the raw filter value is never printed. Rows accept
  an optional server-evaluated href and navigate on row/card click; the
  explicit consumer action stays the keyboard-reachable path, and a click
  landing on an interactive descendant (link, button, control) never
  triggers row navigation.
- At narrow widths render ruled `dl` facts; at wide widths render one captioned
  native table. CSS must leave exactly one renderer/action set in the
  accessibility tree, preserve DOM/focus/reading order, and avoid page overflow.
- Keep the six mutually exclusive states: ready, loading, empty,
  filtered-empty, invalid-query, and error. `invalid-query` stays a declared
  state (specimen, coverage) with no production producer: a page or its query
  resolver that cannot canonicalize URL input redirects to its reset path
  carrying the reserved `?filters=ignored` pair instead of rendering this
  state, and the reset render raises one informational, echo-free notice.
  Invalid/error copy never echoes input, identity, scope, or exception detail.
- Generic copy belongs to the bilingual `data-directory` dictionary domain.
- The toolbar's page-size options and labelled text/calendar-day filter fields
  are optional registered props (defaults 25/50/100, enum-only filters);
  never hardcode a concrete directory's sizes or filters into the composition.

## Related contracts

- [`../../pop/specs/administrative-foundation.md`](../../pop/specs/administrative-foundation.md) — follow when role scope, query, URL, or cursor behavior changes.
- [`../../pop/specs/application-frontend-system.md`](../../pop/specs/application-frontend-system.md) — follow when responsive semantics, inventory, state, or evidence changes.
- [`../components/ui/AGENTS.md`](../components/ui/AGENTS.md) — follow before changing owned shadcn source used by this composition.
