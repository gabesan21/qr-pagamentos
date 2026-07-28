# Frente F01 — Backend UI enablers — [[11.1.4-build-mfa-challenge-and-recovery-ui]]

- **Entrega:** Serviço e rota para regeneração de recovery codes, e helper server-only de status TOTP para o perfil.
- **Escopo:** Implementar `regenerateRecoveryCodes(userId)` no serviço TOTP (substituir `throw` por transação que gera novos códigos e invalida os antigos), persistir no store, e criar `POST /profile/totp/regenerate` com origin-guard, reautorização owner e request-log. Criar helper `getTotpStatus(userId)` retornando `none | pending | active` para uso server-only na página de perfil.
- **Responsável:** agent.
- **Owns:** `src/auth/totp.ts`, `src/auth/totp-store.ts`, `src/app/profile/totp/regenerate/route.ts`, `src/app/profile/totp/regenerate/route.test.ts`.
- **May read:** `src/auth/admin-totp-recovery.ts`, `src/auth/totp.test.ts`.
- **Must not edit:** rotas existentes de enroll/confirm/disable/login/admin, schema/migration.
- **Depends on:** nenhuma.
- **Skills:** [[pop/skills/clean-code-change|clean-code-change]].
- **Critérios:** 1, 6.

## Contrato de execução

- Entregar somente o escopo e os critérios desta frente.
- Dependência ou entrada ausente/incompatível → responder `BLOCKED` ao orquestrador com evidência.
- Não alterar caminhos fora de `Owns`.

## Resultado

- **Status:** pendente.
- **Commit/artefato:** —
- **Arquivos alterados:** —
- **Desvios:** nenhum.
- **Evidência:** —
