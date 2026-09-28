# QR develop integration

2026-09-28 — Explicit user authorization to merge all accumulated work and retain only main/develop.

Source commit `cebc70f6` captures the cumulative verified work from all eight temporary checkouts, including root login/dashboard refinements and M-8 through M-14 plus hotfixes. Independent audit confirmed no unique source changes were omitted. Historical `develop-onto-main` was accounted for with an ours merge because its only tree difference restored maintenance documents deliberately retired in main; those documents remain retired.

Before cleanup, binary patches, nonignored untracked files and all branch history were privately backed up; the previous dirty root also remains in a recovery stash. Temporary worktrees were checked unchanged against those copies. Only local main/develop remain. No remote push or main merge.

Docker runs the verified storefront image using the permanent checkout Compose file. App healthy; database container, mounts, environment and ports preserved.
