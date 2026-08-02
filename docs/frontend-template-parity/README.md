# Frontend template parity contract

`manifest.json` plus `obligations.ndjson` are the canonical, machine-readable
inventory for Epoch 12. The manifest binds the newline-delimited obligation
records by path, count, and SHA-256. Together they are generated from the
immutable template snapshot and record one stable,
hash-bound mapping for every reachable route/component, authored class
occurrence, state, interaction, asset, locale, theme, current page/loading/error
surface, and explicitly excluded generated UI module.

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
duplicate, or invalid records. The reproducible local inventory generator used
to author this snapshot is `/tmp/generate-parity-manifest.mjs`; it is not a
repository artifact. Do not hand-edit the manifest: regenerate from the pinned
reference, then validate with `pnpm frontend-parity:check` once F02 lands.
