---
id: identity-security
project: applications/qr-pagamentos
domain: identity-security
kind: contract
status: active
implementation: implemented
origin: "roadmap/11-identity-security-and-release"
created: 2026-07-28
updated: 2026-07-28
supersedes: []
superseded_by:
---

# Spec — Identity security

This spec defines the durable contracts for time-based one-time password (TOTP) multi-factor authentication, recovery codes, the MFA challenge cookie, and administrator-driven TOTP recovery. The challenge and profile UI belong to [[11.1.4-build-mfa-challenge-and-recovery-ui]].

## Expected behavior

- A user starts with no TOTP credential. Enrollment creates a pending credential; the secret is encrypted and never leaves the server.
- Confirmation requires the current password plus a valid first TOTP code from the enrolled secret.
- Once active, username/password login alone is insufficient: password proof issues a short-lived `qr_mfa_challenge` cookie, and a second POST validates a TOTP code or recovery code before promoting the challenge to a real `qr_session`.
- Disablement, whether by the owner or an administrator, deletes the credential and recovery codes and revokes every session of the target. Administrator-driven disablement appends exactly one `totp_recovery_action` audit row; owner-initiated disablement does not append an audit row.

## Invariants

- TOTP state is derived from the credential row: not configured when absent; pending when present but unconfirmed; active when confirmed.
- The plaintext TOTP secret is encrypted with AES-256-GCM using a deployment-owned `TOTP_ENCRYPTION_KEY` loaded from a file-backed secret; the key is never reused for Nautt credentials or stored in Git/image layers.
- Validation follows RFC 6238 with SHA-1, 30-second step, and 6 digits, accepting a ±1-step window for clock skew.
- Replay protection stores the highest accepted counter and rejects equal or lower counters; any code accepted within the window is recorded and cannot be reused.
- Recovery codes are generated as random one-time values, displayed exactly once to the user, and stored only as SHA-256 digests; use marks the row consumed and rejects reuse.
- The `qr_mfa_challenge` cookie is HttpOnly, Secure in production, SameSite=Lax, path `/`, short-lived, single-use, and bound to a challenge row; failed validation returns one opaque outcome and never distinguishes code type.
- Real sessions may carry an `mfaVerifiedAt` fact; session creation, expiry, and revocation follow the existing session contract.
- Administrator recovery is allowed only for non-deleted target users; it appends exactly one `totp_recovery_action` audit row with actor and target UUIDs, action, and timestamp.

## Interfaces

- **Enrollment:** `POST /profile/totp/enroll` (owner-only, origin-guarded) returns `200` JSON with `{ provisioningUri, recoveryCodes }`; the plaintext secret is not exposed. This JSON response is required so the follow-up UI task [[11.1.4-build-mfa-challenge-and-recovery-ui]] can render the QR code and recovery codes.
- **Confirmation:** `POST /profile/totp/confirm` (owner-only, origin-guarded) requires password and first TOTP code.
- **Owner disablement:** `POST /profile/totp/disable` (owner-only, origin-guarded) requires password plus TOTP code or recovery code.
- **Recovery-code regeneration:** `POST /profile/totp/regenerate` (owner-only, origin-guarded) replaces existing recovery codes and returns the new set once.
- **Challenge:** `POST /login/submit` issues `qr_mfa_challenge` when TOTP is active; `POST /login/totp-challenge` validates the challenge and creates the real session.
- **Administrator recovery:** `POST /admin/users/[id]/totp-disable` (admin-only, origin-guarded) disables TOTP for the target.
- **UI surfaces:** `/login` renders the MFA challenge when `?mfa=required`; `/profile` renders the TOTP security section with enroll/confirm/disable/regenerate flows; `/admin/accounts/[id]` renders the TOTP recovery action when the target has a configured credential.

## Errors and limits

- **Unauthorized/role mismatch:** empty `401` or `403` with no body.
- **Owner routes:** opaque redirects to `/profile?totp={enrolled|confirmed|disabled|failed|conflict|unavailable}`.
- **Administrator recovery:** opaque redirects to `/admin/accounts/[id]?editor=totp-disabled|failed`; unknown or deleted targets share the `failed` outcome.
- **Challenge failure:** one opaque redirect or error; the response never distinguishes TOTP code from recovery code, nor reveals whether a user has TOTP configured.

## Conformance criteria

- [x] TOTP states and transitions are enforced by the service layer.
- [x] Secrets are encrypted at rest with AES-256-GCM and the `TOTP_ENCRYPTION_KEY`.
- [x] Validation rejects replayed codes and accepts only the ±1-step window.
- [x] Recovery codes are hashed, one-time, and opaque after generation.
- [x] Challenge cookies are short-lived, single-use, and promote to a real session only on valid proof.
- [x] Disablement revokes target sessions and appends one audit row.
- [x] Routes are origin-guarded, role-bound, and produce only opaque outcomes.

## Implementation notes

- `POST /profile/totp/enroll` returns `200` JSON (`{ provisioningUri, recoveryCodes }`) instead of an opaque redirect. The redirect pattern would prevent the UI from obtaining the provisioning URI and recovery codes, so the contract exposes only the public-safe metadata needed for QR-code rendering. The plaintext secret remains server-encrypted.
- `TOTP_ENCRYPTION_KEY` is a required deployment secret; the installer generates it when absent and stages it alongside `NAUTT_ENCRYPTION_KEY`.

## Out of scope

- Email-based password reset and external identity providers.
- The MFA challenge and profile UI; owned by [[11.1.4-build-mfa-challenge-and-recovery-ui]].
- Provider/webhook identity flows; owned by [[specs/nautt-finance-integration|Nautt Finance integration]].

## Related references

- [[specs/administrative-foundation|Administrative foundation]] — follow for role model, session revocation, and administrator audit conventions.
- [[specs/product-scope|Product scope]] — follow when a decision changes the MVP identity boundary.
- [`AGENTS.md`](../AGENTS.md) — follow before changing root application structure or DOX contracts.
