# Frente F02 — Login MFA challenge — [[11.1.4-build-mfa-challenge-and-recovery-ui]]

- **Entrega:** Página `/login` adapta-se ao challenge MFA, mostrando formulário de código TOTP ou recovery code.
- **Escopo:** Alterar `src/app/login/page.tsx` para detectar `?mfa=required` e renderizar o challenge form. Criar `src/app/login/totp-challenge-form.tsx` como client boundary observando evento `submit` nativo, com tabs/links para alternar entre TOTP e recovery code, campo `code`, botão submit com spinner, e mensagem genérica de erro quando `?mfa=failed`. Preservar foco e acessibilidade.
- **Responsável:** agent.
- **Owns:** `src/app/login/page.tsx`, `src/app/login/totp-challenge-form.tsx`.
- **May read:** `src/app/login/login-submit.tsx`, DESIGN.md.
- **Must not edit:** `src/app/login/submit/route.ts`, `src/app/login/totp-challenge/route.ts`.
- **Depends on:** F01 (somente para dados, não para UI).
- **Skills:** [[pop/skills/ui-change|ui-change]].
- **Critérios:** 3, 4, 7.

## Contrato de execução

- Entregar somente o escopo e os critérios desta frente.
- Não interceptar o POST; apenas observar eventos nativos para pending state.
- Não criar variantes visuais fora do inventário existente.

## Resultado

- **Status:** pendente.
- **Commit/artefato:** —
- **Arquivos alterados:** —
- **Desvios:** nenhum.
- **Evidência:** —
