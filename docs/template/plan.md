# Plan: QR Pagamentos Frontend Template

## Goal
Complete React frontend template for QR Pagamentos (bilingual pt-BR/en payment-management app backed by Nautt Finance), covering:
- Shared access: Login (+TOTP challenge), Password Reset
- Admin area: Dashboard, Global Orders (list + detail v1/v2), Global Payment Links (list + detail), Users directory + account creation, User detail/editor, Platform Settings (6 sections)
- Merchant area: Dashboard, Orders (list + detail), Payment Links (list/new/detail/edit/orders/order-detail), Products catalog (list/new/detail), Categories, Settings, Profile & Security (TOTP)
- Public checkout: /pay/[identifier] (V1 + V2, PIX QR, status polling, buyer data policy variants)
- 6 themes: pix-paper, cashier-daylight, settlement-sand, midnight-clearing, vault-blue, terminal-amber
- Full state coverage: loading/empty/filtered-empty/error/validation/success/confirmations

## Stages
1. Load `vibecoding-webapp-swarm` skill → orchestration rules.
2. Load `webapp-building-swarm` + `swarm-workspace` → repo setup, design system.
3. Design stage: design tokens + 6 theme palettes, i18n scaffolding, mock data layer.
4. Parallel build waves via subagents:
   - Wave A: App shell, routing, auth pages (login/reset), i18n, theme system
   - Wave B: Admin pages
   - Wave C: Merchant pages (dashboard, orders, links)
   - Wave D: Catalog, settings, profile
   - Wave E: Public checkout
5. Integration: wire routes, verify build, cross-check page/state coverage vs prompt.
6. Delivery: build + save website version.

## Constraints
- Frontend template only — mock data, no backend design.
- Bilingual pt-BR/en everywhere.
- Admin read-only boundaries, owner isolation, safe unavailable states, redaction of secrets.
