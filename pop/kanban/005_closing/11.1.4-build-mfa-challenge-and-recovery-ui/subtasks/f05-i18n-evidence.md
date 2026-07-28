# Frente F05 — i18n, evidence and tests — [[11.1.4-build-mfa-challenge-and-recovery-ui]]

- **Entrega:** Dicionários bilíngues atualizados e evidence runners de login/profile cobrindo novos estados.
- **Escopo:** Adicionar chaves de MFA em `src/i18n/dictionaries/profile/en.ts` e `pt-BR.ts`. Atualizar `tests/login.evidence.spec.ts` para capturar estado de challenge MFA. Atualizar `tests/profile.evidence.spec.ts` para capturar estados none/pending/active. Manter `pnpm check`, `pnpm login:evidence`, `pnpm profile:evidence` passando.
- **Responsável:** agent.
- **Owns:** `src/i18n/dictionaries/profile/`, `tests/login.evidence.spec.ts`, `tests/profile.evidence.spec.ts`.
- **May read:** scripts de evidence correspondentes.
- **Must not edit:** specs duráveis sem necessidade; specs afetadas devem ser sincronizadas.
- **Depends on:** F02, F03, F04.
- **Skills:** [[pop/skills/ui-change|ui-change]], [[pop/skills/sync-specs|sync-specs]].
- **Critérios:** 1, 5, 7, 8.

## Contrato de execução

- Entregar somente o escopo e os critérios desta frente.
- Evidence runners locais apenas; nenhum teste em produção real.
- Sincronizar spec `identity-security` se houver discrepância sobre owner-disable audit.

## Resultado

- **Status:** pendente.
- **Commit/artefato:** —
- **Arquivos alterados:** —
- **Desvios:** nenhum.
- **Evidência:** —
