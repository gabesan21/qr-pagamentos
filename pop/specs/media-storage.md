# Spec - Secure media storage

- **Project:** [[PROJECT|QR Pagamentos]]
- **Epoch/Phase:** [[roadmap/6-secure-panel-foundation|Phase 6.3]]
- **Status:** aprovada
- **Implementation:** partial
- **Created:** 2026-07-23
- **Updated:** 2026-07-23 — task 6.3.2 implements the metadata, validation, storage, lifecycle, reconciliation, and read boundary; independent verification and operational provisioning remain pending.

## What it covers

This spec defines the single hardened server boundary for merchant-owned storefront-logo and product-image bytes. It covers canonical image validation, opaque metadata, physical storage and quota invariants, revision-fenced lifecycle operations, reconciliation, and public/protected reads.

## Accepted media and canonical output

- The only accepted input signatures and decoded formats are JPEG, PNG, and WebP. Input is at most 5 MiB, exactly one frame/page, at most 4096 pixels on either axis, and at most 16,777,216 decoded pixels.
- SVG, GIF, AVIF, animation, multiple pages, mismatched signatures, truncation, and decoder/resource-limit failures are unavailable and never reach persistence or publication.
- Exactly `sharp@0.34.5` runs with fail-on-error decoding, sequential reads, disabled cache, one decoder worker, the pixel limit, and a five-second timeout. A committed preflight proves the pinned package/libvips and fixtures in the pinned build image before the application build.
- Orientation is normalized and accepted input is encoded once as metadata-free, non-animated `image/webp`. Canonical output over 5 MiB is rejected.
- Consumer target sizes of 1024×1024 for storefront logos and 1600×1200 for product images are advisory; they do not weaken the hard limits.

## Metadata and lifecycle

- `MediaObject` records an application-generated UUID, unique opaque 43-character public identifier, separate unexposed 43-character storage key, owner, closed purpose (`STOREFRONT_LOGO | PRODUCT_IMAGE`), closed state (`WRITING | STAGED | ACTIVE | ORPHANED | DELETING`), non-negative 64-bit lifecycle revision, canonical MIME, byte length, width, height, SHA-256, timestamps, and nullable purge deadline.
- Every lifecycle claim matches the exact owner, purpose, state, and observed revision and atomically increments the revision. Revisions never reset, including orphan/reactivation cycles, so stale ABA claims lose.
- A committed `WRITING` reservation precedes file creation. Durable publication precedes `WRITING → STAGED`. Same-owner/purpose claims activate or orphan, and orphaning establishes a 24-hour grace deadline.
- Cleanup may claim eligible stale `WRITING`, due `ORPHANED`, or retryable `DELETING` records only through the same revision fence. A row remains `DELETING` and counted after any failed durable removal; deletion occurs only after both controlled paths are absent and both directories are synced.

## Quota and reconciliation

- Every metadata row in every state counts physically until durable removal: at most 256 objects and 100 MiB of canonical bytes per owner; within that, storefront logos are limited to 8 objects and 10 MiB.
- Admission completes a controlled-root inventory and repeats inventory plus row totals while serializing on the owner. Untracked files, missing tracked files, incomplete scans, failed reclaim, or unverifiable totals deny every new create.
- Reconciliation is deterministic, revision-fenced, and idempotent. Nothing younger than 24 hours is purged, and an active/reactivated object cannot be removed by a stale sweeper.

## Filesystem contract

- `MEDIA_STORAGE_ROOT` is the only root and must be an existing canonical absolute non-symlink directory other than `/`. Callers never supply paths and bytes remain outside `public/`.
- The supported target is a local Linux POSIX filesystem with ext4/XFS semantics. Controlled `0700` staging and object directories must share one device and pass a private initialization probe for `O_NOFOLLOW`, `O_EXCL`, hard-link no-clobber, regular descriptors, file `fsync`, and directory `fsync`.
- Publication writes a `0600` exclusive no-follow temp, syncs it, hard-links to an absent final name, syncs the final directory, opens the final name once with `O_NOFOLLOW`, and authenticates that descriptor through bounded EOF length plus persisted SHA-256. It then removes the temp, syncs staging, and only then publishes metadata state.
- Serving likewise reads at most 5 MiB+1 from one opened regular descriptor, requires exact length and SHA-256, then rechecks exact state and revision before committing the verified buffer. A pathname/device/size check or later pathname stream is never sufficient.

## Read contract

- `GET /media/[identifier]` is unlocalized. `ACTIVE` media is sessionless; `STAGED` and not-yet-due `ORPHANED` media is readable only by its active merchant owner. Administrators gain no owner access.
- Every success and failure has `Cache-Control: no-store`. A successful response contains only exact canonical bytes with `image/webp`, `nosniff`, inline disposition, and exact length.
- Malformed identifiers, missing/inconsistent rows or files, corruption, same-size regular-file swaps, symlink swaps, wrong owner/role, stale revisions, and non-readable states all return the same empty `404`. `ACTIVE → ORPHANED` revokes the next public read immediately.

## Operational boundary

- Task 6.3.2 does not add logo/product attachment columns, upload UI or mutation routes, storefront/catalog projection wiring, or request limiter/logger inventory.
- Task 6.3.3 exclusively owns production mounts, root/control-directory provisioning and permissions, environment wiring, installer/update/uninstall, and backup/restore behavior. Its filesystem must satisfy this spec's probe without relaxing it.

## Open

- Independent critical verification and task closeout remain pending.
- Persistent production provisioning and operations remain planned in [[6.3.3-provision-persistent-media-operations]].

## Related specs

- [[specs/administrative-foundation|Administrative foundation]] — follow for mutually exclusive role capability and protected denial semantics.
- [[specs/storefront-and-customization|Storefront and customization]] — follow when a later task attaches a storefront logo.
- [[specs/catalog-and-payment-links|Catalog and payment links]] — follow when a later task attaches product images.
