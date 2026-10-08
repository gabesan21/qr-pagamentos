---
task: D-20261008-nautt-production-signature
entry: 02-secret
---

# Disposable owner-bound signing key

The runtime reads only the resolved owner's ACTIVE credential state and encrypted webhook secret. Decryption supports current/previous local encryption keys, preserves complete UTF-8 secret bytes and rejects empty ciphertext/plaintext as operational faults. Locally acquired encryption buffers are wiped in finally; the existing verifier wipes the fresh signing buffer. No API-key read, credential scan, caching, prefix removal, suffix decoding or registration change.

## Evidence

- [[src/integrations/nautt/webhook-runtime.ts|Runtime]] — follow for owner-only lookup and key cleanup.
