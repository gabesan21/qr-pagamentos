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
  locations, closed page sizes, bounded entries, and zero-I/O invalid paths.
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
  service/store, or theme/role branching.
- At narrow widths render ruled `dl` facts; at wide widths render one captioned
  native table. CSS must leave exactly one renderer/action set in the
  accessibility tree, preserve DOM/focus/reading order, and avoid page overflow.
- Keep the six mutually exclusive states: ready, loading, empty,
  filtered-empty, invalid-query, and error. Invalid/error copy never echoes
  input, identity, scope, or exception detail.
- Generic copy belongs to the bilingual `data-directory` dictionary domain.

## Related contracts

- [`../../pop/specs/administrative-foundation.md`](../../pop/specs/administrative-foundation.md) — follow when role scope, query, URL, or cursor behavior changes.
- [`../../pop/specs/administrative-design-system.md`](../../pop/specs/administrative-design-system.md) — follow when responsive semantics, inventory, state, or evidence changes.
- [`../components/ui/AGENTS.md`](../components/ui/AGENTS.md) — follow before changing owned shadcn source used by this composition.
