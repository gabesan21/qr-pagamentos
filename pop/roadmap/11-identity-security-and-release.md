# Epoch 11 - Identity security and release

- **Project:** [[PROJECT|QR Pagamentos]]
- **Roadmap:** [[ROADMAP|Roadmap]]
- **Status:** concluída (2026-07-31)
- **Yolo:** yes
- **Description:** Add password recovery and 2FA, then prove role isolation, visual quality, and production upgrade/recovery readiness.
- **Pause if:** reset/MFA secrets, persistent media, or upgrade recovery cannot be exercised without exposing credentials or risking non-disposable production data.

## Recon and forks

- [[researches/panel-rebuild-roadmap/panel-rebuild-roadmap|Panel rebuild roadmap recon]] - establishes missing mail/MFA infrastructure and the required security, browser, and clean-clone closure gates.
- Fork: if outbound SMTP is not available, keep reset requests generic and disabled by validated operator configuration rather than introducing an insecure fallback.

## Phase 11.1 - Password recovery and MFA

- **Status:** concluída (2026-07-28)
- **Description:** Add self-hosted email reset and TOTP security without making email a login credential.

| Task | Description | Status |
|------|-------------|--------|

## Phase 11.2 - System verification and release evidence

- **Status:** concluída (2026-07-31)
- **Description:** Close the rebuild with independent security, UI, accessibility, and production continuity proof.

| Task | Description | Status |
|------|-------------|--------|

## Dependency and parallel-wave map

- 11.1.1 and 11.1.3 may run in parallel after their identity/lifecycle prerequisites, but package, Prisma, and secret-configuration write sets must serialize.
- 11.1.2 and 11.1.4 follow their respective backend security contracts.
- 11.2.1 is the full security gate; 11.2.2 follows it, and 11.2.3 is the final disposable production rehearsal.
