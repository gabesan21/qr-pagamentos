# Container operations contract

- Scope: non-shell startup wrappers, media preflight/inventory helpers, migration/bootstrap/identity gates, and liveness.
- Read repository-root [`AGENTS.md`](../AGENTS.md) before changing this subtree.
- [`../src/media/AGENTS.md`](../src/media/AGENTS.md) — follow when a helper evaluates media filesystem or descriptor/digest invariants.

## Boundaries

- Keep app and filesystem helpers at UID/GID `1000:1000`, with read-only roots and only explicit private tmpfs/data mounts writable.
- `MEDIA_STORAGE_ROOT` is exactly `/app/media`; never accept an operator path, create it at runtime, weaken its `0700` control directories, or bypass the pre-bind local-POSIX probe.
- Runtime must complete media and database preflights before spawning `server.js`; failures emit only stable redacted codes and start no application child.
- Runtime must also refuse a loopback HTTP `PUBLIC_ORIGIN` or `NAUTT_WEBHOOK_CALLBACK_URL` unless `ALLOW_LOOPBACK_OPERATOR_ORIGINS` is exactly `1`; this restates the single production decision in `src/net/local-origin.ts` because this wrapper cannot import it — keep both in sync and never interpolate the configured origin value into a message.
- Media helpers never receive a Docker socket, provider/edge network, production secret, host port, arbitrary volume, or identifier/digest output channel.
- Preserve no-follow regular-descriptor reads, exact UID/GID/private modes, bounded EOF, digest verification, exclusive creation, hard-link no-clobber, file/directory sync, and durable private-probe cleanup.
- Keep one-shot failures visible and non-retrying. Preserve direct child spawning and signal forwarding.
- `rotate-encryption-keys.mjs` is the explicit operator-invoked encryption-key rewrap one-shot, profile-gated in `compose.yaml` and never started by a plain `up`. It prints only per-table counts (`PASS rewrap table=... scanned=... rewrapped=... skipped=... unreadable=...`), never key material, ciphertext, or a row identifier, and never retries — an unreadable row is a hard failure.
- Never put a credential, connection URL, media identity, volume mountpoint, or filesystem path in completion logs.

## Verification

- Run `pnpm container:contract-check -- --local-pins`.
- Run the focused container/media tests and only disposable clean-clone scenarios for runtime evidence.
