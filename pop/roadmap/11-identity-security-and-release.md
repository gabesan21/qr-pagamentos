# Epoch 11 - Identity security and release

- **Project:** [[PROJECT|QR Pagamentos]]
- **Roadmap:** [[ROADMAP|Roadmap]]
- **Status:** pendente
- **Yolo:** yes
- **Description:** Add password recovery and 2FA, then prove role isolation, visual quality, and production upgrade/recovery readiness.
- **Pause if:** reset/MFA secrets, persistent media, or upgrade recovery cannot be exercised without exposing credentials or risking non-disposable production data.

## Recon and forks

- [[researches/panel-rebuild-roadmap/panel-rebuild-roadmap|Panel rebuild roadmap recon]] - establishes missing mail/MFA infrastructure and the required security, browser, and clean-clone closure gates.
- Fork: if outbound SMTP is not available, keep reset requests generic and disabled by validated operator configuration rather than introducing an insecure fallback.

## Phase 11.1 - Password recovery and MFA

- **Status:** pendente
- **Description:** Add self-hosted email reset and TOTP security without making email a login credential.

| Task | Description | Status |
|------|-------------|--------|
| [[11.1.1-build-self-hosted-password-reset]] | Add validated mail configuration and hashed single-use reset challenges with expiry, rate limits, and session revocation. · size: L | 001_initial_task |
| [[11.1.2-add-admin-password-reset-action]] | Let administrators send a generic reset email from the user profile with safe no-email and delivery-failure behavior. · size: M | 001_initial_task |
| [[11.1.3-implement-totp-security-lifecycle]] | Add encrypted TOTP enrollment, confirmation, disablement, replay protection, and one-time recovery codes. · size: L | 001_initial_task |
| [[11.1.4-build-mfa-challenge-and-recovery-ui]] | Add bilingual login challenge, recovery, profile-security, and administrator-safe recovery experiences. · size: L | 001_initial_task |

## Phase 11.2 - System verification and release evidence

- **Status:** pendente
- **Description:** Close the rebuild with independent security, UI, accessibility, and production continuity proof.

| Task | Description | Status |
|------|-------------|--------|
| [[11.2.1-verify-cross-role-security-and-privacy]] | Prove role isolation, owner scoping, soft-delete effects, payer privacy, upload abuse resistance, and reset/MFA controls. · size: L | 001_initial_task |
| [[11.2.2-verify-six-theme-bilingual-experience]] | Produce browser evidence for both locales, six themes, responsive routes, tables, charts, checkout, keyboard, and WCAG 2.2 AA. · size: L | 001_initial_task |
| [[11.2.3-rehearse-production-upgrade-and-recovery]] | Exercise clean install, seed, media persistence, mail validation, update, backup, restore, and exact-revision release evidence. · size: L | 001_initial_task |

## Dependency and parallel-wave map

- 11.1.1 and 11.1.3 may run in parallel after their identity/lifecycle prerequisites, but package, Prisma, and secret-configuration write sets must serialize.
- 11.1.2 and 11.1.4 follow their respective backend security contracts.
- 11.2.1 is the full security gate; 11.2.2 follows it, and 11.2.3 is the final disposable production rehearsal.
