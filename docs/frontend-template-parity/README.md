# Frontend template parity contract

`manifest.json` plus `obligations.ndjson` are the canonical, machine-readable
inventory for Epoch 12. The manifest binds the newline-delimited obligation
records by path, count, and SHA-256. Together they are generated from the
immutable template snapshot and record one stable,
hash-bound mapping for every reachable route/component, authored class
occurrence, state, interaction, asset, locale, theme, current page/loading/error
surface, and explicitly excluded generated UI module.

Schema version 2 makes the occurrence records consumable without reopening the
template source:

- each `authored-class-occurrence` stores the exact readable `className`
  initializer, its literal value when applicable, and its expression form;
- each `state` stores its exact lexical React component/hook owner, the
  binding/setter names, exact initial value, every owner-local setter transition,
  and the exact owner-local JSX, derived, or indirect read sites that define its
  expected view. Nested handlers and callbacks inside that owner are included;
  sibling component/hook functions are excluded even when they reuse the same
  state/setter names. An intentionally omitted state binding is named from its
  setter and marked `render-invalidation-only`; a state with no render read is
  explicitly marked `write-only` rather than receiving an invented view;
- each `interaction` stores the DOM event, exact handler expression, resolved
  local implementation (or caller-provided callback boundary), and classified
  exact effect calls that define feedback;
- `target` contains only exact current route/page/loading/error paths and exact
  current component paths. It is derived from the route-component imports in
  `App.tsx`, their transitive import closure, and exact current path inventory.
  Readable template `:param` segments are normalized to current `[param]`
  segments only for matching; a mixed static/dynamic shared source must include
  every applicable exact dynamic current path;
- `fixture` has a record-specific stable ID bound to source path, SHA-256, line,
  expression SHA-256, applicable template routes, exact current surface paths,
  imported mock fixture names, and the fixed fixture clock.

The checker independently rebuilds those fields with the TypeScript AST. Missing
records retain the `PARITY_*_MISSING` failures; semantic tampering produces a
dimension-specific `PARITY_*_EXPRESSION_INVALID`, `*_VALUE_INVALID`,
`STATE_NAME_INVALID`, `STATE_INITIAL_INVALID`, `STATE_TRIGGER_INVALID`,
`STATE_EXPECTED_VIEW_INVALID`, `INTERACTION_EVENT_INVALID`,
`INTERACTION_ACTION_INVALID`, `INTERACTION_FEEDBACK_INVALID`, `*_TARGET_INVALID`,
`*_FIXTURE_INVALID`, `DYNAMIC_TARGET_MISSING`,
`STATE_LEXICAL_TRANSITION_LEAK`, or `STATE_LEXICAL_VIEW_LEAK` diagnostic.

## Authority and dispositions

The supplied template is authoritative for presentation and interaction feedback.
The current application contracts remain authoritative for business behavior,
authorization, security, runtime, exact-decimal handling, stored locale values,
and stored theme identifiers. Template mock fixtures and session mechanics are
reference-only and never define production behavior.

`direct-presentation-map` is a corresponding template/current route;
`presentation-reference` is a reusable visual obligation; and
`current-only-presentation-map` is a current surface without a direct template
route. `current-contract-wins` preserves a current durable contract.
`excluded-unreachable-generated-ui` is an explicit exclusion because the module
is not transitively reachable from `docs/template/app/src/App.tsx`.

`/store/[slug]` (including loading/error) uses `authorized-extrapolation`: no
supplied route exists, and its later owner is task `12.6.2`. `/store/[slug]/pay`
(including loading/error) has the same disposition and is owned by `12.6.3`.
All other non-direct records carry a reason and a concrete candidate task ID.
The terminal `excluded-unreachable-generated-ui` disposition alone permits a
null owner, because its recorded reachability reason is the final resolution.

## Evidence protocol

Every visual record fixes the repository's `chromium` Playwright project,
Chromium, device scale factor 1, fixed fixtures/clock, local settled fonts,
disabled animations/caret, and blocked external requests. Capture full pages at
`320x1000`, `375x1000`, `768x1000`, and `1440x1000`, for `pt-BR` and `en`, and
all six persisted themes when applicable. Each record names its state fixture.
Pixel comparison uses `threshold: 0.1` and `maxDiffPixelRatio: 0.001`.
Geometry, typography, content, focus, overflow, and other semantic failures are
independent failures and cannot be waived by the raster ratio.

## Regeneration and validation

The F02 checker consumes this schema and must fail closed on missing, stale,
duplicate, invalid, generic, or source-divergent records. Refresh only the three
source-derived semantic record families with
`node scripts/check-frontend-template-parity-contract.mjs --refresh-semantic-contract`;
this preserves all other contract records and recomputes the NDJSON binding.
Then validate the canonical contract with `pnpm frontend-parity:check`. Do not
hand-edit the manifest or obligation records. The disposable negative suite is
`node scripts/check-frontend-template-parity-contract.mjs --semantic-mutation-probes`;
it makes an isolated in-memory clone for each field removal/tamper, runs the same
independent source-derived semantic validator used by the canonical gate, and
asserts the dimension-specific diagnostic without changing repository files.
