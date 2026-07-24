# Installer operations contract

- Scope: install, update, default retention, paired purge, backup, restore, and protected operational evidence.
- Read repository-root [`AGENTS.md`](../AGENTS.md) before changing this subtree.
- [`../pop/specs/media-storage.md`](../pop/specs/media-storage.md) — follow when media durability, backup, restore, or recovery changes.

## Boundaries

- Never use `sudo`, root escalation, host ownership repair, bind/NFS/plugin data volumes, or a broad Docker resource selector.
- Serialize every data operation through the per-checkout lock; a helper may inherit only its verified open lock descriptor.
- Treat only exact local Compose-labeled PostgreSQL and media volume IDs as managed. Default uninstall preserves both volumes, protected source/staged credentials, backups, recovery sets, and deployment identity.
- Purge requires the exact Compose project token and removes the verified PostgreSQL/media pair together; never use `down --volumes` for an operator deployment.
- With retained data, validate every PostgreSQL and Nautt source/staged/supplied value and authenticate all three database roles before secret or deployment mutation. Never rotate, regenerate, overwrite, print, hash-log, or path-log continuity material.
- Update keeps the old app healthy through candidate media preflight and additive database gates. After database work begins, never claim database rollback; target-health rollback is previous-image-only against the retained pair.
- Backup stops only the app and publishes one immutable PostgreSQL/media pair after descriptor/digest, archive, checksum, and manifest verification.
- Restore accepts no partial/force mode. Rehearse the exact release against disposable labeled DB/media/network/secret resources and prove their absence before managed mutation.
- Preserve the automatic pre-restore recovery pair. If requested restore and recovery both fail, keep the app stopped and retain all evidence and artifacts.

## Verification

- Run `install/test.sh`.
- Run `pnpm container:test --clean-clone --scenario install-lifecycle`, `media-backup`, `media-restore`, and `update` only against disposable resources.
