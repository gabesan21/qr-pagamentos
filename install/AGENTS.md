# Installer operations contract

- Scope: install, update, default retention, paired purge, backup, restore, and protected operational evidence.
- Read repository-root [`AGENTS.md`](../AGENTS.md) before changing this subtree.
- [`../pop/specs/media-storage.md`](../pop/specs/media-storage.md) — follow when media durability, backup, restore, or recovery changes.

## Boundaries

- Never use `sudo`, root escalation, host ownership repair, bind/NFS/plugin data volumes, or a broad Docker resource selector.
- Serialize every data operation through the per-checkout lock; a helper may inherit only its verified open lock descriptor.
- Normal install requires a clean exact Git commit and binds both operational image tags and revision labels to that full SHA.
- Treat only exact local Compose-labeled PostgreSQL and media volume IDs as managed. Default uninstall preserves both volumes, protected source/staged credentials, backups, recovery sets, and deployment identity.
- Purge requires the exact Compose project token and removes the verified PostgreSQL/media pair together; never use `down --volumes` for an operator deployment.
- With retained data, validate every PostgreSQL, Nautt, and TOTP encryption source/staged/supplied value and authenticate all three database roles before secret or deployment mutation. Never rotate, regenerate, overwrite, print, hash-log, or path-log continuity material.
- Pin the previous image content before candidate build. Seal every build, preflight, checkout, helper, promotion, health, and final-proof failure with bounded redacted evidence and exact old-app/volume proof or pinned-image rollback. After database work begins, never claim database rollback.
- Backup stops only the app and publishes one immutable PostgreSQL/media pair after descriptor/digest, archive, checksum, and manifest verification.
- Restore accepts no partial/force mode or followed artifact. Require both manifest-bound exact-SHA images, exact private archive identity/modes, UID-1000 disposable-volume secret staging independent of host UID, and residual-free inventory streaming. Prove rehearsal resources absent before managed mutation and verify database/media inventory before health.
- Preserve the automatic pre-restore recovery pair. If requested restore and recovery both fail, keep the app stopped and retain all evidence and artifacts.

## Verification

- Run `install/test.sh`.
- Run `pnpm container:test --clean-clone --scenario install-lifecycle`, `media-backup`, `media-restore`, and `update` only against disposable resources.
